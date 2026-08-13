import { apiFetch, API } from './api';

// Notifications gateway is mounted on the root HTTP server, not under the
// /api REST prefix — Nest's setGlobalPrefix only affects HTTP routes.
export const NOTIFICATIONS_SOCKET_URL = `${API.replace(/\/api$/, '')}/notifications`;

export type NotificationType = 'ACTION_REQUIRED' | 'INFO';

// id / recipient_user_id are BIGINT in Postgres — the pg driver (and thus the
// JSON response) sends them as strings, never numbers.
export type AppNotification = {
  id: string;
  recipient_user_id: string;
  type: NotificationType;
  object_type: string;
  object_id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
  resolved_at: string | null;
};

export function listNotifications(limit = 20) {
  return apiFetch<AppNotification[]>(`/notifications?limit=${limit}`);
}

export function getUnreadNotificationCount() {
  return apiFetch<{ count: number }>('/notifications/count');
}

export function markNotificationRead(id: string) {
  return apiFetch<AppNotification>(`/notifications/${id}/read`, { method: 'POST' });
}

export function markAllNotificationsRead() {
  return apiFetch<{ ok: true }>('/notifications/read-all', { method: 'POST' });
}
