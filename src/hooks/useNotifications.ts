'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/app/providers';
import {
  AppNotification,
  NOTIFICATIONS_SOCKET_URL,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications';

export function useNotifications() {
  const { token } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  const refresh = useCallback(async () => {
    const [list, { count }] = await Promise.all([listNotifications(), getUnreadNotificationCount()]);
    setItems(list);
    setUnreadCount(count);
  }, []);

  useEffect(() => {
    if (!token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setItems([]);
      setUnreadCount(0);
      return;
    }

    refresh().catch(() => {});

    const socket = io(NOTIFICATIONS_SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on('notification', (n: AppNotification) => {
      setItems((prev) => [n, ...prev].slice(0, 20));
      setUnreadCount((c) => c + 1);
    });
    // Resync on every (re)connect — catches anything missed while offline
    // (network blip, laptop sleep) that the socket alone would silently drop.
    socket.on('connect', () => {
      refresh().catch(() => {});
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const markRead = useCallback(async (id: string) => {
    const updated = await markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n.id === id ? updated : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead();
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    setUnreadCount(0);
  }, []);

  return { items, unreadCount, markRead, markAllRead, refresh };
}
