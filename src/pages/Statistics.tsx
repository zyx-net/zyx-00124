import { useState, useEffect } from 'react';
import { BarChart3, Users, Building2, Download, Loader2, TrendingUp } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import type { StudentStat, ClassroomStat } from '../../shared/types';

export default function Statistics() {
  useAuth();
  const { show } = useToast();
  const [tab, setTab] = useState<'students' | 'classrooms'>('students');
  const [studentStats, setStudentStats] = useState<StudentStat[]>([]);
  const [classroomStats, setClassroomStats] = useState<ClassroomStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([api.getStudentStats(), api.getClassroomStats()]);
      setStudentStats(s);
      setClassroomStats(c);
    } catch (e: any) {
      show('error', e.error || '加载统计失败');
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await api.exportStats(tab);
      show('success', '导出成功');
    } catch (e: any) {
      show('error', e.error || '导出失败');
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-bold text-zinc-900">统计导出</h1>
          <p className="text-sm text-zinc-500 mt-1">按学生或教室维度查看使用数据</p>
        </div>
        <button onClick={handleExport} disabled={exporting} className="btn-primary">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          导出 {tab === 'students' ? '学生' : '教室'}统计
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
              <Users className="w-5 h-5 text-brand-700" />
            </div>
            <div>
              <div className="text-sm text-zinc-500">学生总数</div>
              <div className="text-2xl font-bold text-zinc-900">{studentStats.length}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent-100 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-accent-700" />
            </div>
            <div>
              <div className="text-sm text-zinc-500">教室总数</div>
              <div className="text-2xl font-bold text-zinc-900">{classroomStats.length}</div>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-700" />
            </div>
            <div>
              <div className="text-sm text-zinc-500">总预约次数</div>
              <div className="text-2xl font-bold text-zinc-900">
                {studentStats.reduce((s, x) => s + x.totalReservations, 0)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 border-b border-zinc-100 pb-4 mb-4">
          <button
            onClick={() => setTab('students')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'students' ? 'bg-brand-600 text-white' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Users className="w-4 h-4" /> 学生统计
            </span>
          </button>
          <button
            onClick={() => setTab('classrooms')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              tab === 'classrooms' ? 'bg-brand-600 text-white' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <Building2 className="w-4 h-4" /> 教室统计
            </span>
          </button>
        </div>

        {tab === 'students' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-100">
                  <th className="py-3 px-2 font-medium">学生</th>
                  <th className="py-3 px-2 font-medium">学号/用户名</th>
                  <th className="py-3 px-2 font-medium text-right">预约总数</th>
                  <th className="py-3 px-2 font-medium text-right">完成次数</th>
                  <th className="py-3 px-2 font-medium text-right">签到次数</th>
                  <th className="py-3 px-2 font-medium text-right">签到率</th>
                  <th className="py-3 px-2 font-medium text-right">违约次数</th>
                </tr>
              </thead>
              <tbody>
                {studentStats.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-zinc-400">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  studentStats.map((s) => (
                    <tr key={s.studentId} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                      <td className="py-3 px-2 font-medium text-zinc-900">{s.studentName}</td>
                      <td className="py-3 px-2 text-zinc-600">{s.studentUsername}</td>
                      <td className="py-3 px-2 text-right text-zinc-900">{s.totalReservations}</td>
                      <td className="py-3 px-2 text-right text-zinc-900">{s.completedCount}</td>
                      <td className="py-3 px-2 text-right text-zinc-900">{s.checkInCount}</td>
                      <td className="py-3 px-2 text-right">
                        <span
                          className={`badge ${
                            s.checkInRate >= 0.8
                              ? 'bg-green-100 text-green-800'
                              : s.checkInRate >= 0.5
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {(s.checkInRate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-3 px-2 text-right">
                        <span
                          className={`font-medium ${
                            s.violationCount >= 3 ? 'text-red-600' : s.violationCount > 0 ? 'text-amber-600' : 'text-zinc-500'
                          }`}
                        >
                          {s.violationCount}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-100">
                  <th className="py-3 px-2 font-medium">教室名称</th>
                  <th className="py-3 px-2 font-medium">教学楼</th>
                  <th className="py-3 px-2 font-medium text-right">可用座位</th>
                  <th className="py-3 px-2 font-medium text-right">预约总数</th>
                  <th className="py-3 px-2 font-medium text-right">完成次数</th>
                  <th className="py-3 px-2 font-medium text-right">使用率</th>
                </tr>
              </thead>
              <tbody>
                {classroomStats.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-zinc-400">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  classroomStats.map((c) => (
                    <tr key={c.classroomId} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                      <td className="py-3 px-2 font-medium text-zinc-900">{c.classroomName}</td>
                      <td className="py-3 px-2 text-zinc-600">{c.building}</td>
                      <td className="py-3 px-2 text-right text-zinc-900">{c.totalSeats}</td>
                      <td className="py-3 px-2 text-right text-zinc-900">{c.totalReservations}</td>
                      <td className="py-3 px-2 text-right text-zinc-900">{c.completedCount}</td>
                      <td className="py-3 px-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-24 h-2 bg-zinc-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-500 rounded-full"
                              style={{ width: `${Math.min(c.utilizationRate * 100, 100)}%` }}
                            />
                          </div>
                          <span className="text-zinc-700 tabular-nums w-12 text-right">
                            {(c.utilizationRate * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
