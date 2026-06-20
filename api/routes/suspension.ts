import { Router, type Request, type Response } from 'express';
import { getDB } from '../data/store.js';
import { authMiddleware, roleMiddleware, logAudit } from '../middleware/auth.js';
import {
  createSuspensionPlan,
  checkSuspensionConflicts,
  confirmSuspensionPlan,
  revokeSuspensionPlan,
  listSuspensionPlans,
  getSuspensionPlan,
} from '../services/suspension.js';
import type { SuspensionReason, SuspensionRecurrence, SuspensionTimeRange, ConflictResolution } from '../../shared/types.js';

const router = Router();

router.get('/', authMiddleware, roleMiddleware('admin'), (_req: Request, res: Response): void => {
  const { status } = _req.query as { status?: string };
  const plans = listSuspensionPlans(status as any);
  const db = getDB();
  const classroomMap = new Map(db.classrooms.map((c) => [c.id, c]));
  const enriched = plans.map((p) => ({
    ...p,
    classroomName: classroomMap.get(p.classroomId)?.name,
    building: classroomMap.get(p.classroomId)?.building,
  }));
  res.json(enriched);
});

router.get('/:id', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const plan = getSuspensionPlan(req.params.id);
  if (!plan) {
    res.status(404).json({ error: '停用计划不存在' });
    return;
  }
  const db = getDB();
  const classroom = db.classrooms.find((c) => c.id === plan.classroomId);
  res.json({
    ...plan,
    classroomName: classroom?.name,
    building: classroom?.building,
  });
});

router.post('/', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const {
    classroomId,
    reason,
    reasonText,
    recurrence,
    startDate,
    endDate,
    timeRanges,
    weekdays,
  } = req.body as {
    classroomId?: string;
    reason?: SuspensionReason;
    reasonText?: string;
    recurrence?: SuspensionRecurrence;
    startDate?: string;
    endDate?: string;
    timeRanges?: SuspensionTimeRange[];
    weekdays?: number[];
  };

  if (!classroomId || !reason || !reasonText || !recurrence || !startDate || !endDate || !timeRanges) {
    res.status(400).json({ error: '缺少必填字段' });
    return;
  }

  const result = createSuspensionPlan(
    req.currentUser!,
    classroomId,
    reason,
    reasonText,
    recurrence,
    startDate,
    endDate,
    timeRanges,
    weekdays || [],
  );

  if (!result.success) {
    logAudit(req.currentUser!.id, req.currentUser!.name, '创建停用计划失败', undefined, false, result.error);
    res.status(400).json({ error: result.error });
    return;
  }

  logAudit(req.currentUser!.id, req.currentUser!.name, '创建停用计划', result.data!.id, true);
  res.status(201).json(result.data);
});

router.post('/:id/check-conflicts', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const { id } = req.params;
  const result = checkSuspensionConflicts(id);

  if (!result.success) {
    logAudit(req.currentUser!.id, req.currentUser!.name, '冲突预检失败', id, false, result.error);
    res.status(400).json({ error: result.error });
    return;
  }

  logAudit(
    req.currentUser!.id,
    req.currentUser!.name,
    `冲突预检：发现 ${result.data!.conflictCount} 个冲突预约`,
    id,
    true,
  );
  res.json(result.data);
});

router.post('/:id/confirm', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const { id } = req.params;
  const { resolution } = req.body as { resolution?: ConflictResolution };

  if (!resolution) {
    res.status(400).json({ error: '请选择冲突处理方式' });
    return;
  }

  const result = confirmSuspensionPlan(req.currentUser!, id, resolution);

  if (!result.success) {
    logAudit(req.currentUser!.id, req.currentUser!.name, '确认停用计划失败', id, false, result.error);
    res.status(400).json({ error: result.error });
    return;
  }

  logAudit(req.currentUser!.id, req.currentUser!.name, result.data!.summary, id, true);
  res.json(result.data);
});

router.post('/:id/revoke', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const { id } = req.params;
  const result = revokeSuspensionPlan(req.currentUser!, id);

  if (!result.success) {
    logAudit(req.currentUser!.id, req.currentUser!.name, '撤销停用计划失败', id, false, result.error);
    res.status(400).json({ error: result.error });
    return;
  }

  logAudit(req.currentUser!.id, req.currentUser!.name, result.data!.summary, id, true);
  res.json(result.data);
});

export default router;
