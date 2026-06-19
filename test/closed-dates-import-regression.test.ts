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

function requestRaw(method: string, urlPath: string, token?: string): Promise<{ status: number; body: string; headers: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          resolve({ status: res.statusCode!, body: buf, headers: res.headers });
        });
      },
    );
    req.on('error', reject);
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

const SAMPLE_CSV_WITH_CLASSROOM = `日期,关闭原因,教室
2026-07-01,建党节-A101,cls-a101
2026-08-01,建军节-Z999,Z999
2026-09-10,教师节-B202,cls-b202
2026-10-01,国庆-不存在,NOT-EXIST
2026-11-11,双11-空教室,
2026-12-25,圣诞-A101-2,cls-a101
`;

const SAMPLE_CSV_CLASSROOM_MATCH_MODES = `日期,关闭原因,classroomId
2026-07-01,方式1-id,cls-a101
2026-08-01,方式2-名称,A101
2026-09-01,方式3-楼栋+名称,A栋教学楼 A101
2026-10-01,方式4-B202,B202
2026-11-01,方式5-无效,Z999
`;

const SAMPLE_CSV_SAME_CLASSROOM_DUP = `日期,关闭原因,教室
2026-07-01,上午,A101
2026-07-01,下午,A101
2026-07-01,全局,
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

    // 导出（用 raw request 拿到原始 CSV 文本）
    const exportR = await requestRaw('GET', '/api/classrooms/closed-dates/export', adminToken);
    check(exportR.status === 200, '导出返回 200');
    check((exportR.headers['content-type'] as string)?.includes('text/csv'), '响应 Content-Type 为 text/csv');
    check((exportR.headers['content-disposition'] as string)?.includes('attachment'), '响应含 attachment 下载头');

    const csvText = exportR.body.replace(/^\uFEFF/, '');
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
  // 8. 真正重启持久化：停掉服务 → 重启 → 数据仍在
  // ----------------------------------------------------------------
  console.log('\n8. 真正重启持久化：停止服务 → 重新启动 → 数据完整恢复');
  {
    await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_WITH_CLASSROOM, skipDuplicates: true }, adminToken);

    const execR2 = await request('GET', '/api/classrooms/closed-dates/list', undefined, adminToken);
    const countBeforeRestart = execR2.data.length;
    check(countBeforeRestart === 3, `导入后 list 有 3 条`, countBeforeRestart);

    const snapR = await request('GET', '/api/classrooms/closed-dates/import/last', undefined, adminToken);
    const batchIdBefore = snapR.data.batchId;
    check(!!batchIdBefore, '重启前快照存在且 batchId 非空', batchIdBefore);

    // 确认磁盘写入
    const dbText = fs.readFileSync(dbPath, 'utf-8');
    const db = JSON.parse(dbText);
    check(Array.isArray(db.closedDates) && db.closedDates.length === 3, 'db.json 中 closedDates 有 3 条');
    check(!!db.lastClosedDateImport, 'db.json 中保存了 lastClosedDateImport 快照');
    check(db.lastClosedDateImport.importedCount === 3, '快照 importedCount 在磁盘上正确');
    check(db.closedDates.some((d: any) => d.classroomId === 'cls-a101'), '磁盘记录带 classroomId');

    // 真正重启服务：动态 import app，启动新实例在测试端口
    console.log('  正在停止并重启服务...');
    const { default: app } = await import('../api/app.js');
    const TEST_PORT = 13001;
    const server1 = app.listen(TEST_PORT);

    // 等待新服务就绪
    await new Promise<void>((resolve) => {
      const tryHealth = () => {
        http.get(`http://localhost:${TEST_PORT}/api/health`, (res) => {
          res.resume();
          if (res.statusCode === 200) resolve();
          else setTimeout(tryHealth, 200);
        }).on('error', () => setTimeout(tryHealth, 200));
      };
      setTimeout(tryHealth, 100);
    });

    // 新服务上重新登录（内存会话已丢失）
    const loginOnNewServer = (username: string, password: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify({ username, password });
        const req = http.request(
          {
            hostname: 'localhost',
            port: TEST_PORT,
            path: '/api/auth/login',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
          },
          (res) => {
            let buf = '';
            res.on('data', (c) => (buf += c));
            res.on('end', () => {
              try {
                const json = JSON.parse(buf);
                if (json.token) resolve(json.token);
                else reject(new Error('no token'));
              } catch { reject(new Error('parse error')); }
            });
          },
        );
        req.on('error', reject);
        req.write(data);
        req.end();
      });
    };

    const getOnNewServer = (path: string, token: string): Promise<{ status: number; data: any }> => {
      return new Promise((resolve) => {
        const req = http.request(
          {
            hostname: 'localhost',
            port: TEST_PORT,
            path,
            method: 'GET',
            headers: { Authorization: `Bearer ${token}` },
          },
          (res) => {
            let buf = '';
            res.on('data', (c) => (buf += c));
            res.on('end', () => {
              let json: any = buf;
              try { json = JSON.parse(buf); } catch {}
              resolve({ status: res.statusCode!, data: json });
            });
          },
        );
        req.on('error', () => resolve({ status: 0, data: null }));
        req.end();
      });
    };

    const newAdminToken = await loginOnNewServer('admin', 'admin123');
    check(!!newAdminToken, '重启后能重新登录获取 token');

    // 在新服务实例上验证数据
    const listAfterRestart = await getOnNewServer('/api/classrooms/closed-dates/list', newAdminToken);
    check(listAfterRestart.status === 200, '重启后 list API 返回 200', listAfterRestart.status);
    check(listAfterRestart.data.length === countBeforeRestart, `重启后数据条数不变 (${countBeforeRestart})`, listAfterRestart.data.length);

    const snapAfterRestart = await getOnNewServer('/api/classrooms/closed-dates/import/last', newAdminToken);
    check(snapAfterRestart.status === 200, '重启后快照 API 返回 200');
    check(snapAfterRestart.data?.batchId === batchIdBefore, '重启后快照 batchId 不变', snapAfterRestart.data?.batchId);
    check(snapAfterRestart.data?.importedCount === 3, '重启后快照 importedCount 仍为 3', snapAfterRestart.data?.importedCount);

    // 关闭测试服务
    await new Promise<void>((resolve) => server1.close(() => resolve()));

    // 清理（通过原服务）
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

  // ----------------------------------------------------------------
  // 11. 教室列预览校验：不存在的教室标记 invalid
  // ----------------------------------------------------------------
  console.log('\n11. 教室列预览校验：不存在的教室标记 invalid，不能进新增队列');
  {
    const previewR = await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: SAMPLE_CSV_WITH_CLASSROOM }, adminToken);
    check(previewR.data.total === 6, '6 条输入', previewR.data.total);
    check(previewR.data.newCount === 3, '可新增 = 3（cls-a101 两个不同日期 + cls-b202）', previewR.data.newCount);
    check(previewR.data.invalidCount === 3, '无效 = 3（Z999、NOT-EXIST、空教室）', previewR.data.invalidCount);
    check(previewR.data.duplicateCount === 0, '重复 = 0', previewR.data.duplicateCount);

    const z999Row = previewR.data.rows.find((r: any) => r.date === '2026-08-01');
    check(z999Row?.status === 'invalid', 'Z999 状态 = invalid', z999Row?.status);
    check(z999Row?.message?.includes('Z999'), 'Z999 错误信息包含教室名称', z999Row?.message);
    check(z999Row?.message?.includes('教室'), 'Z999 错误信息包含"教室"字样', z999Row?.message);

    const notExistRow = previewR.data.rows.find((r: any) => r.date === '2026-10-01');
    check(notExistRow?.status === 'invalid', 'NOT-EXIST 状态 = invalid', notExistRow?.status);

    const emptyRow = previewR.data.rows.find((r: any) => r.date === '2026-11-11');
    check(emptyRow?.status === 'invalid', '空教室状态 = invalid', emptyRow?.status);
    check(emptyRow?.message?.includes('教室不能为空'), '空教室错误提示正确', emptyRow?.message);

    const validRow = previewR.data.rows.find((r: any) => r.date === '2026-07-01');
    check(validRow?.status === 'new', '有效 cls-a101 状态 = new', validRow?.status);
    check(validRow?.classroomId === 'cls-a101', '有效行 classroomId 正确', validRow?.classroomId);
    check(validRow?.classroomName?.includes('A101'), '有效行带 classroomName', validRow?.classroomName);
  }

  // ----------------------------------------------------------------
  // 12. 执行导入：无效教室不会写入数据库
  // ----------------------------------------------------------------
  console.log('\n12. 执行导入：无效教室不会写入数据库，只有有效记录新增');
  {
    // 先清空
    await request('PUT', '/api/classrooms/closed-dates/batch', { dates: [] }, adminToken);

    const execR = await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_WITH_CLASSROOM }, adminToken);
    check(execR.data.success === true, '导入成功', execR.data.success);
    check(execR.data.added === 3, '实际新增 = 3', execR.data.added);
    check(execR.data.failed === 3, '失败 = 3', execR.data.failed);
    check(execR.data.rows.length === 6, '6 条结果明细', execR.data.rows.length);

    // 验证数据库
    const listR = await request('GET', '/api/classrooms/closed-dates/list', undefined, adminToken);
    check(listR.data.length === 3, '数据库中只有 3 条', listR.data.length);
    const datesInDB = listR.data.map((d: any) => d.date).sort();
    check(JSON.stringify(datesInDB) === JSON.stringify(['2026-07-01', '2026-09-10', '2026-12-25']), '写入的日期正确', datesInDB);
    check(!listR.data.some((d: any) => d.date === '2026-08-01'), 'Z999 未写入');
    check(!listR.data.some((d: any) => d.date === '2026-10-01'), 'NOT-EXIST 未写入');
    check(!listR.data.some((d: any) => d.date === '2026-11-11'), '空教室未写入');

    // 验证 classroomId 字段写入
    const july1 = listR.data.find((d: any) => d.date === '2026-07-01');
    check(july1?.classroomId === 'cls-a101', '写入的记录带 classroomId', july1?.classroomId);
  }

  // ----------------------------------------------------------------
  // 13. 导出：带 classroomId 的记录导出时带出教室列
  // ----------------------------------------------------------------
  console.log('\n13. 导出：有 classroomId 的记录导出时带出教室列');
  {
    const exportR = await requestRaw('GET', '/api/classrooms/closed-dates/export', adminToken);
    check(exportR.status === 200, '导出 200', exportR.status);
    const csvBody = exportR.body.replace(/^\uFEFF/, '');
    check(csvBody.includes('日期,关闭原因,教室'), '导出包含教室列头', csvBody.includes('日期,关闭原因,教室'));
    check(csvBody.includes('A栋教学楼 A101'), '导出包含教室名称', csvBody.includes('A栋教学楼 A101'));
  }

  // ----------------------------------------------------------------
  // 14. 导入导出一致性：导出的 CSV 能正确再导入（含教室列）
  // ----------------------------------------------------------------
  console.log('\n14. 导入导出一致性：导出 CSV（含教室列）能正确再导入');
  {
    const exportR = await requestRaw('GET', '/api/classrooms/closed-dates/export', adminToken);
    const csvBody = exportR.body.replace(/^\uFEFF/, '');
    const previewR = await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: csvBody }, adminToken);
    check(previewR.data.duplicateCount === 3, '导出后再预览：3 条都重复（在 DB 中）', previewR.data.duplicateCount);
    check(previewR.data.invalidCount === 0, '导出后再预览：无无效记录', previewR.data.invalidCount);
  }

  // ----------------------------------------------------------------
  // 15. 撤销：只恢复实际导入的记录，不恢复无效行
  //     + 撤销后导出 CSV 回退 + 快照清除
  // ----------------------------------------------------------------
  console.log('\n15. 撤销：恢复到导入前状态 + 导出回退 + 快照清除');
  {
    // 当前状态：3 条带教室的记录（上面第 12 步导入的）
    // 先记录当前导出内容
    const exportBeforeUndo = await requestRaw('GET', '/api/classrooms/closed-dates/export', adminToken);
    const csvBeforeUndo = exportBeforeUndo.body.replace(/^\uFEFF/, '');
    check(csvBeforeUndo.split('\n').length >= 4, '撤销前导出至少 4 行（表头+3数据）');

    // 撤销
    const undoR = await request('POST', '/api/classrooms/closed-dates/import/undo', undefined, adminToken);
    check(undoR.data.success === true, '撤销成功', undoR.data.success);
    check(undoR.data.restoredCount === 3, '撤销恢复 3 条', undoR.data.restoredCount);

    // 撤销后列表为空
    const listR = await request('GET', '/api/classrooms/closed-dates/list', undefined, adminToken);
    check(listR.data.length === 0, '撤销后数据库为空', listR.data.length);

    // 撤销后导出 CSV 也应为空或仅有表头
    const exportAfterUndo = await requestRaw('GET', '/api/classrooms/closed-dates/export', adminToken);
    const csvAfterUndo = exportAfterUndo.body.replace(/^\uFEFF/, '');
    const dataLinesAfterUndo = csvAfterUndo.split('\n').filter((l: string) => l.trim().length > 0 && !l.startsWith('日期') && !l.startsWith('date'));
    check(dataLinesAfterUndo.length === 0, '撤销后导出 CSV 无数据行', dataLinesAfterUndo.length);

    // 撤销后快照为 null
    const lastR = await request('GET', '/api/classrooms/closed-dates/import/last', undefined, adminToken);
    check(lastR.data === null, '撤销后快照为 null', lastR.data);
  }

  // ----------------------------------------------------------------
  // 16. 撤销后再次导出-再导入闭环：导出内容再预览应为 0 条
  // ----------------------------------------------------------------
  console.log('\n16. 撤销后导出闭环验证：空数据导出再预览应为 0 条有效记录');
  {
    const exportR = await requestRaw('GET', '/api/classrooms/closed-dates/export', adminToken);
    const csvBody = exportR.body.replace(/^\uFEFF/, '');
    const previewR = await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: csvBody }, adminToken);
    check(previewR.data.total === 0, '空数据导出再预览 total=0', previewR.data.total);
    check(previewR.data.newCount === 0, '空数据导出再预览 newCount=0', previewR.data.newCount);
  }

  // ----------------------------------------------------------------
  // 17. 多种教室匹配方式（id、名称、楼栋+名称）
  // ----------------------------------------------------------------
  console.log('\n17. 多种教室匹配方式：id、名称、楼栋+名称都支持');
  {
    const previewR = await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: SAMPLE_CSV_CLASSROOM_MATCH_MODES }, adminToken);
    check(previewR.data.newCount === 4, '4 种匹配方式都成功', previewR.data.newCount);
    check(previewR.data.invalidCount === 1, 'Z999 无效', previewR.data.invalidCount);

    const byId = previewR.data.rows.find((r: any) => r.date === '2026-07-01');
    check(byId?.classroomId === 'cls-a101', 'id 匹配正确', byId?.classroomId);

    const byName = previewR.data.rows.find((r: any) => r.date === '2026-08-01');
    check(byName?.classroomId === 'cls-a101', '名称匹配正确', byName?.classroomId);

    const byFull = previewR.data.rows.find((r: any) => r.date === '2026-09-01');
    check(byFull?.classroomId === 'cls-a101', '楼栋+名称匹配正确', byFull?.classroomId);

    const byB202 = previewR.data.rows.find((r: any) => r.date === '2026-10-01');
    check(byB202?.classroomId === 'cls-b202', 'B202 名称匹配正确', byB202?.classroomId);
  }

  // ----------------------------------------------------------------
  // 18. 同批内同教室同日重复检测
  // ----------------------------------------------------------------
  console.log('\n18. 同批内同教室同日重复检测');
  {
    const previewR = await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: SAMPLE_CSV_SAME_CLASSROOM_DUP }, adminToken);
    check(previewR.data.newCount === 1, '可新增 = 1（仅第一条）', previewR.data.newCount);
    check(previewR.data.duplicateCount === 1, '重复 = 1（同教室同日第二条）', previewR.data.duplicateCount);
    check(previewR.data.invalidCount === 1, '无效 = 1（有教室列但教室为空）', previewR.data.invalidCount);

    const dupRow = previewR.data.rows.find((r: any) => r.line === 3);
    check(dupRow?.status === 'duplicate', '第二条同教室同日为 duplicate', dupRow?.status);
    check(dupRow?.message?.includes('日期已有关闭记录') || dupRow?.message?.includes('已有关闭记录'), '重复提示正确', dupRow?.message);

    const emptyRow = previewR.data.rows.find((r: any) => r.line === 4);
    check(emptyRow?.status === 'invalid', '第三条空教室为 invalid', emptyRow?.status);
  }

  // ----------------------------------------------------------------
  // 19. 不带教室列时保持全局逻辑
  // ----------------------------------------------------------------
  console.log('\n19. 不带教室列时保持全局逻辑（向后兼容）');
  {
    const previewR = await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: SAMPLE_CSV_VALID }, adminToken);
    check(previewR.data.newCount === 4, '不带教室列时 new = 4', previewR.data.newCount);
    check(previewR.data.invalidCount === 0, '不带教室列时无 invalid', previewR.data.invalidCount);

    // 执行后验证无 classroomId
    const execR = await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_VALID, skipDuplicates: true }, adminToken);
    check(execR.data.added === 4, '不带教室列时新增 4 条', execR.data.added);

    const listR = await request('GET', '/api/classrooms/closed-dates/list', undefined, adminToken);
    check(listR.data.every((d: any) => !d.classroomId), '全局关闭记录无 classroomId 字段', listR.data.map((d:any) => d.classroomId));

    // 清理
    await request('POST', '/api/classrooms/closed-dates/import/undo', undefined, adminToken);
  }

  // ----------------------------------------------------------------
  // 20. 学生无权限访问教室列相关导入
  // ----------------------------------------------------------------
  console.log('\n20. 学生无权限：带教室列的导入学生也无法访问');
  {
    const prevR = await request('POST', '/api/classrooms/closed-dates/import/preview', { csv: SAMPLE_CSV_WITH_CLASSROOM }, stu1Token);
    check(prevR.status === 403, '学生预览返回 403', prevR.status);

    const execR = await request('POST', '/api/classrooms/closed-dates/import/execute', { csv: SAMPLE_CSV_WITH_CLASSROOM }, stu1Token);
    check(execR.status === 403, '学生执行导入返回 403', execR.status);
  }

  console.log(`\n=== 关闭日期批量导入回归测试结果：${passCount} 通过 / ${failCount} 失败 ===\n`);
  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
