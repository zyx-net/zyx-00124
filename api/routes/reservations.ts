import { Router, type Request, type Response } from 'express';
import { getDB } from '../data/store.js';
import { authMiddleware, roleMiddleware, logAudit } from '../middleware/auth.js';
import {
  createReservation,
  approveReservation,
  rejectReservation,
  checkIn,
  checkOut,
  getClassroomSeatStatus,
  processMissedCheckouts,
  getStudentViolationCount,
  isClosedDate,
} from '../services/reservation.js';

const router = Router();

router.get('/', authMiddleware, (req: Request, res: Response): void => {
  const db = getDB();
  const user = req.currentUser!;
  const { status, studentId, classroomId, date } = req.query as {
    status?: string;
    studentId?: string;
    classroomId?: string;
    date?: string;
  };

  let list = db.reservations;
  if (user.role === 'student') {
    list = list.filter((r) => r.studentId === user.id);
  } else if (studentId) {
    list = list.filter((r) => r.studentId === studentId);
  }
  if (status) {
    list = list.filter((r) => r.status === status);
  }
  if (classroomId) {
    list = list.filter((r) => r.classroomId === classroomId);
  }
  if (date) {
    list = list.filter((r) => r.date === date);
  }

  const users = new Map(db.users.map((u) => [u.id, u]));
  const classrooms = new Map(db.classrooms.map((c) => [c.id, c]));

  const enriched = list.map((r) => {
    const student = users.get(r.studentId);
    const classroom = classrooms.get(r.classroomId);
    const seat = classroom?.seats.find((s) => s.id === r.seatId);
    return {
      ...r,
      studentName: student?.name,
      studentUsername: student?.username,
      classroomName: classroom?.name,
      seatLabel: seat?.label,
    };
  });

  res.json(enriched);
});

router.get('/seat-status', authMiddleware, (req: Request, res: Response): void => {
  const { classroomId, date, slotId } = req.query as {
    classroomId?: string;
    date?: string;
    slotId?: string;
  };
  if (!classroomId || !date || !slotId) {
    res.status(400).json({ error: '缺少参数' });
    return;
  }
  const closed = isClosedDate(date);
  if (closed) {
    res.json({ closed: true, closedReason: closed.reason, seats: {} });
    return;
  }
  const statusMap = getClassroomSeatStatus(classroomId, date, slotId);
  const seats: Record<string, { available: boolean; reservationId?: string }> = {};
  statusMap.forEach((v, k) => {
    seats[k] = v;
  });
  res.json({ closed: false, seats });
});

router.post('/', authMiddleware, roleMiddleware('student'), (req: Request, res: Response): void => {
  processMissedCheckouts();
  const user = req.currentUser!;
  const { classroomId, seatId, date, slotId } = req.body as {
    classroomId?: string;
    seatId?: string;
    date?: string;
    slotId?: string;
  };

  if (!classroomId || !seatId || !date || !slotId) {
    res.status(400).json({ error: '缺少必填字段' });
    return;
  }

  const violationCount = getStudentViolationCount(user.id);
  const db = getDB();
  if (violationCount >= db.config.violationWarningThreshold) {
    // 只是警告，不阻止申请，但记录日志
    logAudit(user.id, user.name, '高违约次数申请', undefined, true, `违约次数${violationCount}次`);
  }

  const result = createReservation(user, classroomId, seatId, date, slotId);
  if (!result.success) {
    logAudit(user.id, user.name, '提交预约失败', undefined, false, result.error);
    res.status(400).json({ error: result.error });
    return;
  }
  logAudit(user.id, user.name, '提交预约成功', result.data!.id, true);
  res.status(201).json(result.data);
});

router.put('/:id/approve', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  processMissedCheckouts();
  const { id } = req.params;
  const result = approveReservation(req.currentUser!, id);
  if (!result.success) {
    logAudit(req.currentUser!.id, req.currentUser!.name, '批准预约失败', id, false, result.error);
    res.status(400).json({ error: result.error });
    return;
  }
  logAudit(req.currentUser!.id, req.currentUser!.name, '批准预约', id, true);
  res.json(result.data);
});

router.put('/:id/reject', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  processMissedCheckouts();
  const { id } = req.params;
  const { reason } = req.body as { reason?: string };
  if (!reason) {
    res.status(400).json({ error: '请填写退回原因' });
    return;
  }
  const result = rejectReservation(req.currentUser!, id, reason);
  if (!result.success) {
    logAudit(req.currentUser!.id, req.currentUser!.name, '退回预约失败', id, false, result.error);
    res.status(400).json({ error: result.error });
    return;
  }
  logAudit(req.currentUser!.id, req.currentUser!.name, '退回预约', id, true, reason);
  res.json(result.data);
});

router.post('/:id/checkin', authMiddleware, (req: Request, res: Response): void => {
  processMissedCheckouts();
  const { id } = req.params;
  const { targetStudentId } = req.body as { targetStudentId?: string };
  const result = checkIn(req.currentUser!, id, targetStudentId);
  if (!result.success) {
    logAudit(req.currentUser!.id, req.currentUser!.name, '签到失败', id, false, result.error);
    res.status(400).json({ error: result.error });
    return;
  }
  logAudit(req.currentUser!.id, req.currentUser!.name, '签到成功', id, true);
  res.json(result.data);
});

router.post('/:id/checkout', authMiddleware, (req: Request, res: Response): void => {
  processMissedCheckouts();
  const { id } = req.params;
  const result = checkOut(req.currentUser!, id);
  if (!result.success) {
    logAudit(req.currentUser!.id, req.currentUser!.name, '签退失败', id, false, result.error);
    res.status(400).json({ error: result.error });
    return;
  }
  logAudit(req.currentUser!.id, req.currentUser!.name, '签退成功', id, true);
  res.json(result.data);
});

export default router;
