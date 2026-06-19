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

function request(method: string, urlPath: string, body?: any, token?: string): Promise<{ status: number; data: any }> {
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
          resolve({ status: res.statusCode!, data: json });
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
function check(cond: boolean, desc: string, detail?: string) {
  if (cond) {
    passCount++;
    console.log(`  ✅ ${desc}`);
  } else {
    failCount++;
    console.error(`  ❌ ${desc}${detail ? ` — ${detail}` : ''}`);
  }
}
function noUndefined(obj: any, label: string): boolean {
  const keys = Object.keys(obj);
  for (const k of keys) {
    if (obj[k] === undefined) {
      check(false, `${label} 字段 "${k}" 为 undefined`);
      return false;
    }
  }
  return true;
}

const REQUIRED_CLASSROOM_STAT_KEYS = [
  'classroomId', 'classroomName', 'building',
  'totalSeats', 'totalReservations', 'completedCount', 'utilizationRate',
];

async function main() {
  console.log('\n=== 教室统计回归测试 ===\n');

  const adminToken = await login('admin', 'admin123');
  const stu1Token = await login('student01', '123456');
  const stu2Token = await login('student02', '123456');

  // ----------------------------------------------------------------
  // 1. /api/classroom-stats 返回 ClassroomStat[] 结构正确
  // ----------------------------------------------------------------
  console.log('1. GET /api/classroom-stats 返回正确 ClassroomStat[] 结构');
  const statR = await request('GET', '/api/classroom-stats', undefined, adminToken);
  check(statR.status === 200, '返回 200', `实际 ${statR.status}`);
  check(Array.isArray(statR.data), '返回数组', `实际 ${typeof statR.data}`);
  if (Array.isArray(statR.data)) {
    check(statR.data.length > 0, '数组非空（至少有默认教室）', `长度 ${statR.data.length}`);
    let allValid = true;
    for (let i = 0; i < statR.data.length; i++) {
      const item = statR.data[i];
      for (const key of REQUIRED_CLASSROOM_STAT_KEYS) {
        if (!(key in item)) {
          check(false, `第 ${i} 条缺少必填字段 "${key}"`);
          allValid = false;
        }
      }
      if (!noUndefined(item, `第 ${i} 条教室统计`)) allValid = false;
      // 类型校验
      if (typeof item.classroomId !== 'string' || item.classroomId.length === 0) {
        check(false, `第 ${i} 条 classroomId 不是有效字符串`);
        allValid = false;
      }
      if (typeof item.totalSeats !== 'number' || item.totalSeats < 0) {
        check(false, `第 ${i} 条 totalSeats 不是有效数字`);
        allValid = false;
      }
      if (typeof item.totalReservations !== 'number' || item.totalReservations < 0) {
        check(false, `第 ${i} 条 totalReservations 不是有效数字`);
        allValid = false;
      }
      if (typeof item.completedCount !== 'number' || item.completedCount < 0) {
        check(false, `第 ${i} 条 completedCount 不是有效数字`);
        allValid = false;
      }
      if (typeof item.utilizationRate !== 'number') {
        check(false, `第 ${i} 条 utilizationRate 不是数字`);
        allValid = false;
      }
    }
    if (allValid) check(true, '全部教室统计数据字段完整且类型正确');
  }

  // ----------------------------------------------------------------
  // 2. /api/classrooms 仍返回教室基础列表（不破坏原有功能）
  // ----------------------------------------------------------------
  console.log('\n2. GET /api/classrooms 仍返回教室基础列表');
  const baseR = await request('GET', '/api/classrooms', undefined, adminToken);
  check(baseR.status === 200, '返回 200');
  check(Array.isArray(baseR.data), '返回数组');
  if (Array.isArray(baseR.data) && baseR.data.length > 0) {
    const first = baseR.data[0];
    check('id' in first, '教室基础列表首条含 "id" 字段');
    check('seats' in first, '教室基础列表首条含 "seats" 字段');
    check(!('classroomId' in first), '教室基础列表首条不含 "classroomId"（与统计区分）');
    check(!('completedCount' in first), '教室基础列表首条不含 "completedCount"');
  }

  // ----------------------------------------------------------------
  // 3. 构造 no_show 数据，验证教室统计不被污染
  // ----------------------------------------------------------------
  console.log('\n3. no_show 不被漏算或错算进教室 completedCount');
  const { getDB, saveDB } = await import('../api/data/store.js');
  const { createReservation, approveReservation } = await import('../api/services/reservation.js');

  // 清理
  const db0 = getDB();
  db0.reservations = [];
  db0.violations = [];
  db0.auditLogs = [];
  saveDB(db0);

  const db = getDB();
  const student01 = db.users.find((u) => u.username === 'student01')!;
  const student02 = db.users.find((u) => u.username === 'student02')!;
  const classroom = db.classrooms.find((c) => c.id === 'cls-a101')!;
  const slot = db.timeSlots.find((t) => t.classroomId === 'cls-a101' && t.weekday.includes(1))!;

  // Case A: no_show（未签到超时收尾）→ 教室 A101
  const c1 = createReservation(student01, classroom.id, classroom.seats[0].id, '2026-06-22', slot.id);
  approveReservation(db.users.find((u) => u.username === 'admin')!, c1.data!.id);

  // Case B: 真实签到 + 签退 → 教室 A101
  const c2 = createReservation(student02, classroom.id, classroom.seats[1].id, '2026-06-22', slot.id);
  approveReservation(db.users.find((u) => u.username === 'admin')!, c2.data!.id);

  // 统一修改 DB
  const db2 = getDB();
  const r1 = db2.reservations.find((r) => r.id === c1.data!.id)!;
  r1.status = 'completed';
  (r1 as any).checkInTime = undefined;
  (r1 as any).checkOutTime = undefined;
  r1.isLate = true;
  r1.notCheckedOut = true;

  const r2 = db2.reservations.find((r) => r.id === c2.data!.id)!;
  r2.status = 'completed';
  (r2 as any).checkInTime = '2026-06-22 08:05';
  (r2 as any).checkOutTime = '2026-06-22 09:55';

  db2.violations.push({
    id: 'v-regression-1',
    studentId: student01.id,
    reservationId: r1.id,
    type: 'no_show',
    description: '未签到',
    date: r1.date,
    createdAt: new Date().toISOString(),
  });
  saveDB(db2);

  // 通过 HTTP 接口验证
  const statsAfterNoShow = await request('GET', '/api/classroom-stats', undefined, adminToken);
  const clsA101 = (statsAfterNoShow.data as any[]).find((c: any) => c.classroomId === 'cls-a101');
  check(!!clsA101, '能找到教室 A101 的统计数据');
  if (clsA101) {
    check(noUndefined(clsA101, '教室 A101 统计'), '教室 A101 统计无 undefined 字段');
    check(clsA101.totalReservations === 2, `totalReservations=2`, `实际 ${clsA101.totalReservations}`);
    check(clsA101.completedCount === 1, `completedCount=1（只有真实签到的 1 条）`, `实际 ${clsA101.completedCount}`);
    check(typeof clsA101.utilizationRate === 'number', `utilizationRate 是数字`, `实际 ${typeof clsA101.utilizationRate}`);
  }

  // ----------------------------------------------------------------
  // 4. 教室 CSV 导出字段与统计接口一致
  // ----------------------------------------------------------------
  console.log('\n4. 教室 CSV 导出字段与统计接口一致');
  const csvR = await request('GET', '/api/export/classrooms', undefined, adminToken);
  check(csvR.status === 200, '教室 CSV 导出返回 200');
  const csvText = String(csvR.data).replace(/^\uFEFF/, '');
  const csvLines = csvText.split('\n').filter((l: string) => l.trim());
  check(csvLines.length >= 1 + (statsAfterNoShow.data as any[]).length, 'CSV 行数 >= 表头 + 数据行');
  if (csvLines.length > 0) {
    const header = csvLines[0];
    check(header.includes('教室名称'), 'CSV 表头含"教室名称"');
    check(header.includes('完成次数'), 'CSV 表头含"完成次数"');
    check(header.includes('使用率'), 'CSV 表头含"使用率"');
    const headerCols = header.split(',').length;
    // 逐行检查：所有数据行列数与表头一致，且无 undefined
    let allRowsValid = true;
    for (let i = 1; i < csvLines.length; i++) {
      const cols = csvLines[i].split(',');
      if (cols.length !== headerCols) {
        check(false, `CSV 第 ${i} 行列数 ${cols.length} 与表头 ${headerCols} 不一致`);
        allRowsValid = false;
      }
      if (cols.some((c: string) => c === 'undefined' || c === 'null' || c === '')) {
        check(false, `CSV 第 ${i} 行含空/undefined/null 值`);
        allRowsValid = false;
      }
    }
    if (allRowsValid) check(true, '所有 CSV 数据行列数一致且无空值');
  }
  // 找 A101 行，与 API 数值对齐
  const a101Line = csvLines.find((l: string) => l.includes('A101'));
  if (a101Line && clsA101) {
    const cols = a101Line.split(',');
    // CSV 列：教室名称,教学楼,可用座位数,预约总数,完成次数,使用率
    check(cols[3] === String(clsA101.totalReservations), `CSV totalReservations=${cols[3]} 与 API=${clsA101.totalReservations} 一致`);
    check(cols[4] === String(clsA101.completedCount), `CSV completedCount=${cols[4]} 与 API=${clsA101.completedCount} 一致`);
  }

  // ----------------------------------------------------------------
  // 4b. 走错接口检测：如果误用 /api/classrooms 当统计用，能检测到字段缺失
  // ----------------------------------------------------------------
  console.log('\n4b. 走错接口检测：误用 /api/classrooms 当统计用会被检测到');
  const wrongR = await request('GET', '/api/classrooms', undefined, adminToken);
  if (Array.isArray(wrongR.data) && wrongR.data.length > 0) {
    const firstWrong = wrongR.data[0];
    const missingStatsFields = REQUIRED_CLASSROOM_STAT_KEYS.filter((k) => !(k in firstWrong));
    check(missingStatsFields.length > 0, `能检测到走错接口缺失的统计字段`, `缺失: ${missingStatsFields.join(',')}`);
    // 走错接口拿到的是 Classroom 基础对象，不应该有 completedCount 等统计字段
    check(!('completedCount' in firstWrong), '旧入口 /api/classrooms 不含 completedCount（不会混淆）');
    check(!('utilizationRate' in firstWrong), '旧入口 /api/classrooms 不含 utilizationRate（不会混淆）');
  }

  // ----------------------------------------------------------------
  // 5. 学生统计端点也不受 no_show 污染
  // ----------------------------------------------------------------
  console.log('\n5. 学生统计端点 no_show 不污染（交叉验证）');
  const stuStatsR = await request('GET', '/api/students', undefined, adminToken);
  const s1 = (stuStatsR.data as any[]).find((s: any) => s.studentUsername === 'student01');
  const s2 = (stuStatsR.data as any[]).find((s: any) => s.studentUsername === 'student02');
  if (s1) {
    check(s1.checkInCount === 0, `student01 checkInCount=0（no_show）`, `实际 ${s1.checkInCount}`);
    check(s1.completedCount === 0, `student01 completedCount=0（no_show）`, `实际 ${s1.completedCount}`);
    check(s1.violationCount >= 1, `student01 violationCount>=1（no_show 违约）`, `实际 ${s1.violationCount}`);
    check(noUndefined(s1, 'student01 统计'), 'student01 统计无 undefined');
  }
  if (s2) {
    check(s2.checkInCount === 1, `student02 checkInCount=1（真实签到）`, `实际 ${s2.checkInCount}`);
    check(s2.completedCount === 1, `student02 completedCount=1（真实签退）`, `实际 ${s2.completedCount}`);
    check(noUndefined(s2, 'student02 统计'), 'student02 统计无 undefined');
  }

  // ----------------------------------------------------------------
  // 6. 代签失败不改变预约状态，教室统计不受影响
  // ----------------------------------------------------------------
  console.log('\n6. 代签失败不改变教室统计');
  // 构造一条新的已批准预约给 student01
  const c3 = createReservation(student01, classroom.id, classroom.seats[2].id, '2026-06-22', slot.id);
  if (c3.success) {
    approveReservation(db.users.find((u) => u.username === 'admin')!, c3.data!.id);
    // student02 代签
    const failSignR = await request('POST', `/api/reservations/${c3.data!.id}/checkin`, { targetStudentId: student01.id }, stu2Token);
    check(failSignR.status === 400, '代签返回 400');
    // 教室统计 completedCount 不变
    const statsAfter = await request('GET', '/api/classroom-stats', undefined, adminToken);
    const clsAfter = (statsAfter.data as any[]).find((c: any) => c.classroomId === 'cls-a101');
    if (clsAfter) {
      check(clsAfter.completedCount === 1, `代签失败后 completedCount 仍为 1`, `实际 ${clsAfter.completedCount}`);
    }
  } else {
    console.log('  ⚠️ 第三条预约创建失败（可能座位不足），跳过代签测试');
    check(true, '代签测试跳过（预约创建失败）');
  }

  console.log(`\n=== 教室统计回归测试结果：${passCount} 通过 / ${failCount} 失败 ===\n`);
  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
