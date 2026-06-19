import { useState, useEffect, useMemo } from 'react';
import {
  LogIn,
  LogOut,
  MapPin,
  Calendar,
  Clock,
  AlertTriangle,
  Square,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { todayStr, formatDate, statusLabel, statusClass } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function CheckIn() {
  const { user, config } = useAuth();
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<any[]>([]);
  const [actionLoading, setActionLoading] = useState<string>('');

  useEffect(() => {
    fetchReservations();
  }, [user]);

  const fetchReservations = async () => {
    setLoading(true);
    try {
      const data = await api.listReservations(user?.role === 'student' ? { studentId: user?.id } : {});
      setReservations(data || []);
    } catch (err: any) {
      show('error', err?.error || '加载预约列表失败');
    } finally {
      setLoading(false);
    }
  };

  const now = useMemo(() => new Date(), [loading]);

  const isWithinTimeSlot = (r: any): boolean => {
    if (!r.date || !r.startTime || !r.endTime) return false;
    const today = todayStr();
    if (r.date !== today) return false;

    const nowTime = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = r.startTime.split(':').map(Number);
    const [eh, em] = r.endTime.split(':').map(Number);
    const startTime = sh * 60 + sm;
    const endTime = eh * 60 + em;

    return nowTime >= startTime && nowTime <= endTime;
  };

  const isLate = (r: any): boolean => {
    if (!config?.lateThresholdMinutes || !r.date || !r.startTime) return false;
    const today = todayStr();
    if (r.date !== today) return false;

    const nowTime = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = r.startTime.split(':').map(Number);
    const startTime = sh * 60 + sm;
    const threshold = startTime + config.lateThresholdMinutes;

    return nowTime > threshold;
  };

  const pendingList = reservations.filter(
    (r) => r.status === 'approved' && r.date >= todayStr()
  );

  const checkedInList = reservations.filter(
    (r) => r.status === 'checked_in'
  );

  const handleCheckIn = async (id: string) => {
    setActionLoading(id);
    try {
      const result = await api.checkIn(id, user?.role === 'student' ? user?.id : undefined);
      if (result?.isLate) {
        show('info', '签到成功，但已迟到，请准时到达');
      } else {
        show('success', '签到成功');
      }
      fetchReservations();
    } catch (err: any) {
      show('error', err?.error || '签到失败');
    } finally {
      setActionLoading('');
    }
  };

  const handleCheckOut = async (id: string) => {
    setActionLoading(id);
    try {
      await api.checkOut(id);
      show('success', '签退成功');
      fetchReservations();
    } catch (err: any) {
      show('error', err?.error || '签退失败');
    } finally {
      setActionLoading('');
    }
  };

  const renderCard = (r: any) => {
    const withinSlot = isWithinTimeSlot(r);
    const late = isLate(r);
    const canCheckIn = r.status === 'approved' && withinSlot;
    const canCheckOut = r.status === 'checked_in';

    return (
      <div
        key={r.id}
        className={cn(
          'card relative overflow-hidden transition',
          r.status === 'checked_in' && 'ring-2 ring-blue-200'
        )}
      >
        {late && r.status === 'approved' && (
          <div className="absolute top-0 left-0 right-0 bg-amber-50 border-b border-amber-200 px-6 py-2">
            <div className="flex items-center gap-2 text-amber-700 text-xs">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="font-medium">迟到警告：已超过开始时间 {config?.lateThresholdMinutes || 15} 分钟</span>
            </div>
          </div>
        )}

        <div className={cn('flex items-start justify-between gap-4', late && r.status === 'approved' && 'mt-4')}>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-3">
              <span className={cn('badge', statusClass(r.status))}>
                {statusLabel(r.status)}
              </span>
              {r.isLate && (
                <span className="badge bg-amber-100 text-amber-700">已迟到</span>
              )}
              {r.notCheckedOut && (
                <span className="badge bg-red-100 text-red-700">未签退</span>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <span className="text-zinc-700 font-medium">{r.classroomName || '-'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Square className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <span className="text-zinc-700">座位 {r.seatLabel || '-'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <span className="text-zinc-700">{r.date}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <span className="text-zinc-700">
                  {r.startTime?.slice(0, 5)} - {r.endTime?.slice(0, 5)}
                </span>
              </div>
              {r.checkInTime && (
                <div className="flex items-center gap-2 text-xs text-zinc-500 mt-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  <span>签到时间：{r.checkInTime}</span>
                </div>
              )}
              {r.checkOutTime && (
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <LogOut className="w-3.5 h-3.5 text-blue-500" />
                  <span>签退时间：{r.checkOutTime}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 flex-shrink-0">
            {r.status === 'approved' && (
              <button
                onClick={() => handleCheckIn(r.id)}
                disabled={!canCheckIn || actionLoading === r.id}
                className={cn(
                  'btn-primary px-4 py-2 min-w-[88px]',
                  !canCheckIn && 'bg-zinc-300 hover:bg-zinc-300 cursor-not-allowed'
                )}
                title={!withinSlot ? '仅在预约时段内可签到' : ''}
              >
                {actionLoading === r.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                签到
              </button>
            )}
            {canCheckOut && (
              <button
                onClick={() => handleCheckOut(r.id)}
                disabled={actionLoading === r.id}
                className="btn-secondary px-4 py-2 min-w-[88px]"
              >
                {actionLoading === r.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                签退
              </button>
            )}
            {r.status === 'approved' && !withinSlot && (
              <p className="text-xs text-zinc-400 text-center max-w-[88px]">
                非时段内
              </p>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-zinc-800">签到签退</h2>
        <p className="text-sm text-zinc-500 mt-1">
          请在预约时段内完成签到，使用当前登录账号进行身份验证，防止代签
        </p>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <LogIn className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-800">待签到</h3>
            <p className="text-xs text-zinc-500">
              已批准且尚未签到的预约，共 {pendingList.length} 条
            </p>
          </div>
        </div>
        {pendingList.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">暂无待签到的预约</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingList.map(renderCard)}
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-800">已签到</h3>
            <p className="text-xs text-zinc-500">
              正在进行中，需完成签退，共 {checkedInList.length} 条
            </p>
          </div>
        </div>
        {checkedInList.length === 0 ? (
          <div className="py-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">暂无进行中的预约</p>
          </div>
        ) : (
          <div className="space-y-3">
            {checkedInList.map(renderCard)}
          </div>
        )}
      </div>
    </div>
  );
}
