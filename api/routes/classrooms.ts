import { Router, type Request, type Response } from 'express';
import { getDB, saveDB, generateId } from '../data/store.js';
import { authMiddleware, roleMiddleware, logAudit } from '../middleware/auth.js';
import type { Classroom, Seat, TimeSlot, ClosedDate } from '../../shared/types.js';

const router = Router();

router.get('/', authMiddleware, (_req: Request, res: Response): void => {
  const db = getDB();
  res.json(db.classrooms);
});

router.post('/', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const { name, building, rows, cols } = req.body as {
    name?: string;
    building?: string;
    rows?: number;
    cols?: number;
  };

  if (!name || !building || !rows || !cols) {
    res.status(400).json({ error: '缺少必填字段' });
    return;
  }

  const db = getDB();
  const seats: Seat[] = [];
  const classroomId = 'cls-' + generateId();
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= cols; c++) {
      seats.push({
        id: `${classroomId}-seat-${r}-${c}`,
        row: r,
        col: c,
        label: `${String.fromCharCode(64 + r)}${c}`,
        enabled: true,
      });
    }
  }

  const classroom: Classroom = {
    id: classroomId,
    name,
    building,
    rows,
    cols,
    seats,
    createdAt: new Date().toISOString(),
  };

  db.classrooms.push(classroom);
  saveDB(db);
  logAudit(req.currentUser!.id, req.currentUser!.name, '创建教室', classroom.id, true);
  res.status(201).json(classroom);
});

router.put('/:id', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { name, building } = req.body as { name?: string; building?: string };
  const db = getDB();
  const classroom = db.classrooms.find((c) => c.id === id);
  if (!classroom) {
    res.status(404).json({ error: '教室不存在' });
    return;
  }
  if (name) classroom.name = name;
  if (building) classroom.building = building;
  saveDB(db);
  logAudit(req.currentUser!.id, req.currentUser!.name, '更新教室', id, true);
  res.json(classroom);
});

router.delete('/:id', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const { id } = req.params;
  const db = getDB();
  const idx = db.classrooms.findIndex((c) => c.id === id);
  if (idx === -1) {
    res.status(404).json({ error: '教室不存在' });
    return;
  }
  db.classrooms.splice(idx, 1);
  db.timeSlots = db.timeSlots.filter((s) => s.classroomId !== id);
  saveDB(db);
  logAudit(req.currentUser!.id, req.currentUser!.name, '删除教室', id, true);
  res.json({ message: '删除成功' });
});

router.put('/:id/seats', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { seats } = req.body as { seats?: Seat[] };
  const db = getDB();
  const classroom = db.classrooms.find((c) => c.id === id);
  if (!classroom) {
    res.status(404).json({ error: '教室不存在' });
    return;
  }
  if (seats) {
    classroom.seats = seats;
    classroom.rows = Math.max(...seats.map((s) => s.row));
    classroom.cols = Math.max(...seats.map((s) => s.col));
  }
  saveDB(db);
  logAudit(req.currentUser!.id, req.currentUser!.name, '更新教室座位配置', id, true);
  res.json(classroom.seats);
});

router.get('/:id/slots', authMiddleware, (_req: Request, res: Response): void => {
  const { id } = _req.params;
  const db = getDB();
  const slots = db.timeSlots.filter((s) => s.classroomId === id);
  res.json(slots);
});

router.put('/:id/slots', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { slots } = req.body as { slots?: Omit<TimeSlot, 'id' | 'classroomId'>[] };
  const db = getDB();
  const classroom = db.classrooms.find((c) => c.id === id);
  if (!classroom) {
    res.status(404).json({ error: '教室不存在' });
    return;
  }
  db.timeSlots = db.timeSlots.filter((s) => s.classroomId !== id);
  if (slots) {
    for (const s of slots) {
      db.timeSlots.push({
        ...s,
        id: 'slot-' + generateId(),
        classroomId: id,
      });
    }
  }
  saveDB(db);
  logAudit(req.currentUser!.id, req.currentUser!.name, '更新开放时段', id, true);
  res.json(db.timeSlots.filter((s) => s.classroomId === id));
});

router.get('/closed-dates/list', authMiddleware, (_req: Request, res: Response): void => {
  const db = getDB();
  res.json(db.closedDates);
});

router.put('/closed-dates/batch', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const { dates } = req.body as { dates?: ClosedDate[] };
  const db = getDB();
  db.closedDates = dates || [];
  saveDB(db);
  logAudit(req.currentUser!.id, req.currentUser!.name, '更新关闭日期', undefined, true);
  res.json(db.closedDates);
});

export default router;
