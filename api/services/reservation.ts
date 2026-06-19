import { getDB, saveDB, generateId } from '../data/store.js';
import type {
  User,
  Classroom,
  TimeSlot,
  Reservation,
  Violation,
  ViolationType,
  ClosedDate,
} from '../../shared/types.js';

function parseTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

export function isClosedDate(date: string): ClosedDate | undefined {
  const db = getDB();
  return db.closedDates.find((c) => c.date === date);
}

export function isSeatAvailable(
  classroomId: string,
  seatId: string,
  date: string,
  slotId: string,
  excludeReservationId?: string,
): boolean {
  const db = getDB();
  const conflicting = db.reservations.find(
    (r) =>
      r.classroomId === classroomId &&
      r.seatId === seatId &&
      r.date === date &&
      r.slotId === slotId &&
      r.id !== excludeReservationId &&
      (r.status === 'approved' || r.status === 'checked_in' || r.status === 'completed'),
  );
  return !conflicting;
}

export function createReservation(
  student: User,
  classroomId: string,
  seatId: string,
  date: string,
  slotId: string,
): { success: boolean; data?: Reservation; error?: string } {
  const db = getDB();

  const closed = isClosedDate(date);
  if (closed) {
    return { success: false, error: `${date} 为关闭日期（${closed.reason}），不可预约` };
  }

  const classroom = db.classrooms.find((c) => c.id === classroomId);
  if (!classroom) {
    return { success: false, error: '教室不存在' };
  }

  const seat = classroom.seats.find((s) => s.id === seatId);
  if (!seat) {
    return { success: false, error: '座位不存在' };
  }
  if (!seat.enabled) {
    return { success: false, error: '该座位已禁用' };
  }

  const slot = db.timeSlots.find((s) => s.id === slotId && s.classroomId === classroomId);
  if (!slot) {
    return { success: false, error: '时段不存在' };
  }

  const dateObj = new Date(date);
  const weekday = dateObj.getDay() === 0 ? 7 : dateObj.getDay();
  if (!slot.weekday.includes(weekday)) {
    return { success: false, error: '该时段在所选日期不开放' };
  }

  if (!isSeatAvailable(classroomId, seatId, date, slotId)) {
    return { success: false, error: '该座位在此时段已被预约' };
  }

  const reservation: Reservation = {
    id: 'res-' + generateId(),
    studentId: student.id,
    classroomId,
    seatId,
    date,
    slotId,
    startTime: slot.startTime,
    endTime: slot.endTime,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  db.reservations.unshift(reservation);
  saveDB(db);
  return { success: true, data: reservation };
}

export function approveReservation(
  admin: User,
  reservationId: string,
): { success: boolean; data?: Reservation; error?: string } {
  const db = getDB();
  const reservation = db.reservations.find((r) => r.id === reservationId);
  if (!reservation) {
    return { success: false, error: '预约不存在' };
  }
  if (reservation.status !== 'pending') {
    return { success: false, error: '该预约状态不是待审批' };
  }
  if (!isSeatAvailable(reservation.classroomId, reservation.seatId, reservation.date, reservation.slotId, reservationId)) {
    return { success: false, error: '同座位同时段已有批准的预约，无法重复批准' };
  }

  reservation.status = 'approved';
  reservation.approvedBy = admin.id;
  reservation.approvedAt = new Date().toISOString();
  saveDB(db);
  return { success: true, data: reservation };
}

export function rejectReservation(
  admin: User,
  reservationId: string,
  reason: string,
): { success: boolean; data?: Reservation; error?: string } {
  const db = getDB();
  const reservation = db.reservations.find((r) => r.id === reservationId);
  if (!reservation) {
    return { success: false, error: '预约不存在' };
  }
  if (reservation.status !== 'pending') {
    return { success: false, error: '该预约状态不是待审批' };
  }

  reservation.status = 'rejected';
  reservation.rejectReason = reason;
  saveDB(db);

  addViolation(reservation.studentId, reservation.id, 'rejected', `预约被退回：${reason}`);
  return { success: true, data: reservation };
}

export function checkIn(
  user: User,
  reservationId: string,
  targetStudentId?: string,
): { success: boolean; data?: Reservation; error?: string } {
  const db = getDB();
  const reservation = db.reservations.find((r) => r.id === reservationId);
  if (!reservation) {
    return { success: false, error: '预约不存在' };
  }

  if (targetStudentId && targetStudentId !== user.id) {
    return { success: false, error: '不能替他人签到' };
  }

  if (reservation.studentId !== user.id) {
    return { success: false, error: '这不是您的预约，不能替他人签到' };
  }

  if (reservation.status !== 'approved') {
    return { success: false, error: '预约未批准，无法签到' };
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (reservation.date !== today) {
    return { success: false, error: '非预约当日，无法签到' };
  }

  const startDate = parseTime(reservation.date, reservation.startTime);
  const endDate = parseTime(reservation.date, reservation.endTime);

  if (now < startDate) {
    return { success: false, error: '尚未到签到时间' };
  }

  const lateThreshold = db.config.lateThresholdMinutes;
  const isLate = now.getTime() - startDate.getTime() > lateThreshold * 60 * 1000;

  if (now > endDate) {
    reservation.status = 'completed';
    reservation.isLate = true;
    reservation.notCheckedOut = true;
    addViolation(reservation.studentId, reservation.id, 'no_show', '预约时段结束未签到');
    saveDB(db);
    return { success: false, error: '预约时段已结束，已标记为违约' };
  }

  reservation.status = 'checked_in';
  reservation.checkInTime = now.toISOString();
  reservation.isLate = isLate;

  if (isLate) {
    addViolation(reservation.studentId, reservation.id, 'late', `迟到超过${lateThreshold}分钟签到`);
  }

  saveDB(db);
  return { success: true, data: reservation };
}

export function checkOut(
  user: User,
  reservationId: string,
): { success: boolean; data?: Reservation; error?: string } {
  const db = getDB();
  const reservation = db.reservations.find((r) => r.id === reservationId);
  if (!reservation) {
    return { success: false, error: '预约不存在' };
  }
  if (reservation.studentId !== user.id) {
    return { success: false, error: '这不是您的预约' };
  }
  if (reservation.status !== 'checked_in') {
    return { success: false, error: '当前状态无法签退' };
  }

  reservation.status = 'completed';
  reservation.checkOutTime = new Date().toISOString();
  saveDB(db);
  return { success: true, data: reservation };
}

export function processMissedCheckouts(): void {
  const db = getDB();
  const now = new Date();
  let changed = false;

  for (const r of db.reservations) {
    if (r.status === 'checked_in' || r.status === 'approved') {
      const endDate = parseTime(r.date, r.endTime);
      if (now > endDate) {
        if (r.status === 'checked_in') {
          r.status = 'completed';
          r.notCheckedOut = true;
          addViolationRaw(db, r.studentId, r.id, 'not_checked_out', '使用结束后未签退');
          changed = true;
        } else if (r.status === 'approved') {
          const lateThreshold = db.config.lateThresholdMinutes;
          const startDate = parseTime(r.date, r.startTime);
          if (now.getTime() - startDate.getTime() > lateThreshold * 60 * 1000) {
            r.status = 'completed';
            r.isLate = true;
            r.notCheckedOut = true;
            addViolationRaw(db, r.studentId, r.id, 'no_show', '预约未签到');
            changed = true;
          }
        }
      }
    }
  }

  if (changed) {
    saveDB(db);
  }
}

function addViolation(studentId: string, reservationId: string, type: ViolationType, description: string): void {
  const db = getDB();
  addViolationRaw(db, studentId, reservationId, type, description);
  saveDB(db);
}

function addViolationRaw(
  db: ReturnType<typeof getDB>,
  studentId: string,
  reservationId: string,
  type: ViolationType,
  description: string,
): void {
  const exists = db.violations.find((v) => v.reservationId === reservationId && v.type === type);
  if (exists) return;
  const violation: Violation = {
    id: 'vio-' + generateId(),
    studentId,
    reservationId,
    type,
    description,
    createdAt: new Date().toISOString(),
  };
  db.violations.unshift(violation);
}

export function getStudentViolationCount(studentId: string): number {
  const db = getDB();
  return db.violations.filter((v) => v.studentId === studentId).length;
}

export function getClassroomSeatStatus(
  classroomId: string,
  date: string,
  slotId: string,
): Map<string, { available: boolean; reservationId?: string }> {
  const db = getDB();
  const result = new Map<string, { available: boolean; reservationId?: string }>();
  const classroom = db.classrooms.find((c) => c.id === classroomId);
  if (!classroom) return result;

  for (const seat of classroom.seats) {
    result.set(seat.id, { available: seat.enabled && isSeatAvailable(classroomId, seat.id, date, slotId) });
  }

  for (const r of db.reservations) {
    if (r.classroomId === classroomId && r.date === date && r.slotId === slotId) {
      if (r.status === 'approved' || r.status === 'checked_in' || r.status === 'completed') {
        result.set(r.seatId, { available: false, reservationId: r.id });
      }
    }
  }

  return result;
}

export type { Classroom, TimeSlot };
