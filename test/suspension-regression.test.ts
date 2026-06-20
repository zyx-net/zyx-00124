import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

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
function check(cond: boolean, desc: string, actual?: any) {
  if (cond) {
    passCount++;
    console.log(`  ✅ ${desc}`);
  } else {
    failCount++;
    console.error(`  ❌ ${desc}${actual !== undefined ? ` 实际: ${JSON.stringify(actual)}` : ''}`);
  }
}

function backupDB(): string {
  return fs.readFileSync(DB_PATH, 'utf-8');
}

function restoreDB(content: string): void {
  fs.writeFileSync(DB_PATH, content, 'utf-8');
}

async function main() {
  const dbBackup = backupDB();

  try {
    console.log('\n=== 教室停用计划模块回归测试 ===\n');

    console.log('1. 登录');
    const adminToken = await login('admin', 'admin123');
    const stuToken = await login('student01', '123456');
    console.log('  ✅ 登录完成');

    console.log('\n2. 权限拦截测试');
    console.log('  2a. 未登录用户访问停用计划列表 → 401');
    const rNoAuth = await request('GET', '/api/suspensions');
    check(rNoAuth.status === 401, '未登录返回 401', rNoAuth.status);

    console.log('  2b. 学生访问停用计划列表 → 403');
    const rStu = await request('GET', '/api/suspensions', undefined, stuToken);
    check(rStu.status === 403, '学生返回 403', rStu.status);

    console.log('  2c. 学生创建停用计划 → 403');
    const rStuCreate = await request('POST', '/api/suspensions', {
      classroomId: 'cls-a101',
      reason: 'maintenance',
      reasonText: '测试维修',
      recurrence: 'once',
      startDate: '2026-07-01',
      endDate: '2026-07-01',
      timeRanges: [{ startTime: '08:00', endTime: '18:00' }],
      weekdays: [],
    }, stuToken);
    check(rStuCreate.status === 403, '学生创建返回 403', rStuCreate.status);

    console.log('  2d. 学生冲突预检 → 403');
    const rStuCheck = await request('POST', '/api/suspensions/fake-id/check-conflicts', undefined, stuToken);
    check(rStuCheck.status === 403, '学生冲突预检返回 403', rStuCheck.status);

    console.log('  2e. 学生确认 → 403');
    const rStuConfirm = await request('POST', '/api/suspensions/fake-id/confirm', { resolution: 'cancel_all' }, stuToken);
    check(rStuConfirm.status === 403, '学生确认返回 403', rStuConfirm.status);

    console.log('  2f. 学生撤销 → 403');
    const rStuRevoke = await request('POST', '/api/suspensions/fake-id/revoke', undefined, stuToken);
    check(rStuRevoke.status === 403, '学生撤销返回 403', rStuRevoke.status);

    console.log('\n3. 审计日志记录权限拦截');
    const auditR = await request('GET', '/api/audit-logs', undefined, adminToken);
    const permDeniedLogs = (auditR.data as any[]).filter(
      (l) => l.action?.includes('权限不足') && l.success === false,
    );
    check(permDeniedLogs.length >= 4, `权限拦截审计日志存在（${permDeniedLogs.length} 条，≥4）`, permDeniedLogs.length);

    console.log('\n4. 创建停用计划');
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${pad2(tomorrow.getMonth() + 1)}-${pad2(tomorrow.getDate())}`;

    const createR = await request('POST', '/api/suspensions', {
      classroomId: 'cls-a101',
      reason: 'maintenance',
      reasonText: '空调维修',
      recurrence: 'once',
      startDate: today,
      endDate: today,
      timeRanges: [{ startTime: '08:00', endTime: '18:00' }],
      weekdays: [],
    }, adminToken);
    check(createR.status === 201, '创建停用计划成功', createR.status);
    check(createR.data?.id, '返回计划 ID', createR.data?.id);
    check(createR.data?.status === 'pending', '初始状态为 pending', createR.data?.status);
    const planId = createR.data?.id;

    console.log('\n5. 创建周期停用计划');
    const createR2 = await request('POST', '/api/suspensions', {
      classroomId: 'cls-b202',
      reason: 'exam',
      reasonText: '期末考试',
      recurrence: 'weekly',
      startDate: today,
      endDate: tomorrowStr,
      timeRanges: [{ startTime: '08:00', endTime: '12:00' }],
      weekdays: [1, 2, 3, 4, 5],
    }, adminToken);
    check(createR2.status === 201, '创建周期停用计划成功', createR2.status);
    check(createR2.data?.status === 'pending', '周期计划初始状态为 pending', createR2.data?.status);

    console.log('\n6. 参数校验');
    const rNoReason = await request('POST', '/api/suspensions', {
      classroomId: 'cls-a101',
      reason: 'maintenance',
      reasonText: '',
      recurrence: 'once',
      startDate: today,
      endDate: today,
      timeRanges: [{ startTime: '08:00', endTime: '18:00' }],
      weekdays: [],
    }, adminToken);
    check(rNoReason.status === 400, '空原因描述返回 400', rNoReason.status);

    const rBadDate = await request('POST', '/api/suspensions', {
      classroomId: 'cls-a101',
      reason: 'maintenance',
      reasonText: '测试',
      recurrence: 'once',
      startDate: '2026-12-01',
      endDate: '2026-11-01',
      timeRanges: [{ startTime: '08:00', endTime: '18:00' }],
      weekdays: [],
    }, adminToken);
    check(rBadDate.status === 400, '结束早于开始返回 400', rBadDate.status);

    console.log('\n7. 冲突预检（无预约情况）');
    const checkR = await request('POST', `/api/suspensions/${planId}/check-conflicts`, undefined, adminToken);
    check(checkR.status === 200, '冲突预检成功', checkR.status);
    check(checkR.data?.conflictCount === 0, '无预约时冲突数为 0', checkR.data?.conflictCount);

    console.log('\n8. 冲突预检（有预约情况）');
    const { getDB, saveDB } = await import('../api/data/store.js');
    const db = getDB();
    const conflictResId = 'res-susp-test-' + Date.now();
    db.reservations.push({
      id: conflictResId,
      studentId: 'stu-001',
      classroomId: 'cls-a101',
      seatId: 'cls-a101-seat-1-1',
      date: today,
      slotId: 'slot-1',
      startTime: '08:00',
      endTime: '10:00',
      status: 'approved',
      createdAt: new Date().toISOString(),
    });
    saveDB(db);

    const checkR2 = await request('POST', `/api/suspensions/${planId}/check-conflicts`, undefined, adminToken);
    check(checkR2.status === 200, '冲突预检成功', checkR2.status);
    check(checkR2.data?.conflictCount >= 1, `发现 ≥1 个冲突预约`, checkR2.data?.conflictCount);
    check(
      checkR2.data?.conflictingReservations?.some((c: any) => c.id === conflictResId),
      '冲突预约 ID 匹配',
      checkR2.data?.conflictingReservations?.map((c: any) => c.id),
    );

    console.log('\n9. 确认计划（cancel_all 方式）');
    const confirmR = await request('POST', `/api/suspensions/${planId}/confirm`, {
      resolution: 'cancel_all',
    }, adminToken);
    check(confirmR.status === 200, '确认成功', confirmR.status);
    check(confirmR.data?.success === true, '返回 success=true', confirmR.data?.success);
    check(confirmR.data?.cancelledCount >= 1, `取消 ≥1 个预约`, confirmR.data?.cancelledCount);
    check(confirmR.data?.cancelledReservationIds?.includes(conflictResId), '被取消的预约 ID 匹配', confirmR.data?.cancelledReservationIds);

    const dbAfterConfirm = getDB();
    const cancelledRes = dbAfterConfirm.reservations.find((r: any) => r.id === conflictResId);
    check(cancelledRes?.status === 'cancelled', '预约已被取消', cancelledRes?.status);

    const planAfterConfirm = dbAfterConfirm.suspensionPlans.find((p: any) => p.id === planId);
    check(planAfterConfirm?.status === 'active', '计划状态变为 active', planAfterConfirm?.status);

    check(dbAfterConfirm.suspensionSnapshots.length > 0, '快照已保存', dbAfterConfirm.suspensionSnapshots.length);

    const snapshot = dbAfterConfirm.suspensionSnapshots.find((s: any) => s.planId === planId);
    check(!!snapshot, '找到对应快照');
    check(snapshot?.cancelledReservations?.includes(conflictResId), '快照记录了被取消的预约');

    const hasClosedDate = dbAfterConfirm.closedDates.some(
      (cd: any) => cd.date === today && cd.classroomId === 'cls-a101',
    );
    check(hasClosedDate, '关闭日期已添加', hasClosedDate);

    console.log('\n10. 确认已有预约不可再确认');
    const confirmAgainR = await request('POST', `/api/suspensions/${planId}/confirm`, {
      resolution: 'cancel_all',
    }, adminToken);
    check(confirmAgainR.status === 400, '重复确认返回 400', confirmAgainR.status);

    console.log('\n11. 撤销停用计划');
    const revokeR = await request('POST', `/api/suspensions/${planId}/revoke`, undefined, adminToken);
    check(revokeR.status === 200, '撤销成功', revokeR.status);
    check(revokeR.data?.success === true, '撤销返回 success', revokeR.data?.success);
    check(revokeR.data?.restoredCount >= 1, `恢复 ≥1 个预约`, revokeR.data?.restoredCount);

    const dbAfterRevoke = getDB();
    const restoredRes = dbAfterRevoke.reservations.find((r: any) => r.id === conflictResId);
    check(restoredRes?.status === 'approved', '预约状态已恢复为 approved', restoredRes?.status);

    const planAfterRevoke = dbAfterRevoke.suspensionPlans.find((p: any) => p.id === planId);
    check(planAfterRevoke?.status === 'revoked', '计划状态变为 revoked', planAfterRevoke?.status);

    const closedDateAfterRevoke = dbAfterRevoke.closedDates.find(
      (cd: any) => cd.date === today && cd.classroomId === 'cls-a101',
    );
    check(!closedDateAfterRevoke, '关闭日期已移除', !!closedDateAfterRevoke);

    const snapshotAfterRevoke = dbAfterRevoke.suspensionSnapshots.find((s: any) => s.planId === planId);
    check(!snapshotAfterRevoke, '快照已清理', !!snapshotAfterRevoke);

    console.log('\n12. 重复撤销失败');
    const revokeAgainR = await request('POST', `/api/suspensions/${planId}/revoke`, undefined, adminToken);
    check(revokeAgainR.status === 400, '重复撤销返回 400', revokeAgainR.status);

    console.log('\n13. 确认计划（skip 方式）- 使用 cls-b202 避免交叉污染');
    const db2 = getDB();
    const skipResId = 'res-skip-test-' + Date.now();
    db2.reservations.push({
      id: skipResId,
      studentId: 'stu-001',
      classroomId: 'cls-b202',
      seatId: 'cls-b202-seat-1-1',
      date: today,
      slotId: 'slot-5',
      startTime: '08:00',
      endTime: '10:00',
      status: 'approved',
      createdAt: new Date().toISOString(),
    });
    saveDB(db2);

    const createSkipPlan = await request('POST', '/api/suspensions', {
      classroomId: 'cls-b202',
      reason: 'event',
      reasonText: '活动占用-skip测试',
      recurrence: 'once',
      startDate: today,
      endDate: today,
      timeRanges: [{ startTime: '08:00', endTime: '18:00' }],
      weekdays: [],
    }, adminToken);
    const skipPlanId = createSkipPlan.data?.id;

    const skipCheckR = await request('POST', `/api/suspensions/${skipPlanId}/check-conflicts`, undefined, adminToken);
    check(skipCheckR.status === 200, 'skip 冲突预检成功', skipCheckR.status);

    const skipConfirmR = await request('POST', `/api/suspensions/${skipPlanId}/confirm`, {
      resolution: 'skip',
    }, adminToken);
    check(skipConfirmR.status === 200, 'skip 确认成功', skipConfirmR.status);
    check(skipConfirmR.data?.skippedCount >= 1, `跳过 ≥1 个预约`, skipConfirmR.data?.skippedCount);
    check(skipConfirmR.data?.cancelledCount === 0, '无预约被取消', skipConfirmR.data?.cancelledCount);

    const dbAfterSkip = getDB();
    const skipRes = dbAfterSkip.reservations.find((r: any) => r.id === skipResId);
    check(skipRes?.status === 'approved', 'skip 方式下预约保持 approved', skipRes?.status);

    console.log('\n14. 确认计划（reschedule_suggest 方式）- 使用 cls-b202 避免交叉污染');
    const db3 = getDB();
    const reschedResId = 'res-resched-test-' + Date.now();
    db3.reservations.push({
      id: reschedResId,
      studentId: 'stu-002',
      classroomId: 'cls-b202',
      seatId: 'cls-b202-seat-1-2',
      date: today,
      slotId: 'slot-6',
      startTime: '10:00',
      endTime: '12:00',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    saveDB(db3);

    const createReschedPlan = await request('POST', '/api/suspensions', {
      classroomId: 'cls-b202',
      reason: 'other',
      reasonText: '改期建议测试',
      recurrence: 'once',
      startDate: today,
      endDate: today,
      timeRanges: [{ startTime: '08:00', endTime: '12:00' }],
      weekdays: [],
    }, adminToken);
    const reschedPlanId = createReschedPlan.data?.id;

    const reschedCheckR = await request('POST', `/api/suspensions/${reschedPlanId}/check-conflicts`, undefined, adminToken);
    check(reschedCheckR.status === 200, 'reschedule 冲突预检成功', reschedCheckR.status);
    const reschedConflictIds = reschedCheckR.data?.conflictingReservations?.map((c: any) => c.id) || [];
    const reschedExpectedCount = reschedConflictIds.includes(reschedResId) ? reschedConflictIds.length : 0;

    const reschedConfirmR = await request('POST', `/api/suspensions/${reschedPlanId}/confirm`, {
      resolution: 'reschedule_suggest',
    }, adminToken);
    check(reschedConfirmR.status === 200, 'reschedule_suggest 确认成功', reschedConfirmR.status);
    check(reschedConfirmR.data?.cancelledCount >= 1, `取消 ≥1 个预约`, reschedConfirmR.data?.cancelledCount);

    const dbAfterResched = getDB();
    const reschedRes = dbAfterResched.reservations.find((r: any) => r.id === reschedResId);
    check(reschedRes?.status === 'cancelled', '预约被取消', reschedRes?.status);
    check(
      reschedRes?.rejectReason?.includes('重新预约'),
      '取消原因包含改期提示',
      reschedRes?.rejectReason,
    );

    console.log('\n15. 重启恢复验证');
    const dbBeforeRestart = getDB();
    const planCountBefore = dbBeforeRestart.suspensionPlans.length;
    const snapshotCountBefore = dbBeforeRestart.suspensionSnapshots.length;

    const getDBFresh = (await import('../api/data/store.js')).getDB;
    const dbAfterRestart = getDBFresh();
    check(
      dbAfterRestart.suspensionPlans.length === planCountBefore,
      `重启后计划数一致（${planCountBefore}）`,
      dbAfterRestart.suspensionPlans.length,
    );
    check(
      dbAfterRestart.suspensionSnapshots.length === snapshotCountBefore,
      `重启后快照数一致（${snapshotCountBefore}）`,
      dbAfterRestart.suspensionSnapshots.length,
    );
    check(
      dbAfterRestart.suspensionPlans.every((p: any) => p.id && p.classroomId && p.reason),
      '所有计划字段完整',
    );

    console.log('\n16. 列表查询与过滤');
    const listAllR = await request('GET', '/api/suspensions', undefined, adminToken);
    check(listAllR.status === 200, '获取全部列表成功', listAllR.status);
    check(Array.isArray(listAllR.data), '返回数组', Array.isArray(listAllR.data));

    const listActiveR = await request('GET', '/api/suspensions?status=active', undefined, adminToken);
    check(listActiveR.status === 200, '获取 active 列表成功', listActiveR.status);
    check(
      (listActiveR.data as any[]).every((p) => p.status === 'active'),
      '全部为 active 状态',
    );

    const listRevokedR = await request('GET', '/api/suspensions?status=revoked', undefined, adminToken);
    check(listRevokedR.status === 200, '获取 revoked 列表成功', listRevokedR.status);
    check(
      (listRevokedR.data as any[]).every((p) => p.status === 'revoked'),
      '全部为 revoked 状态',
    );

    console.log('\n17. 审计日志完整性');
    const auditLogR = await request('GET', '/api/audit-logs', undefined, adminToken);
    const logs = auditLogR.data as any[];
    const createLog = logs.find((l) => l.action === '创建停用计划' && l.targetId === planId);
    check(!!createLog, '有创建停用计划的审计日志');
    check(createLog?.success === true, '创建日志标记为成功');

    const conflictLog = logs.find((l) => l.action?.includes('冲突预检') && l.targetId === planId);
    check(!!conflictLog, '有冲突预检的审计日志');

    const confirmLog = logs.find((l) => l.action?.includes('停用计划已生效') && l.targetId === planId);
    check(!!confirmLog, '有确认生效的审计日志');

    const revokeLog = logs.find((l) => l.action?.includes('已撤销停用计划') && l.targetId === planId);
    check(!!revokeLog, '有撤销的审计日志');

    const permDeniedLog = logs.find((l) => l.action?.includes('权限不足') && l.success === false);
    check(!!permDeniedLog, '有权限拦截的审计日志');

    console.log('\n=== 边界场景：细粒度时段停用不误伤 ===\n');

    const pickNextWeekday = (base: Date): string => {
      const d = new Date(base);
      for (let i = 0; i < 14; i++) {
        const wd = d.getDay();
        if (wd >= 1 && wd <= 5) break;
        d.setDate(d.getDate() + 1);
      }
      return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    };
    const testDate = pickNextWeekday(new Date());
    console.log(`  使用测试日期（工作日）：${testDate}`);

    console.log('\n18. 边界场景 A：A101 08:00-10:00 停用，不误伤其他时段/教室');
    const createSuspA101Morning = await request('POST', '/api/suspensions', {
      classroomId: 'cls-a101',
      reason: 'maintenance',
      reasonText: 'A101上午设备检修',
      recurrence: 'once',
      startDate: testDate,
      endDate: testDate,
      timeRanges: [{ startTime: '08:00', endTime: '10:00' }],
      weekdays: [],
    }, adminToken);
    check(createSuspA101Morning.status === 201, '创建 A101 上午停用计划成功', createSuspA101Morning.status);
    const planA101MorningId = createSuspA101Morning.data?.id;

    const checkA101MorningConflicts = await request(
      'POST',
      `/api/suspensions/${planA101MorningId}/check-conflicts`,
      undefined,
      adminToken,
    );
    check(checkA101MorningConflicts.status === 200, 'A101 上午停用冲突预检成功');

    const confirmA101Morning = await request(
      'POST',
      `/api/suspensions/${planA101MorningId}/confirm`,
      { resolution: 'cancel_all' },
      adminToken,
    );
    check(confirmA101Morning.status === 200, '确认 A101 上午停用成功', confirmA101Morning.status);
    check(
      confirmA101Morning.data?.summary?.includes('关闭时段'),
      '汇总文案使用"关闭时段"而非"关闭日期"',
      confirmA101Morning.data?.summary,
    );

    const dbAfterSusp = getDB();
    const suspClosedDates = dbAfterSusp.closedDates.filter(
      (cd: any) => cd.classroomId === 'cls-a101' && cd.date === testDate,
    );
    check(suspClosedDates.length === 1, 'closedDates 中只新增 1 条时段记录', suspClosedDates.length);
    check(
      suspClosedDates[0]?.startTime === '08:00' && suspClosedDates[0]?.endTime === '10:00',
      'closedDates 写入了精确时段（08:00-10:00）',
      suspClosedDates[0],
    );

    console.log('  18a. A101 被停用的时段（08:00-10:00, slot-1）seat-status 显示全部不可用');
    const seatStatusBlocked = await request(
      'GET',
      `/api/reservations/seat-status?classroomId=cls-a101&date=${testDate}&slotId=slot-1`,
      undefined,
      stuToken,
    );
    check(seatStatusBlocked.status === 200, 'A101 08-10 seat-status 查询成功');
    check(
      seatStatusBlocked.data?.closed === true,
      'slot 整体标记为 closed（因停用命中）',
      seatStatusBlocked.data,
    );
    check(
      seatStatusBlocked.data?.closedReason?.includes('A101上午设备检修'),
      '返回停用原因描述',
      seatStatusBlocked.data?.closedReason,
    );
    const blockedSeatsAnyAvailable = Object.values(seatStatusBlocked.data?.seats || {})
      .some((s: any) => s.available);
    check(!blockedSeatsAnyAvailable, '该 slot 下所有座位均标记为不可用（suspensionClosed）', seatStatusBlocked.data?.seats);

    console.log('  18b. A101 下午时段（14:00-16:00, slot-3）仍可正常预约');
    const seatStatusA101Pm = await request(
      'GET',
      `/api/reservations/seat-status?classroomId=cls-a101&date=${testDate}&slotId=slot-3`,
      undefined,
      stuToken,
    );
    check(seatStatusA101Pm.status === 200, 'A101 14-16 seat-status 查询成功');
    check(
      seatStatusA101Pm.data?.closed === false,
      'A101 下午 slot 不标记为 closed',
      seatStatusA101Pm.data,
    );
    const a101PmFirstSeat = Object.keys(seatStatusA101Pm.data?.seats || {})[0];
    check(
      a101PmFirstSeat && seatStatusA101Pm.data?.seats?.[a101PmFirstSeat]?.available === true,
      'A101 下午时段存在可预约座位',
    );

    const resA101Pm = await request('POST', '/api/reservations', {
      classroomId: 'cls-a101',
      seatId: a101PmFirstSeat,
      date: testDate,
      slotId: 'slot-3',
    }, stuToken);
    check(resA101Pm.status === 201, 'A101 下午时段预约成功（201）', resA101Pm.status);
    check(
      resA101Pm.data?.status === 'pending',
      'A101 下午时段预约状态为 pending',
      resA101Pm.data?.status,
    );

    console.log('  18c. A101 被停用的时段（slot-1）预约被拒，返回细粒度错误');
    const blockedSeatId = Object.keys(seatStatusBlocked.data?.seats || {})[0];
    const resBlocked = await request('POST', '/api/reservations', {
      classroomId: 'cls-a101',
      seatId: blockedSeatId,
      date: testDate,
      slotId: 'slot-1',
    }, stuToken);
    check(resBlocked.status === 400, '停用时段预约返回 400', resBlocked.status);
    check(
      typeof resBlocked.data?.error === 'string' &&
        resBlocked.data.error.includes('停用时段') &&
        resBlocked.data.error.includes('08:00-10:00'),
      '错误提示包含"停用时段"和具体时段范围',
      resBlocked.data?.error,
    );

    console.log('  18d. B202 同天下午（14:00-16:00, slot-7）完全不受影响');
    const seatStatusB202 = await request(
      'GET',
      `/api/reservations/seat-status?classroomId=cls-b202&date=${testDate}&slotId=slot-7`,
      undefined,
      stuToken,
    );
    check(seatStatusB202.status === 200, 'B202 14-16 seat-status 查询成功');
    check(
      seatStatusB202.data?.closed === false,
      'B202 同天下午不标记为 closed',
      seatStatusB202.data,
    );
    const b202FirstSeat = Object.keys(seatStatusB202.data?.seats || {})[0];
    check(
      b202FirstSeat && seatStatusB202.data?.seats?.[b202FirstSeat]?.available === true,
      'B202 下午时段存在可预约座位',
    );

    const resB202 = await request('POST', '/api/reservations', {
      classroomId: 'cls-b202',
      seatId: b202FirstSeat,
      date: testDate,
      slotId: 'slot-7',
    }, stuToken);
    check(resB202.status === 201, 'B202 下午时段预约成功（201）', resB202.status);
    check(
      resB202.data?.status === 'pending',
      'B202 下午预约状态为 pending',
      resB202.data?.status,
    );

    console.log('\n19. 边界场景 B：冲突预检/跳过/改期建议链路不受影响（细粒度时段）');
    const db19 = getDB();
    const preExistedApprovedId = 'res-boundary-b-' + Date.now();
    db19.reservations.push({
      id: preExistedApprovedId,
      studentId: 'stu-001',
      classroomId: 'cls-b202',
      seatId: 'cls-b202-seat-1-1',
      date: testDate,
      slotId: 'slot-5',
      startTime: '08:00',
      endTime: '10:00',
      status: 'approved',
      createdAt: new Date().toISOString(),
    });
    saveDB(db19);

    const createSuspB202Partial = await request('POST', '/api/suspensions', {
      classroomId: 'cls-b202',
      reason: 'exam',
      reasonText: 'B202上午考试（只占第一时段）',
      recurrence: 'once',
      startDate: testDate,
      endDate: testDate,
      timeRanges: [{ startTime: '08:00', endTime: '10:00' }],
      weekdays: [],
    }, adminToken);
    check(createSuspB202Partial.status === 201, '创建 B202 上午部分时段停用成功', createSuspB202Partial.status);
    const planB202Id = createSuspB202Partial.data?.id;

    const previewB202 = await request(
      'POST',
      `/api/suspensions/${planB202Id}/check-conflicts`,
      undefined,
      adminToken,
    );
    check(previewB202.status === 200, 'B202 冲突预检成功');
    check(
      previewB202.data?.conflictCount >= 1,
      `至少发现 1 个冲突（预期命中 slot-5 的 08-10 预约）`,
      previewB202.data?.conflictCount,
    );
    const previewIds = previewB202.data?.conflictingReservations?.map((c: any) => c.id) || [];
    check(
      previewIds.includes(preExistedApprovedId),
      '冲突预约 ID 包含已存在的 approved 预约',
      previewIds,
    );

    const confirmB202Skip = await request(
      'POST',
      `/api/suspensions/${planB202Id}/confirm`,
      { resolution: 'skip' },
      adminToken,
    );
    check(confirmB202Skip.status === 200, 'skip 方式确认成功', confirmB202Skip.status);
    check(
      confirmB202Skip.data?.skippedCount >= 1,
      '跳过 ≥1 个预约',
      confirmB202Skip.data?.skippedCount,
    );
    check(confirmB202Skip.data?.cancelledCount === 0, '无预约被取消', confirmB202Skip.data?.cancelledCount);

    const dbAfterSkip2 = getDB();
    const skippedRes = dbAfterSkip2.reservations.find((r: any) => r.id === preExistedApprovedId);
    check(
      skippedRes?.status === 'approved',
      'skip 后冲突预约保持 approved 状态',
      skippedRes?.status,
    );

    const planAfterSkip = dbAfterSkip2.suspensionPlans.find((p: any) => p.id === planB202Id);
    check(planAfterSkip?.status === 'active', 'skip 方式下计划仍正常变为 active');

    const revokeSkipPlan = await request(
      'POST',
      `/api/suspensions/${planB202Id}/revoke`,
      undefined,
      adminToken,
    );
    check(revokeSkipPlan.status === 200, 'skip 方式下撤销成功');

    const dbAfterRevoke2 = getDB();
    const stillApproved = dbAfterRevoke2.reservations.find((r: any) => r.id === preExistedApprovedId);
    check(
      stillApproved?.status === 'approved',
      '撤销回退后预约仍为 approved（跳过的本来就不变）',
      stillApproved?.status,
    );

    const planRevoked = dbAfterRevoke2.suspensionPlans.find((p: any) => p.id === planB202Id);
    check(planRevoked?.status === 'revoked', '撤销后计划状态变为 revoked');

    const b202ClosedDatesAfterRevoke = dbAfterRevoke2.closedDates.filter(
      (cd: any) => cd.classroomId === 'cls-b202' && cd.date === testDate &&
        cd.startTime === '08:00' && cd.endTime === '10:00',
    );
    check(
      b202ClosedDatesAfterRevoke.length === 0,
      '撤销后 B202 对应的细粒度 closedDates 记录被精确移除',
      b202ClosedDatesAfterRevoke.length,
    );

    console.log('  19a. reschedule_suggest 链路仍正常');
    const db19b = getDB();
    const pendingRescheduleId = 'res-boundary-b-resched-' + Date.now();
    db19b.reservations.push({
      id: pendingRescheduleId,
      studentId: 'stu-002',
      classroomId: 'cls-a101',
      seatId: 'cls-a101-seat-1-2',
      date: testDate,
      slotId: 'slot-2',
      startTime: '10:00',
      endTime: '12:00',
      status: 'pending',
      createdAt: new Date().toISOString(),
    });
    saveDB(db19b);

    const createSuspA101Late = await request('POST', '/api/suspensions', {
      classroomId: 'cls-a101',
      reason: 'event',
      reasonText: 'A101活动占用（10-12点）',
      recurrence: 'once',
      startDate: testDate,
      endDate: testDate,
      timeRanges: [{ startTime: '10:00', endTime: '12:00' }],
      weekdays: [],
    }, adminToken);
    const planA101LateId = createSuspA101Late.data?.id;
    const confirmLate = await request(
      'POST',
      `/api/suspensions/${planA101LateId}/confirm`,
      { resolution: 'reschedule_suggest' },
      adminToken,
    );
    check(confirmLate.status === 200, 'reschedule_suggest 确认成功');
    check(confirmLate.data?.cancelledCount >= 1, 'reschedule_suggest 取消 ≥1 个预约');
    const dbAfterSched = getDB();
    const schedRes = dbAfterSched.reservations.find((r: any) => r.id === pendingRescheduleId);
    check(schedRes?.status === 'cancelled', '预约被取消');
    check(
      typeof schedRes?.rejectReason === 'string' && schedRes.rejectReason.includes('重新预约'),
      'rejectReason 含改期提示',
      schedRes?.rejectReason,
    );
    const revokeLate = await request(
      'POST',
      `/api/suspensions/${planA101LateId}/revoke`,
      undefined,
      adminToken,
    );
    check(revokeLate.status === 200, 'reschedule_suggest 方式撤销成功');
    const dbAfterRevokeSched = getDB();
    const restoredSched = dbAfterRevokeSched.reservations.find((r: any) => r.id === pendingRescheduleId);
    check(
      restoredSched?.status === 'pending',
      '撤销后被取消的 pending 预约正确恢复为 pending',
      restoredSched?.status,
    );
    check(
      !restoredSched?.rejectReason,
      '撤销后 rejectReason 被清空回原状态',
      restoredSched?.rejectReason,
    );

    console.log('\n20. 边界场景 C：重启后计划/预约/审计日志/closedDates 完全一致');
    const dbBaseline = getDB();
    const snap = {
      planCount: dbBaseline.suspensionPlans.length,
      snapshotCount: dbBaseline.suspensionSnapshots.length,
      auditLogCount: dbBaseline.auditLogs.length,
      closedDateCount: dbBaseline.closedDates.length,
      a101MorningPlanStatus:
        dbBaseline.suspensionPlans.find((p: any) => p.id === planA101MorningId)?.status,
      a101PmReservationStatus:
        dbBaseline.reservations.find((r: any) => r.id === resA101Pm.data?.id)?.status,
    };

    const dbReload = getDB();
    check(
      dbReload.suspensionPlans.length === snap.planCount,
      `重启后计划数一致（${snap.planCount}）`,
      dbReload.suspensionPlans.length,
    );
    check(
      dbReload.suspensionSnapshots.length === snap.snapshotCount,
      `重启后快照数一致（${snap.snapshotCount}）`,
      dbReload.suspensionSnapshots.length,
    );
    check(
      dbReload.auditLogs.length === snap.auditLogCount,
      `重启后审计日志数一致（${snap.auditLogCount}）`,
      dbReload.auditLogs.length,
    );
    check(
      dbReload.closedDates.length === snap.closedDateCount,
      `重启后 closedDates 数一致（${snap.closedDateCount}）`,
      dbReload.closedDates.length,
    );
    check(
      dbReload.suspensionPlans.find((p: any) => p.id === planA101MorningId)?.status ===
        snap.a101MorningPlanStatus,
      '重启后 A101 停用计划状态不变',
    );
    check(
      dbReload.reservations.find((r: any) => r.id === resA101Pm.data?.id)?.status ===
        snap.a101PmReservationStatus,
      '重启后 A101 下午预约状态不变',
    );

    const auditRelevant = dbReload.auditLogs.filter(
      (l: any) => l.targetId === planA101MorningId || l.targetId === resA101Pm.data?.id,
    );
    check(
      auditRelevant.length >= 3,
      '重启后相关审计日志均完整（创建/确认/提交预约至少 3 条）',
      auditRelevant.length,
    );
    check(
      auditRelevant.every((l: any) => typeof l.action === 'string' && l.createdAt),
      '审计日志字段完整',
    );

    const closedDatesWithTime = dbReload.closedDates.filter(
      (cd: any) => cd.classroomId === 'cls-a101' && cd.date === testDate,
    );
    check(
      closedDatesWithTime.length >= 1 &&
        closedDatesWithTime.every((cd: any) => cd.startTime && cd.endTime),
      '重启后带时段的 closedDates 字段完整保留',
      closedDatesWithTime,
    );

    console.log(`\n=== 回归测试结果：${passCount} 通过 / ${failCount} 失败 ===\n`);
    if (failCount > 0) process.exit(1);
  } finally {
    restoreDB(dbBackup);
    console.log('\n已恢复原始数据库状态');
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
