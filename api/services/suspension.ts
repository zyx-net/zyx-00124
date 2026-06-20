import { getDB, saveDB, generateId } from '../data/store.js';
import type {
  User,
  SuspensionPlan,
  SuspensionRecurrence,
  SuspensionReason,
  SuspensionTimeRange,
  SuspensionStatus,
  SuspensionConflictPreview,
  ConflictingReservation,
  ConflictResolution,
  SuspensionConfirmResult,
  SuspensionRevokeResult,
  SuspensionSnapshot,
  ClosedDate,
  Reservation,
} from '../../shared/types.js';

function parseDateLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function todayLocalStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getWeekday(dateStr: string): number {
  const d = parseDateLocal(dateStr);
  return d.getDay() === 0 ? 7 : d.getDay();
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function timeRangesOverlap(
  a: SuspensionTimeRange,
  bStart: string,
  bEnd: string,
): boolean {
  const aStart = timeToMinutes(a.startTime);
  const aEnd = timeToMinutes(a.endTime);
  const bStartMin = timeToMinutes(bStart);
  const bEndMin = timeToMinutes(bEnd);
  return aStart < bEndMin && aEnd > bStartMin;
}

export function generateDatesForPlan(plan: SuspensionPlan): string[] {
  const dates: string[] = [];
  const start = parseDateLocal(plan.startDate);
  const end = parseDateLocal(plan.endDate);
  const current = new Date(start);

  while (current <= end) {
    const dateStr = `${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`;
    const wd = current.getDay() === 0 ? 7 : current.getDay();

    let include = false;
    if (plan.recurrence === 'once') {
      include = dateStr === plan.startDate;
    } else if (plan.recurrence === 'daily') {
      include = plan.weekdays.length === 0 || plan.weekdays.includes(wd);
    } else if (plan.recurrence === 'weekly') {
      include = plan.weekdays.includes(wd);
    } else if (plan.recurrence === 'monthly') {
      include = current.getDate() === start.getDate();
    }

    if (include) {
      dates.push(dateStr);
    }
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function createSuspensionPlan(
  admin: User,
  classroomId: string,
  reason: SuspensionReason,
  reasonText: string,
  recurrence: SuspensionRecurrence,
  startDate: string,
  endDate: string,
  timeRanges: SuspensionTimeRange[],
  weekdays: number[],
): { success: boolean; data?: SuspensionPlan; error?: string } {
  const db = getDB();

  const classroom = db.classrooms.find((c) => c.id === classroomId);
  if (!classroom) {
    return { success: false, error: '教室不存在' };
  }

  if (!reasonText.trim()) {
    return { success: false, error: '停用原因描述不能为空' };
  }

  if (!startDate || !endDate) {
    return { success: false, error: '请选择起止日期' };
  }

  if (parseDateLocal(startDate) > parseDateLocal(endDate)) {
    return { success: false, error: '开始日期不能晚于结束日期' };
  }

  if (!timeRanges || timeRanges.length === 0) {
    return { success: false, error: '请至少添加一个停用时段' };
  }

  for (const tr of timeRanges) {
    if (!tr.startTime || !tr.endTime) {
      return { success: false, error: '时段起止时间不能为空' };
    }
    if (timeToMinutes(tr.startTime) >= timeToMinutes(tr.endTime)) {
      return { success: false, error: '时段开始时间必须早于结束时间' };
    }
  }

  if (recurrence !== 'once' && weekdays.length === 0) {
    return { success: false, error: '周期停用请至少选择一个星期' };
  }

  const plan: SuspensionPlan = {
    id: 'sp-' + generateId(),
    classroomId,
    reason,
    reasonText: reasonText.trim(),
    recurrence,
    startDate,
    endDate,
    timeRanges,
    weekdays,
    status: 'pending',
    createdBy: admin.id,
    createdByName: admin.name,
    createdAt: new Date().toISOString(),
  };

  db.suspensionPlans.unshift(plan);
  saveDB(db);
  return { success: true, data: plan };
}

export function checkSuspensionConflicts(planId: string): {
  success: boolean;
  data?: SuspensionConflictPreview;
  error?: string;
} {
  const db = getDB();
  const plan = db.suspensionPlans.find((p) => p.id === planId);
  if (!plan) {
    return { success: false, error: '停用计划不存在' };
  }

  const dates = generateDatesForPlan(plan);
  const classroom = db.classrooms.find((c) => c.id === plan.classroomId);
  const users = new Map(db.users.map((u) => [u.id, u]));

  const conflicts: ConflictingReservation[] = [];

  for (const date of dates) {
    for (const r of db.reservations) {
      if (r.classroomId !== plan.classroomId) continue;
      if (r.date !== date) continue;
      if (r.status !== 'approved' && r.status !== 'pending' && r.status !== 'checked_in') continue;

      const overlaps = plan.timeRanges.some((tr) =>
        timeRangesOverlap(tr, r.startTime, r.endTime),
      );
      if (overlaps) {
        const student = users.get(r.studentId);
        const seat = classroom?.seats.find((s) => s.id === r.seatId);
        conflicts.push({
          id: r.id,
          studentId: r.studentId,
          studentName: student?.name,
          classroomId: r.classroomId,
          classroomName: classroom?.name,
          seatId: r.seatId,
          seatLabel: seat?.label,
          date: r.date,
          slotId: r.slotId,
          startTime: r.startTime,
          endTime: r.endTime,
          status: r.status,
        });
      }
    }
  }

  return {
    success: true,
    data: {
      plan,
      conflictingReservations: conflicts,
      conflictCount: conflicts.length,
    },
  };
}

export function confirmSuspensionPlan(
  admin: User,
  planId: string,
  resolution: ConflictResolution,
): { success: boolean; data?: SuspensionConfirmResult; error?: string } {
  const db = getDB();
  const plan = db.suspensionPlans.find((p) => p.id === planId);
  if (!plan) {
    return { success: false, error: '停用计划不存在' };
  }
  if (plan.status !== 'pending') {
    return { success: false, error: '只有待确认的计划可以确认' };
  }

  const conflictResult = checkSuspensionConflicts(planId);
  const conflicts = conflictResult.data?.conflictingReservations || [];

  const previousReservations = JSON.parse(JSON.stringify(db.reservations)) as Reservation[];
  const previousClosedDates = JSON.parse(JSON.stringify(db.closedDates)) as ClosedDate[];

  const cancelledIds: string[] = [];
  const skippedIds: string[] = [];

  if (resolution === 'cancel_all') {
    for (const c of conflicts) {
      const r = db.reservations.find((rv) => rv.id === c.id);
      if (r && (r.status === 'pending' || r.status === 'approved')) {
        r.status = 'cancelled';
        cancelledIds.push(r.id);
      }
    }
  } else if (resolution === 'reschedule_suggest') {
    for (const c of conflicts) {
      const r = db.reservations.find((rv) => rv.id === c.id);
      if (r && (r.status === 'pending' || r.status === 'approved')) {
        r.status = 'cancelled';
        r.rejectReason = `教室停用（${plan.reasonText}），请重新预约其他时段`;
        cancelledIds.push(r.id);
      }
    }
  } else {
    for (const c of conflicts) {
      skippedIds.push(c.id);
    }
  }

  const dates = generateDatesForPlan(plan);
  const addedClosedDates: ClosedDate[] = [];
  for (const date of dates) {
    for (const tr of plan.timeRanges) {
      const existing = db.closedDates.find(
        (cd) => cd.date === date && cd.classroomId === plan.classroomId,
      );
      if (!existing) {
        const closedDate: ClosedDate = {
          date,
          reason: `${plan.reasonText}（${tr.startTime}-${tr.endTime}）`,
          classroomId: plan.classroomId,
        };
        db.closedDates.push(closedDate);
        addedClosedDates.push(closedDate);
      } else {
        addedClosedDates.push({ ...existing });
      }
    }
  }

  plan.status = 'active';
  plan.confirmedAt = new Date().toISOString();

  const snapshot: SuspensionSnapshot = {
    planId: plan.id,
    previousReservations,
    previousClosedDates,
    addedClosedDates,
    cancelledReservations: cancelledIds,
    confirmedBy: admin.id,
    confirmedByName: admin.name,
    confirmedAt: new Date().toISOString(),
    resolution,
    summary: `确认停用计划，取消 ${cancelledIds.length} 个预约，跳过 ${skippedIds.length} 个`,
  };
  db.suspensionSnapshots.unshift(snapshot);

  saveDB(db);

  const summary = `停用计划已生效：取消 ${cancelledIds.length} 个预约，跳过 ${skippedIds.length} 个，新增 ${addedClosedDates.length} 个关闭日期`;
  return {
    success: true,
    data: {
      success: true,
      planId: plan.id,
      cancelledCount: cancelledIds.length,
      cancelledReservationIds: cancelledIds,
      skippedCount: skippedIds.length,
      skippedReservationIds: skippedIds,
      summary,
    },
  };
}

export function revokeSuspensionPlan(
  admin: User,
  planId: string,
): { success: boolean; data?: SuspensionRevokeResult; error?: string } {
  const db = getDB();
  const plan = db.suspensionPlans.find((p) => p.id === planId);
  if (!plan) {
    return { success: false, error: '停用计划不存在' };
  }
  if (plan.status !== 'active') {
    return { success: false, error: '只有已生效的计划可以撤销' };
  }

  const snapshot = db.suspensionSnapshots.find((s) => s.planId === planId);
  if (!snapshot) {
    return { success: false, error: '找不到该计划的快照，无法撤销' };
  }

  const restoredIds: string[] = [];
  for (const rid of snapshot.cancelledReservations) {
    const r = db.reservations.find((rv) => rv.id === rid);
    if (r && r.status === 'cancelled') {
      const prev = snapshot.previousReservations.find((pv) => pv.id === rid);
      if (prev) {
        r.status = prev.status;
        r.rejectReason = prev.rejectReason;
        restoredIds.push(r.id);
      }
    }
  }

  const addedDateKeys = new Set(
    snapshot.addedClosedDates.map((cd) => `${cd.date}|${cd.classroomId || ''}`),
  );
  db.closedDates = db.closedDates.filter((cd) => {
    const key = `${cd.date}|${cd.classroomId || ''}`;
    return !addedDateKeys.has(key);
  });
  const currentKeys = new Set(db.closedDates.map((cd) => `${cd.date}|${cd.classroomId || ''}`));
  for (const prev of snapshot.previousClosedDates) {
    const key = `${prev.date}|${prev.classroomId || ''}`;
    if (!currentKeys.has(key)) {
      db.closedDates.push(prev);
      currentKeys.add(key);
    }
  }
  const removedClosedDateCount = addedDateKeys.size;

  plan.status = 'revoked';
  plan.revokedAt = new Date().toISOString();
  plan.revokedBy = admin.id;
  plan.revokedByName = admin.name;

  const snapshotIdx = db.suspensionSnapshots.findIndex((s) => s.planId === planId);
  if (snapshotIdx !== -1) {
    db.suspensionSnapshots.splice(snapshotIdx, 1);
  }

  saveDB(db);

  const summary = `已撤销停用计划：恢复 ${restoredIds.length} 个预约，移除 ${snapshot.addedClosedDates.length} 个关闭日期`;
  return {
    success: true,
    data: {
      success: true,
      planId: plan.id,
      restoredCount: restoredIds.length,
      restoredReservationIds: restoredIds,
      removedClosedDateCount: snapshot.addedClosedDates.length,
      summary,
    },
  };
}

export function listSuspensionPlans(status?: SuspensionStatus): SuspensionPlan[] {
  const db = getDB();
  let plans = db.suspensionPlans;
  if (status) {
    plans = plans.filter((p) => p.status === status);
  }
  return plans;
}

export function getSuspensionPlan(planId: string): SuspensionPlan | undefined {
  const db = getDB();
  return db.suspensionPlans.find((p) => p.id === planId);
}

export { todayLocalStr };
