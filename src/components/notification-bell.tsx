'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import type { AppNotification } from '@/lib/notifications';

function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'baru saja';
  if (min < 60) return `${min}m lalu`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}j lalu`;
  return `${Math.floor(hr / 24)}h lalu`;
}

export default function NotificationBell({
  items,
  unreadCount,
  onMarkRead,
  onMarkAllRead,
  dark = false,
}: {
  items: AppNotification[];
  unreadCount: number;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  dark?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        aria-label="Notifikasi"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative p-2 rounded-lg transition-colors',
          dark ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-neutral-500 hover:bg-neutral-100',
        )}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg border bg-white shadow-lg z-50 text-neutral-900">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <span className="text-sm font-semibold">Notifikasi</span>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="text-xs text-kesh-700 hover:underline"
                >
                  Tandai semua dibaca
                </button>
              )}
            </div>
            {items.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-neutral-400">Tidak ada notifikasi</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={n.link || '#'}
                  onClick={() => {
                    if (!n.read_at) onMarkRead(n.id);
                    setOpen(false);
                  }}
                  className={cn(
                    'block px-3 py-2.5 border-b last:border-b-0 hover:bg-neutral-50',
                    !n.read_at && 'bg-kesh-50',
                  )}
                >
                  <p className="text-xs font-medium text-neutral-800">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-neutral-500 line-clamp-2">{n.body}</p>}
                  <p className="mt-1 text-[10px] text-neutral-400">{timeAgo(n.created_at)}</p>
                </Link>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
