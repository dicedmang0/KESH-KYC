'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { formatCif } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { formatDateTime } from '@/lib/monitoring';
import {
  getComplaint,
  updateComplaint,
  formatComplaintStatus,
  formatComplaintCategory,
  formatComplaintChannel,
  formatComplaintPriority,
  canUpdateComplaint,
  canResolveComplaint,
  isComplaintReadOnly,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_CHANNEL_LABELS,
  COMPLAINT_PRIORITY_LABELS,
  COMPLAINT_STATUS_LABELS,
  type Complaint,
  type ComplaintCategory,
  type ComplaintChannel,
  type ComplaintPriority,
  type ComplaintStatus,
} from '@/lib/complaints';

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-800 break-words">
        {value ?? <span className="text-slate-400 font-normal">—</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const cls =
    status === 'OPEN'        ? 'bg-blue-100 text-blue-700' :
    status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' :
    status === 'RESOLVED'    ? 'bg-emerald-100 text-emerald-700' :
    status === 'CLOSED'      ? 'bg-slate-100 text-slate-500' :
                               'bg-slate-100 text-slate-500';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {formatComplaintStatus(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority?: string | null }) {
  const cls =
    priority === 'HIGH'   ? 'bg-red-100 text-red-700' :
    priority === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
    priority === 'LOW'    ? 'bg-emerald-100 text-emerald-700' :
                            'bg-slate-100 text-slate-500';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {formatComplaintPriority(priority)}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['SystemAdmin', 'ComplianceLead', 'FrontDesk', 'Auditor', 'FinanceManager']);

export default function ComplaintDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // edit form state
  const [editCategory, setEditCategory]           = useState<ComplaintCategory>('TRANSFER');
  const [editChannel, setEditChannel]             = useState<ComplaintChannel>('WALK_IN');
  const [editPriority, setEditPriority]           = useState<ComplaintPriority>('MEDIUM');
  const [editStatus, setEditStatus]               = useState<ComplaintStatus>('OPEN');
  const [editNotes, setEditNotes]                 = useState('');
  const [editResolutionNotes, setEditResolutionNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setErr('');
    (async () => {
      try {
        const data = await getComplaint(id);
        if (!alive) return;
        setComplaint(data);
        setEditCategory((data.category as ComplaintCategory) ?? 'TRANSFER');
        setEditChannel((data.channel as ComplaintChannel) ?? 'WALK_IN');
        setEditPriority((data.priority as ComplaintPriority) ?? 'MEDIUM');
        setEditStatus((data.status as ComplaintStatus) ?? 'OPEN');
        setEditNotes(data.complaint_notes ?? '');
        setEditResolutionNotes(data.resolution_notes ?? '');
      } catch (e: unknown) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : 'Gagal memuat data pengaduan');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  async function save() {
    if (!complaint) return;
    setSaving(true);
    setSaveErr('');
    try {
      const payload: Parameters<typeof updateComplaint>[1] = {};

      // FrontDesk can only update notes on their own OPEN complaint
      if (role === 'FrontDesk') {
        payload.complaint_notes = editNotes;
      } else {
        payload.category         = editCategory;
        payload.channel          = editChannel;
        payload.priority         = editPriority;
        payload.status           = editStatus;
        payload.complaint_notes  = editNotes;
        payload.resolution_notes = editResolutionNotes || undefined;
      }

      const updated = await updateComplaint(id, payload);
      setComplaint(updated);
      setEditCategory((updated.category as ComplaintCategory) ?? 'TRANSFER');
      setEditChannel((updated.channel as ComplaintChannel) ?? 'WALK_IN');
      setEditPriority((updated.priority as ComplaintPriority) ?? 'MEDIUM');
      setEditStatus((updated.status as ComplaintStatus) ?? 'OPEN');
      setEditNotes(updated.complaint_notes ?? '');
      setEditResolutionNotes(updated.resolution_notes ?? '');
      toast.success('Pengaduan berhasil diperbarui.');
    } catch (e: unknown) {
      toast.error('Gagal memperbarui pengaduan. Silakan coba lagi.');
      setSaveErr(e instanceof Error ? e.message : 'Gagal memperbarui pengaduan. Silakan coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  if (!ALLOWED_ROLES.has(role ?? '')) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak memiliki akses ke halaman ini.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-100" />
        <div className="rounded-2xl border p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {err}
      </div>
    );
  }

  if (!complaint) return null;

  const readOnly = isComplaintReadOnly(role, complaint);
  const canEdit  = canUpdateComplaint(role, complaint);
  const canResolve = canResolveComplaint(role);

  // Status options available per role
  const statusOptions = Object.entries(COMPLAINT_STATUS_LABELS).filter(([k]) => {
    if (role === 'FrontDesk') return k !== 'RESOLVED' && k !== 'CLOSED';
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/complaints" className="text-sm text-kesh-700 hover:underline">
              ← Pengaduan
            </Link>
          </div>
          <h1 className="mt-1 text-xl font-semibold">
            {complaint.complaint_no ?? `Pengaduan #${complaint.id}`}
          </h1>
        </div>
        <StatusBadge status={complaint.status} />
      </div>

      {/* Detail sections */}
      <Section title="Informasi Customer">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Nama Customer" value={complaint.customer_name} />
          <Field label="CIF" value={
            <span className="font-mono">{formatCif(complaint.cif_no)}</span>
          } />
          <Field label="Tipe Customer" value={complaint.customer_type} />
        </div>
      </Section>

      <Section title="Detail Pengaduan">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="No. Pengaduan" value={
            <span className="font-mono">{complaint.complaint_no ?? `#${complaint.id}`}</span>
          } />
          <Field label="No. Transaksi" value={
            complaint.transaction_reference
              ? <span className="font-mono">{complaint.transaction_reference}</span>
              : undefined
          } />
          <Field label="Kategori" value={formatComplaintCategory(complaint.category)} />
          <Field label="Kanal" value={formatComplaintChannel(complaint.channel)} />
          <Field label="Prioritas" value={<PriorityBadge priority={complaint.priority} />} />
          <Field label="Status" value={<StatusBadge status={complaint.status} />} />
        </div>
      </Section>

      <Section title="Catatan">
        <Field label="Catatan Keluhan" value={
          complaint.complaint_notes
            ? <span className="whitespace-pre-wrap text-slate-700">{complaint.complaint_notes}</span>
            : undefined
        } />
        <Field label="Catatan Penyelesaian" value={
          complaint.resolution_notes
            ? <span className="whitespace-pre-wrap text-slate-700">{complaint.resolution_notes}</span>
            : undefined
        } />
      </Section>

      <Section title="Riwayat">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Dibuat Oleh" value={complaint.created_by} />
          <Field label="Tanggal Dibuat" value={formatDateTime(complaint.created_at)} />
          {complaint.resolved_at && (
            <Field label="Tanggal Selesai" value={formatDateTime(complaint.resolved_at)} />
          )}
        </div>
      </Section>

      {/* Edit / Update form — hidden for Auditor and non-editable states */}
      {!readOnly && canEdit && (
        <Section title="Perbarui Pengaduan">
          {saveErr && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {saveErr}
            </div>
          )}

          <div className="space-y-3">
            {/* Full editors for roles with resolve permission */}
            {role !== 'FrontDesk' && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-xs text-slate-500">Kategori</label>
                    <select
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value as ComplaintCategory)}
                    >
                      {Object.entries(COMPLAINT_CATEGORY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Kanal</label>
                    <select
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
                      value={editChannel}
                      onChange={(e) => setEditChannel(e.target.value as ComplaintChannel)}
                    >
                      {Object.entries(COMPLAINT_CHANNEL_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Prioritas</label>
                    <select
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as ComplaintPriority)}
                    >
                      {Object.entries(COMPLAINT_PRIORITY_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-500">Status</label>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as ComplaintStatus)}
                    disabled={!canResolve && (editStatus === 'RESOLVED' || editStatus === 'CLOSED')}
                  >
                    {statusOptions.map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div>
              <label className="text-xs text-slate-500">Catatan Keluhan</label>
              <textarea
                rows={4}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                placeholder="Catatan keluhan…"
              />
            </div>

            {role !== 'FrontDesk' && (
              <div>
                <label className="text-xs text-slate-500">Catatan Penyelesaian</label>
                <textarea
                  rows={3}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
                  value={editResolutionNotes}
                  onChange={(e) => setEditResolutionNotes(e.target.value)}
                  placeholder="Isi catatan penyelesaian jika pengaduan telah ditangani…"
                />
              </div>
            )}

            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-60 transition-colors"
            >
              {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
            </button>
          </div>
        </Section>
      )}

      {readOnly && role === 'Auditor' && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Anda memiliki akses baca saja pada halaman ini.
        </div>
      )}
    </div>
  );
}
