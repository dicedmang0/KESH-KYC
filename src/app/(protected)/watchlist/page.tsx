'use client';

import { useState } from 'react';
import WatchlistUploadCard from '@/components/WatchlistUploadCard';
import WatchlistEntries from '@/components/WatchlistEntries';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';

// Roles that can upload/manage watchlist data. FrontDesk gets read-only access
// to stored entries only (no upload card / upload history).
const MANAGE_ROLES = ['ComplianceLead', 'SystemAdmin', 'Director'];
const READ_ROLES = ['FrontDesk'];

export default function WatchlistPage() {
  const { token } = useAuth();
  const role = getRoleFromToken(token);
  const [entriesRefreshKey, setEntriesRefreshKey] = useState(0);

  const canManage = !!role && MANAGE_ROLES.includes(role);
  const canView = canManage || (!!role && READ_ROLES.includes(role));

  if (!canView) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-6">
          <h1 className="text-xl font-semibold">Akses Ditolak</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Anda tidak memiliki izin untuk mengakses Daftar Pengawasan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Daftar Pengawasan</h1>
        <p className="text-sm text-neutral-500">
          {canManage
            ? 'Unggah dan pantau data watchlist untuk proses screening.'
            : 'Lihat data watchlist tersimpan untuk proses screening.'}
        </p>
      </div>

      {canManage && (
        <div className="grid gap-4 md:grid-cols-2">
          <WatchlistUploadCard onUploaded={() => setEntriesRefreshKey((k) => k + 1)} />
        </div>
      )}

      <WatchlistEntries refreshKey={entriesRefreshKey} />
    </div>
  );
}
