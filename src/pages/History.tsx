import { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  AlertTriangle,
  Activity,
  MapPin,
  Calendar,
  Clock,
  User,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Search,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import {
  formatDateTime,
  statusLabel,
  statusClass,
  violationLabel,
  violationClass,
  todayStr,
} from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AuditLog, Violation } from '../../shared/types';

interface EnrichedViolation extends Violation {
  studentName?: string;
}

type TabType = 'reservations' | 'violations' | 'audit';

export default function History() {
  const { user } = useAuth();
  const { show } = useToast();
  const isAdmin = user?.role === 'admin';

  const [activeTab, setActiveTab] = useState<TabType>('reservations');
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterClassroom, setFilterClassroom] = useState('');
  const [filterStudent, setFilterStudent] = useState('');

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const promises: Promise<any>[] = [
        api.listReservations(isAdmin ? {} : { studentId: user?.id }),
        isAdmin ? api.listViolations() : api.listViolations(user?.id),
      ];

      if (isAdmin) {
        promises.push(api.listAuditLogs());
        promises.push(api.listClassrooms());
        promises.push(api.listUsers());
      }

      const [resData, violationData, auditData, classroomData, userData] = await Promise.all(
        promises
      );

      setReservations(resData || []);
      setViolations(violationData || []);
      if (auditData) setAuditLogs(auditData);
      if (classroomData) setClassrooms(classroomData);
      if (userData) setUsers(userData);
    } catch (err: any) {
      show('error', err?.error || '加载历史记录失败');
    } finally {
      setLoading(false);
    }
  };

  const filteredReservations = useMemo(() => {
    return reservations.filter((r) => {
      if (filterStartDate && r.date < filterStartDate) return false;
      if (filterEndDate && r.date > filterEndDate) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterClassroom && r.classroomId !== filterClassroom) return false;
      if (filterStudent && r.studentId !== filterStudent) return false;
      return true;
    });
  }, [reservations, filterStartDate, filterEndDate, filterStatus, filterClassroom, filterStudent]);

  const violationTypeColor = (type: string): string => {
    const map: Record<string, string> = {
      late: 'bg-amber-100 text-amber-800 border-amber-200',
      no_show: 'bg-red-100 text-red-800 border-red-200',
      not_checked_out: 'bg-orange-100 text-orange-800 border-orange-200',
      rejected: 'bg-zinc-100 text-zinc-800 border-zinc-200',
    };
    return map[type] || 'bg-zinc-100 text-zinc-700 border-zinc-200';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-zinc-800">历史记录</h2>
        <p className="text-sm text-zinc-500 mt-1">
          查看预约记录、违约记录及操作日志
        </p>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex border-b border-zinc-100">
          <button
            onClick={() => setActiveTab('reservations')}
            className={cn(
              'px-6 py-4 text-sm font-medium transition relative flex items-center gap-2',
              activeTab === 'reservations'
                ? 'text-brand-600'
                : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            <FileText className="w-4 h-4" />
            预约记录
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                activeTab === 'reservations'
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-zinc-100 text-zinc-600'
              )}
            >
              {filteredReservations.length}
            </span>
            {activeTab === 'reservations' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('violations')}
            className={cn(
              'px-6 py-4 text-sm font-medium transition relative flex items-center gap-2',
              activeTab === 'violations'
                ? 'text-brand-600'
                : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            <AlertTriangle className="w-4 h-4" />
            违约记录
            <span
              className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                activeTab === 'violations'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-zinc-100 text-zinc-600'
              )}
            >
              {violations.length}
            </span>
            {activeTab === 'violations' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
            )}
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('audit')}
              className={cn(
                'px-6 py-4 text-sm font-medium transition relative flex items-center gap-2',
                activeTab === 'audit'
                  ? 'text-brand-600'
                  : 'text-zinc-500 hover:text-zinc-700'
              )}
            >
              <Activity className="w-4 h-4" />
              操作日志
              <span
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs font-medium',
                  activeTab === 'audit'
                    ? 'bg-brand-100 text-brand-700'
                    : 'bg-zinc-100 text-zinc-600'
                )}
              >
                {auditLogs.length}
              </span>
              {activeTab === 'audit' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
              )}
            </button>
          )}
        </div>

        {activeTab === 'reservations' && (
          <div>
            <div className="p-4 border-b border-zinc-100 bg-zinc-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
                <div>
                  <label className="label text-xs">开始日期</label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label text-xs">结束日期</label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                    className="input"
                  />
                </div>
                <div>
                  <label className="label text-xs">状态</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="input"
                  >
                    <option value="">全部状态</option>
                    <option value="pending">待审批</option>
                    <option value="approved">已批准</option>
                    <option value="rejected">已退回</option>
                    <option value="checked_in">已签到</option>
                    <option value="completed">已完成</option>
                    <option value="cancelled">已取消</option>
                  </select>
                </div>
                <div>
                  <label className="label text-xs">教室</label>
                  <select
                    value={filterClassroom}
                    onChange={(e) => setFilterClassroom(e.target.value)}
                    className="input"
                  >
                    <option value="">全部教室</option>
                    {classrooms.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.building} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                {isAdmin && (
                  <div>
                    <label className="label text-xs">学生</label>
                    <select
                      value={filterStudent}
                      onChange={(e) => setFilterStudent(e.target.value)}
                      className="input"
                    >
                      <option value="">全部学生</option>
                      {users
                        .filter((u) => u.role === 'student')
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.username})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              {filteredReservations.length === 0 ? (
                <div className="py-16 text-center">
                  <Search className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                  <p className="text-sm text-zinc-500">暂无预约记录</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-zinc-50">
                    <tr>
                      {isAdmin && (
                        <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                          学生
                        </th>
                      )}
                      <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        教室
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        座位
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        日期时段
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        状态
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        迟到
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        未签退
                      </th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        退回原因
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filteredReservations.map((r) => (
                      <tr key={r.id} className="hover:bg-zinc-50 transition">
                        {isAdmin && (
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
                                <User className="w-4 h-4 text-zinc-500" />
                              </div>
                              <span className="text-sm font-medium text-zinc-800">
                                {r.studentName || '-'}
                              </span>
                            </div>
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 text-sm text-zinc-700">
                            <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                            {r.classroomName || '-'}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-700">
                          {r.seatLabel || '-'}
                        </td>
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5 text-sm text-zinc-700">
                              <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                              {r.date}
                            </div>
                            <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                              <Clock className="w-3.5 h-3.5 text-zinc-400" />
                              {r.startTime?.slice(0, 5)} - {r.endTime?.slice(0, 5)}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn('badge', statusClass(r.status))}>
                            {statusLabel(r.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {r.isLate ? (
                            <span className="badge bg-amber-100 text-amber-700">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              是
                            </span>
                          ) : (
                            <span className="text-sm text-zinc-400">否</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {r.notCheckedOut ? (
                            <span className="badge bg-red-100 text-red-700">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              是
                            </span>
                          ) : (
                            <span className="text-sm text-zinc-400">否</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {r.rejectReason ? (
                            <div className="flex items-start gap-1.5 max-w-xs">
                              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                              <span className="text-sm text-red-600">
                                {r.rejectReason}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-zinc-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {activeTab === 'violations' && (
          <div className="overflow-x-auto">
            {violations.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">暂无违约记录</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-zinc-50">
                  <tr>
                    {isAdmin && (
                      <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        学生
                      </th>
                    )}
                    <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      类型
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      描述
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      时间
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {violations.map((v: EnrichedViolation) => (
                    <tr key={v.id} className="hover:bg-zinc-50 transition">
                      {isAdmin && (
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center">
                              <User className="w-4 h-4 text-zinc-500" />
                            </div>
                            <span className="text-sm font-medium text-zinc-800">
                              {v.studentName || v.studentId || '-'}
                            </span>
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'badge border',
                            violationTypeColor(v.type)
                          )}
                        >
                          {violationLabel(v.type)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-700">
                        {v.description || '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-zinc-500">
                        {formatDateTime(v.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'audit' && isAdmin && (
          <div className="overflow-x-auto">
            {auditLogs.length === 0 ? (
              <div className="py-16 text-center">
                <Activity className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">暂无操作日志</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      操作人
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      操作内容
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      是否成功
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      原因
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      时间
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {auditLogs.map((log) => (
                    <tr
                      key={log.id}
                      className={cn(
                        'transition',
                        !log.success && 'bg-red-50/50 hover:bg-red-50'
                      )}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-full flex items-center justify-center',
                              log.success ? 'bg-zinc-100' : 'bg-red-100'
                            )}
                          >
                            <User
                              className={cn(
                                'w-4 h-4',
                                log.success ? 'text-zinc-500' : 'text-red-500'
                              )}
                            />
                          </div>
                          <span
                            className={cn(
                              'text-sm font-medium',
                              log.success ? 'text-zinc-800' : 'text-red-800'
                            )}
                          >
                            {log.userName || log.userId || '-'}
                          </span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          'px-6 py-4 text-sm',
                          log.success ? 'text-zinc-700' : 'text-red-700 font-medium'
                        )}
                      >
                        {log.action}
                      </td>
                      <td className="px-6 py-4">
                        {log.success ? (
                          <span className="badge bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            成功
                          </span>
                        ) : (
                          <span className="badge bg-red-100 text-red-700">
                            <XCircle className="w-3 h-3 mr-1" />
                            失败
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {log.reason ? (
                          <div
                            className={cn(
                              'flex items-start gap-1.5 max-w-xs text-sm',
                              log.success ? 'text-zinc-500' : 'text-red-600'
                            )}
                          >
                            {!log.success && (
                              <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                            )}
                            <span>{log.reason}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-zinc-400">-</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          'px-6 py-4 text-sm',
                          log.success ? 'text-zinc-500' : 'text-red-500'
                        )}
                      >
                        {formatDateTime(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
