'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { formatCif } from '@/lib/utils';
import { toast } from '@/lib/toast';
import {
  getMonitoringCase,
  staffReview,
  managerReview,
  updateMonitoringReport,
  formatCaseStatus,
  formatCaseType,
  formatSeverity,
  formatTriggerLabel,
  formatMonitoringAmount,
  formatDateTime,
  formatDate,
  formatReportStatus,
  formatStaffAction,
  formatManagerAction,
  formatComplianceReviewer,
  getStaffReviewSummary,
  getManagerReviewSummary,
  STAFF_ACTION_LABELS,
  MANAGER_ACTION_LABELS,
  REPORT_STATUS_LABELS,
  type MonitoringCaseDetail,
  type MonitoringTrigger,
  type StaffReviewAction,
  type ManagerReviewAction,
  type MonitoringReportStatus,
} from '@/lib/monitoring';

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

function SeverityBadge({ severity }: { severity?: string | null }) {
  const cls =
    severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
    severity === 'HIGH'     ? 'bg-orange-100 text-orange-700' :
    severity === 'MEDIUM'   ? 'bg-amber-100 text-amber-700' :
    severity === 'LOW'      ? 'bg-emerald-100 text-emerald-700' :
                              'bg-slate-100 text-slate-500';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{formatSeverity(severity)}</span>;
}

function CaseTypeBadge({ type }: { type?: string | null }) {
  const cls =
    type === 'LTKT' ? 'bg-blue-100 text-blue-700' :
    type === 'LTKM' ? 'bg-purple-100 text-purple-700' :
    type === 'BOTH' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-slate-100 text-slate-500';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{formatCaseType(type)}</span>;
}

function StatusBadge({ status, label }: { status?: string | null; label?: string | null }) {
  const cls =
    status === 'DETECTED'                         ? 'bg-orange-100 text-orange-700' :
    status === 'UNDER_COMPLIANCE_REVIEW'          ? 'bg-blue-100 text-blue-700' :
    status === 'NEED_CLARIFICATION'               ? 'bg-amber-100 text-amber-700' :
    status === 'CLOSED_FALSE_POSITIVE'            ? 'bg-slate-100 text-slate-500' :
    status === 'COMPLIANCE_APPROVED'              ? 'bg-teal-100 text-teal-700' :
    status === 'COMPLIANCE_REJECTED'              ? 'bg-red-100 text-red-700' :
    status === 'PENDING_COMPLIANCE_STAFF_REVIEW'  ? 'bg-blue-100 text-blue-700' :
    status === 'PENDING_COMPLIANCE_MANAGER_REVIEW'? 'bg-purple-100 text-purple-700' :
    status === 'STAFF_REVIEWED'                   ? 'bg-teal-100 text-teal-700' :
    status === 'MANAGER_APPROVED'                 ? 'bg-emerald-100 text-emerald-700' :
    status === 'MANAGER_REJECTED'                 ? 'bg-red-100 text-red-700' :
    status === 'PENDING_DIRECTOR_REVIEW'          ? 'bg-purple-100 text-purple-700' :
    status === 'DIRECTOR_APPROVED'                ? 'bg-emerald-100 text-emerald-700' :
    status === 'DIRECTOR_REJECTED'                ? 'bg-red-100 text-red-700' :
    status === 'READY_TO_REPORT'                  ? 'bg-teal-100 text-teal-700' :
    status === 'REPORTED'                         ? 'bg-green-100 text-green-700' :
    status === 'ARCHIVED'                         ? 'bg-slate-100 text-slate-400' :
                                                    'bg-slate-100 text-slate-500';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{label || formatCaseStatus(status)}</span>;
}

function SystemSupportBadge({ supported }: { supported?: boolean | null }) {
  if (supported === true) {
    return <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-700">Terdeteksi Sistem</span>;
  }
  if (supported === false) {
    return <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700">Template / Manual-ready</span>;
  }
  return null;
}

