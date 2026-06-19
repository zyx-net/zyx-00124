import { getDB } from '../data/store.js';
import type { StudentStat, ClassroomStat } from '../../shared/types.js';

export function getStudentStats(): StudentStat[] {
  const db = getDB();
  const students = db.users.filter((u) => u.role === 'student');
  const result: StudentStat[] = [];

  for (const student of students) {
    const reservations = db.reservations.filter((r) => r.studentId === student.id);
    const completedCount = reservations.filter((r) => r.status === 'completed').length;
    const checkInCount = reservations.filter(
      (r) => r.status === 'checked_in' || r.status === 'completed',
    ).length;
    const violationCount = db.violations.filter((v) => v.studentId === student.id).length;

    result.push({
      studentId: student.id,
      studentName: student.name,
      studentUsername: student.username,
      totalReservations: reservations.length,
      completedCount,
      checkInCount,
      checkInRate: reservations.length === 0 ? 0 : checkInCount / reservations.length,
      violationCount,
    });
  }

  return result;
}

export function getClassroomStats(): ClassroomStat[] {
  const db = getDB();
  const result: ClassroomStat[] = [];

  for (const classroom of db.classrooms) {
    const reservations = db.reservations.filter((r) => r.classroomId === classroom.id);
    const completedCount = reservations.filter((r) => r.status === 'completed').length;
    const totalSeats = classroom.seats.filter((s) => s.enabled).length;

    const daysWithSlots = new Set(reservations.map((r) => r.date)).size;
    const slotsPerDay = db.timeSlots.filter((s) => s.classroomId === classroom.id).length;
    const totalCapacity = daysWithSlots * slotsPerDay * totalSeats;
    const utilizationRate = totalCapacity === 0 ? 0 : completedCount / totalCapacity;

    result.push({
      classroomId: classroom.id,
      classroomName: classroom.name,
      building: classroom.building,
      totalSeats,
      totalReservations: reservations.length,
      completedCount,
      utilizationRate,
    });
  }

  return result;
}

export function exportToCSV(type: 'students' | 'classrooms'): string {
  if (type === 'students') {
    const stats = getStudentStats();
    const headers = ['学号/用户名', '姓名', '预约总数', '完成次数', '签到次数', '签到率', '违约次数'];
    const rows = stats.map((s) => [
      s.studentUsername,
      s.studentName,
      s.totalReservations,
      s.completedCount,
      s.checkInCount,
      (s.checkInRate * 100).toFixed(1) + '%',
      s.violationCount,
    ]);
    return [headers, ...rows].map((r) => r.join(',')).join('\n');
  } else {
    const stats = getClassroomStats();
    const headers = ['教室名称', '教学楼', '可用座位数', '预约总数', '完成次数', '使用率'];
    const rows = stats.map((s) => [
      s.classroomName,
      s.building,
      s.totalSeats,
      s.totalReservations,
      s.completedCount,
      (s.utilizationRate * 100).toFixed(1) + '%',
    ]);
    return [headers, ...rows].map((r) => r.join(',')).join('\n');
  }
}
