import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { User, Reservation } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dbPath = path.join(root, 'data', 'db.json');
const dbBackupPath = path.join(root, 'data', 'db.json.bak');

function backupDB() {
  if (fs.existsSync(dbPath)) {
    fs.copyFileSync(dbPath, dbBackupPath);
  }
}
function restoreDB() {
  if (fs.existsSync(dbBackupPath)) {
    fs.copyFileSync(dbBackupPath, dbPath);
    try { fs.unlinkSync(dbBackupPath); } catch {}
  }
}

let passCount = 0;
let failCount = 0;
function test(name: string, fn: () => void | Promise<void>) {
  try {
    const r = fn();
    if (r && typeof (r as Promise<void>).then === 'function') {
      (r as Promise<void>).then(
        () => {
          passCount++;
          console.log(`  ✅ ${name}`);
        },
        (e) => {
          failCount++;
          console.error(`  ❌ ${name}\n     ${(e as Error).stack || (e as Error).message}`);
        },
      );
    } else {
      passCount++;
      console.log(`  ✅ ${name}`);
    }
  } catch (e) {
    failCount++;
    console.error(`  ❌ ${name}\n     ${(e as Error).stack || (e as Error).message}`);
  }
}

backupDB();
process.on('exit', restoreDB);

console.log('\n=== Bug 回归测试 ===\n');

// =========================================================================
// Bug 1: 时区 todayLocalStr
// =========================================================================
console.log('Bug 1: 时区 todayLocalStr 北京时间凌晨不误判');
import { todayLocalStr } from '../api/services/reservation.js';

test('todayLocalStr 使用本地时区（非 UTC）返回正确日期（凌晨 01:30）', () => {
  // new Date(year, month-1, day, hour, min) = 本地时区构造
  // 本地 2026-06-20 01:30 对应 UTC 2026-06-19 17:30
  const d = new Date(2026, 5, 20, 1, 30, 0);
  const s = todayLocalStr(d);
  assert.equal(s, '2026-06-20', `北京时间凌晨 01:30 应当返回 2026-06-20，实际 ${s}`);
});

test('todayLocalStr 正常白天时间也返回正确日期', () => {
  const d = new Date(2026, 5, 20, 14, 0, 0);
  assert.equal(todayLocalStr(d), '2026-06-20');
});

test('todayLocalStr 跨日前夕 23:59 返回正确日期', () => {
  const d = new Date(2026, 5, 20, 23, 59, 0);
  assert.equal(todayLocalStr(d), '2026-06-20');
});

test('todayLocalStr 零点 00:00:00 返回正确日期', () => {
  const d = new Date(2026, 5, 20, 0, 0, 0);
  assert.equal(todayLocalStr(d), '2026-06-20');
});

// =========================================================================
// Bug 2: 统计口径
// =========================================================================
console.log('\nBug 2: 统计口径 no_show 不误算成已签到/已完成');
import { getStudentStats, getClassroomStats, exportToCSV } from '../api/services/statistics.js';
import { createReservation, approveReservation, checkIn } from '../api/services/reservation.js';
import { getDB, saveDB } from '../api/data/store.js';

function resetDB() {
  const db = getDB();
  db.reservations = [];
  db.violations = [];
  db.auditLogs = [];
  saveDB(db);
}

// 2026-06-22 是周一，属于默认时段的 weekday=[1,2,3,4,5]
const TEST_DATE = '2026-06-22';
// 选一个工作日开放的时段
function getDefaultSlot() {
  return getDB().timeSlots.find((t) => t.classroomId === 'cls-a101' && t.weekday.includes(1))!;
}
function getDefaultClassroom() {
  return getDB().classrooms.find((c) => c.id === 'cls-a101')!;
}
function getStudent01(): User {
  return getDB().users.find((u) => u.username === 'student01')!;
}
function getAdmin(): User {
  return getDB().users.find((u) => u.username === 'admin')!;
}

