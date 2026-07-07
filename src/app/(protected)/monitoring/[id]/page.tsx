'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import {
  getMonitoringCase,
  complianceReview,
  directorReview,
  updateMonitoringReport,
  formatCaseStatus,
  formatCaseType,
  formatSeverity,
  formatTriggerLabel,
  formatMonitoringAmount,
  formatDateTime,
  formatDate,
  formatReportStatus,
  COMPLIANCE_ACTION_LABELS,
  DIRECTOR_DECISION_LABELS,
  REPORT_STATUS_LABELS,
  type MonitoringCaseDetail,
  type ComplianceReviewAction,
  type DirectorDecision,
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

function StatusBadge({ status }: { status?: string | null }) {
  const cls =
    status === 'DETECTED'                ? 'bg-orange-100 text-orange-700' :
    status === 'UNDER_COMPLIANCE_REVIEW' ? 'bg-blue-100 text-blue-700' :
    status === 'NEED_CLARIFICATION'      ? 'bg-amber-100 text-amber-700' :
    status === 'CLOSED_FALSE_POSITIVE'   ? 'bg-slate-100 text-slate-500' :
    status === 'COMPLIANCE_APPROVED'     ? 'bg-teal-100 text-teal-700' :
    status === 'COMPLIANCE_REJECTED'     ? 'bg-red-100 text-red-700' :
    status === 'PENDING_DIRECTOR_REVIEW' ? 'bg-purple-100 text-purple-700' :
    status === 'DIRECTOR_APPROVED'       ? 'bg-emerald-100 text-emerald-700' :
    status === 'DIRECTOR_REJECTED'       ? 'bg-red-100 text-red-700' :
    status === 'READY_TO_REPORT'         ? 'bg-teal-100 text-teal-700' :
    status === 'REPORTED'                ? 'bg-green-100 text-green-700' :
    status === 'ARCHIVED'                ? 'bg-slate-100 text-slate-400' :
                                           'bg-slate-100 text-slate-500';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{formatCaseStatus(status)}</span>;
}

// Compliance actions available per case type
function getComplianceActions(caseType?: string | null): ComplianceReviewAction[] {
  const base: ComplianceReviewAction[] = [
    'CLOSE_FALSE_POSITIVE',
    'NEED_CLARIFICATION',
    'ESCALATE_TO_DIRECTOR',
    'RECOMMEND_REPORT',
  ];
  // For LTKT only, allow direct READY_TO_REPORT
  if (caseType === 'LTKT') {
    return [...base, 'READY_TO_REPORT'];
  }
  return base;
}

const COMPLIANCE_ACTIONABLE_STATUSES = new Set([
  'DETECTED',
  'UNDER_COMPLIANCE_REVIEW',
  'NEED_CLARIFICATION',
]);

// Report update endpoint is only valid for these statuses (backend workflow:
// Director APPROVED transitions case.status straight to READY_TO_REPORT).
const REPORT_EDITABLE_STATUSES = new Set([
  'READY_TO_REPORT',
  'REPORTED',
]);

// ── Page ──────────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['SystemAdmin', 'ComplianceLead', 'Director', 'Auditor']);

