'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Pagination } from '@/components/pagination';

type AdminUser = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  branch_id: number | null;
  is_active: boolean;
  created_at: string;
};

const INTERNAL_ROLES = [
  'SystemAdmin',
  'Director',
  'ComplianceLead',
  'OperationSupervisor',
  'FrontDesk',
  'FinanceStaff',
  'FinanceManager',
  'Auditor',
];

const ROLE_LABELS: Record<string, string> = {
  SystemAdmin:         'Admin Sistem',
  Director:            'Direktur',
  ComplianceLead:      'Lead Compliance',
  OperationSupervisor: 'Operation Supervisor',
  FrontDesk:           'Frontline',
  FinanceStaff:        'Finance Staff',
  FinanceManager:      'Finance Manager',
  Auditor:             'Auditor',
  ComplianceStaff:     'Deprecated - Compliance Staff',
};

export default function AdminManagementCard() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [adminPage, setAdminPage] = useState(1);
  const [adminPageSize, setAdminPageSize] = useState(20);

  const [form, setForm] = useState({
    email: '',
    fullName: '',
    role: 'FrontDesk',
    branchId: '',
    password: '',
  });

  async function loadAdmins() {
    setLoading(true);
    setErr('');
    try {
      const data = await apiFetch<AdminUser[]>('/users/admins');
      setAdmins(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal memuat pengguna admin');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAdmins();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      await apiFetch('/users/admins', {
        method: 'POST',
        body: {
          email: form.email,
          fullName: form.fullName,
          role: form.role,
          branchId: form.branchId ? Number(form.branchId) : undefined,
          password: form.password,
        },
      });
      setForm({
        email: '',
        fullName: '',
        role: 'FrontDesk',
        branchId: '',
        password: '',
      });
      await loadAdmins();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal membuat admin');
    } finally {
      setSaving(false);
    }
  }

  async function updateAdmin(id: number, patch: Partial<AdminUser>) {
    setSaving(true);
    setErr('');
    try {
      await apiFetch(`/users/admins/${id}`, {
        method: 'PATCH',
        body: {
          role: patch.role,
          isActive: patch.is_active,
          branchId:
            patch.branch_id !== undefined ? patch.branch_id : undefined,
        },
      });
      await loadAdmins();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal memperbarui admin');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {err && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {/* Form create admin */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-medium">Buat Admin Baru</h2>

        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-neutral-500">Email</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={form.email}
                onChange={(e) =>
                  setForm((s) => ({ ...s, email: e.target.value }))
                }
                required
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Nama</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={form.fullName}
                onChange={(e) =>
                  setForm((s) => ({ ...s, fullName: e.target.value }))
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-neutral-500">Role</label>
              <select
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={form.role}
                onChange={(e) =>
                  setForm((s) => ({ ...s, role: e.target.value }))
                }
              >
                {INTERNAL_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r] ?? r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500">Branch ID</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={form.branchId}
                onChange={(e) =>
                  setForm((s) => ({ ...s, branchId: e.target.value }))
                }
                placeholder="opsional"
              />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Password awal</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((s) => ({ ...s, password: e.target.value }))
                }
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-2 rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-60 transition-colors"
          >
            {saving ? 'Menyimpan…' : 'Buat Admin'}
          </button>
        </form>
      </div>

      {/* Tabel admin */}
      <div className="rounded-2xl border border-neutral-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-neutral-50">
          <h2 className="text-sm font-medium">Daftar Admin</h2>
          {loading && (
            <span className="text-xs text-neutral-500">Memuat…</span>
          )}
        </div>

        <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-neutral-500 bg-neutral-50">
          <div className="col-span-1">ID</div>
          <div className="col-span-3">Pengguna</div>
          <div className="col-span-2">Role</div>
          <div className="col-span-2">Cabang</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2 text-right">Aksi</div>
        </div>

        {admins.length === 0 ? (
          <div className="px-4 py-3 text-sm text-neutral-500">
            Belum ada admin.
          </div>
        ) : (
          admins.slice((adminPage - 1) * adminPageSize, adminPage * adminPageSize).map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-12 gap-2 px-4 py-2 text-sm border-t"
            >
              <div className="col-span-1 text-xs">#{u.id}</div>
              <div className="col-span-3">
                <div className="font-medium">{u.full_name}</div>
                <div className="text-xs text-neutral-500">{u.email}</div>
              </div>
              <div className="col-span-2">
                <select
                  className="border rounded-lg px-2 py-1 text-xs bg-white"
                  value={u.role}
                  onChange={(e) =>
                    updateAdmin(u.id, { role: e.target.value })
                  }
                >
                  {INTERNAL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r] ?? r}
                    </option>
                  ))}
                  {!INTERNAL_ROLES.includes(u.role) && (
                    <option key={u.role} value={u.role} disabled>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </option>
                  )}
                </select>
              </div>
              <div className="col-span-2">
                <input
                  className="border rounded-lg px-2 py-1 text-xs w-20"
                  value={u.branch_id ?? ''}
                  onChange={(e) =>
                    updateAdmin(u.id, {
                      branch_id: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                />
              </div>
              <div className="col-span-2">
                <button
                  className={`px-2 py-1 rounded-full text-xs ${
                    u.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                  onClick={() =>
                    updateAdmin(u.id, { is_active: !u.is_active })
                  }
                >
                  {u.is_active ? 'Aktif' : 'Tidak Aktif'}
                </button>
              </div>
              <div className="col-span-2 text-right text-xs text-neutral-500">
                {/* ruang untuk fitur lanjutan (reset password, dll) */}
              </div>
            </div>
          ))
        )}
        <Pagination
          page={adminPage}
          pageSize={adminPageSize}
          total={admins.length}
          onPageChange={setAdminPage}
          onPageSizeChange={(s) => { setAdminPageSize(s); setAdminPage(1); }}
          disabled={loading}
        />
      </div>
    </div>
  );
}
