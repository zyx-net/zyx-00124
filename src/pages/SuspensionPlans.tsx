import { useState, useEffect } from 'react';
import {
  Ban,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  MapPin,
  Loader2,
  ArrowLeft,
  ChevronRight,
  RotateCcw,
  Eye,
  Wrench,
  FileText,
  PartyPopper,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type {
  SuspensionReason,
  SuspensionRecurrence,
  SuspensionTimeRange,
  ConflictResolution,
} from '../../shared/types';

type Step = 'list' | 'create' | 'conflict' | 'result';

const REASON_OPTIONS: { value: SuspensionReason; label: string; icon: typeof Wrench }[] = [
  { value: 'maintenance', label: '维修', icon: Wrench },
  { value: 'exam', label: '考试占用', icon: FileText },
  { value: 'event', label: '活动占用', icon: PartyPopper },
  { value: 'other', label: '其他', icon: HelpCircle },
];

const RECURRENCE_OPTIONS: { value: SuspensionRecurrence; label: string }[] = [
  { value: 'once', label: '单次' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
];

const WEEKDAY_LABELS = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export default function SuspensionPlans() {
  const { show } = useToast();
  const [step, setStep] = useState<Step>('list');
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [classrooms, setClassrooms] = useState<any[]>([]);
  const [form, setForm] = useState({
    classroomId: '',
    reason: 'maintenance' as SuspensionReason,
    reasonText: '',
    recurrence: 'once' as SuspensionRecurrence,
    startDate: '',
    endDate: '',
    timeRanges: [{ startTime: '08:00', endTime: '18:00' }] as SuspensionTimeRange[],
    weekdays: [] as number[],
  });
  const [createdPlan, setCreatedPlan] = useState<any>(null);
  const [conflictPreview, setConflictPreview] = useState<any>(null);
  const [confirmResult, setConfirmResult] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchPlans();
    fetchClassrooms();
  }, []);

  useEffect(() => {
    fetchPlans();
  }, [statusFilter]);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const data = await api.listSuspensionPlans(statusFilter || undefined);
      setPlans(data || []);
    } catch (err: any) {
      show('error', err?.error || '加载停用计划失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchClassrooms = async () => {
    try {
      const data = await api.listClassrooms();
      setClassrooms(data || []);
    } catch {}
  };

  const resetForm = () => {
    setForm({
      classroomId: '',
      reason: 'maintenance',
      reasonText: '',
      recurrence: 'once',
      startDate: '',
      endDate: '',
      timeRanges: [{ startTime: '08:00', endTime: '18:00' }],
      weekdays: [],
    });
    setCreatedPlan(null);
    setConflictPreview(null);
    setConfirmResult(null);
    setStep('list');
  };

  const handleCreate = async () => {
    setActionLoading(true);
    try {
      const result = await api.createSuspensionPlan(form);
      setCreatedPlan(result);
      setStep('conflict');
      show('success', '停用计划已创建，请检查冲突');
      await handleCheckConflicts(result.id);
    } catch (err: any) {
      show('error', err?.error || '创建失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckConflicts = async (planId: string) => {
    try {
      const result = await api.checkSuspensionConflicts(planId);
      setConflictPreview(result);
    } catch (err: any) {
      show('error', err?.error || '冲突预检失败');
    }
  };

  const handleConfirm = async (resolution: ConflictResolution) => {
    if (!createdPlan) return;
    setActionLoading(true);
    try {
      const result = await api.confirmSuspensionPlan(createdPlan.id, resolution);
      setConfirmResult(result);
      setStep('result');
      show('success', result.summary);
    } catch (err: any) {
      show('error', err?.error || '确认失败');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async (planId: string) => {
    setActionLoading(true);
    try {
      const result = await api.revokeSuspensionPlan(planId);
      show('success', result.summary);
      fetchPlans();
    } catch (err: any) {
      show('error', err?.error || '撤销失败');
    } finally {
      setActionLoading(false);
    }
  };

  const addTimeRange = () => {
    setForm((prev) => ({
      ...prev,
      timeRanges: [...prev.timeRanges, { startTime: '08:00', endTime: '18:00' }],
    }));
  };

  const removeTimeRange = (index: number) => {
    if (form.timeRanges.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      timeRanges: prev.timeRanges.filter((_, i) => i !== index),
    }));
  };

  const updateTimeRange = (index: number, field: keyof SuspensionTimeRange, value: string) => {
    setForm((prev) => ({
      ...prev,
      timeRanges: prev.timeRanges.map((tr, i) => (i === index ? { ...tr, [field]: value } : tr)),
    }));
  };

  const toggleWeekday = (wd: number) => {
    setForm((prev) => ({
      ...prev,
      weekdays: prev.weekdays.includes(wd)
        ? prev.weekdays.filter((w) => w !== wd)
        : [...prev.weekdays, wd].sort(),
    }));
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return 'badge bg-amber-100 text-amber-700';
      case 'active':
        return 'badge bg-red-100 text-red-700';
      case 'revoked':
        return 'badge bg-zinc-100 text-zinc-500';
      default:
        return 'badge bg-zinc-100 text-zinc-600';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '待确认';
      case 'active': return '已生效';
      case 'revoked': return '已撤销';
      default: return status;
    }
  };

  const reasonLabel = (reason: string) => {
    const opt = REASON_OPTIONS.find((o) => o.value === reason);
    return opt?.label || reason;
  };

  const recurrenceLabel = (r: string) => {
    const opt = RECURRENCE_OPTIONS.find((o) => o.value === r);
    return opt?.label || r;
  };

  if (step === 'create') {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <button
          onClick={resetForm}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          返回列表
        </button>

        <div className="card">
          <h2 className="text-lg font-semibold text-zinc-800 mb-6 flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-500" />
            创建停用计划
          </h2>

          <div className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">教室</label>
              <select
                value={form.classroomId}
                onChange={(e) => setForm((prev) => ({ ...prev, classroomId: e.target.value }))}
                className="input"
              >
                <option value="">请选择教室</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.building} {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">停用类型</label>
              <div className="grid grid-cols-4 gap-2">
                {REASON_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setForm((prev) => ({ ...prev, reason: opt.value }))}
                    className={cn(
                      'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition text-sm',
                      form.reason === opt.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-zinc-200 hover:border-zinc-300 text-zinc-600',
                    )}
                  >
                    <opt.icon className="w-5 h-5" />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">停用原因描述</label>
              <input
                type="text"
                value={form.reasonText}
                onChange={(e) => setForm((prev) => ({ ...prev, reasonText: e.target.value }))}
                placeholder="例如：空调维修、期末考试占用..."
                className="input"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">重复方式</label>
              <div className="grid grid-cols-4 gap-2">
                {RECURRENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setForm((prev) => ({ ...prev, recurrence: opt.value }))}
                    className={cn(
                      'px-3 py-2 rounded-lg border-2 text-sm font-medium transition',
                      form.recurrence === opt.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-zinc-200 hover:border-zinc-300 text-zinc-600',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {form.recurrence !== 'once' && (
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">选择星期</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5, 6, 7].map((wd) => (
                    <button
                      key={wd}
                      onClick={() => toggleWeekday(wd)}
                      className={cn(
                        'w-10 h-10 rounded-lg text-sm font-medium transition',
                        form.weekdays.includes(wd)
                          ? 'bg-brand-500 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200',
                      )}
                    >
                      {WEEKDAY_LABELS[wd].slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">开始日期</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1">结束日期</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="input"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-zinc-700">停用时段</label>
                <button
                  onClick={addTimeRange}
                  className="text-sm text-brand-600 hover:text-brand-700 flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  添加时段
                </button>
              </div>
              <div className="space-y-2">
                {form.timeRanges.map((tr, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="time"
                      value={tr.startTime}
                      onChange={(e) => updateTimeRange(i, 'startTime', e.target.value)}
                      className="input flex-1"
                    />
                    <span className="text-zinc-400">至</span>
                    <input
                      type="time"
                      value={tr.endTime}
                      onChange={(e) => updateTimeRange(i, 'endTime', e.target.value)}
                      className="input flex-1"
                    />
                    {form.timeRanges.length > 1 && (
                      <button
                        onClick={() => removeTimeRange(i)}
                        className="p-1 rounded text-zinc-400 hover:text-red-500 transition"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button onClick={resetForm} className="btn btn-ghost">
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={actionLoading || !form.classroomId || !form.reasonText || !form.startDate || !form.endDate}
              className="btn btn-primary flex items-center gap-2"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              创建并检查冲突
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'conflict' && conflictPreview) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <button
          onClick={resetForm}
          className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 transition"
        >
          <ArrowLeft className="w-4 h-4" />
          返回列表
        </button>

        <div className="card">
          <h2 className="text-lg font-semibold text-zinc-800 mb-2 flex items-center gap-2">
            <Eye className="w-5 h-5 text-amber-500" />
            冲突预检结果
          </h2>
          <p className="text-sm text-zinc-500 mb-4">
            计划「{conflictPreview.plan?.reasonText}」
            — {conflictPreview.plan?.classroomName || '教室'}
            · {conflictPreview.plan?.startDate} ~ {conflictPreview.plan?.endDate}
          </p>

          {conflictPreview.conflictCount === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-base font-medium text-zinc-700">无冲突预约</p>
              <p className="text-sm text-zinc-500 mt-1">可以直接确认生效</p>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span className="text-sm font-medium text-amber-700">
                  发现 {conflictPreview.conflictCount} 个冲突预约
                </span>
              </div>

              <div className="space-y-2 max-h-64 overflow-auto">
                {conflictPreview.conflictingReservations.map((c: any) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-zinc-50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-800">
                          {c.studentName || '学生'}
                        </span>
                        <span className={cn('badge', statusBadge(c.status))}>
                          {statusLabel(c.status)}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-1 flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {c.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {c.startTime} - {c.endTime}
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {c.seatLabel || '座位'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-zinc-100 pt-4">
            <p className="text-sm font-medium text-zinc-700 mb-3">选择冲突处理方式：</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <button
                onClick={() => handleConfirm('cancel_all')}
                disabled={actionLoading}
                className="p-4 rounded-lg border-2 border-red-200 hover:border-red-400 bg-red-50 transition text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="font-medium text-red-700">全部取消</span>
                </div>
                <p className="text-xs text-red-600/80">
                  将所有冲突预约标记为已取消
                </p>
              </button>

              <button
                onClick={() => handleConfirm('reschedule_suggest')}
                disabled={actionLoading}
                className="p-4 rounded-lg border-2 border-amber-200 hover:border-amber-400 bg-amber-50 transition text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-5 h-5 text-amber-600" />
                  <span className="font-medium text-amber-700">取消并建议改期</span>
                </div>
                <p className="text-xs text-amber-600/80">
                  取消预约并通知学生重新预约
                </p>
              </button>

              <button
                onClick={() => handleConfirm('skip')}
                disabled={actionLoading}
                className="p-4 rounded-lg border-2 border-zinc-200 hover:border-zinc-400 bg-zinc-50 transition text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <ChevronRight className="w-5 h-5 text-zinc-600" />
                  <span className="font-medium text-zinc-700">暂时跳过</span>
                </div>
                <p className="text-xs text-zinc-600/80">
                  保留冲突预约，计划正常生效
                </p>
              </button>
            </div>
          </div>

          {actionLoading && (
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-zinc-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              处理中...
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'result' && confirmResult) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="card">
          <div className="text-center py-6">
            <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-zinc-800 mb-2">停用计划已生效</h2>
            <p className="text-sm text-zinc-500">{confirmResult.summary}</p>
          </div>

          <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-zinc-50">
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{confirmResult.cancelledCount}</p>
              <p className="text-xs text-zinc-500">已取消预约</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{confirmResult.skippedCount}</p>
              <p className="text-xs text-zinc-500">跳过预约</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">
                {confirmResult.cancelledCount + confirmResult.skippedCount === 0 ? '✓' : confirmResult.cancelledCount + confirmResult.skippedCount}
              </p>
              <p className="text-xs text-zinc-500">处理预约</p>
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <button onClick={resetForm} className="btn btn-primary">
              返回列表
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-800 flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-500" />
            教室停用计划
          </h2>
          <p className="text-sm text-zinc-500 mt-1">按单次或周期给教室设置维修、考试等停用时段</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setStep('create');
          }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          新建计划
        </button>
      </div>

      <div className="flex gap-2">
        {[
          { value: '', label: '全部' },
          { value: 'pending', label: '待确认' },
          { value: 'active', label: '已生效' },
          { value: 'revoked', label: '已撤销' },
        ].map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition',
              statusFilter === tab.value
                ? 'bg-brand-50 text-brand-700'
                : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        </div>
      ) : plans.length === 0 ? (
        <div className="py-12 text-center text-zinc-400">
          <Ban className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无停用计划</p>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((p) => (
            <div key={p.id} className="card hover:shadow-md transition">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('badge', statusBadge(p.status))}>
                      {statusLabel(p.status)}
                    </span>
                    <span className="text-sm font-medium text-zinc-800">
                      {p.classroomName || '教室'}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {reasonLabel(p.reason)}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 mb-1">{p.reasonText}</p>
                  <div className="text-xs text-zinc-500 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {p.startDate} ~ {p.endDate}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {p.timeRanges?.map((tr: any) => `${tr.startTime}-${tr.endTime}`).join(' / ')}
                    </span>
                    <span>{recurrenceLabel(p.recurrence)}</span>
                    {p.weekdays?.length > 0 && (
                      <span>{p.weekdays.map((w: number) => WEEKDAY_LABELS[w]).join(' ')}</span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    创建人：{p.createdByName} · {new Date(p.createdAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  {p.status === 'pending' && (
                    <button
                      onClick={async () => {
                        setCreatedPlan(p);
                        await handleCheckConflicts(p.id);
                        setStep('conflict');
                      }}
                      className="btn btn-ghost text-sm flex items-center gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      冲突检查
                    </button>
                  )}
                  {p.status === 'active' && (
                    <button
                      onClick={() => handleRevoke(p.id)}
                      disabled={actionLoading}
                      className="btn btn-ghost text-sm text-amber-600 hover:text-amber-700 flex items-center gap-1"
                    >
                      <RotateCcw className="w-4 h-4" />
                      撤销
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
