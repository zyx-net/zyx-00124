import http from 'node:http';

const BASE = 'http://localhost:3001';

function request(method: string, path: string, body?: any, token?: string): Promise<{ status: number; data: any; headers: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
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
  if (r.status !== 200 || !r.data?.token) throw new Error(`登录失败 ${username}: ${r.status} ${JSON.stringify(r.data)}`);
  console.log(`  ✅ 登录 ${username} 成功`);
  return r.data.token as string;
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

async function main() {
  console.log('\n=== 端到端 HTTP API 链路实测 ===\n');

  // ------- 准备：登录 -------
  console.log('1. 登录');
  const adminToken = await login('admin', 'admin123');
  const stu1Token = await login('student01', '123456');
  const stu2Token = await login('student02', '123456');

  // ------- 2. 构造今日预约 + 批准 -------
  console.log('\n2. 构造今日预约并批准');
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  // 直接用 service 层写 DB，保证有一条今日已批准的预约（绕过时段限制）
  const { getDB, saveDB } = await import('../api/data/store.js');
  const db = getDB();
  // 先清空学生 1 的预约（干净状态）
  db.reservations = db.reservations.filter((r) => r.studentId !== 'stu-001' || r.date !== today);
  db.violations = db.violations.filter((v) => v.studentId !== 'stu-001' || v.date !== today);
  const reservationId = 'res-e2e-' + Date.now();
  const reservation = {
    id: reservationId,
    studentId: 'stu-001',
    classroomId: 'cls-a101',
    seatId: 'cls-a101-seat-A-1',
    seatLabel: 'A1',
    classroomName: 'A101',
    building: 'A栋教学楼',
    date: today,
    timeSlotId: 'slot-1',
    startTime: '08:00',
    endTime: '10:00',
    status: 'approved' as const,
    createdAt: new Date().toISOString(),
  };
  db.reservations.push(reservation);
  saveDB(db);
  console.log(`  ✅ 已写入今日(${today}) approved 预约`);

  // 验证 API 能读到
  const listR = await request('GET', '/api/reservations', undefined, stu1Token);
  const my = (listR.data as any[]).find((r) => r.id === reservationId);
  check(!!my && my.status === 'approved', '预约列表能读到 approved 状态', my?.status);

  // ------- 3. 查初始统计 -------
  console.log('\n3. 初始统计（批准后未签到）');
  const statsBefore = await request('GET', '/api/students', undefined, adminToken);
  const s1 = (statsBefore.data as any[]).find((s: any) => s.studentUsername === 'student01');
  check(!!s1, '能读到学生 1 的统计');
  console.log(`     初始: 预约=${s1?.totalReservations} 签到=${s1?.checkInCount} 完成=${s1?.completedCount} 违约=${s1?.violationCount}`);
  check(s1?.checkInCount === 0, '初始 checkInCount=0（未签到）', s1?.checkInCount);
  check(s1?.completedCount === 0, '初始 completedCount=0（未完成）', s1?.completedCount);

  // ------- 4. student02 代签失败：状态不变 + 统计不污染 -------
  console.log('\n4. student02 代签 student01 的预约 → 失败不污染');
  const failSignR = await request('POST', `/api/reservations/${reservationId}/checkin`, { targetStudentId: 'stu-001' }, stu2Token);
  check(failSignR.status === 400, '代签返回 400', failSignR.status);
  check(!!failSignR.data?.error, `代签有错误提示: ${failSignR.data?.error}`);

  // 状态仍为 approved
  const listAfterFail = await request('GET', '/api/reservations', undefined, stu1Token);
  const f = (listAfterFail.data as any[]).find((r) => r.id === reservationId);
  check(f?.status === 'approved', '代签失败后状态仍为 approved', f?.status);
  check(!f?.checkInTime, '代签失败后无 checkInTime', f?.checkInTime);

  // 统计不被污染
  const statsAfterFail = await request('GET', '/api/students', undefined, adminToken);
  const s1AfterFail = (statsAfterFail.data as any[]).find((s: any) => s.studentUsername === 'student01');
  check(
    s1AfterFail?.checkInCount === s1?.checkInCount,
    `代签失败 checkInCount 未变（${s1?.checkInCount}）`,
    s1AfterFail?.checkInCount,
  );
  check(
    s1AfterFail?.completedCount === s1?.completedCount,
    `代签失败 completedCount 未变（${s1?.completedCount}）`,
    s1AfterFail?.completedCount,
  );

  // ------- 5. 审计日志有失败记录 -------
  console.log('\n5. 审计日志有代签失败记录');
  const histR = await request('GET', '/api/audit-logs', undefined, adminToken);
  check(histR.status === 200, '获取审计日志成功', histR.status);
  const auditLogs: any[] = histR.data as any[] || [];
  const failLog = auditLogs.find((l) => l.action?.includes('签到失败') && l.success === false);
  check(!!failLog, `审计日志存在签到失败记录: ${failLog?.action || '未找到'} 原因: ${failLog?.reason || ''}`);

  // ------- 6. student01 尝试真实签到（今日时区正确） -------
  console.log('\n6. student01 本人签到（时区 Bug 验证）');
  const realSignR = await request('POST', `/api/reservations/${reservationId}/checkin`, undefined, stu1Token);
  if (realSignR.status === 200) {
    console.log('     当前时间在时段内，签到成功');
    check(true, '本人签到成功');
    check(!!realSignR.data?.checkInTime, '签到成功后 checkInTime 已写入');

    // 验证签到后统计更新
    const statsAfterCheckIn = await request('GET', '/api/students', undefined, adminToken);
    const s1After = (statsAfterCheckIn.data as any[]).find((s: any) => s.studentUsername === 'student01');
    check(s1After?.checkInCount === (s1?.checkInCount || 0) + 1, '签到成功后 checkInCount +1', s1After?.checkInCount);
    check(s1After?.completedCount === (s1?.completedCount || 0) + 1, '签到成功后 completedCount +1', s1After?.completedCount);
  } else {
    console.log(`     签到失败（正常，不在时段内）: ${realSignR.data?.error}`);
    check(
      realSignR.data?.error !== '非预约当日，无法签到',
      '错误信息不是"非预约当日"（时区 Bug 已修复）',
      realSignR.data?.error,
    );
    check(realSignR.status === 400, '签到失败返回 400', realSignR.status);
    // 状态仍为 approved
    const listAfter = await request('GET', '/api/reservations', undefined, stu1Token);
    const a = (listAfter.data as any[]).find((r) => r.id === reservationId);
    check(a?.status === 'approved', '不在时段内签到失败，状态仍为 approved', a?.status);

    // 模拟 no_show：将预约设置为 completed(no_show)，再次验证统计
    console.log('\n6b. 模拟 no_show 超时收尾 → 统计仍不应计入签到/完成');
    const db2 = getDB();
    const r = db2.reservations.find((x) => x.id === reservationId)!;
    r.status = 'completed';
    r.isLate = true;
    r.notCheckedOut = true;
    (r as any).checkInTime = undefined;
    (r as any).checkOutTime = undefined;
    db2.violations.push({
      id: 'v-e2e-' + Date.now(),
      studentId: 'stu-001',
      reservationId,
      type: 'no_show',
      date: today,
      createdAt: new Date().toISOString(),
    });
    saveDB(db2);
    console.log('     已将预约设置为 completed + no_show 违约（无真实签到时间）');

    // 验证统计
    const statsNoShow = await request('GET', '/api/students', undefined, adminToken);
    const s1NoShow = (statsNoShow.data as any[]).find((s: any) => s.studentUsername === 'student01');
    console.log(`     no_show 后: 预约=${s1NoShow?.totalReservations} 签到=${s1NoShow?.checkInCount} 完成=${s1NoShow?.completedCount} 违约=${s1NoShow?.violationCount}`);
    check(
      s1NoShow?.checkInCount === s1?.checkInCount,
      `no_show 不计入 checkInCount（应为 ${s1?.checkInCount}）`,
      s1NoShow?.checkInCount,
    );
    check(
      s1NoShow?.completedCount === s1?.completedCount,
      `no_show 不计入 completedCount（应为 ${s1?.completedCount}）`,
      s1NoShow?.completedCount,
    );
    check(
      s1NoShow?.violationCount === (s1?.violationCount || 0) + 1,
      'no_show 计入违约次数 +1',
      s1NoShow?.violationCount,
    );

    // 教室维度也验证
    const classR = await request('GET', '/api/classroom-stats', undefined, adminToken);
    const cls = (classR.data as any[]).find((c: any) => c.classroomId === 'cls-a101');
    console.log(`     教室 A101: 预约=${cls?.totalReservations} 完成=${cls?.completedCount}`);
  }

  // ------- 7. CSV 导出与接口一致 -------
  console.log('\n7. CSV 导出与统计接口数字一致');
  const csvR = await request('GET', '/api/export/students', undefined, adminToken);
  check(csvR.status === 200, '学生 CSV 导出成功', csvR.status);
  const statsApi = await request('GET', '/api/students', undefined, adminToken);
  const s1Api = (statsApi.data as any[]).find((s: any) => s.studentUsername === 'student01');
  const csvLines = String(csvR.data).split('\n');
  const s1Line = csvLines.find((l) => l.includes('student01'));
  if (s1Line && s1Api) {
    const cols = s1Line.split(',');
    check(cols[2] === String(s1Api.totalReservations), `CSV 预约总数=${cols[2]} 与 API=${s1Api.totalReservations} 一致`);
    check(cols[3] === String(s1Api.completedCount), `CSV 完成次数=${cols[3]} 与 API=${s1Api.completedCount} 一致`);
    check(cols[4] === String(s1Api.checkInCount), `CSV 签到次数=${cols[4]} 与 API=${s1Api.checkInCount} 一致`);
    console.log(`     CSV 学生 1 行: ${s1Line}`);
  }

  console.log(`\n=== 链路实测结果：${passCount} 通过 / ${failCount} 失败 ===\n`);
  if (failCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
