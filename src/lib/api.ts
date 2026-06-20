const TOKEN_KEY = 'srs_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export interface ApiError {
  error: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    let data: ApiError;
    try {
      data = await res.json();
    } catch {
      data = { error: `HTTP ${res.status}` };
    }
    throw data;
  }
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: Omit<import('../../shared/types').User, 'password'> }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ user: Omit<import('../../shared/types').User, 'password'>; config: import('../../shared/types').SystemConfig }>('/api/auth/me'),

  listClassrooms: () => request<import('../../shared/types').Classroom[]>('/api/classrooms'),
  createClassroom: (data: { name: string; building: string; rows: number; cols: number }) =>
    request<import('../../shared/types').Classroom>('/api/classrooms', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateClassroom: (id: string, data: { name?: string; building?: string }) =>
    request<import('../../shared/types').Classroom>(`/api/classrooms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteClassroom: (id: string) => request(`/api/classrooms/${id}`, { method: 'DELETE' }),
  updateSeats: (id: string, seats: import('../../shared/types').Seat[]) =>
    request<import('../../shared/types').Seat[]>(`/api/classrooms/${id}/seats`, {
      method: 'PUT',
      body: JSON.stringify({ seats }),
    }),
  listSlots: (classroomId: string) =>
    request<import('../../shared/types').TimeSlot[]>(`/api/classrooms/${classroomId}/slots`),
  updateSlots: (classroomId: string, slots: Omit<import('../../shared/types').TimeSlot, 'id' | 'classroomId'>[]) =>
    request<import('../../shared/types').TimeSlot[]>(`/api/classrooms/${classroomId}/slots`, {
      method: 'PUT',
      body: JSON.stringify({ slots }),
    }),
  listClosedDates: () => request<import('../../shared/types').ClosedDate[]>('/api/classrooms/closed-dates/list'),
  updateClosedDates: (dates: import('../../shared/types').ClosedDate[]) =>
    request<import('../../shared/types').ClosedDate[]>('/api/classrooms/closed-dates/batch', {
      method: 'PUT',
      body: JSON.stringify({ dates }),
    }),
  exportClosedDates: async () => {
    const token = getToken();
    const res = await fetch('/api/classrooms/closed-dates/export', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let data: any;
      try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}` }; }
      throw data;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `closed-dates-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
  downloadClosedDatesTemplate: async (mode: 'global' | 'classroom' = 'global') => {
    const token = getToken();
    const res = await fetch(`/api/classrooms/closed-dates/template?mode=${mode}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let data: any;
      try { data = await res.json(); } catch { data = { error: `HTTP ${res.status}` }; }
      throw data;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = mode === 'classroom' ? 'closed-dates-template-classroom.csv' : 'closed-dates-template-global.csv';
    a.click();
    URL.revokeObjectURL(url);
  },
  getClosedDatesSample: () =>
    request<{ csv: string; description: string; expectedPreview: { total: number; newCount: number; invalidCount: number; duplicateCount: number } }>('/api/classrooms/closed-dates/sample'),
  previewClosedDatesImport: (csv: string) =>
    request<import('../../shared/types').ImportPreviewResult>('/api/classrooms/closed-dates/import/preview', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    }),
  executeClosedDatesImport: (csv: string, skipDuplicates = true) =>
    request<import('../../shared/types').ImportExecuteResult>('/api/classrooms/closed-dates/import/execute', {
      method: 'POST',
      body: JSON.stringify({ csv, skipDuplicates }),
    }),
  undoLastClosedDatesImport: () =>
    request<{ success: boolean; batchId: string; restoredCount: number; summary: string }>('/api/classrooms/closed-dates/import/undo', {
      method: 'POST',
    }),
  getLastClosedDatesImport: () =>
    request<import('../../shared/types').ClosedDateImportSnapshot | null>('/api/classrooms/closed-dates/import/last'),
  getSeatStatus: (classroomId: string, date: string, slotId: string) =>
    request<{ closed: boolean; closedReason?: string; seats: Record<string, { available: boolean; reservationId?: string }> }>(
      `/api/reservations/seat-status?classroomId=${classroomId}&date=${date}&slotId=${slotId}`,
    ),

  listReservations: (params?: { status?: string; studentId?: string; classroomId?: string; date?: string }) => {
    const q = params
      ? '?' +
        Object.entries(params)
          .filter(([, v]) => v)
          .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
          .join('&')
      : '';
    return request<any[]>(`/api/reservations${q}`);
  },
  createReservation: (data: { classroomId: string; seatId: string; date: string; slotId: string }) =>
    request<import('../../shared/types').Reservation>('/api/reservations', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  approveReservation: (id: string) =>
    request<import('../../shared/types').Reservation>(`/api/reservations/${id}/approve`, { method: 'PUT' }),
  rejectReservation: (id: string, reason: string) =>
    request<import('../../shared/types').Reservation>(`/api/reservations/${id}/reject`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    }),
  checkIn: (id: string, targetStudentId?: string) =>
    request<import('../../shared/types').Reservation>(`/api/reservations/${id}/checkin`, {
      method: 'POST',
      body: JSON.stringify({ targetStudentId }),
    }),
  checkOut: (id: string) =>
    request<import('../../shared/types').Reservation>(`/api/reservations/${id}/checkout`, { method: 'POST' }),

  listViolations: (studentId?: string) =>
    request<any[]>(`/api/violations${studentId ? `?studentId=${studentId}` : ''}`),
  getHistory: () => request<{ reservations: any[]; violations: any[] }>('/api/history'),
  getStudentStats: () => request<import('../../shared/types').StudentStat[]>('/api/students'),
  getClassroomStats: () => request<import('../../shared/types').ClassroomStat[]>('/api/classroom-stats'),
  exportStats: async (type: 'students' | 'classrooms') => {
    const token = getToken();
    const res = await fetch(`/api/export/${type}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw { error: '导出失败' };
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },
  listAuditLogs: () => request<import('../../shared/types').AuditLog[]>('/api/audit-logs'),
  listUsers: () => request<Omit<import('../../shared/types').User, 'password'>[]>('/api/users'),
  getConfig: () => request<import('../../shared/types').SystemConfig>('/api/config'),

  listSuspensionPlans: (status?: string) =>
    request<any[]>(`/api/suspensions${status ? `?status=${status}` : ''}`),
  getSuspensionPlan: (id: string) =>
    request<any>(`/api/suspensions/${id}`),
  createSuspensionPlan: (data: {
    classroomId: string;
    reason: import('../../shared/types').SuspensionReason;
    reasonText: string;
    recurrence: import('../../shared/types').SuspensionRecurrence;
    startDate: string;
    endDate: string;
    timeRanges: import('../../shared/types').SuspensionTimeRange[];
    weekdays: number[];
  }) =>
    request<import('../../shared/types').SuspensionPlan>('/api/suspensions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  checkSuspensionConflicts: (id: string) =>
    request<import('../../shared/types').SuspensionConflictPreview>(`/api/suspensions/${id}/check-conflicts`, {
      method: 'POST',
    }),
  confirmSuspensionPlan: (id: string, resolution: import('../../shared/types').ConflictResolution) =>
    request<import('../../shared/types').SuspensionConfirmResult>(`/api/suspensions/${id}/confirm`, {
      method: 'POST',
      body: JSON.stringify({ resolution }),
    }),
  revokeSuspensionPlan: (id: string) =>
    request<import('../../shared/types').SuspensionRevokeResult>(`/api/suspensions/${id}/revoke`, {
      method: 'POST',
    }),
};
