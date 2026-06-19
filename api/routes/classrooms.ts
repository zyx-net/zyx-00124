import { Router, type Request, type Response } from 'express';
import { getDB, saveDB, generateId } from '../data/store.js';
import { authMiddleware, roleMiddleware, logAudit } from '../middleware/auth.js';
import type {
  Classroom,
  Seat,
  TimeSlot,
  ClosedDate,
  ImportPreviewRow,
  ImportPreviewResult,
  ImportExecuteResult,
  ClosedDateImportSnapshot,
} from '../../shared/types.js';

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

function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  if (isNaN(d.getTime())) return false;
  const [y, m, day] = s.split('-').map(Number);
  return d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day;
}

function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { cur.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        cur.push(field); field = '';
        if (cur.some((c) => c.length > 0)) lines.push(cur);
        cur = [];
      } else field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); lines.push(cur); }
  return lines;
}

function buildPreview(csvText: string, existingDates: Set<string>): ImportPreviewResult {
  const rows = parseCSV(csvText.replace(/^\uFEFF/, ''));
  if (rows.length === 0) {
    return { total: 0, newCount: 0, duplicateCount: 0, invalidCount: 0, rows: [] };
  }
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const dateIdx = header.findIndex((h) => h === 'date' || h === '日期');
  const reasonIdx = header.findIndex((h) => h === 'reason' || h === '关闭原因' || h === '原因');
  const previewRows: ImportPreviewRow[] = [];
  const seenInBatch = new Set<string>();
  for (let i = 1; i < rows.length; i++) {
    const raw = rows[i];
    const lineNum = i + 1;
    const rawDate = (dateIdx >= 0 ? raw[dateIdx] : raw[0] || '').trim();
    const rawReason = (reasonIdx >= 0 ? raw[reasonIdx] : raw[1] || '').trim();
    const errors: string[] = [];
    let status: ImportPreviewRow['status'] = 'new';
    if (!isValidDateStr(rawDate)) errors.push('日期格式错误（应为 YYYY-MM-DD）');
    if (!rawReason) errors.push('关闭原因不能为空');
    if (errors.length > 0) {
      status = 'invalid';
    } else if (existingDates.has(rawDate) || seenInBatch.has(rawDate)) {
      status = 'duplicate';
      errors.push('日期已存在');
    } else {
      seenInBatch.add(rawDate);
    }
    previewRows.push({
      line: lineNum,
      date: rawDate,
      reason: rawReason,
      status,
      message: errors.join('；') || undefined,
    });
  }
  return {
    total: previewRows.length,
    newCount: previewRows.filter((r) => r.status === 'new').length,
    duplicateCount: previewRows.filter((r) => r.status === 'duplicate').length,
    invalidCount: previewRows.filter((r) => r.status === 'invalid').length,
    rows: previewRows,
  };
}

function closedDatesToCSV(list: ClosedDate[]): string {
  const escape = (s: string) => {
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = ['日期,关闭原因'];
  for (const cd of list) lines.push(`${escape(cd.date)},${escape(cd.reason)}`);
  return lines.join('\n');
}

router.get('/closed-dates/export', authMiddleware, roleMiddleware('admin'), (_req: Request, res: Response): void => {
  const db = getDB();
  const csv = closedDatesToCSV(db.closedDates);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=closed-dates-${Date.now()}.csv`);
  res.send('\uFEFF' + csv);
  logAudit(_req.currentUser!.id, _req.currentUser!.name, '导出关闭日期CSV', undefined, true);
});

router.post('/closed-dates/import/preview', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const { csv } = req.body as { csv?: string };
  if (!csv) {
    res.status(400).json({ error: '缺少 CSV 内容' });
    return;
  }
  const db = getDB();
  const existing = new Set(db.closedDates.map((d) => d.date));
  const preview = buildPreview(csv, existing);
  logAudit(req.currentUser!.id, req.currentUser!.name, '预览关闭日期导入', undefined, true);
  res.json(preview);
});

router.post('/closed-dates/import/execute', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const { csv, skipDuplicates } = req.body as { csv?: string; skipDuplicates?: boolean };
  if (!csv) {
    res.status(400).json({ error: '缺少 CSV 内容' });
    return;
  }
  const db = getDB();
  const existing = new Set(db.closedDates.map((d) => d.date));
  const preview = buildPreview(csv, existing);
  const previousClosedDates = JSON.parse(JSON.stringify(db.closedDates)) as ClosedDate[];
  const newItems: ClosedDate[] = [];
  const finalRows: ImportPreviewRow[] = preview.rows.map((r) => {
    if (r.status === 'new') {
      newItems.push({ date: r.date, reason: r.reason });
      existing.add(r.date);
      return { ...r };
    }
    if (r.status === 'duplicate' && skipDuplicates) {
      return { ...r };
    }
    return { ...r };
  });
  const merged = [...previousClosedDates, ...newItems].sort((a, b) => a.date.localeCompare(b.date));
  db.closedDates = merged;
  const batchId = 'batch-' + generateId();
  const summary = `成功导入 ${newItems.length} 条${preview.duplicateCount > 0 ? `（跳过重复 ${preview.duplicateCount} 条）` : ''}${preview.invalidCount > 0 ? `，无效 ${preview.invalidCount} 条` : ''}`;
  const snapshot: ClosedDateImportSnapshot = {
    batchId,
    previousClosedDates,
    importedCount: newItems.length,
    importedBy: req.currentUser!.id,
    importedByName: req.currentUser!.name,
    importedAt: new Date().toISOString(),
    summary,
  };
  db.lastClosedDateImport = snapshot;
  saveDB(db);
  logAudit(req.currentUser!.id, req.currentUser!.name, `批量导入关闭日期: ${summary}`, batchId, true);
  const result: ImportExecuteResult = {
    success: true,
    added: newItems.length,
    skipped: skipDuplicates ? preview.duplicateCount : 0,
    failed: preview.invalidCount,
    rows: finalRows,
    batchId,
    summary,
  };
  res.json(result);
});

router.post('/closed-dates/import/undo', authMiddleware, roleMiddleware('admin'), (req: Request, res: Response): void => {
  const db = getDB();
  const snap = db.lastClosedDateImport;
  if (!snap) {
    res.status(400).json({ error: '没有可撤销的批量导入' });
    return;
  }
  db.closedDates = snap.previousClosedDates;
  const batchId = snap.batchId;
  const restoredCount = snap.importedCount;
  db.lastClosedDateImport = null;
  saveDB(db);
  logAudit(req.currentUser!.id, req.currentUser!.name, `撤销关闭日期批量导入，恢复 ${restoredCount} 条前的状态`, batchId, true);
  res.json({ success: true, batchId, restoredCount, summary: `已撤销最近一次导入（${restoredCount} 条）` });
});

router.get('/closed-dates/import/last', authMiddleware, roleMiddleware('admin'), (_req: Request, res: Response): void => {
  const db = getDB();
  res.json(db.lastClosedDateImport || null);
});

export default router;