test('仅 status=completed(no_show) 不计入学生签到/完成次数', () => {
  resetDB();
  const student01 = getStudent01();
  const classroom = getDefaultClassroom();
  const slot = getDefaultSlot();

  // 1. 学生创建预约 → 管理员批准
  const created = createReservation(student01, classroom.id, classroom.seats[0].id, TEST_DATE, slot.id);
  assert.ok(created.success, `创建预约应成功: ${created.error || ''}`);
  const reservation = created.data!;
  const approved = approveReservation(getAdmin(), reservation.id);
  assert.ok(approved.success, `批准应成功: ${approved.error || ''}`);

  // 2. 模拟 processMissedCheckouts: 未签到超时 → completed + no_show（checkInTime/checkOutTime 均不存在）
  const db = getDB();
  const r = db.reservations.find((x) => x.id === reservation.id)!;
  r.status = 'completed';
  r.isLate = true;
  r.notCheckedOut = true;
  (r as any).checkInTime = undefined;
  (r as any).checkOutTime = undefined;
  db.violations.push({
    id: 'v-test-1',
    studentId: student01.id,
    reservationId: r.id,
    type: 'no_show',
    date: r.date,
    createdAt: new Date().toISOString(),
  });
  saveDB(db);

  // 3. 校验统计
  const stats = getStudentStats().find((s) => s.studentId === student01.id)!;
  assert.equal(stats.totalReservations, 1, '预约总数应为 1');
  assert.equal(stats.checkInCount, 0, `no_show 不应计入 checkInCount，实际 ${stats.checkInCount}`);
  assert.equal(stats.completedCount, 0, `no_show 不应计入 completedCount，实际 ${stats.completedCount}`);
  assert.equal(stats.violationCount, 1, '违约次数应为 1 (no_show)');
});

test('真实签到 + 正常签退 → checkInCount=1, completedCount=1', () => {
  resetDB();
  const student01 = getStudent01();
  const classroom = getDefaultClassroom();
  const slot = getDefaultSlot();

  const created = createReservation(student01, classroom.id, classroom.seats[0].id, TEST_DATE, slot.id);
  const reservation = created.data!;
  approveReservation(getAdmin(), reservation.id);

  // 模拟真实签到签退
  const db = getDB();
  const r = db.reservations.find((x) => x.id === reservation.id)!;
  r.status = 'completed';
  (r as any).checkInTime = '2026-06-22 08:05';
  (r as any).checkOutTime = '2026-06-22 09:55';
  saveDB(db);

  const stats = getStudentStats().find((s) => s.studentId === student01.id)!;
  assert.equal(stats.totalReservations, 1);
  assert.equal(stats.checkInCount, 1, `真实签到应计入 checkInCount，实际 ${stats.checkInCount}`);
  assert.equal(stats.completedCount, 1, `真实签退应计入 completedCount，实际 ${stats.completedCount}`);
});

test('真实签到但未签退（not_checked_out 违约）→ 也算签到和完成使用', () => {
  resetDB();
  const student01 = getStudent01();
  const classroom = getDefaultClassroom();
  const slot = getDefaultSlot();

  const created = createReservation(student01, classroom.id, classroom.seats[0].id, TEST_DATE, slot.id);
  const reservation = created.data!;
  approveReservation(getAdmin(), reservation.id);

  const db = getDB();
  const r = db.reservations.find((x) => x.id === reservation.id)!;
  r.status = 'completed';
  r.notCheckedOut = true;
  (r as any).checkInTime = '2026-06-22 08:05';
  (r as any).checkOutTime = undefined;
  db.violations.push({
    id: 'v-test-2',
    studentId: student01.id,
    reservationId: r.id,
    type: 'not_checked_out',
    date: r.date,
    createdAt: new Date().toISOString(),
  });
  saveDB(db);

  const stats = getStudentStats().find((s) => s.studentId === student01.id)!;
  assert.equal(stats.totalReservations, 1);
  assert.equal(stats.checkInCount, 1, `真实签到(未签退)应计入 checkInCount，实际 ${stats.checkInCount}`);
  assert.equal(stats.completedCount, 1, `真实签到(未签退)也算使用完成，实际 ${stats.completedCount}`);
  assert.equal(stats.violationCount, 1, '违约次数应为 1 (not_checked_out)');
});

