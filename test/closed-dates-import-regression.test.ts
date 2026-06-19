import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'data', 'db.json');
const dbBackupPath = path.join(root, 'data', 'db.json.bak');

function backupDB() {
  if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, dbBackupPath);
}
function restoreDB() {
  if (fs.existsSync(dbBackupPath)) {
    fs.copyFileSync(dbBackupPath, dbPath);
    try { fs.unlinkSync(dbBackupPath); } catch {}
  }
}

backupDB();
process.on('exit', restoreDB);

const BASE = 'http://localhost:3001';

function request(method: string, urlPath: string, body?: any, token?: string): Promise<{ status: number; data: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const data = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json: any = buf;
          try { json = buf ? JSON.parse(buf) : null; } catch {}
          resolve({ status: res.statusCode!, data: json, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function login(username: string, password: string): Promise<string> {
  const r = await request('POST', '/api/auth/login', { username, password });
  if (r.status !== 200 || !r.data?.token) throw new Error(`登录失败 ${username}: ${r.status}`);
  return r.data.token;
}

let passCount = 0;
let failCount = 0;
function check(cond: boolean, desc: string, actual?: any) {
  if (cond) {
    passCount++;
    console.log(`  ✅ ${desc}`);
  } else {
    failCount++;
    console.error(`  ❌ ${desc}${actual !== undefined ? ` 实际: ${JSON.stringify(actual)}` : ''}`);
  }
}

const SAMPLE_CSV_VALID = `日期,关闭原因
2026-07-01,建党节
2026-08-01,建军节
2026-09-10,教师节
2026-10-01,国庆节
`;

const SAMPLE_CSV_MIXED = `日期,关闭原因
2026-07-01,建党节
2026-07-01,重复的建党节
2026-13-40,坏日期
2026-08-15,
,空日期
not-a-date,invalid
2026-09-10,教师节
`;

const SAMPLE_CSV_EN_HEADER = `date,reason
2026-05-01,劳动节
2026-06-01,儿童节
`;

async function main() {
  console.log('\n=== 关闭日期批量导入导出回归测试 ===\n');

  const adminToken = await login('admin', 'admin123');
  const stu1Token = await login('student01', '123456');

  // 先清空关闭日期，确保测试环境干净
  {
    const clearR = await request('PUT', '/api/classrooms/closed-dates/batch', { dates: [] }, adminToken);
    check(clearR.status === 200, '初始化：清空关闭日期列表成功', clearR.status);
  }

  // ----------------------------------------------------------------
  // 1. 权限控制：学生角色禁止访问所有批量接口
  // ----------------------------------------------------------------
  console.log('\n1. 权限控制：学生无法访问批量导入/导出/撤销接口');
  {
    const exportR = await request('GET', '/api/classrooms/closed-dates/export', undefined, stu1Token);
    check(exportR.status === 403, '学生导出返回 403', exportR.status);

    const previewR = await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: SAMPLE_CSV_VALID }, stu1Token);
    check(previewR.status === 403, '学生预览导入返回 403', previewR.status);

    const executeR = await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_VALID }, stu1Token);
    check(executeR.status === 403, '学生执行导入返回 403', executeR.status);

    const undoR = await request('POST', '/api/classrooms/closed-dates/import/undo', undefined, stu1Token);
    check(undoR.status === 403, '学生撤销导入返回 403', undoR.status);

    const lastR = await request('GET', '/api/classrooms/closed-dates/import/last', undefined, stu1Token);
    check(lastR.status === 403, '学生查询最近导入返回 403', lastR.status);
  }

  // ----------------------------------------------------------------
  // 2. 未登录（无 token）禁止访问
  // ----------------------------------------------------------------
  console.log('\n2. 未登录（无 token）禁止访问批量接口');
  {
    const r = await request('GET', '/api/classrooms/closed-dates/export');
    check(r.status === 401, '未登录导出返回 401', r.status);
    const r2 = await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_VALID });
    check(r2.status === 401, '未登录导入返回 401', r2.status);
  }

  // ----------------------------------------------------------------
  // 3. 导入预览：正确分类 new / duplicate / invalid
  // ----------------------------------------------------------------
  console.log('\n3. 导入预览：正确识别新增、重复、无效行');
  {
    // 先插入一条 2026-07-01 制造已有重复
    await request('PUT', '/api/classrooms/closed-dates/batch', { dates: [{ date: '2026-07-01', reason: '已存在' }] }, adminToken);

    const previewR = await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: SAMPLE_CSV_MIXED }, adminToken);
    check(previewR.status === 200, '预览接口返回 200', previewR.status);
    const p = previewR.data;
    check(p.total === 7, `预览总行数 = 7`, p.total);
    check(p.newCount === 1, `预览 newCount = 1（仅 09-10 教师节，08-15 原因空被 invalid）`, p.newCount);
    check(p.duplicateCount === 2, `预览 duplicateCount = 2（两条 07-01）`, p.duplicateCount);
    check(p.invalidCount === 4, `预览 invalidCount = 4（13-40、08-15空原因、空日期、not-a-date）`, p.invalidCount);

    const dupRows = p.rows.filter((r: any) => r.status === 'duplicate');
    check(dupRows.length > 0 && dupRows.every((r: any) => r.message?.includes('已存在')), '重复行带有"日期已存在"提示');

    const invRows = p.rows.filter((r: any) => r.status === 'invalid');
    check(invRows.some((r: any) => r.message?.includes('日期格式错误')), '无效行包含日期格式错误提示');
    check(invRows.some((r: any) => r.message?.includes('不能为空')), '无效行包含原因不能为空提示');

    // 清理回空
    await request('PUT', '/api/classrooms/closed-dates/batch', { dates: [] }, adminToken);
  }

  // ----------------------------------------------------------------
  // 4. 英文表头 CSV 也能识别
  // ----------------------------------------------------------------
  console.log('\n4. 英文表头 CSV 识别（date,reason）');
  {
    const previewR = await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: SAMPLE_CSV_EN_HEADER }, adminToken);
    check(previewR.status === 200, '英文表头预览返回 200');
    check(previewR.data.newCount === 2, '英文表头 2 条数据都识别为 new', previewR.data.newCount);
    check(previewR.data.rows[0].date === '2026-05-01', '正确读取第 1 条日期');
    check(previewR.data.rows[0].reason === '劳动节', '正确读取第 1 条原因');
  }

  // ----------------------------------------------------------------
  // 5. 执行导入 + 撤销回滚：数据状态正确恢复
  // ----------------------------------------------------------------
  console.log('\n5. 执行导入 + 撤销回滚');
  {
    // 预置一条基线数据
    await request('PUT', '/api/classrooms/closed-dates/batch', { dates: [{ date: '2026-01-01', reason: '基线' }] }, adminToken);

    const execR = await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_VALID, skipDuplicates: true }, adminToken);
    check(execR.status === 200, '执行导入返回 200', execR.status);
    check(execR.data.success === true, '执行导入 success=true');
    check(execR.data.added === 4, `执行导入 added = 4`, execR.data.added);
    check(execR.data.skipped === 0, `执行导入 skipped = 0`, execR.data.skipped);
    check(!!execR.data.batchId, '返回 batchId');
    check(!!execR.data.summary, '返回 summary');

    // 验证 list 能查到 1（基线） + 4（导入）= 5 条
    const listR = await request('GET', '/api/classrooms/closed-dates/list', undefined, adminToken);
    check(listR.data.length === 5, `导入后关闭日期总数 = 5`, listR.data.length);
    check(listR.data.some((d: any) => d.date === '2026-01-01'), '基线数据仍保留');
    check(listR.data.some((d: any) => d.date === '2026-10-01' && d.reason === '国庆节'), '导入的国庆节记录存在');

    // 查询最近一次快照
    const lastR = await request('GET', '/api/classrooms/closed-dates/import/last', undefined, adminToken);
    check(lastR.status === 200, '查询最近导入快照返回 200');
    check(lastR.data.importedCount === 4, '快照 importedCount = 4', lastR.data.importedCount);
    check(lastR.data.previousClosedDates.length === 1, '快照保存了导入前的 1 条基线', lastR.data.previousClosedDates?.length);

    // 撤销
    const undoR = await request('POST', '/api/classrooms/closed-dates/import/undo', undefined, adminToken);
    check(undoR.status === 200, '撤销返回 200', undoR.status);
    check(undoR.data.success === true, '撤销 success=true');
    check(undoR.data.restoredCount === 4, '撤销恢复计数 = 4', undoR.data.restoredCount);

    // 撤销后数据回到基线
    const listAfterUndo = await request('GET', '/api/classrooms/closed-dates/list', undefined, adminToken);
    check(listAfterUndo.data.length === 1, `撤销后总数回到 1 条`, listAfterUndo.data.length);
    check(listAfterUndo.data[0].date === '2026-01-01' && listAfterUndo.data[0].reason === '基线', '撤销后基线数据保留完整');

    // 快照已清除
    const lastAfterUndo = await request('GET', '/api/classrooms/closed-dates/import/last', undefined, adminToken);
    check(lastAfterUndo.data === null, '撤销后最近导入快照为 null', lastAfterUndo.data);

    // 再次撤销应失败
    const undo2R = await request('POST', '/api/classrooms/closed-dates/import/undo', undefined, adminToken);
    check(undo2R.status === 400, '无快照时撤销返回 400', undo2R.status);
    check(!!undo2R.data?.error, '无快照撤销有错误提示');

    // 清理
    await request('PUT', '/api/classrooms/closed-dates/batch', { dates: [] }, adminToken);
  }

  // ----------------------------------------------------------------
  // 6. 重复数据 + skipDuplicates 选项行为正确
  // ----------------------------------------------------------------
  console.log('\n6. skipDuplicates 选项行为正确');
  {
    // 先导入一次
    await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_VALID, skipDuplicates: true }, adminToken);

    // 再导入同样内容
    const execR = await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_VALID, skipDuplicates: true }, adminToken);
    check(execR.data.added === 0, '重复导入 with skipDuplicates=true → added = 0', execR.data.added);
    check(execR.data.skipped === 4, '重复导入 with skipDuplicates=true → skipped = 4', execR.data.skipped);

    const listR = await request('GET', '/api/classrooms/closed-dates/list', undefined, adminToken);
    check(listR.data.length === 4, '数据总数保持 4 条不变', listR.data.length);

    // 清理
    await request('PUT', '/api/classrooms/closed-dates/batch', { dates: [] }, adminToken);
  }

  // ----------------------------------------------------------------
  // 7. 导入导出一致性：导出的 CSV 能被重新导入
  // ----------------------------------------------------------------
  console.log('\n7. 导入导出一致性：导出 CSV 再导入结果一致');
  {
    // 导入一批
    const r1 = await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_VALID, skipDuplicates: true }, adminToken);
    check(r1.data.added === 4, '初始导入 added=4', r1.data.added);

    // 导出
    const exportR = await request('GET', '/api/classrooms/closed-dates/export', undefined, adminToken);
    check(exportR.status === 200, '导出返回 200');
    check((exportR.headers['content-type'] as string)?.includes('text/csv'), '响应 Content-Type 为 text/csv');
    check((exportR.headers['content-disposition'] as string)?.includes('attachment'), '响应含 attachment 下载头');

    const csvText = String(exportR.data).replace(/^\uFEFF/, '');
    check(csvText.includes('日期,关闭原因') || csvText.includes('date,reason'), '导出 CSV 含表头');
    check(csvText.includes('2026-07-01'), '导出 CSV 包含导入的 07-01');
    check(csvText.includes('国庆节'), '导出 CSV 包含"国庆节"原因');

    // 清空后用导出的 CSV 再导入
    await request('PUT', '/api/classrooms/closed-dates/batch', { dates: [] }, adminToken);
    const r2 = await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: csvText, skipDuplicates: true }, adminToken);
    check(r2.data.added === 4, '用导出内容再次导入 added=4', r2.data.added);

    const listR = await request('GET', '/api/classrooms/closed-dates/list', undefined, adminToken);
    check(listR.data.length === 4, '再导入后总数 = 4');
    const reasons = new Set(listR.data.map((d: any) => d.reason));
    check(reasons.has('建党节') && reasons.has('建军节') && reasons.has('教师节') && reasons.has('国庆节'), '所有原因与最初导入一致');

    // 清理
    await request('PUT', '/api/classrooms/closed-dates/batch', { dates: [] }, adminToken);
  }

  // ----------------------------------------------------------------
  // 8. 重启持久化：数据写入 db.json，服务重启后不丢
  // ----------------------------------------------------------------
  console.log('\n8. 持久化验证：写入 db.json，数据在磁盘上存在');
  {
    await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_VALID, skipDuplicates: true }, adminToken);
    const dbText = fs.readFileSync(dbPath, 'utf-8');
    const db = JSON.parse(dbText);
    check(Array.isArray(db.closedDates) && db.closedDates.length === 4, 'db.json 中 closedDates 有 4 条');
    check(db.closedDates.some((d: any) => d.date === '2026-10-01'), 'db.json 中存在 10-01');
    check(!!db.lastClosedDateImport, 'db.json 中保存了 lastClosedDateImport 快照');
    check(db.lastClosedDateImport.importedCount === 4, '快照 importedCount 在磁盘上正确');

    // 模拟"重启"：直接通过 getDB 重新读取
    const { getDB } = await import('../api/data/store.js');
    const reloaded = getDB();
    check(reloaded.closedDates.length === 4, '重新 getDB() 后仍有 4 条关闭日期');
    check(!!reloaded.lastClosedDateImport, '重新 getDB() 后仍有导入快照');

    // 清理
    await request('PUT', '/api/classrooms/closed-dates/batch', { dates: [] }, adminToken);
  }

  // ----------------------------------------------------------------
  // 9. 逐条结果不半成功半沉默：混合输入每条都有状态
  // ----------------------------------------------------------------
  console.log('\n9. 逐条结果完整性：每条记录都有明确状态，无静默半成功');
  {
    const previewR = await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: SAMPLE_CSV_MIXED }, adminToken);
    const rows: any[] = previewR.data.rows;
    check(rows.length === 7, '7 条输入对应 7 条预览结果', rows.length);
    check(rows.every((r) => r.line && ['new', 'duplicate', 'invalid'].includes(r.status)), '每条都有行号且 status ∈ {new, duplicate, invalid}');
    check(rows.every((r) => r.status === 'new' || r.message?.length > 0), '非 new 行都有 message 解释原因');

    const execR = await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_MIXED, skipDuplicates: true }, adminToken);
    check(execR.data.rows.length === 7, '执行结果也返回全部 7 条明细', execR.data.rows.length);
    check(execR.data.added + execR.data.skipped + execR.data.failed === 7, 'added+skipped+failed = 总行数', { added: execR.data.added, skipped: execR.data.skipped, failed: execR.data.failed, total: execR.data.added + execR.data.skipped + execR.data.failed });
  }

  // ----------------------------------------------------------------
  // 10. 审计日志：导入/导出/撤销都有记录
  // ----------------------------------------------------------------
  console.log('\n10. 审计日志：导入/导出/撤销/冲突处理都有记录');
  {
    // 先清审计日志
    const { getDB, saveDB } = await import('../api/data/store.js');
    const db0 = getDB();
    db0.auditLogs = [];
    db0.closedDates = [];
    db0.lastClosedDateImport = null;
    saveDB(db0);

    // 导出
    await request('GET', '/api/classrooms/closed-dates/export', undefined, adminToken);
    // 预览
    await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: SAMPLE_CSV_VALID }, adminToken);
    // 执行导入
    await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_VALID, skipDuplicates: true }, adminToken);
    // 撤销
    await request('POST', '/api/classrooms/closed-dates/import/undo', undefined, adminToken);

    const logsR = await request('GET', '/api/audit-logs', undefined, adminToken);
    const logs: any[] = logsR.data || [];
    check(logs.some((l) => l.action?.includes('导出关闭日期CSV')), '有"导出关闭日期CSV"审计日志');
    check(logs.some((l) => l.action?.includes('预览关闭日期导入')), '有"预览关闭日期导入"审计日志');
    check(logs.some((l) => l.action?.includes('批量导入关闭日期')), '有"批量导入关闭日期"审计日志');
    check(logs.some((l) => l.action?.includes('撤销关闭日期批量导入')), '有"撤销关闭日期批量导入"审计日志');
    check(logs.every((l) => typeof l.success === 'boolean'), '每条日志都有 success 字段');
    check(logs.some((l) => l.action?.includes('权限不足')) === false, 'admin 操作没有权限不足日志');
  }

  console.log(`\n=== 关闭日期批量导入回归测试结果：${passCount} 通过 / ${failCount} 失败 ===\n`);
  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
