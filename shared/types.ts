export type UserRole = 'student' | 'admin';

export interface User {
  id: string;
  username: string;
  password: string;
  name: string;
  role: UserRole;
  studentId?: string;
  createdAt: string;
}

export interface Seat {
  id: string;
  row: number;
  col: number;
  label: string;
  enabled: boolean;
}

export interface Classroom {
  id: string;
  name: string;
  building: string;
  rows: number;
  cols: number;
  seats: Seat[];
  createdAt: string;
}

export interface TimeSlot {
  id: string;
  classroomId: string;
  startTime: string;
  endTime: string;
  weekday: number[];
}

export interface ClosedDate {
  date: string;
  reason: string;
  classroomId?: string;
}

export type ImportRowStatus = 'new' | 'duplicate' | 'invalid';

export interface ImportPreviewRow {
  line: number;
  date: string;
  reason: string;
  classroomId?: string;
  classroomName?: string;
  status: ImportRowStatus;
  message?: string;
}

export interface ImportPreviewResult {
  total: number;
  newCount: number;
  duplicateCount: number;
  invalidCount: number;
  rows: ImportPreviewRow[];
}

export interface ImportExecuteResult {
  success: boolean;
  added: number;
  skipped: number;
  failed: number;
  rows: ImportPreviewRow[];
  batchId: string;
  summary: string;
}

export interface ClosedDateImportSnapshot {
  batchId: string;
  previousClosedDates: ClosedDate[];
  importedCount: number;
  importedBy: string;
  importedByName?: string;
  importedAt: string;
  summary: string;
}

export type ReservationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'checked_in'
  | 'completed'
  | 'cancelled';

export interface Reservation {
  id: string;
  studentId: string;
  classroomId: string;
  seatId: string;
  date: string;
  slotId: string;
  startTime: string;
  endTime: string;
  status: ReservationStatus;
  isLate?: boolean;
  notCheckedOut?: boolean;
  checkInTime?: string;
  checkOutTime?: string;
  approvedBy?: string;
  rejectReason?: string;
  createdAt: string;
  approvedAt?: string;
}

export type ViolationType = 'late' | 'no_show' | 'not_checked_out' | 'rejected';

export interface Violation {
  id: string;
  studentId: string;
  reservationId: string;
  type: ViolationType;
  description: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName?: string;
  action: string;
  targetId?: string;
  success: boolean;
  reason?: string;
  createdAt: string;
}

export interface StudentStat {
  studentId: string;
  studentName: string;
  studentUsername: string;
  totalReservations: number;
  completedCount: number;
  checkInCount: number;
  checkInRate: number;
  violationCount: number;
}

export interface ClassroomStat {
  classroomId: string;
  classroomName: string;
  building: string;
  totalSeats: number;
  totalReservations: number;
  completedCount: number;
  utilizationRate: number;
}

export type SuspensionRecurrence = 'once' | 'daily' | 'weekly' | 'monthly';

export type SuspensionStatus = 'pending' | 'active' | 'revoked';

export type SuspensionReason = 'maintenance' | 'exam' | 'event' | 'other';

export interface SuspensionTimeRange {
  startTime: string;
  endTime: string;
}

export interface SuspensionPlan {
  id: string;
  classroomId: string;
  reason: SuspensionReason;
  reasonText: string;
  recurrence: SuspensionRecurrence;
  startDate: string;
  endDate: string;
  timeRanges: SuspensionTimeRange[];
  weekdays: number[];
  status: SuspensionStatus;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  confirmedAt?: string;
  revokedAt?: string;
  revokedBy?: string;
  revokedByName?: string;
}

export interface ConflictingReservation {
  id: string;
  studentId: string;
  studentName?: string;
  classroomId: string;
  classroomName?: string;
  seatId: string;
  seatLabel?: string;
  date: string;
  slotId: string;
  startTime: string;
  endTime: string;
  status: string;
}

export interface SuspensionConflictPreview {
  plan: SuspensionPlan;
  conflictingReservations: ConflictingReservation[];
  conflictCount: number;
}

export type ConflictResolution = 'cancel_all' | 'reschedule_suggest' | 'skip';

export interface SuspensionConfirmResult {
  success: boolean;
  planId: string;
  cancelledCount: number;
  cancelledReservationIds: string[];
  skippedCount: number;
  skippedReservationIds: string[];
  summary: string;
}

export interface SuspensionRevokeResult {
  success: boolean;
  planId: string;
  restoredCount: number;
  restoredReservationIds: string[];
  removedClosedDateCount: number;
  summary: string;
}

export interface SuspensionSnapshot {
  planId: string;
  previousReservations: Reservation[];
  previousClosedDates: ClosedDate[];
  addedClosedDates: ClosedDate[];
  cancelledReservations: string[];
  confirmedBy: string;
  confirmedByName: string;
  confirmedAt: string;
  resolution: ConflictResolution;
  summary: string;
}

export interface SystemConfig {
  lateThresholdMinutes: number;
  violationWarningThreshold: number;
}