test('教室维度统计同样按真实签到判定，no_show 不计入', () => {
  resetDB();
  const student01 = getStudent01();
  const student02 = getDB().users.find((u) => u.username === 'student02')!;
  const classroom = getDefaultClassroom();
  const slot = getDefaultSlot();

  // 先创建两条预约并批准
  const c1 = createReservation(student01, classroom.id, classroom.seats[0].id, TEST_DATE, slot.id);
  approveReservation(getAdmin(), c1.data!.id);
  const c2 = createReservation(student02, classroom.id, classroom.seats[1].id, TEST_DATE, slot.id);
  approveReservation(getAdmin(), c2.data!.id);

  // 一次拿 DB 引用，修改两条预约，最后统一保存
  const db = getDB();
  // Case 1: no_show completed
  const noShow = db.reservations.find((r) => r.id === c1.data!.id)!;
  noShow.status = 'completed';
  (noShow as any).checkInTime = undefined;
  (noShow as any).checkOutTime = undefined;
  // Case 2: 真实签到 + 签退
  const real = db.reservations.find((r) => r.id === c2.data!.id)!;
  real.status = 'completed';
  (real as any).checkInTime = '2026-06-22 08:05';
  (real as any).checkOutTime = '2026-06-22 09:55';
  saveDB(db);

  const cstats = getClassroomStats().find((c) => c.classroomId === classroom.id)!;
  assert.equal(cstats.totalReservations, 2, `教室预约总数应为 2，实际 ${cstats.totalReservations}`);
  assert.equal(cstats.completedCount, 1, `教室维度 completedCount 应只有真实签到的 1 条，实际 ${cstats.completedCount}`);
});

test('CSV 导出数字与统计接口一致', () => {
  resetDB();
  const student01 = getStudent01();
  const student02 = getDB().users.find((u) => u.username === 'student02')!;
  const classroom = getDefaultClassroom();
  const slot = getDefaultSlot();

  // 先创建两条预约并批准
  const c1 = createReservation(student01, classroom.id, classroom.seats[0].id, TEST_DATE, slot.id);
  approveReservation(getAdmin(), c1.data!.id);
  const c2 = createReservation(student02, classroom.id, classroom.seats[1].id, TEST_DATE, slot.id);
  approveReservation(getAdmin(), c2.data!.id);

  // 一次修改，一次保存
  const db = getDB();
  const noShow = db.reservations.find((r) => r.id === c1.data!.id)!;
  noShow.status = 'completed';
  (noShow as any).checkInTime = undefined;
  (noShow as any).checkOutTime = undefined;
  const real = db.reservations.find((r) => r.id === c2.data!.id)!;
  real.status = 'completed';
  (real as any).checkInTime = '2026-06-22 08:05';
  (real as any).checkOutTime = '2026-06-22 09:55';
  saveDB(db);

  const csv = exportToCSV('students');
  const stats = getStudentStats().find((s) => s.studentId === student01.id)!;
  const lines = csv.split('\n');
  const studentLine = lines.find((l) => l.includes(student01.username));
  assert.ok(studentLine, 'CSV 中应有学生数据');
  const cols = studentLine!.split(',');
  // CSV 列：学号,姓名,预约总数,完成次数,签到次数,签到率,违约次数
  assert.equal(cols[2], String(stats.totalReservations), 'CSV 预约总数一致');
  assert.equal(cols[3], String(stats.completedCount), `CSV 完成次数应=${stats.completedCount}，实际 ${cols[3]}`);
  assert.equal(cols[4], String(stats.checkInCount), `CSV 签到次数应=${stats.checkInCount}，实际 ${cols[4]}`);
});

