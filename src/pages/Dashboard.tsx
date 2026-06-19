import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarPlus,
  LogIn,
  AlertTriangle,
  Clock,
  FileCheck,
  Users,
  BarChart3,
  ChevronRight,
  MapPin,
  Calendar,
  Loader2,
  CalendarCheck,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { formatDateTime, formatDate, statusLabel, statusClass, todayStr } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function Dashboard() {
  const { user } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resData, violationData] = await Promise.all([
        api.listReservations(user?.role === 'student' ? { studentId: user?.id } : {}),
        user?.role === 'student' ? api.listViolations(user?.id) : api.listViolations(),
      ]);
      setReservations(resData || []);
      setViolations(violationData || []);

      if (user?.role === 'admin') {
        const today = todayStr();
        const todayReservations = resData?.filter((r: any) => r.date === today) || [];
        const pendingCount = resData?.filter((r: any) => r.status === 'pending').length || 0;
        setStats({
          pending: pendingCount,
          today: todayReservations.length,
          violations: (violationData || []).length,
          total: (resData || []).length,
        });
      } else {
        const currentRes =
          resData?.find(
            (r: any) =>
              (r.status === 'approved' || r.status === 'checked_in') && r.date >= todayStr()
          ) || null;
        const recentRes = resData?.slice(0, 5) || [];
        setStats({
          current: currentRes,
          violationCount: (violationData || []).length,
          recent: recentRes,
        });
      }
    } catch (err: any) {
      show('error', err?.error || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckIn = async (id: string) => {
    try {
      await api.checkIn(id);
      show('success', '签到成功');
      fetchData();
    } catch (err: any) {
      show('error', err?.error || '签到失败');
    }
  };

  const handleCheckOut = async (id: string) => {
    try {
      await api.checkOut(id);
      show('success', '签退成功');
      fetchData();
    } catch (err: any) {
      show('error', err?.error || '签退失败');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (user?.role === 'admin') {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-500 mb-1">待审批</p>
                <p className="text-3xl font-bold text-zinc-800">{stats.pending || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <FileCheck className="w-6 h-6 text-amber-600" />
              </div>
            </div>
            <button
              onClick={() => navigate('/approval')}
              className="mt-4 text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              查看审批 <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-500 mb-1">今日预约</p>
                <p className="text-3xl font-bold text-zinc-800">{stats.today || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center">
                <CalendarCheck className="w-6 h-6 text-brand-600" />
              </div>
            </div>
            <button
              onClick={() => navigate('/history')}
              className="mt-4 text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              查看详情 <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-500 mb-1">违约记录</p>
                <p className="text-3xl font-bold text-zinc-800">{stats.violations || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <button
              onClick={() => navigate('/history')}
              className="mt-4 text-sm text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              查看详情 <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="card">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-zinc-500 mb-1">预约总数</p>
                <p className="text-3xl font-bold text-zinc-800">{stats.total || 0}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-zinc-600" />
              </div>
            </div>
            <button
              onClick={() => navigate('/statistics')}
              className="mt-4 text-sm text-zinc-600 hover:text-zinc-700 flex items-center gap-1"
            >
              统计导出 <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h3 className="text-base font-semibold text-zinc-800 mb-4 flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-amber-500" />
              待审批列表
            </h3>
            {reservations.filter((r) => r.status === 'pending').length === 0 ? (
              <div className="py-8 text-center text-zinc-400 text-sm">暂无待审批预约</div>
            ) : (
              <div className="space-y-3">
                {reservations
                  .filter((r) => r.status === 'pending')
                  .slice(0, 5)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="badge bg-amber-100 text-amber-700">待审批</span>
                          <span className="text-sm font-medium text-zinc-800 truncate">
                            {r.classroomName || '自习室'}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1 flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {r.date}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {r.startTime?.slice(0, 5)} - {r.endTime?.slice(0, 5)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="text-base font-semibold text-zinc-800 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-brand-500" />
              今日预约
            </h3>
            {reservations.filter((r) => r.date === todayStr()).length === 0 ? (
              <div className="py-8 text-center text-zinc-400 text-sm">今日暂无预约</div>
            ) : (
              <div className="space-y-3">
                {reservations
                  .filter((r) => r.date === todayStr())
                  .slice(0, 5)
                  .map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 hover:bg-zinc-100 transition"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn('badge', statusClass(r.status))}>
                            {statusLabel(r.status)}
                          </span>
                          <span className="text-sm font-medium text-zinc-800 truncate">
                            {r.studentName || r.classroomName || '预约'}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-500 mt-1 flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {r.classroomName || '自习室'}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {r.startTime?.slice(0, 5)} - {r.endTime?.slice(0, 5)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-zinc-400" />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {stats.current && (
        <div className="card bg-gradient-to-r from-brand-500 to-brand-600 text-white border-0">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/80 text-sm mb-1">当前预约</p>
              <h3 className="text-xl font-semibold mb-2">
                {stats.current.classroomName || '自习室'} - {stats.current.seatLabel || '座位'}
              </h3>
              <div className="flex items-center gap-4 text-sm text-white/90">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {stats.current.date}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {stats.current.startTime?.slice(0, 5)} - {stats.current.endTime?.slice(0, 5)}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              {stats.current.status === 'approved' && (
                <button
                  onClick={() => handleCheckIn(stats.current.id)}
                  className="px-4 py-2 rounded-lg bg-white text-brand-600 font-medium hover:bg-white/90 transition"
                >
                  <span className="flex items-center gap-1">
                    <LogIn className="w-4 h-4" />
                    签到
                  </span>
                </button>
              )}
              {stats.current.status === 'checked_in' && (
                <button
                  onClick={() => handleCheckOut(stats.current.id)}
                  className="px-4 py-2 rounded-lg bg-white text-brand-600 font-medium hover:bg-white/90 transition"
                >
                  <span className="flex items-center gap-1">
                    <XCircle className="w-4 h-4" />
                    签退
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/reserve')}
          className="card text-left hover:shadow-md transition group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center group-hover:bg-brand-200 transition">
              <CalendarPlus className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h4 className="font-semibold text-zinc-800">预约申请</h4>
              <p className="text-xs text-zinc-500">快速预约自习座位</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-400 ml-auto" />
        </button>

        <button
          onClick={() => navigate('/checkin')}
          className="card text-left hover:shadow-md transition group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition">
              <LogIn className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h4 className="font-semibold text-zinc-800">签到签退</h4>
              <p className="text-xs text-zinc-500">完成预约后签到</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-400 ml-auto" />
        </button>

        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <div
              className={cn(
                'w-10 h-10 rounded-lg flex items-center justify-center',
                stats.violationCount > 0 ? 'bg-red-100' : 'bg-green-100'
              )}
            >
              <AlertTriangle
                className={cn(
                  'w-5 h-5',
                  stats.violationCount > 0 ? 'text-red-600' : 'text-green-600'
                )}
              />
            </div>
            <div>
              <h4 className="font-semibold text-zinc-800">违约次数</h4>
              <p className="text-xs text-zinc-500">请遵守预约规则</p>
            </div>
          </div>
          <p
            className={cn(
              'text-2xl font-bold',
              stats.violationCount > 0 ? 'text-red-600' : 'text-green-600'
            )}
          >
            {stats.violationCount || 0} 次
          </p>
          {stats.violationCount > 0 && (
            <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              请注意：多次违约将影响预约权限
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="text-base font-semibold text-zinc-800 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-brand-500" />
          最近预约
        </h3>
        {(stats.recent || []).length === 0 ? (
          <div className="py-8 text-center text-zinc-400 text-sm">
            暂无预约记录
            <button
              onClick={() => navigate('/reserve')}
              className="ml-2 text-brand-600 hover:underline"
            >
              立即预约
            </button>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {(stats.recent || []).map((r: any) => (
              <div
                key={r.id}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                    <MapPin className="w-5 h-5 text-zinc-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-800">
                        {r.classroomName || '自习室'}
                      </span>
                      <span className={cn('badge', statusClass(r.status))}>
                        {statusLabel(r.status)}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5 flex items-center gap-3">
                      <span>{r.date}</span>
                      <span>
                        {r.startTime?.slice(0, 5)} - {r.endTime?.slice(0, 5)}
                      </span>
                      <span>座位: {r.seatLabel || '-'}</span>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-zinc-400">
                  {formatDateTime(r.createdAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
