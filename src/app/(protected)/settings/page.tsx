'use client';

import AdminManagementCard from '@/components/AdminManagementCard';

export default function SettingsPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Pengaturan</h1>
        <p className="text-sm text-neutral-500">
          Pengaturan admin internal, role & konfigurasi lainnya.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <AdminManagementCard />
      </div>
    </div>
  );
}