test('失败签到（身份错误/代签）不改变预约状态且不污染统计', () => {
  resetDB();
  const student01 = getStudent01();
  const student02 = getDB().users.find((u) => u.username === 'student02')!;
  const classroom = getDefaultClassroom();
  const slot = getDefaultSlot();

  const created = createReservation(student01, classroom.id, classroom.seats[0].id, TEST_DATE, slot.id);
  const reservation = created.data!;
  approveReservation(getAdmin(), reservation.id);

  // 统计初始状态
  const statsBefore = getStudentStats().find((s) => s.studentId === student01.id)!;
  assert.equal(statsBefore.checkInCount, 0, '初始 checkInCount=0');
  assert.equal(statsBefore.completedCount, 0, '初始 completedCount=0');

  // student02 试图代签 student01 的预约 → 应失败
  const failResult = checkIn(student02, reservation.id, student01.id);
  assert.ok(!failResult.success, '代签应失败');
  assert.match(failResult.error || '', /签到|替.*他人|student|身份|权限/i, `代签应有合适错误信息：${failResult.error}`);

  // 失败后状态应保持 approved
  const db = getDB();
  const rAfter = db.reservations.find((x) => x.id === reservation.id)!;
  assert.equal(rAfter.status, 'approved', `失败操作不应改变预约状态，实际 ${rAfter.status}`);
  assert.equal((rAfter as any).checkInTime, undefined, '失败操作不应写入 checkInTime');

  // 统计不应被污染
  const statsAfter = getStudentStats().find((s) => s.studentId === student01.id)!;
  assert.equal(statsAfter.checkInCount, 0, `失败签到后 checkInCount 仍应为 0，实际 ${statsAfter.checkInCount}`);
  assert.equal(statsAfter.completedCount, 0, `失败签到后 completedCount 仍应为 0，实际 ${statsAfter.completedCount}`);
});

// =========================================================================
// Bug 1: 服务重启后（从 JSON 恢复）签到不误判
// =========================================================================
console.log('\nBug 1: 服务重启后（从 JSON 恢复数据）签到不误判非当日');
test('从 db.json 恢复后，本地时区日期比较正确', () => {
  resetDB();
  const student01 = getStudent01();
  const admin = getAdmin();
  const classroom = getDefaultClassroom();

  // 构造今日（本地时区）的日期字符串
  const now = new Date();
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const weekday = now.getDay() === 0 ? 7 : now.getDay();

  // 找一个今日开放的时段（工作日时段，如果今日是周末则找任何可用）
  let slot = getDB().timeSlots.find((t) => t.classroomId === classroom.id && t.weekday.includes(weekday));
  if (!slot) {
    // 如果今日是周末，临时放宽：直接手动写入 DB 一条今日预约（无需 createReservation 的 weekday 检查）
    // 然后调用 checkIn — 关键看是否误报"非预约当日"
    slot = getDefaultSlot();
  }

  // 手动写一条今日已批准的预约到 db（模拟服务重启后从 JSON 恢复的状态）
  const db = getDB();
  const reservationId = 'test-restart-' + Date.now();
  const reservation: Reservation = {
    id: reservationId,
    studentId: student01.id,
    classroomId: classroom.id,
    seatId: classroom.seats[0].id,
    seatLabel: classroom.seats[0].label,
    classroomName: classroom.name,
    building: classroom.building,
    date: today,
    timeSlotId: slot.id,
    startTime: slot.startTime,
    endTime: slot.endTime,
    status: 'approved',
    createdAt: new Date().toISOString(),
  };
  db.reservations.push(reservation);
  saveDB(db);

  // 重新读取（模拟服务重启后）并执行签到
  // 关键断言：不是"非预约当日"的错误（其他错误如"不在时段内"也可以接受）
  const result = checkIn(student01, reservationId);
  assert.notEqual(
    result.error,
    '非预约当日，无法签到',
    `服务重启后今日预约不应误判为非当日，本地 today=${today}, error=${result.error || '无'}`,
  );
});

process.on('beforeExit', () => {
  console.log(`\n=== 结果：${passCount} 通过 / ${failCount} 失败 ===\n`);
  if (failCount > 0) process.exit(1);
});
