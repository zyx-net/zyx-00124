import { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Calendar,
  Clock,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Square,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { todayStr, formatDate, weekdayName } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Classroom, TimeSlot, Seat } from '../../shared/types';

export default function Reserve() {
  const { user, config } = useAuth();
  const { show } = useToast();

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string>('');
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [seatStatus, setSeatStatus] = useState<Record<string, { available: boolean; reservationId?: string }>>({});
  const [closed, setClosed] = useState(false);
  const [closedReason, setClosedReason] = useState('');
  const [selectedSeat, setSelectedSeat] = useState<string>('');
  const [violationCount, setViolationCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const dateOptions = useMemo(() => {
    const dates: string[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(formatDate(d));
    }
    return dates;
  }, []);

  const weekdayOfSelected = useMemo(() => {
    return new Date(selectedDate).getDay();
  }, [selectedDate]);

  useEffect(() => {
    fetchClassrooms();
    if (user?.id) {
      fetchViolations();
    }
  }, [user]);

  useEffect(() => {
    if (selectedClassroom) {
      fetchSlots(selectedClassroom);
    }
  }, [selectedClassroom]);

  useEffect(() => {
    if (selectedClassroom && selectedDate && selectedSlot) {
      fetchSeatStatus();
    }
  }, [selectedClassroom, selectedDate, selectedSlot]);

  const fetchClassrooms = async () => {
    setLoading(true);
    try {
      const data = await api.listClassrooms();
      setClassrooms(data || []);
      if (data && data.length > 0 && !selectedClassroom) {
        setSelectedClassroom(data[0].id);
      }
    } catch (err: any) {
      show('error', err?.error || '加载教室列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchSlots = async (classroomId: string) => {
    try {
      const data = await api.listSlots(classroomId);
      setSlots(data || []);
      setSelectedSlot('');
    } catch (err: any) {
      show('error', err?.error || '加载时段失败');
    }
  };

  const fetchSeatStatus = async () => {
    try {
      const data = await api.getSeatStatus(selectedClassroom, selectedDate, selectedSlot);
      setSeatStatus(data.seats || {});
      setClosed(data.closed || false);
      setClosedReason(data.closedReason || '');
      setSelectedSeat('');
    } catch (err: any) {
      show('error', err?.error || '加载座位状态失败');
    }
  };

  const fetchViolations = async () => {
    try {
      const data = await api.listViolations(user?.id);
      setViolationCount(data?.length || 0);
    } catch {
      // ignore
    }
  };

  const availableSlots = slots.filter((s) => s.weekday.includes(weekdayOfSelected));

  const currentClassroom = classrooms.find((c) => c.id === selectedClassroom);

  const handleSubmit = async () => {
    if (!selectedClassroom || !selectedDate || !selectedSlot || !selectedSeat) {
      show('error', '请完整选择教室、日期、时段和座位');
      return;
    }
    setSubmitting(true);
    try {
      await api.createReservation({
        classroomId: selectedClassroom,
        seatId: selectedSeat,
        date: selectedDate,
        slotId: selectedSlot,
      });
      show('success', '预约申请已提交，等待审批');
      setSelectedSeat('');
      fetchSeatStatus();
    } catch (err: any) {
      show('error', err?.error || '预约失败');
    } finally {
      setSubmitting(false);
    }
  };

  const getSeatClass = (seat: Seat) => {
    if (!seat.enabled) {
      return 'bg-zinc-200 text-zinc-400 cursor-not-allowed border-zinc-200';
    }
    const status = seatStatus[seat.id];
    if (status && !status.available) {
      return 'bg-red-100 text-red-500 cursor-not-allowed border-red-200';
    }
    if (selectedSeat === seat.id) {
      return 'bg-brand-500 text-white cursor-pointer border-brand-500 ring-2 ring-brand-300 ring-offset-2';
    }
    return 'bg-white text-zinc-700 cursor-pointer border-zinc-200 hover:border-brand-400 hover:bg-brand-50';
  };

  const handleSeatClick = (seat: Seat) => {
    if (!seat.enabled) return;
    const status = seatStatus[seat.id];
    if (status && !status.available) return;
    if (closed) return;
    setSelectedSeat(seat.id === selectedSeat ? '' : seat.id);
  };

  const currentDateIndex = dateOptions.indexOf(selectedDate);

  return (
    <div className="space-y-6 max-w-5xl">
      {violationCount > 0 && config && violationCount >= config.violationWarningThreshold && (
        <div className="card border-amber-200 bg-amber-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-amber-800">违约警告</h4>
              <p className="text-sm text-amber-700 mt-1">
                您已累计 {violationCount} 次违约记录，请遵守预约规则，及时签到签退。
                多次违约可能导致预约权限被限制。
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <label className="label flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-brand-500" />
            选择教室
          </label>
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
            </div>
          ) : (
            <select
              value={selectedClassroom}
              onChange={(e) => setSelectedClassroom(e.target.value)}
              className="input"
            >
              <option value="">请选择教室</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.building} - {c.name}
                </option>
              ))}
            </select>
          )}
          {currentClassroom && (
            <p className="text-xs text-zinc-500 mt-2">
              共 {currentClassroom.rows * currentClassroom.cols} 个座位
            </p>
          )}
        </div>

        <div className="card">
          <label className="label flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-brand-500" />
            选择日期
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (currentDateIndex > 0) {
                  setSelectedDate(dateOptions[currentDateIndex - 1]);
                }
              }}
              disabled={currentDateIndex <= 0}
              className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft className="w-4 h-4 text-zinc-600" />
            </button>
            <div className="flex-1 text-center">
              <div className="text-sm font-semibold text-zinc-800">{selectedDate}</div>
              <div className="text-xs text-zinc-500">
                {weekdayName(new Date(selectedDate).getDay())}
              </div>
            </div>
            <button
              onClick={() => {
                if (currentDateIndex < dateOptions.length - 1) {
                  setSelectedDate(dateOptions[currentDateIndex + 1]);
                }
              }}
              disabled={currentDateIndex >= dateOptions.length - 1}
              className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            </button>
          </div>
          <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
            {dateOptions.map((d) => {
              const wd = new Date(d).getDay();
              const isToday = d === todayStr();
              return (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={cn(
                    'flex-shrink-0 px-2 py-1.5 rounded-lg text-xs transition',
                    selectedDate === d
                      ? 'bg-brand-500 text-white'
                      : 'bg-zinc-50 text-zinc-600 hover:bg-zinc-100'
                  )}
                >
                  <div className="font-medium">{weekdayName(wd).replace('周', '')}</div>
                  <div className={cn('text-[10px]', selectedDate === d ? 'text-white/80' : 'text-zinc-400')}>
                    {isToday ? '今天' : d.slice(5)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="card">
          <label className="label flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-brand-500" />
            选择时段
          </label>
          {availableSlots.length === 0 ? (
            <div className="text-sm text-zinc-400 py-4 text-center">该日期暂无可用时段</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {availableSlots.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSlot(s.id)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-sm font-medium transition border',
                    selectedSlot === s.id
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:border-brand-400 hover:bg-brand-50'
                  )}
                >
                  {s.startTime?.slice(0, 5)} - {s.endTime?.slice(0, 5)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-zinc-800 flex items-center gap-2">
            <Square className="w-5 h-5 text-brand-500" />
            选择座位
          </h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-white border border-zinc-200" />
              可用
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-red-100 border border-red-200" />
              已占用
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-zinc-200 border border-zinc-200" />
              禁用
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-brand-500" />
              已选
            </span>
          </div>
        </div>

        {!selectedClassroom || !selectedSlot ? (
          <div className="py-12 text-center text-zinc-400 text-sm">
            请先选择教室和时段
          </div>
        ) : closed ? (
          <div className="py-12 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <p className="text-sm text-zinc-700 font-medium">该时段教室已关闭</p>
            {closedReason && <p className="text-xs text-zinc-500 mt-1">{closedReason}</p>}
          </div>
        ) : currentClassroom ? (
          <div className="space-y-3">
            <div className="text-center text-xs text-zinc-500 py-2">
              —— 讲台方向 ——
            </div>
            <div className="flex flex-col items-center gap-2">
              {Array.from({ length: currentClassroom.rows }).map((_, rowIdx) => {
                const rowSeats = currentClassroom.seats.filter((s) => s.row === rowIdx);
                return (
                  <div key={rowIdx} className="flex items-center gap-2">
                    <span className="w-6 text-xs text-zinc-400 text-right">{rowIdx + 1}</span>
                    <div className="flex gap-2">
                      {rowSeats
                        .sort((a, b) => a.col - b.col)
                        .map((seat) => (
                          <button
                            key={seat.id}
                            onClick={() => handleSeatClick(seat)}
                            disabled={!seat.enabled || (seatStatus[seat.id] && !seatStatus[seat.id].available)}
                            className={cn(
                              'w-10 h-10 rounded-lg border text-xs font-medium flex items-center justify-center transition',
                              getSeatClass(seat)
                            )}
                          >
                            {seat.label}
                          </button>
                        ))}
                    </div>
                    <span className="w-6 text-xs text-zinc-400">{rowIdx + 1}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <div>
            {selectedSeat ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-brand-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-800">
                    已选择：{currentClassroom?.building} {currentClassroom?.name} - 座位{' '}
                    {currentClassroom?.seats.find((s) => s.id === selectedSeat)?.label}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {selectedDate} {weekdayName(weekdayOfSelected)}{' '}
                    {slots.find((s) => s.id === selectedSlot)?.startTime?.slice(0, 5)} -{' '}
                    {slots.find((s) => s.id === selectedSlot)?.endTime?.slice(0, 5)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                  <XCircle className="w-5 h-5 text-zinc-400" />
                </div>
                <p className="text-sm text-zinc-500">请在上方座位图中选择座位</p>
              </div>
            )}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!selectedSeat || submitting || closed}
            className="btn-primary px-8 py-2.5"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                提交中...
              </>
            ) : (
              '提交预约'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
