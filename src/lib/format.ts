export function formatDateTime(iso?: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso?: string | Date): string {
  if (!iso) return '-';
  const d = iso instanceof Date ? iso : new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(): string {
  return formatDate(new Date());
}

export function weekdayName(n: number): string {
  const names = ['日', '一', '二', '三', '四', '五', '六'];
  return '周' + names[n];
}

export function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending: '待审批',
    approved: '已批准',
    rejected: '已退回',
    checked_in: '已签到',
    completed: '已完成',
    cancelled: '已取消',
  };
  return map[s] || s;
}

export function statusClass(s: string): string {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    approved: 'bg-brand-100 text-brand-800',
    rejected: 'bg-red-100 text-red-800',
    checked_in: 'bg-blue-100 text-blue-800',
    completed: 'bg-zinc-100 text-zinc-700',
    cancelled: 'bg-zinc-100 text-zinc-500',
  };
  return map[s] || 'bg-zinc-100 text-zinc-700';
}

export function violationLabel(t: string): string {
  const map: Record<string, string> = {
    late: '迟到',
    no_show: '未签到',
    not_checked_out: '未签退',
    rejected: '预约被退回',
  };
  return map[t] || t;
}

export function violationClass(t: string): string {
  return 'bg-red-100 text-red-800';
}
