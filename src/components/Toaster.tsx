'use client';

import { useEffect, useState } from 'react';
import { subscribeToToasts, type ToastItem } from '@/lib/toast';

export default function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => subscribeToToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-lg pointer-events-auto ${
            t.type === 'success'
              ? 'bg-emerald-700 text-white'
              : 'bg-red-700 text-white'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
