import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  User,
  Classroom,
  TimeSlot,
  ClosedDate,
  Reservation,
  Violation,
  AuditLog,
  SystemConfig,
  ClosedDateImportSnapshot,
  SuspensionPlan,
  SuspensionSnapshot,
} from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readFile<T>(filename: string, defaultValue: T): T {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return defaultValue;
  }
  try {
    const content = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

function writeFile<T>(filename: string, data: T): void {
  ensureDataDir();
  const filepath = path.join(DATA_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export interface DB {
  users: User[];
  classrooms: Classroom[];
  timeSlots: TimeSlot[];
  closedDates: ClosedDate[];
  reservations: Reservation[];
  violations: Violation[];
  auditLogs: AuditLog[];
  config: SystemConfig;
  lastClosedDateImport?: ClosedDateImportSnapshot | null;
  suspensionPlans: SuspensionPlan[];
  suspensionSnapshots: SuspensionSnapshot[];
}

function getDefaultData(): DB {
  const now = new Date().toISOString();
  const users: User[] = [
    {
      id: 'admin-001',
      username: 'admin',
      password: 'admin123',
      name: '系统管理员',
      role: 'admin',
      createdAt: now,
    },
    {
      id: 'stu-001',
      username: 'student01',
      password: '123456',
      name: '张三',
      role: 'student',
      studentId: '2024001',
      createdAt: now,
    },
    {
      id: 'stu-002',
      username: 'student02',
      password: '123456',
      name: '李四',
      role: 'student',
      studentId: '2024002',
      createdAt: now,
    },
  ];

  const createSeats = (classroomId: string, rows: number, cols: number) => {
    const seats = [];
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
    return seats;
  };

  const classrooms: Classroom[] = [
    {
      id: 'cls-a101',
      name: 'A101',
      building: 'A栋教学楼',
      rows: 5,
      cols: 6,
      seats: createSeats('cls-a101', 5, 6),
      createdAt: now,
    },
    {
      id: 'cls-b202',
      name: 'B202',
      building: 'B栋教学楼',
      rows: 4,
      cols: 5,
      seats: createSeats('cls-b202', 4, 5),
      createdAt: now,
    },
  ];

  const timeSlots: TimeSlot[] = [
    { id: 'slot-1', classroomId: 'cls-a101', startTime: '08:00', endTime: '10:00', weekday: [1, 2, 3, 4, 5] },
    { id: 'slot-2', classroomId: 'cls-a101', startTime: '10:00', endTime: '12:00', weekday: [1, 2, 3, 4, 5] },
    { id: 'slot-3', classroomId: 'cls-a101', startTime: '14:00', endTime: '16:00', weekday: [1, 2, 3, 4, 5] },
    { id: 'slot-4', classroomId: 'cls-a101', startTime: '16:00', endTime: '18:00', weekday: [1, 2, 3, 4, 5] },
    { id: 'slot-5', classroomId: 'cls-b202', startTime: '08:00', endTime: '10:00', weekday: [1, 2, 3, 4, 5] },
    { id: 'slot-6', classroomId: 'cls-b202', startTime: '10:00', endTime: '12:00', weekday: [1, 2, 3, 4, 5] },
    { id: 'slot-7', classroomId: 'cls-b202', startTime: '14:00', endTime: '16:00', weekday: [1, 2, 3, 4, 5] },
    { id: 'slot-8', classroomId: 'cls-b202', startTime: '16:00', endTime: '18:00', weekday: [1, 2, 3, 4, 5] },
  ];

  const config: SystemConfig = {
    lateThresholdMinutes: 15,
    violationWarningThreshold: 3,
  };

  return {
    users,
    classrooms,
    timeSlots,
    closedDates: [],
    reservations: [],
    violations: [],
    auditLogs: [],
    config,
    lastClosedDateImport: null,
    suspensionPlans: [],
    suspensionSnapshots: [],
  };
}

export function getDB(): DB {
  const db = readFile<DB>('db.json', {} as DB);
  if (!db.users || db.users.length === 0) {
    const defaultData = getDefaultData();
    writeFile('db.json', defaultData);
    return defaultData;
  }
  if (!db.suspensionPlans) db.suspensionPlans = [];
  if (!db.suspensionSnapshots) db.suspensionSnapshots = [];
  return db;
}

export function saveDB(db: DB): void {
  writeFile('db.json', db);
}

export { generateId };