function AlertInformationCard({ trigger, index }: { trigger: MonitoringTrigger; index: number }) {
  const [open, setOpen] = useState(false);
  const info = trigger.alert_information;

  const hasInfo = !!(info && (
    info.report_type || info.trigger_criteria || info.analysis ||
    info.recommendation || (info.parameters?.length ?? 0) > 0 ||
    (info.matched_conditions?.length ?? 0) > 0 ||
    (info.evidence && Object.keys(info.evidence).length > 0) ||
    (info.limitations?.length ?? 0) > 0 || info.source
  ));

  const title = trigger.alert_name ?? trigger.rule_name ?? trigger.rule_code ?? `Trigger #${index + 1}`;

  if (!hasInfo) {
    return (
      <div className="rounded-lg border bg-slate-50 p-3 text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-700">{title}</span>
          <SystemSupportBadge supported={info?.supported_by_system} />
        </div>
        <p className="text-xs text-slate-400 mt-1">Tidak ada detail alert tersedia.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800">{title}</span>
          <SystemSupportBadge supported={info?.supported_by_system} />
        </div>
        <span className="text-slate-400 text-xs ml-2 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && info && (
        <div className="border-t p-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {trigger.alert_name && <Field label="Alert" value={trigger.alert_name} />}
            {info.report_type && <Field label="Jenis Laporan" value={info.report_type} />}
            {info.source && <Field label="Sumber" value={info.source} />}
            {info.trigger_criteria && (
              <div className="sm:col-span-2">
                <Field label="Kriteria Trigger" value={info.trigger_criteria} />
              </div>
            )}
            {info.analysis && (
              <div className="sm:col-span-2">
                <Field label="Analisis" value={info.analysis} />
              </div>
            )}
            {info.recommendation && (
              <div className="sm:col-span-2">
                <Field label="Rekomendasi" value={info.recommendation} />
              </div>
            )}
          </div>

          {(info.parameters?.length ?? 0) > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Parameter</div>
              <ul className="list-disc list-inside text-sm text-slate-700 space-y-0.5">
                {info.parameters!.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>
          )}

          {(info.matched_conditions?.length ?? 0) > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Kondisi yang Terdeteksi</div>
              <ul className="list-disc list-inside text-sm text-slate-700 space-y-0.5">
                {info.matched_conditions!.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          {info.evidence && Object.keys(info.evidence).length > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Evidence</div>
              <div className="rounded bg-slate-50 p-2 space-y-1">
                {Object.entries(info.evidence).map(([k, v]) => (
                  <div key={k} className="flex gap-2 text-xs">
                    <span className="text-slate-500 font-medium min-w-28 shrink-0">{k}</span>
                    <span className="text-slate-700 break-all">
                      {v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(info.limitations?.length ?? 0) > 0 && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Limitasi Data</div>
              <ul className="list-disc list-inside text-xs text-slate-500 space-y-0.5">
                {info.limitations!.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STAFF_ACTIONABLE_STATUSES = new Set([
  'DETECTED',
  'UNDER_COMPLIANCE_REVIEW',
  'NEED_CLARIFICATION',
  'PENDING_COMPLIANCE_STAFF_REVIEW',
]);

const REPORT_EDITABLE_STATUSES = new Set([
  'READY_TO_REPORT',
  'REPORTED',
]);

// ── Page ──────────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['SystemAdmin', 'Director', 'ComplianceLead', 'Auditor']);

export default function MonitoringDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const [detail, setDetail] = useState<MonitoringCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Staff review form
  const [staffAction, setStaffAction] = useState<StaffReviewAction>('ESCALATE_TO_MANAGER');
  const [staffNotes, setStaffNotes] = useState('');
  const [staffSubmitting, setStaffSubmitting] = useState(false);
  const [staffError, setStaffError] = useState('');

  // Manager review form
  const [managerAction, setManagerAction] = useState<ManagerReviewAction>('APPROVE_REPORT');
  const [managerNotes, setManagerNotes] = useState('');
  const [managerSubmitting, setManagerSubmitting] = useState(false);
  const [managerError, setManagerError] = useState('');

  // Report tracking form
  const [repStatus, setRepStatus] = useState<MonitoringReportStatus>('READY_TO_SUBMIT');
  const [repRef, setRepRef] = useState('');
  const [repFile, setRepFile] = useState('');
  const [repAt, setRepAt] = useState('');
  const [repSubmitting, setRepSubmitting] = useState(false);
  const [repError, setRepError] = useState('');

  const canStaffReview = role === 'SystemAdmin' || role === 'Director';
  const canManagerReview = role === 'ComplianceLead' || role === 'SystemAdmin' || role === 'Director';
  const canEditReport = role === 'ComplianceLead' || role === 'SystemAdmin' || role === 'Director';

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError('');
    getMonitoringCase(id)
      .then((data) => {
        if (!alive) return;
        setDetail(data);
        if (data.report_status) setRepStatus(data.report_status);
        if (data.report_reference_no) setRepRef(data.report_reference_no);
        if (data.report_file_uri) setRepFile(data.report_file_uri);
        if (data.reported_at) setRepAt(data.reported_at.slice(0, 16));
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : 'Gagal memuat detail case');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  async function submitStaffReview() {
    if (!id || !staffNotes.trim()) return;
    setStaffSubmitting(true);
    setStaffError('');
    try {
      const updated = await staffReview(id, { action: staffAction, notes: staffNotes });
      setDetail(updated);
      setStaffNotes('');
      toast.success('Review Operation Supervisor berhasil disimpan.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal menyimpan review Operation Supervisor.';
      setStaffError(msg);
      toast.error('Gagal menyimpan review Operation Supervisor.');
    } finally {
      setStaffSubmitting(false);
    }
  }

  async function submitManagerReview() {
    if (!id || !managerNotes.trim()) return;
    setManagerSubmitting(true);
    setManagerError('');
    try {
      const updated = await managerReview(id, { action: managerAction, notes: managerNotes });
      setDetail(updated);
      setManagerNotes('');
      toast.success('Approval Lead Compliance berhasil disimpan.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal menyimpan approval Lead Compliance.';
      setManagerError(msg);
      toast.error('Gagal menyimpan approval Lead Compliance.');
    } finally {
      setManagerSubmitting(false);
    }
  }

  async function submitReportUpdate() {
    if (!id) return;
    setRepSubmitting(true);
    setRepError('');
    try {
      const updated = await updateMonitoringReport(id, {
        report_status: repStatus,
        report_reference_no: repRef || undefined,
        report_file_uri: repFile || undefined,
        reported_at: repAt ? new Date(repAt).toISOString() : undefined,
      });
      setDetail(updated);
    } catch (e: unknown) {
      setRepError(e instanceof Error ? e.message : 'Gagal memperbarui laporan');
    } finally {
      setRepSubmitting(false);
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
    return <div className="p-6 text-sm text-slate-400">Memuat…</div>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <p className="text-sm text-red-700">{error}</p>
        <Link href="/monitoring" className="mt-3 inline-block text-sm text-kesh-700 hover:underline">← Kembali ke Monitoring</Link>
      </div>
    );
  }

  if (!detail) return null;

  const staffActionable = STAFF_ACTIONABLE_STATUSES.has(detail.status ?? '');
  const managerActionable = detail.status === 'PENDING_COMPLIANCE_MANAGER_REVIEW';
  const reportEditable = REPORT_EDITABLE_STATUSES.has(detail.status ?? '');

  const staffSummary = getStaffReviewSummary(detail);
  const managerSummary = getManagerReviewSummary(detail);

  return (
    <div className="space-y-4">
      {/* Back */}
      <Link href="/monitoring" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        ← Monitoring
      </Link>

      {/* ── 1. Ringkasan Case ────────────────────────────────────────────── */}
      <Section title="Ringkasan Case">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Field label="No. Case" value={<span className="font-mono">{detail.case_no ?? `#${detail.id}`}</span>} />
          <Field label="Tipe Case" value={<CaseTypeBadge type={detail.case_type} />} />
          <Field label="Status" value={<StatusBadge status={detail.status} label={detail.status_label} />} />
          <Field label="Severity" value={<SeverityBadge severity={detail.severity} />} />
          <Field label="Nama Customer" value={detail.customer_name} />
          <Field label="CIF" value={<span className="font-mono">{formatCif(detail.cif_no)}</span>} />
          <Field label="Sumber" value={detail.source_type} />
          {detail.transfer_id && (
            <Field
              label="Transfer ID"
              value={
                <Link href={`/transfers/${detail.transfer_id}`} className="text-kesh-700 hover:underline">
                  #{detail.transfer_id}
                </Link>
              }
            />
          )}
          {detail.application_id && (
            <Field
              label="Application ID"
              value={
                <Link href={`/users/${detail.application_id}`} className="text-kesh-700 hover:underline">
                  #{detail.application_id}
                </Link>
              }
            />
          )}
          <Field label="Terdeteksi" value={formatDateTime(detail.detected_at)} />
          <Field label="Jatuh Tempo" value={formatDate(detail.due_date)} />
          {detail.trigger_summary && (
            <div className="col-span-2 sm:col-span-3 lg:col-span-4">
              <Field label="Ringkasan Trigger" value={detail.trigger_summary} />
            </div>
          )}
        </div>
      </Section>

      {/* ── 2. Trigger Details ──────────────────────────────────────────── */}
      {(detail.triggers?.length ?? 0) > 0 && (
        <Section title="Detail Trigger">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-slate-500">
                  <th className="pb-2 pr-3">Alert / Kode</th>
                  <th className="pb-2 pr-3">Tipe</th>
                  <th className="pb-2 pr-3">Severity</th>
                  <th className="pb-2 pr-3">Skor</th>
                  <th className="pb-2 pr-3">Nominal</th>
                  <th className="pb-2">Tipe Trigger</th>
                </tr>
              </thead>
              <tbody>
                {(detail.triggers ?? []).map((t, i) => (
                  <tr key={t.id ?? i} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-800">
                        {t.alert_name ?? formatTriggerLabel(t.rule_code)}
                      </div>
                      {t.rule_code && (
                        <div className="text-xs text-slate-400 font-mono">{t.rule_code}</div>
                      )}
                      {!t.alert_name && t.rule_name && (
                        <div className="text-xs text-slate-500">{t.rule_name}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{t.trigger_type ?? '—'}</td>
                    <td className="py-2 pr-3"><SeverityBadge severity={t.severity} /></td>
                    <td className="py-2 pr-3 text-slate-700 font-medium">{t.score ?? '—'}</td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{formatMonitoringAmount(t.amount)}</td>
                    <td className="py-2">
                      {t.supporting ? (
                        <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-500">
                          Pendukung
                        </span>
                      ) : (
                        <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-600">
                          Pengklasifikasi
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {detail.triggers?.some((t) => t.rule_code === 'LTKM_HIGH_VALUE_TRANSFER' && t.supporting) && (
            <p className="text-xs text-slate-400 italic">
              * Transfer bernilai tinggi bersifat pendukung dan tidak sendirinya mengindikasikan transaksi mencurigakan.
            </p>
          )}

          {detail.triggers?.some((t) => t.alert_name || t.alert_information) && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alert Information</p>
              {(detail.triggers ?? []).map((t, i) => (
                <AlertInformationCard key={t.id ?? i} trigger={t} index={i} />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* ── 3. Linked Data Summary ──────────────────────────────────────── */}
      {(detail.linked_transfer || detail.linked_application) && (
        <Section title="Data Terkait">
          {detail.linked_transfer && (
            <div>
              <p className="text-xs font-medium text-slate-600 mb-2">Transfer</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Nama Pengirim" value={detail.linked_transfer.sender_name} />
                <Field label="CIF Pengirim" value={detail.linked_transfer.sender_cif_no ? formatCif(detail.linked_transfer.sender_cif_no) : undefined} />
                <Field label="Nominal" value={formatMonitoringAmount(detail.linked_transfer.amount, detail.linked_transfer.currency ?? 'IDR')} />
                <Field label="Sumber Dana" value={detail.linked_transfer.source_of_funds} />
                <Field label="Tujuan Transaksi" value={detail.linked_transfer.transaction_purpose} />
                <Field label="Penerima" value={detail.linked_transfer.beneficiary_account_name} />
                <Field label="No. Rekening Penerima" value={detail.linked_transfer.beneficiary_account_number} />
                <Field label="Bank Penerima" value={detail.linked_transfer.beneficiary_bank_name} />
                <Field label="Metode" value={detail.linked_transfer.transfer_method} />
                <Field label="Channel" value={detail.linked_transfer.transfer_channel} />
                <Field label="Status Transfer" value={detail.linked_transfer.status} />
              </div>
              {detail.transfer_id != null && (
                <p className="mt-2 text-xs text-slate-400">
                  <Link href={`/transfers/${detail.transfer_id}`} className="text-kesh-700 hover:underline">
                    Transfer #{detail.transfer_id}
                  </Link>
                </p>
              )}
            </div>
          )}
          {detail.linked_application && (
            <div className={detail.linked_transfer ? 'mt-4 pt-4 border-t' : ''}>
              <p className="text-xs font-medium text-slate-600 mb-2">Aplikasi KYC/KYB</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Field label="Tipe" value={detail.linked_application.type} />
                <Field label="Risk Level" value={detail.linked_application.risk_level} />
                <Field label="Status Aplikasi" value={detail.linked_application.status} />
                <Field label="Nama Customer" value={detail.linked_application.customer_name} />
              </div>
            </div>
          )}
        </Section>
      )}

      {/* ── 4. Review Operation Supervisor ─────────────────────────────── */}
      <Section title="Review Operation Supervisor">
        {staffSummary.hasAny && (
          <div className="rounded-lg border bg-slate-50 p-3 space-y-2 text-sm">
            <p className="text-xs text-slate-500 font-medium">Review Terakhir</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Aksi" value={formatStaffAction(staffSummary.action)} />
              <Field label="Direview Pada" value={staffSummary.reviewedAt ? formatDateTime(staffSummary.reviewedAt) : '-'} />
              <Field label="Direview Oleh" value={formatComplianceReviewer(staffSummary.reviewedBy)} />
              <div className="sm:col-span-2">
                <Field label="Catatan" value={staffSummary.notes ?? '-'} />
              </div>
            </div>
          </div>
        )}

        {canStaffReview && staffActionable ? (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-medium text-slate-600">Tambah Review</p>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Aksi</label>
              <select
                value={staffAction}
                onChange={(e) => setStaffAction(e.target.value as StaffReviewAction)}
                className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
              >
                {(Object.keys(STAFF_ACTION_LABELS) as StaffReviewAction[]).map((a) => (
                  <option key={a} value={a}>{STAFF_ACTION_LABELS[a]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Catatan <span className="text-red-500">*</span>
              </label>
              <textarea
                value={staffNotes}
                onChange={(e) => setStaffNotes(e.target.value)}
                rows={3}
                placeholder="Catatan review Operation Supervisor…"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 focus:ring-1 focus:ring-kesh-700/20"
              />
            </div>
            {staffError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{staffError}</div>
            )}
            <button
              disabled={staffSubmitting || !staffNotes.trim()}
              onClick={submitStaffReview}
              className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-50 transition-colors"
            >
              {staffSubmitting ? 'Menyimpan…' : 'Simpan Review'}
            </button>
          </div>
        ) : canStaffReview && !staffActionable ? (
          <p className="text-xs text-slate-400 italic">Status saat ini tidak memerlukan review Operation Supervisor.</p>
        ) : (
          !staffSummary.hasAny && (
            <p className="text-xs text-slate-400 italic">Belum ada review Operation Supervisor.</p>
          )
        )}
      </Section>

      {/* ── 5. Approval Lead Compliance ────────────────────────────────── */}
      <Section title="Approval Lead Compliance">
        {managerSummary.hasAny && (
          <div className="rounded-lg border bg-slate-50 p-3 space-y-2 text-sm">
            <p className="text-xs text-slate-500 font-medium">Approval Terakhir</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Aksi" value={formatManagerAction(managerSummary.action)} />
              <Field label="Diproses Pada" value={managerSummary.reviewedAt ? formatDateTime(managerSummary.reviewedAt) : '-'} />
              <Field label="Diproses Oleh" value={formatComplianceReviewer(managerSummary.reviewedBy)} />
              <div className="sm:col-span-2">
                <Field label="Catatan" value={managerSummary.notes ?? '-'} />
              </div>
            </div>
          </div>
        )}

        {canManagerReview && managerActionable ? (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-medium text-slate-600">Approval Lead Compliance</p>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Aksi</label>
              <select
                value={managerAction}
                onChange={(e) => setManagerAction(e.target.value as ManagerReviewAction)}
                className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
              >
                {(Object.keys(MANAGER_ACTION_LABELS) as ManagerReviewAction[]).map((a) => (
                  <option key={a} value={a}>{MANAGER_ACTION_LABELS[a]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Catatan <span className="text-red-500">*</span>
              </label>
              <textarea
                value={managerNotes}
                onChange={(e) => setManagerNotes(e.target.value)}
                rows={3}
                placeholder="Catatan approval Lead Compliance…"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 focus:ring-1 focus:ring-kesh-700/20"
              />
            </div>
            {managerError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{managerError}</div>
            )}
            <button
              disabled={managerSubmitting || !managerNotes.trim()}
              onClick={submitManagerReview}
              className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-50 transition-colors"
            >
              {managerSubmitting ? 'Menyimpan…' : 'Simpan Approval'}
            </button>
          </div>
        ) : canManagerReview && !managerActionable ? (
          <p className="text-xs text-slate-400 italic">Menunggu eskalasi dari Operation Supervisor untuk approval Lead Compliance.</p>
        ) : (
          !managerSummary.hasAny && (
            <p className="text-xs text-slate-400 italic">Belum ada approval Lead Compliance.</p>
          )
        )}
      </Section>

      {/* ── 6. Report Tracking ──────────────────────────────────────────── */}
      {(reportEditable || detail.report_status) && (
        <Section title="Tracking Laporan Regulasi">
          {canEditReport && reportEditable ? (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Status Laporan</label>
                  <select
                    value={repStatus}
                    onChange={(e) => setRepStatus(e.target.value as MonitoringReportStatus)}
                    className="w-full rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
                  >
                    {(Object.keys(REPORT_STATUS_LABELS) as MonitoringReportStatus[]).map((s) => (
                      <option key={s} value={s}>{REPORT_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">No. Referensi Laporan</label>
                  <input
                    type="text"
                    value={repRef}
                    onChange={(e) => setRepRef(e.target.value)}
                    placeholder="Nomor referensi dari regulator…"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">URI File Laporan</label>
                  <input
                    type="text"
                    value={repFile}
                    onChange={(e) => setRepFile(e.target.value)}
                    placeholder="https://… atau path file"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Tanggal Dilaporkan</label>
                  <input
                    type="datetime-local"
                    value={repAt}
                    onChange={(e) => setRepAt(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
                  />
                </div>
              </div>
              {repError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{repError}</div>
              )}
              <button
                disabled={repSubmitting}
                onClick={submitReportUpdate}
                className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-50 transition-colors"
              >
                {repSubmitting ? 'Menyimpan…' : 'Perbarui Laporan'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Status Laporan" value={formatReportStatus(detail.report_status)} />
              <Field label="No. Referensi" value={detail.report_reference_no} />
              <Field label="Tanggal Dilaporkan" value={formatDateTime(detail.reported_at)} />
              {detail.report_file_uri && (
                <Field label="File Laporan" value={
                  <a href={detail.report_file_uri} target="_blank" rel="noopener noreferrer" className="text-kesh-700 hover:underline break-all">
                    Unduh / Lihat
                  </a>
                } />
              )}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
