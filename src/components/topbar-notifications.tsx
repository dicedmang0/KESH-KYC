'use client';

import { useAuth } from '@/app/providers';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationBell from '@/components/notification-bell';

export default function TopbarNotifications() {
  const { token } = useAuth();
  const { items, unreadCount, markRead, markAllRead } = useNotifications();

  if (!token) return null;

  return (
    <NotificationBell
      items={items}
      unreadCount={unreadCount}
      onMarkRead={markRead}
      onMarkAllRead={markAllRead}
    />
  );
}
