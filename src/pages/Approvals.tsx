import { useState, useEffect } from 'react';
import {
  FileCheck,
  CheckCircle2,
  XCircle,
  Clock,
  MapPin,
  User,
  Calendar,
  Loader2,
  X,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { formatDateTime, statusLabel, statusClass } from '@/lib/format';
import { cn } from '@/lib/utils';

type TabType = 'pending' | 'processed';

export default function Approvals() {
  const { user } = useAuth();
  const { show } = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('pending');
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<any[]>([]);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string>('');
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState<string>('');

  useEffect(() => {
    fetchReservations();
  }, []);

  const fetchReservations = async () => {
    setLoading(true);
    try {
      const data = await api.listReservations();
      setReservations(data || []);
    } catch (err: any) {
      show('error', err?.error || '加载审批列表失败');
    } finally {
      setLoading(false);
    }
  };

  const pendingList = reservations.filter(
    (r) => r.status === 'pending'
  );

  const processedList = reservations.filter(
    (r) => r.status !== 'pending'
  );

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      await api.approveReservation(id);
      show('success', '审批通过');
      fetchReservations();
    } catch (err: any) {
      show('error', err?.error || '审批失败');
    } finally {
      setActionLoading('');
    }
  };

  const openRejectModal = (id: string) => {
    setRejectingId(id);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      show('error', '请输入退回原因');
      return;
    }
    setActionLoading(rejectingId);
    try {
      await api.rejectReservation(rejectingId, rejectReason.trim());
      show('success', '已退回申请');
      setRejectModalOpen(false);
      setRejectingId('');
      setRejectReason('');
      fetchReservations();
    } catch (err: any) {
      show('error', err?.error || '退回失败');
    } finally {
      setActionLoading('');
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-800">审批管理</h2>
          <p className="text-sm text-zinc-500 mt-1">
            审核学生的自习座位预约申请
          </p>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex border-b border-zinc-100">
          <button
            onClick={() => setActiveTab('pending')}
            className={cn(
              'px-6 py-4 text-sm font-medium transition relative',
              activeTab === 'pending'
                ? 'text-brand-600'
                : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              待审批
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                activeTab === 'pending'
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-zinc-100 text-zinc-600'
              )}>
                {pendingList.length}
              </span>
            </span>
            {activeTab === 'pending' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('processed')}
            className={cn(
              'px-6 py-4 text-sm font-medium transition relative',
              activeTab === 'processed'
                ? 'text-brand-600'
                : 'text-zinc-500 hover:text-zinc-700'
            )}
          >
            <span className="flex items-center gap-2">
              <FileCheck className="w-4 h-4" />
              已处理
              <span className={cn(
                'px-2 py-0.5 rounded-full text-xs font-medium',
                activeTab === 'processed'
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-zinc-100 text-zinc-600'
              )}>
                {processedList.length}
              </span>
            </span>
            {activeTab === 'processed' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
            )}
          </button>
        </div>

        <div className="overflow-x-auto">
          {activeTab === 'pending' ? (
            pendingList.length === 0 ? (
              <div className="py-16 text-center">
                <CheckCircle2 className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                <p className="text-sm text-zinc-500">暂无待审批的预约申请</p>
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-zinc-50">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      学生姓名
                    </th>
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
                      申请时间
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {pendingList.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-50 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-brand-600" />
                          </div>
                          <span className="text-sm font-medium text-zinc-800">
                            {r.studentName || '-'}
                          </span>
                        </div>
                      </td>
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
                      <td className="px-6 py-4 text-sm text-zinc-500">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprove(r.id)}
                            disabled={actionLoading === r.id}
                            className="btn-primary px-3 py-1.5 text-xs"
                          >
                            {actionLoading === r.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            批准
                          </button>
                          <button
                            onClick={() => openRejectModal(r.id)}
                            disabled={actionLoading === r.id}
                            className="btn bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 px-3 py-1.5 text-xs"
                          >
                            {actionLoading === r.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5" />
                            )}
                            退回
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : processedList.length === 0 ? (
            <div className="py-16 text-center">
              <FileCheck className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">暂无已处理的申请</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    学生姓名
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    教室座位
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    日期时段
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    审批结果
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    审批人
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    退回原因
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {processedList.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50 transition">
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
                    <td className="px-6 py-4">
                      <div className="text-sm text-zinc-700">
                        {r.classroomName || '-'}
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5">
                        座位 {r.seatLabel || '-'}
                      </div>
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
                    <td className="px-6 py-4 text-sm text-zinc-700">
                      {r.approvedBy ? (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-zinc-400" />
                          {r.approvedBy}
                        </div>
                      ) : (
                        <span className="text-zinc-400">-</span>
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

      {rejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !actionLoading && setRejectModalOpen(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h3 className="text-base font-semibold text-zinc-800 flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                退回申请
              </h3>
              <button
                onClick={() => !actionLoading && setRejectModalOpen(false)}
                disabled={!!actionLoading}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              <label className="label">退回原因</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="请输入退回原因，学生将看到此说明"
                rows={4}
                className="input resize-none"
                disabled={!!actionLoading}
              />
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-zinc-50 border-t border-zinc-100">
              <button
                onClick={() => !actionLoading && setRejectModalOpen(false)}
                disabled={!!actionLoading}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || !!actionLoading}
                className="btn bg-red-600 text-white hover:bg-red-700"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                确认退回
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
