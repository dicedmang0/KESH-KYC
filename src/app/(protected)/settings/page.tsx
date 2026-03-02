'use client';

import AdminManagementCard from '@/components/AdminManagementCard';
import WatchlistUploadCard from '@/components/WatchlistUploadCard';

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-neutral-500">
          Pengaturan admin internal, role & konfigurasi lainnya.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AdminManagementCard />
        <WatchlistUploadCard />
      </div>
    </div>
  );
}
