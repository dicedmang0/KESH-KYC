'use client';

import WatchlistUploadCard from '@/components/WatchlistUploadCard';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';

const ALLOWED_ROLES = ['ComplianceLead', 'SystemAdmin'];

export default function WatchlistPage() {
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  if (!role || !ALLOWED_ROLES.includes(role)) {
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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Daftar Pengawasan</h1>
        <p className="text-sm text-neutral-500">
          Unggah dan pantau data watchlist untuk proses screening.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <WatchlistUploadCard />
      </div>
    </div>
  );
}