export default function MonitoringDetailPage() {
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const [detail, setDetail] = useState<MonitoringCaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Compliance review form
  const [compAction, setCompAction] = useState<ComplianceReviewAction>('NEED_CLARIFICATION');
  const [compNotes, setCompNotes] = useState('');
  const [compSubmitting, setCompSubmitting] = useState(false);
  const [compError, setCompError] = useState('');

  // Director review form
  const [dirDecision, setDirDecision] = useState<DirectorDecision>('APPROVED');
  const [dirNotes, setDirNotes] = useState('');
  const [dirSubmitting, setDirSubmitting] = useState(false);
  const [dirError, setDirError] = useState('');

  // Report tracking form
  const [repStatus, setRepStatus] = useState<MonitoringReportStatus>('READY_TO_SUBMIT');
  const [repRef, setRepRef] = useState('');
  const [repFile, setRepFile] = useState('');
  const [repAt, setRepAt] = useState('');
  const [repSubmitting, setRepSubmitting] = useState(false);
  const [repError, setRepError] = useState('');

  const canComplianceReview = role === 'ComplianceLead' || role === 'SystemAdmin';
  const canDirectorReview = role === 'Director' || role === 'SystemAdmin';
  const canEditReport = role === 'ComplianceLead' || role === 'SystemAdmin';

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError('');
    getMonitoringCase(id)
      .then((data) => {
        if (!alive) return;
        setDetail(data);
        // Pre-fill report form fields if available
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

  async function submitComplianceReview() {
    if (!id) return;
    setCompSubmitting(true);
    setCompError('');
    try {
      const updated = await complianceReview(id, { action: compAction, notes: compNotes });
      setDetail(updated);
      setCompNotes('');
    } catch (e: unknown) {
      setCompError(e instanceof Error ? e.message : 'Gagal menyimpan review');
    } finally {
      setCompSubmitting(false);
    }
  }

  async function submitDirectorReview() {
    if (!id) return;
    setDirSubmitting(true);
    setDirError('');
    try {
      const updated = await directorReview(id, { decision: dirDecision, notes: dirNotes });
      setDetail(updated);
      setDirNotes('');
    } catch (e: unknown) {
      setDirError(e instanceof Error ? e.message : 'Gagal menyimpan keputusan');
    } finally {
      setDirSubmitting(false);
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
        <Link href="/monitoring" className="mt-3 inline-block text-sm text-kesh-700 hover:underline">← Kembali</Link>
      </div>
    );
  }

  if (!detail) return null;

  const complianceActionable = COMPLIANCE_ACTIONABLE_STATUSES.has(detail.status ?? '');
  const directorActionable = detail.status === 'PENDING_DIRECTOR_REVIEW';
  const reportEditable = REPORT_EDITABLE_STATUSES.has(detail.status ?? '');
  const availableCompActions = getComplianceActions(detail.case_type);

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
          <Field label="Status" value={<StatusBadge status={detail.status} />} />
          <Field label="Severity" value={<SeverityBadge severity={detail.severity} />} />
          <Field label="Nama Customer" value={detail.customer_name} />
          <Field label="CIF" value={<span className="font-mono">{detail.cif_no}</span>} />
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
                  <th className="pb-2 pr-3">Kode / Nama</th>
                  <th className="pb-2 pr-3">Tipe</th>
                  <th className="pb-2 pr-3">Severity</th>
                  <th className="pb-2 pr-3">Skor</th>
                  <th className="pb-2 pr-3">Nominal</th>
                  <th className="pb-2 pr-3">Tipe Trigger</th>
                  <th className="pb-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {(detail.triggers ?? []).map((t, i) => (
                  <tr key={t.id ?? i} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-slate-800">{formatTriggerLabel(t.rule_code)}</div>
                      {t.rule_code && (
                        <div className="text-xs text-slate-400 font-mono">{t.rule_code}</div>
                      )}
                      {t.rule_name && (
                        <div className="text-xs text-slate-500">{t.rule_name}</div>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{t.trigger_type ?? '—'}</td>
                    <td className="py-2 pr-3"><SeverityBadge severity={t.severity} /></td>
                    <td className="py-2 pr-3 text-slate-700 font-medium">{t.score ?? '—'}</td>
                    <td className="py-2 pr-3 text-xs text-slate-600">{formatMonitoringAmount(t.amount)}</td>
                    <td className="py-2 pr-3">
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
                    <td className="py-2 text-xs text-slate-600 max-w-xs">
                      {t.details
                        ? typeof t.details === 'string'
                          ? t.details
                          : <pre className="whitespace-pre-wrap font-mono text-xs">{JSON.stringify(t.details, null, 2)}</pre>
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Note about supporting-only triggers */}
          {detail.triggers?.some((t) => t.rule_code === 'LTKM_HIGH_VALUE_TRANSFER' && t.supporting) && (
            <p className="text-xs text-slate-400 italic">
              * Transfer bernilai tinggi bersifat pendukung dan tidak sendirinya mengindikasikan transaksi mencurigakan.
            </p>
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
                <Field label="Nominal" value={formatMonitoringAmount(detail.linked_transfer.amount, detail.linked_transfer.currency ?? 'IDR')} />
                <Field label="Metode" value={detail.linked_transfer.transfer_method} />
                <Field label="Channel" value={detail.linked_transfer.transfer_channel} />
                <Field label="Penerima" value={detail.linked_transfer.beneficiary_account_name} />
                <Field label="Bank Penerima" value={detail.linked_transfer.beneficiary_bank_name} />
                <Field label="Status Transfer" value={detail.linked_transfer.status} />
              </div>
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

      {/* ── 4. Compliance Review ────────────────────────────────────────── */}
      <Section title="Review Compliance">
        {/* Show last recorded review */}
        {detail.compliance_review?.action && (
          <div className="rounded-lg border bg-slate-50 p-3 space-y-1 text-sm">
            <p className="text-xs text-slate-500 font-medium">Review Terakhir</p>
            <p>
              <span className="text-slate-600">Aksi: </span>
              <span className="font-medium text-slate-800">
                {COMPLIANCE_ACTION_LABELS[detail.compliance_review.action] ?? detail.compliance_review.action}
              </span>
            </p>
            {detail.compliance_review.notes && (
              <p><span className="text-slate-600">Catatan: </span>{detail.compliance_review.notes}</p>
            )}
            {detail.compliance_review.reviewed_by && (
              <p className="text-xs text-slate-400">
                oleh {detail.compliance_review.reviewed_by}
                {detail.compliance_review.reviewed_at && ` · ${formatDateTime(detail.compliance_review.reviewed_at)}`}
              </p>
            )}
          </div>
        )}

        {/* Action form — ComplianceLead/SystemAdmin only, when status allows */}
        {canComplianceReview && complianceActionable ? (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-medium text-slate-600">Tambah Review</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Aksi</label>
                <select
                  value={compAction}
                  onChange={(e) => setCompAction(e.target.value as ComplianceReviewAction)}
                  className="w-full rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
                >
                  {availableCompActions.map((a) => (
                    <option key={a} value={a}>{COMPLIANCE_ACTION_LABELS[a]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Catatan <span className="text-red-500">*</span></label>
              <textarea
                value={compNotes}
                onChange={(e) => setCompNotes(e.target.value)}
                rows={3}
                placeholder="Catatan review compliance…"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 focus:ring-1 focus:ring-kesh-700/20"
              />
            </div>
            {compError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{compError}</div>
            )}
            <button
              disabled={compSubmitting || !compNotes.trim()}
              onClick={submitComplianceReview}
              className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-50 transition-colors"
            >
              {compSubmitting ? 'Menyimpan…' : 'Simpan Review'}
            </button>
          </div>
        ) : canComplianceReview && !complianceActionable ? (
          <p className="text-xs text-slate-400 italic">Status saat ini tidak memerlukan review compliance.</p>
        ) : (
          !detail.compliance_review?.action && (
            <p className="text-xs text-slate-400 italic">Belum ada review compliance.</p>
          )
        )}
      </Section>

      {/* ── 5. Director Review ──────────────────────────────────────────── */}
      <Section title="Review Direktur Utama">
        {/* Show last recorded director review */}
        {detail.director_review?.decision && (
          <div className="rounded-lg border bg-slate-50 p-3 space-y-1 text-sm">
            <p className="text-xs text-slate-500 font-medium">Keputusan Terakhir</p>
            <p>
              <span className="text-slate-600">Keputusan: </span>
              <span className="font-medium text-slate-800">
                {DIRECTOR_DECISION_LABELS[detail.director_review.decision] ?? detail.director_review.decision}
              </span>
            </p>
            {detail.director_review.notes && (
              <p><span className="text-slate-600">Catatan: </span>{detail.director_review.notes}</p>
            )}
            {detail.director_review.reviewed_by && (
              <p className="text-xs text-slate-400">
                oleh {detail.director_review.reviewed_by}
                {detail.director_review.reviewed_at && ` · ${formatDateTime(detail.director_review.reviewed_at)}`}
              </p>
            )}
          </div>
        )}

        {/* Action form — Director/SystemAdmin only, when status = PENDING_DIRECTOR_REVIEW */}
        {canDirectorReview && directorActionable ? (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-medium text-slate-600">Keputusan Dirut</p>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Keputusan</label>
              <select
                value={dirDecision}
                onChange={(e) => setDirDecision(e.target.value as DirectorDecision)}
                className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
              >
                {(Object.keys(DIRECTOR_DECISION_LABELS) as DirectorDecision[]).map((d) => (
                  <option key={d} value={d}>{DIRECTOR_DECISION_LABELS[d]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Catatan <span className="text-red-500">*</span></label>
              <textarea
                value={dirNotes}
                onChange={(e) => setDirNotes(e.target.value)}
                rows={3}
                placeholder="Catatan keputusan Direktur Utama…"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 focus:ring-1 focus:ring-kesh-700/20"
              />
            </div>
            {dirError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{dirError}</div>
            )}
            <button
              disabled={dirSubmitting || !dirNotes.trim()}
              onClick={submitDirectorReview}
              className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-50 transition-colors"
            >
              {dirSubmitting ? 'Menyimpan…' : 'Simpan Keputusan'}
            </button>
          </div>
        ) : !detail.director_review?.decision ? (
          <p className="text-xs text-slate-400 italic">
            {directorActionable
              ? 'Menunggu keputusan Direktur Utama.'
              : 'Belum ada review Direktur Utama.'}
          </p>
        ) : null}
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
