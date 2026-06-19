import { useState, useEffect } from 'react';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  X,
  Square,
  Clock,
  CalendarX,
  Save,
  ChevronLeft,
  Loader2,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { formatDate, todayStr, weekdayName } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Classroom, Seat, TimeSlot, ClosedDate } from '../../shared/types';

type ViewMode = 'list' | 'detail';
type DetailTab = 'seats' | 'slots' | 'closed';

interface ClassroomForm {
  name: string;
  building: string;
  rows: number;
  cols: number;
}

interface SlotForm {
  startTime: string;
  endTime: string;
  weekday: number[];
}

export default function ClassroomConfig() {
  const { show } = useToast();
  const [loading, setLoading] = useState(true);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [detailTab, setDetailTab] = useState<DetailTab>('seats');
  const [selectedClassroom, setSelectedClassroom] = useState<Classroom | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string>('');
  const [formData, setFormData] = useState<ClassroomForm>({
    name: '',
    building: '',
    rows: 6,
    cols: 8,
  });
  const [submitting, setSubmitting] = useState(false);

  const [seats, setSeats] = useState<Seat[]>([]);
  const [seatsSaving, setSeatsSaving] = useState(false);

  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotForms, setSlotForms] = useState<SlotForm[]>([]);
  const [slotsSaving, setSlotsSaving] = useState(false);

  const [closedDates, setClosedDates] = useState<ClosedDate[]>([]);
  const [closedDateInput, setClosedDateInput] = useState(todayStr());
  const [closedReasonInput, setClosedReasonInput] = useState('');
  const [closedSaving, setClosedSaving] = useState(false);

  useEffect(() => {
    fetchClassrooms();
  }, []);

  const fetchClassrooms = async () => {
    setLoading(true);
    try {
      const data = await api.listClassrooms();
      setClassrooms(data || []);
    } catch (err: any) {
      show('error', err?.error || '加载教室列表失败');
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setFormData({ name: '', building: '', rows: 6, cols: 8 });
    setAddModalOpen(true);
  };

  const openEditModal = (c: Classroom) => {
    setSelectedClassroom(c);
    setFormData({ name: c.name, building: c.building, rows: c.rows, cols: c.cols });
    setEditModalOpen(true);
  };

  const handleAddClassroom = async () => {
    if (!formData.name.trim() || !formData.building.trim()) {
      show('error', '请填写教室名称和教学楼');
      return;
    }
    if (formData.rows < 1 || formData.cols < 1) {
      show('error', '行数和列数必须大于0');
      return;
    }
    setSubmitting(true);
    try {
      await api.createClassroom({
        name: formData.name.trim(),
        building: formData.building.trim(),
        rows: formData.rows,
        cols: formData.cols,
      });
      show('success', '教室创建成功');
      setAddModalOpen(false);
      fetchClassrooms();
    } catch (err: any) {
      show('error', err?.error || '创建教室失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditClassroom = async () => {
    if (!selectedClassroom) return;
    if (!formData.name.trim() || !formData.building.trim()) {
      show('error', '请填写教室名称和教学楼');
      return;
    }
    setSubmitting(true);
    try {
      await api.updateClassroom(selectedClassroom.id, {
        name: formData.name.trim(),
        building: formData.building.trim(),
      });
      show('success', '教室更新成功');
      setEditModalOpen(false);
      fetchClassrooms();
    } catch (err: any) {
      show('error', err?.error || '更新教室失败');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = (id: string) => {
    setDeletingId(id);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteClassroom = async () => {
    if (!deletingId) return;
    setSubmitting(true);
    try {
      await api.deleteClassroom(deletingId);
      show('success', '教室已删除');
      setDeleteConfirmOpen(false);
      setDeletingId('');
      fetchClassrooms();
    } catch (err: any) {
      show('error', err?.error || '删除教室失败');
    } finally {
      setSubmitting(false);
    }
  };

  const enterDetail = async (c: Classroom) => {
    setSelectedClassroom(c);
    setSeats(JSON.parse(JSON.stringify(c.seats || [])));
    setViewMode('detail');
    setDetailTab('seats');
    try {
      const [slotData, closedData] = await Promise.all([
        api.listSlots(c.id),
        api.listClosedDates(),
      ]);
      setSlots(slotData || []);
      setSlotForms(
        (slotData || []).map((s) => ({
          startTime: s.startTime?.slice(0, 5) || '',
          endTime: s.endTime?.slice(0, 5) || '',
          weekday: s.weekday || [],
        }))
      );
      setClosedDates(closedData || []);
    } catch (err: any) {
      show('error', err?.error || '加载配置失败');
    }
  };

  const backToList = () => {
    setViewMode('list');
    setSelectedClassroom(null);
  };

  const toggleSeat = (seatId: string) => {
    setSeats((prev) =>
      prev.map((s) => (s.id === seatId ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const saveSeats = async () => {
    if (!selectedClassroom) return;
    setSeatsSaving(true);
    try {
      await api.updateSeats(selectedClassroom.id, seats);
      show('success', '座位配置已保存');
    } catch (err: any) {
      show('error', err?.error || '保存座位配置失败');
    } finally {
      setSeatsSaving(false);
    }
  };

  const addSlotForm = () => {
    setSlotForms((prev) => [
      ...prev,
      { startTime: '08:00', endTime: '10:00', weekday: [1, 2, 3, 4, 5] },
    ]);
  };

  const removeSlotForm = (idx: number) => {
    setSlotForms((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateSlotForm = (idx: number, field: keyof SlotForm, value: any) => {
    setSlotForms((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
  };

  const toggleWeekday = (idx: number, day: number) => {
    setSlotForms((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const wd = s.weekday.includes(day)
          ? s.weekday.filter((d) => d !== day)
          : [...s.weekday, day].sort();
        return { ...s, weekday: wd };
      })
    );
  };

  const saveSlots = async () => {
    if (!selectedClassroom) return;
    for (const sf of slotForms) {
      if (!sf.startTime || !sf.endTime) {
        show('error', '请填写完整的时段信息');
        return;
      }
      if (sf.weekday.length === 0) {
        show('error', '请至少选择一个星期');
        return;
      }
    }
    setSlotsSaving(true);
    try {
      const data = await api.updateSlots(
        selectedClassroom.id,
        slotForms.map((s) => ({
          startTime: s.startTime,
          endTime: s.endTime,
          weekday: s.weekday,
        }))
      );
      setSlots(data || []);
      show('success', '时段配置已保存');
    } catch (err: any) {
      show('error', err?.error || '保存时段配置失败');
    } finally {
      setSlotsSaving(false);
    }
  };

  const addClosedDate = async () => {
    if (!closedDateInput) {
      show('error', '请选择日期');
      return;
    }
    if (closedDates.some((d) => d.date === closedDateInput)) {
      show('error', '该日期已存在');
      return;
    }
    const newDates = [
      ...closedDates,
      { date: closedDateInput, reason: closedReasonInput.trim() || '教室维护' },
    ].sort((a, b) => a.date.localeCompare(b.date));
    setClosedSaving(true);
    try {
      const data = await api.updateClosedDates(newDates);
      setClosedDates(data || []);
      setClosedReasonInput('');
      show('success', '关闭日期已添加');
    } catch (err: any) {
      show('error', err?.error || '添加关闭日期失败');
    } finally {
      setClosedSaving(false);
    }
  };

  const removeClosedDate = async (date: string) => {
    const newDates = closedDates.filter((d) => d.date !== date);
    setClosedSaving(true);
    try {
      const data = await api.updateClosedDates(newDates);
      setClosedDates(data || []);
      show('success', '关闭日期已删除');
    } catch (err: any) {
      show('error', err?.error || '删除关闭日期失败');
    } finally {
      setClosedSaving(false);
    }
  };

  const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

  if (loading && viewMode === 'list') {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
      </div>
    );
  }

  if (viewMode === 'detail' && selectedClassroom) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={backToList}
            className="p-2 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition"
          >
            <ChevronLeft className="w-5 h-5 text-zinc-600" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-zinc-800">
              {selectedClassroom.building} - {selectedClassroom.name}
            </h2>
            <p className="text-sm text-zinc-500 mt-0.5">
              共 {selectedClassroom.rows * selectedClassroom.cols} 个座位
            </p>
          </div>
        </div>

        <div className="card p-0 overflow-hidden">
          <div className="flex border-b border-zinc-100">
            <button
              onClick={() => setDetailTab('seats')}
              className={cn(
                'px-6 py-4 text-sm font-medium transition relative',
                detailTab === 'seats'
                  ? 'text-brand-600'
                  : 'text-zinc-500 hover:text-zinc-700'
              )}
            >
              <span className="flex items-center gap-2">
                <Square className="w-4 h-4" />
                座位配置
              </span>
              {detailTab === 'seats' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
              )}
            </button>
            <button
              onClick={() => setDetailTab('slots')}
              className={cn(
                'px-6 py-4 text-sm font-medium transition relative',
                detailTab === 'slots'
                  ? 'text-brand-600'
                  : 'text-zinc-500 hover:text-zinc-700'
              )}
            >
              <span className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                时段配置
              </span>
              {detailTab === 'slots' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
              )}
            </button>
            <button
              onClick={() => setDetailTab('closed')}
              className={cn(
                'px-6 py-4 text-sm font-medium transition relative',
                detailTab === 'closed'
                  ? 'text-brand-600'
                  : 'text-zinc-500 hover:text-zinc-700'
              )}
            >
              <span className="flex items-center gap-2">
                <CalendarX className="w-4 h-4" />
                关闭日期
              </span>
              {detailTab === 'closed' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500" />
              )}
            </button>
          </div>

          <div className="p-6">
            {detailTab === 'seats' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-white border border-brand-400 bg-brand-50" />
                      已启用
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded bg-zinc-200 border border-zinc-200" />
                      已禁用
                    </span>
                  </div>
                  <button
                    onClick={saveSeats}
                    disabled={seatsSaving}
                    className="btn-primary"
                  >
                    {seatsSaving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    保存配置
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="text-center text-xs text-zinc-500 py-2">
                    —— 讲台方向 ——
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    {Array.from({ length: selectedClassroom.rows }).map((_, rowIdx) => {
                      const rowSeats = seats.filter((s) => s.row === rowIdx);
                      return (
                        <div key={rowIdx} className="flex items-center gap-2">
                          <span className="w-6 text-xs text-zinc-400 text-right">
                            {rowIdx + 1}
                          </span>
                          <div className="flex gap-2">
                            {rowSeats
                              .sort((a, b) => a.col - b.col)
                              .map((seat) => (
                                <button
                                  key={seat.id}
                                  onClick={() => toggleSeat(seat.id)}
                                  className={cn(
                                    'w-11 h-11 rounded-lg border text-xs font-medium flex items-center justify-center transition',
                                    seat.enabled
                                      ? 'bg-brand-50 text-brand-700 cursor-pointer border-brand-300 hover:bg-brand-100'
                                      : 'bg-zinc-200 text-zinc-400 cursor-pointer border-zinc-200 hover:bg-zinc-300 hover:text-zinc-500'
                                  )}
                                >
                                  {seat.label}
                                </button>
                              ))}
                          </div>
                          <span className="w-6 text-xs text-zinc-400">
                            {rowIdx + 1}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {detailTab === 'slots' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-zinc-500">
                    配置该教室的开放时段，支持按星期灵活设置
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={addSlotForm} className="btn-secondary">
                      <Plus className="w-4 h-4" />
                      添加时段
                    </button>
                    <button
                      onClick={saveSlots}
                      disabled={slotsSaving}
                      className="btn-primary"
                    >
                      {slotsSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      保存配置
                    </button>
                  </div>
                </div>

                {slotForms.length === 0 ? (
                  <div className="py-12 text-center">
                    <Clock className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                    <p className="text-sm text-zinc-500">暂无时段配置</p>
                    <button
                      onClick={addSlotForm}
                      className="mt-3 text-sm text-brand-600 hover:underline"
                    >
                      添加第一个时段
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {slotForms.map((sf, idx) => (
                      <div
                        key={idx}
                        className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/50 space-y-4"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-zinc-700">
                            时段 {idx + 1}
                          </span>
                          <button
                            onClick={() => removeSlotForm(idx)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="label">开始时间</label>
                            <input
                              type="time"
                              value={sf.startTime}
                              onChange={(e) =>
                                updateSlotForm(idx, 'startTime', e.target.value)
                              }
                              className="input"
                            />
                          </div>
                          <div>
                            <label className="label">结束时间</label>
                            <input
                              type="time"
                              value={sf.endTime}
                              onChange={(e) =>
                                updateSlotForm(idx, 'endTime', e.target.value)
                              }
                              className="input"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="label">适用星期</label>
                          <div className="flex flex-wrap gap-2">
                            {WEEKDAYS.map((d) => (
                              <button
                                key={d}
                                onClick={() => toggleWeekday(idx, d)}
                                className={cn(
                                  'px-3 py-1.5 rounded-lg text-sm font-medium transition border',
                                  sf.weekday.includes(d)
                                    ? 'bg-brand-500 text-white border-brand-500'
                                    : 'bg-white text-zinc-600 border-zinc-200 hover:border-brand-400 hover:text-brand-600'
                                )}
                              >
                                {weekdayName(d)}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {detailTab === 'closed' && (
              <div className="space-y-6">
                <div className="card p-4 border border-zinc-200">
                  <h4 className="text-sm font-semibold text-zinc-800 mb-3">
                    添加关闭日期
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-4">
                      <label className="label">日期</label>
                      <input
                        type="date"
                        value={closedDateInput}
                        onChange={(e) => setClosedDateInput(e.target.value)}
                        className="input"
                      />
                    </div>
                    <div className="md:col-span-6">
                      <label className="label">关闭原因</label>
                      <input
                        type="text"
                        value={closedReasonInput}
                        onChange={(e) => setClosedReasonInput(e.target.value)}
                        placeholder="如：节假日、教室维护等"
                        className="input"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-end">
                      <button
                        onClick={addClosedDate}
                        disabled={closedSaving}
                        className="btn-primary w-full"
                      >
                        {closedSaving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Plus className="w-4 h-4" />
                        )}
                        添加
                      </button>
                    </div>
                  </div>
                </div>

                {closedDates.length === 0 ? (
                  <div className="py-12 text-center">
                    <CalendarX className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
                    <p className="text-sm text-zinc-500">暂无关闭日期</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-zinc-200">
                    <table className="w-full">
                      <thead className="bg-zinc-50">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                            日期
                          </th>
                          <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                            星期
                          </th>
                          <th className="text-left px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                            关闭原因
                          </th>
                          <th className="text-right px-5 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                            操作
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {closedDates.map((cd) => (
                          <tr key={cd.date} className="hover:bg-zinc-50 transition">
                            <td className="px-5 py-3 text-sm font-medium text-zinc-800">
                              {cd.date}
                            </td>
                            <td className="px-5 py-3 text-sm text-zinc-600">
                              {weekdayName(new Date(cd.date).getDay())}
                            </td>
                            <td className="px-5 py-3 text-sm text-zinc-600">
                              {cd.reason}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button
                                onClick={() => removeClosedDate(cd.date)}
                                disabled={closedSaving}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 transition"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-800">教室配置</h2>
          <p className="text-sm text-zinc-500 mt-1">
            管理自习教室、座位、时段及关闭日期
          </p>
        </div>
        <button onClick={openAddModal} className="btn-primary">
          <Plus className="w-4 h-4" />
          新增教室
        </button>
      </div>

      {classrooms.length === 0 ? (
        <div className="card">
          <div className="py-16 text-center">
            <Building2 className="w-12 h-12 text-zinc-300 mx-auto mb-3" />
            <p className="text-sm text-zinc-500">暂无教室</p>
            <button
              onClick={openAddModal}
              className="mt-3 text-sm text-brand-600 hover:underline"
            >
              添加第一个教室
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    教室名称
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    教学楼
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    座位数
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {classrooms.map((c) => (
                  <tr key={c.id} className="hover:bg-zinc-50 transition">
                    <td className="px-6 py-4">
                      <button
                        onClick={() => enterDetail(c)}
                        className="text-sm font-medium text-zinc-800 hover:text-brand-600 transition text-left"
                      >
                        {c.name}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm text-zinc-700">
                        <MapPin className="w-3.5 h-3.5 text-zinc-400" />
                        {c.building}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-zinc-700">
                      {c.rows * c.cols} 个 ({c.rows}行 × {c.cols}列)
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => enterDetail(c)}
                          className="p-2 rounded-lg hover:bg-brand-50 text-zinc-400 hover:text-brand-600 transition"
                          title="配置"
                        >
                          <Square className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEditModal(c)}
                          className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition"
                          title="编辑"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => confirmDelete(c.id)}
                          className="p-2 rounded-lg hover:bg-red-50 text-zinc-400 hover:text-red-500 transition"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !submitting && setAddModalOpen(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h3 className="text-base font-semibold text-zinc-800 flex items-center gap-2">
                <Plus className="w-5 h-5 text-brand-500" />
                新增教室
              </h3>
              <button
                onClick={() => !submitting && setAddModalOpen(false)}
                disabled={submitting}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="label">教室名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="如：自习室A"
                  className="input"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="label">教学楼</label>
                <input
                  type="text"
                  value={formData.building}
                  onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                  placeholder="如：图书馆"
                  className="input"
                  disabled={submitting}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">行数</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formData.rows}
                    onChange={(e) =>
                      setFormData({ ...formData, rows: parseInt(e.target.value) || 1 })
                    }
                    className="input"
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="label">列数</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={formData.cols}
                    onChange={(e) =>
                      setFormData({ ...formData, cols: parseInt(e.target.value) || 1 })
                    }
                    className="input"
                    disabled={submitting}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-zinc-50 border-t border-zinc-100">
              <button
                onClick={() => !submitting && setAddModalOpen(false)}
                disabled={submitting}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleAddClassroom}
                disabled={submitting}
                className="btn-primary"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                创建教室
              </button>
            </div>
          </div>
        </div>
      )}

      {editModalOpen && selectedClassroom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !submitting && setEditModalOpen(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
              <h3 className="text-base font-semibold text-zinc-800 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-brand-500" />
                编辑教室
              </h3>
              <button
                onClick={() => !submitting && setEditModalOpen(false)}
                disabled={submitting}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="label">教室名称</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="label">教学楼</label>
                <input
                  type="text"
                  value={formData.building}
                  onChange={(e) => setFormData({ ...formData, building: e.target.value })}
                  className="input"
                  disabled={submitting}
                />
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    提示：如需修改座位行列数，需要删除教室后重新创建。
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-zinc-50 border-t border-zinc-100">
              <button
                onClick={() => !submitting && setEditModalOpen(false)}
                disabled={submitting}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleEditClassroom}
                disabled={submitting}
                className="btn-primary"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                保存修改
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !submitting && setDeleteConfirmOpen(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-zinc-800">
                    确认删除教室？
                  </h3>
                  <p className="text-sm text-zinc-500 mt-1">
                    删除后该教室的所有座位、时段配置和相关预约记录将无法恢复。
                  </p>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-zinc-50 border-t border-zinc-100">
              <button
                onClick={() => !submitting && setDeleteConfirmOpen(false)}
                disabled={submitting}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={handleDeleteClassroom}
                disabled={submitting}
                className="btn bg-red-600 text-white hover:bg-red-700"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : null}
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
