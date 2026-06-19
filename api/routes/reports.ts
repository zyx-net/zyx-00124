import { Router, type Request, type Response } from 'express';
import { getDB } from '../data/store.js';
import { authMiddleware } from '../middleware/auth.js';
import { processMissedCheckouts } from '../services/reservation.js';
import { getStudentStats, getClassroomStats, exportToCSV } from '../services/statistics.js';

const router = Router();

router.get('/violations', authMiddleware, (req: Request, res: Response): void => {
  processMissedCheckouts();
  const db = getDB();
  const user = req.currentUser!;
  const { studentId } = req.query as { studentId?: string };

  let list = db.violations;
  if (user.role === 'student') {
    list = list.filter((v) => v.studentId === user.id);
  } else if (studentId) {
    list = list.filter((v) => v.studentId === studentId);
  }

  const users = new Map(db.users.map((u) => [u.id, u]));
  const enriched = list.map((v) => ({
    ...v,
    studentName: users.get(v.studentId)?.name,
  }));

  res.json(enriched);
});

router.get('/history', authMiddleware, (req: Request, res: Response): void => {
  processMissedCheckouts();
  const db = getDB();
  const user = req.currentUser!;

  const users = new Map(db.users.map((u) => [u.id, u]));
  const classrooms = new Map(db.classrooms.map((c) => [c.id, c]));

  const reservations =
    (user.role === 'student'
      ? db.reservations.filter((r) => r.studentId === user.id)
      : db.reservations
    ).map((r) => {
      const stu = users.get(r.studentId);
      const cls = classrooms.get(r.classroomId);
      const seat = cls?.seats.find((s) => s.id === r.seatId);
      return {
        ...r,
        studentName: stu?.name,
        studentUsername: stu?.username,
        classroomName: cls?.name,
        seatLabel: seat?.label,
      };
    });

  const violations = (
    user.role === 'student'
      ? db.violations.filter((v) => v.studentId === user.id)
      : db.violations
  ).map((v) => ({
    ...v,
    studentName: users.get(v.studentId)?.name,
  }));

  res.json({
    reservations,
    violations,
  });
});

router.get('/students', authMiddleware, (req: Request, res: Response): void => {
  processMissedCheckouts();
  res.json(getStudentStats());
});

router.get('/classroom-stats', authMiddleware, (req: Request, res: Response): void => {
  processMissedCheckouts();
  res.json(getClassroomStats());
});

router.get('/export/:type', authMiddleware, (req: Request, res: Response): void => {
  processMissedCheckouts();
  const { type } = req.params;
  if (type !== 'students' && type !== 'classrooms') {
    res.status(400).json({ error: '类型错误' });
    return;
  }
  const csv = exportToCSV(type);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${type}-${Date.now()}.csv`);
  res.send('\uFEFF' + csv);
});

router.get('/audit-logs', authMiddleware, (_req: Request, res: Response): void => {
  const db = getDB();
  res.json(db.auditLogs.slice(0, 500));
});

router.get('/users', authMiddleware, (_req: Request, res: Response): void => {
  const db = getDB();
  const list = db.users.map(({ password, ...u }) => u);
  res.json(list);
});

router.get('/config', authMiddleware, (_req: Request, res: Response): void => {
  const db = getDB();
  res.json(db.config);
});

export default router;
