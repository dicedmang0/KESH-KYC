'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, apiUpload, getRoleFromToken } from '@/lib/api';
import { formatCif } from '@/lib/utils';
import EddForm, { DEFAULT_EDD, type EddFormData } from '@/components/EddForm';

type Status = 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

type ApplicationDetail = {
  id: number | string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  status: Status;
  created_at: string;
  submitted_at?: string | null;
  edd_required?: boolean | null;
  edd_completed?: boolean | null;
};

type Person = {
  full_name?: string | null;
  identity_type?: string | null;
  identity_number?: string | null;
  pob?: string | null;
  dob?: string | null;
  nationality?: string | null;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  occupation?: string | null;
  address_identity?: string | null;
  address_residential?: string | null;
  signature_uri?: string | null;
  cif_no?: string | null;
  cif_relationship_type?: string | null;
};

type Business = {
  legal_name?: string | null;
  trade_name?: string | null;
  legal_form?: string | null;
  incorporation_place?: string | null;
  incorporation_date?: string | null;
  nib?: string | null;
  npwp?: string | null;
  address_line?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  industry_code?: string | null;
  business_activity?: string | null;
  cif_no?: string | null;
};

const RISK_FACTOR_LABELS: Record<string, string> = {
  INDIVIDUAL_OCCUPATION_HIGH_RBA: 'Profil pekerjaan high risk berdasarkan RBA',
  INDIVIDUAL_OCCUPATION_MEDIUM_RBA: 'Profil pekerjaan medium risk berdasarkan RBA',
  INDIVIDUAL_OCCUPATION_LOW_RBA: 'Profil pekerjaan low risk berdasarkan RBA',
  GEOGRAPHY_HIGH_RBA: 'Area geografis high risk berdasarkan RBA',
  GEOGRAPHY_MEDIUM_RBA: 'Area geografis medium risk berdasarkan RBA',
  GEOGRAPHY_LOW_RBA: 'Area geografis low risk berdasarkan RBA',
};

function getRiskFactorLabel(code?: string | null, backendLabel?: string | null): string {
  if (code && RISK_FACTOR_LABELS[code]) return RISK_FACTOR_LABELS[code];
  return backendLabel ?? code ?? '—';
}

type RiskFactor = {
  code?: string | null;
  label?: string | null;
  score?: number | null;
  severity?: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | string | null;
  source?: string | null;
  details?: string | null;
  metadata?: { matched?: string | string[] | null; [key: string]: unknown } | null;
};

type Risk = {
  risk_score?: number | null;
  risk_level?: string | null;
  override_level?: string | null;
  risk_factors?: RiskFactor[] | null;
};

type Document = {
  id: number | string;
  doc_type: string;
  file_uri?: string | null;   // actual backend field
  file_url?: string | null;   // legacy fallback
  status?: string | null;
  extracted_json?: { original_name?: string; mime?: string; size?: number } | null;
  original_name?: string | null;  // legacy fallback
  created_at?: string | null;
};

type EddRecord = {
  data?: Partial<EddFormData> | null;
  completed?: boolean | null;
  [key: string]: unknown;
};

// GET /applications/:id returns { application, person, business, documents, parties, risk, edd }
type DetailResponse = {
  application: ApplicationDetail;
  person?: Person | null;
  business?: Business | null;
  documents: Document[];
  parties: Party[];
  risk?: Risk | null;
  edd?: EddRecord | null;
};

type Party = {
  id: number | string;
  role: string;
  full_name: string;
  identity_type?: string | null;
  identity_number?: string | null;
  nationality?: string | null;
  dob?: string | null;
  cif_no?: string | null;
  cif_relationship_type?: string | null;
};

type ScreeningResult = {
  status?: string;
  checked_at?: string | null;
  matches?: { name: string; list_type: string; match_score?: number }[];
  [key: string]: unknown;
};

type PrecheckResult = {
  ready?: boolean;
  missing?: string[];
  [key: string]: unknown;
};

function getErrMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

function getCifRelationshipLabel(value?: string | null): string {
  if (value === 'OUR_CUSTOMER') return 'Our Customer';
  if (value === 'BO') return 'Beneficial Owner';
  if (value === 'WIC') return 'WIC';
  return '—';
}

const STATUS_COLOR: Record<Status, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  IN_REVIEW: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-40 shrink-0 font-medium text-slate-600">{label}</span>
      <span className="text-slate-800">{value || '—'}</span>
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [risk, setRisk] = useState<Risk | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [screening, setScreening] = useState<ScreeningResult | null>(null);
  const [precheck, setPrecheck] = useState<PrecheckResult | null>(null);
  const [eddData, setEddData] = useState<Partial<EddFormData>>({});
  const [eddSaving, setEddSaving] = useState(false);
  const [eddSaveError, setEddSaveError] = useState('');
  const [eddSaveMsg, setEddSaveMsg] = useState('');
  const [userRole, setUserRole] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [actionErr, setActionErr] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  // Document upload (DRAFT only)
  const [docType, setDocType] = useState('KTP');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docErr, setDocErr] = useState('');
  const [docInputKey, setDocInputKey] = useState(0);

  // Party add (BUSINESS + DRAFT only)
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyRole, setPartyRole] = useState('DIRECTOR');
  const [partyName, setPartyName] = useState('');
  const [partyIdType, setPartyIdType] = useState('KTP');
  const [partyIdNumber, setPartyIdNumber] = useState('');
  const [partyDob, setPartyDob] = useState('');
  const [partyNat, setPartyNat] = useState('Indonesia');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyEmail, setPartyEmail] = useState('');
  const [partyLoading, setPartyLoading] = useState(false);
  const [partyErr, setPartyErr] = useState('');

  async function load() {
    if (!id) return;
    setLoading(true);
    setErr('');
    try {
      // Backend returns { application, person, business, documents, parties, risk }
      const resp = await apiFetch<DetailResponse>(`/applications/${id}`);
      const appData = resp.application;
      if (!appData) throw new Error('Data aplikasi tidak ditemukan dalam response');

      setApp(appData);
      setPerson(resp.person ?? null);
      setBusiness(resp.business ?? null);
      setRisk(resp.risk ?? null);
      setDocs(resp.documents ?? []);
      setParties(resp.parties ?? []);

      // Populate EDD from main response or dedicated endpoint
      if (resp.edd?.data) {
        setEddData(resp.edd.data);
      } else if (appData.edd_required || resp.edd) {
        const eddResp = await apiFetch<EddRecord>(`/applications/${id}/edd`).catch(() => null);
        if (eddResp?.data) setEddData(eddResp.data);
      }

      // Only fetch screening after submission — DRAFT hasn't run screening yet
      if (appData.status !== 'DRAFT') {
        const screeningData = await apiFetch<ScreeningResult>(`/applications/${id}/screening`).catch(() => null);
        setScreening(screeningData);
      }
    } catch (e: unknown) {
      setErr(getErrMsg(e, 'Gagal memuat data aplikasi'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    setUserRole(getRoleFromToken(token));
  }, []);

  async function saveEdd(formData: EddFormData, complete: boolean) {
    if (!id) return;
    setEddSaving(true);
    setEddSaveError('');
    setEddSaveMsg('');
    try {
      await apiFetch(`/applications/${id}/edd`, {
        method: 'PATCH',
        body: { ...formData, complete },
      });
      setEddSaveMsg(complete ? 'EDD berhasil dilengkapi.' : 'Draft EDD berhasil disimpan.');
      await load();
    } catch (e: unknown) {
      setEddSaveError(getErrMsg(e, complete ? 'Simpan EDD gagal' : 'Simpan draft EDD gagal'));
    } finally {
      setEddSaving(false);
    }
  }

  async function runPrecheck() {
    if (!id) return;
    setActionLoading(true);
    setActionErr('');
    setActionMsg('');
    setPrecheck(null);
    try {
      const res = await apiFetch<PrecheckResult>(`/applications/${id}/precheck`);
      setPrecheck(res);
    } catch (e: unknown) {
      setActionErr(getErrMsg(e, 'Precheck gagal'));
    } finally {
      setActionLoading(false);
    }
  }

  async function submit() {
    if (!id) return;
    setActionLoading(true);
    setActionErr('');
    setActionMsg('');
    try {
      await apiFetch(`/applications/${id}/submit`, { method: 'PATCH' });
      setActionMsg('Berhasil di-submit.');
      await load();
    } catch (e: unknown) {
      setActionErr(getErrMsg(e, 'Submit gagal'));
    } finally {
      setActionLoading(false);
    }
  }

  async function approve() {
    if (!id) return;
    setActionLoading(true);
    setActionErr('');
    setActionMsg('');
    try {
      await apiFetch(`/applications/${id}/decision`, {
        method: 'PATCH',
        body: { decision: 'APPROVED' },
      });
      setActionMsg('Aplikasi disetujui.');
      await load();
    } catch (e: unknown) {
      setActionErr(getErrMsg(e, 'Approve gagal'));
    } finally {
      setActionLoading(false);
    }
  }

  async function reject() {
    if (!id) return;
    if (!rejectReason.trim()) {
      setActionErr('Alasan penolakan wajib diisi.');
      return;
    }
    setActionLoading(true);
    setActionErr('');
    setActionMsg('');
    try {
      await apiFetch(`/applications/${id}/decision`, {
        method: 'PATCH',
        body: { decision: 'REJECTED', reason: rejectReason.trim() },
      });
      setActionMsg('Aplikasi ditolak.');
      setShowRejectInput(false);
      setRejectReason('');
      await load();
    } catch (e: unknown) {
      setActionErr(getErrMsg(e, 'Reject gagal'));
    } finally {
      setActionLoading(false);
    }
  }

  async function uploadDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !docFile) return;
    setDocUploading(true);
    setDocErr('');
    try {
      const form = new FormData();
      form.append('file', docFile);
      form.append('doc_type', docType);
      await apiUpload(`/applications/${id}/documents/upload`, form);
      setDocFile(null);
      setDocInputKey((k) => k + 1);
      await load();
    } catch (e: unknown) {
      setDocErr(getErrMsg(e, 'Upload dokumen gagal'));
    } finally {
      setDocUploading(false);
    }
  }

  async function viewDocument(docId: number | string) {
    if (!id) return;
    setDocErr('');
    // Open a placeholder tab synchronously so it isn't blocked as a popup
    // once we navigate it after the async signed-URL fetch resolves.
    const win = window.open('', '_blank');
    if (win) win.opener = null;
    try {
      const resp = await apiFetch<{ signed_url?: string; expires_in?: number }>(
        `/applications/${id}/documents/${docId}/url`
      );
      if (resp?.signed_url) {
        if (win) win.location.href = resp.signed_url;
        else window.open(resp.signed_url, '_blank', 'noopener,noreferrer');
      } else {
        win?.close();
        setDocErr('URL dokumen tidak tersedia');
      }
    } catch (e: unknown) {
      win?.close();
      setDocErr(getErrMsg(e, 'Gagal membuka dokumen'));
    }
  }

  async function deleteDocument(docId: number | string) {
    if (!id) return;
    setDocErr('');
    try {
      await apiFetch(`/applications/${id}/documents/${docId}`, { method: 'DELETE' });
      await load();
    } catch (e: unknown) {
      setDocErr(getErrMsg(e, 'Hapus dokumen gagal'));
    }
  }

  async function addParty(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setPartyLoading(true);
    setPartyErr('');
    try {
      await apiFetch(`/applications/${id}/parties`, {
        method: 'POST',
        body: {
          role: partyRole,
          full_name: partyName,
          identity_type: partyIdType,
          identity_number: partyIdNumber,
          dob: partyDob || null,
          nationality: partyNat || null,
          phone: partyPhone || null,
          email: partyEmail || null,
        },
      });
      setPartyName('');
      setPartyIdNumber('');
      setPartyDob('');
      setPartyPhone('');
      setPartyEmail('');
      setPartyOpen(false);
      await load();
    } catch (e: unknown) {
      setPartyErr(getErrMsg(e, 'Tambah pihak gagal'));
    } finally {
      setPartyLoading(false);
    }
  }

  async function deleteParty(partyId: number | string) {
    if (!id) return;
    setPartyErr('');
    try {
      await apiFetch(`/applications/${id}/parties/${partyId}`, { method: 'DELETE' });
      await load();
    } catch (e: unknown) {
      setPartyErr(getErrMsg(e, 'Hapus pihak gagal'));
    }
  }

  if (loading) return <p className="p-6 text-sm text-slate-500">Memuat…</p>;
  if (err) return <p className="p-6 text-sm text-red-600">{err}</p>;
  if (!app) return <p className="p-6 text-sm text-slate-500">Data tidak ditemukan.</p>;

  const canSubmit = app.status === 'DRAFT';
  const canDecide = app.status === 'SUBMITTED' || app.status === 'IN_REVIEW';
  const displayName = app.type === 'INDIVIDUAL' ? person?.full_name : business?.legal_name;

  const isHighRisk = risk?.risk_level === 'HIGH' || app.edd_required === true;
  const eddRequired = app.edd_required ?? false;
  const eddCompleted = app.edd_completed ?? false;
  const approveBlocked = eddRequired && !eddCompleted;

  const canEditEdd = ['SystemAdmin', 'ComplianceLead'].includes(userRole ?? '');
  const canViewEdd = ['SystemAdmin', 'ComplianceLead', 'Auditor'].includes(userRole ?? '');
  const showEddSection = isHighRisk || eddRequired || Object.keys(eddData).length > 0;

  return (
    <div className="space-y-5 p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{displayName || `Application #${app.id ?? id}`}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[app.status] ?? 'bg-slate-100 text-slate-700'}`}>
              {{ DRAFT: 'Draft', SUBMITTED: 'Diajukan', IN_REVIEW: 'Dalam Review', APPROVED: 'Disetujui', REJECTED: 'Ditolak' }[app.status] ?? app.status}
            </span>
            <span className="text-xs text-slate-500">{{ INDIVIDUAL: 'Individu', BUSINESS: 'Perusahaan' }[app.type] ?? app.type}</span>
            {risk?.risk_level && (
              <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                risk.risk_level === 'HIGH' ? 'bg-red-100 text-red-700' :
                risk.risk_level === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
                'bg-emerald-100 text-emerald-700'
              }`}>
                Risiko: {risk.risk_level}{risk.risk_score != null ? ` (${risk.risk_score})` : ''}
              </span>
            )}
          </div>
        </div>
        <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-700 underline transition-colors">
          Kembali
        </button>
      </div>

      {/* HIGH RISK / EDD banner */}
      {isHighRisk && !eddCompleted && (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-semibold">Application ini tergolong HIGH RISK dan memerlukan Enhanced Due Diligence (EDD) sebelum dapat disetujui.</p>
        </div>
      )}
      {eddCompleted && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          EDD lengkap
        </div>
      )}

      {/* Action feedback */}
      {actionMsg && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{actionMsg}</div>
      )}
      {actionErr && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{actionErr}</div>
      )}

      {/* Action buttons */}
      <div className="rounded-xl border p-4 space-y-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Tindakan</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runPrecheck}
            disabled={actionLoading}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            Pra-Pemeriksaan
          </button>

          {canSubmit && (
            <button
              onClick={submit}
              disabled={actionLoading}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Ajukan
            </button>
          )}

          {canDecide && (
            <>
              <div className="flex flex-col gap-1">
                <button
                  onClick={approve}
                  disabled={actionLoading || approveBlocked}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Setujui
                </button>
                {approveBlocked && (
                  <p className="text-xs text-amber-700">Approve hanya bisa dilakukan setelah EDD selesai.</p>
                )}
              </div>
              <button
                onClick={() => { setShowRejectInput(true); setActionErr(''); }}
                disabled={actionLoading}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
              >
                Tolak…
              </button>
            </>
          )}
        </div>

        {/* Reject reason input */}
        {showRejectInput && (
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs text-slate-500">Alasan penolakan *</label>
              <input
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Tuliskan alasan penolakan..."
              />
            </div>
            <button
              onClick={reject}
              disabled={actionLoading}
              className="rounded-md bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
            >
              Konfirmasi Penolakan
            </button>
            <button
              onClick={() => { setShowRejectInput(false); setRejectReason(''); setActionErr(''); }}
              className="rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
            >
              Batal
            </button>
          </div>
        )}

        {/* Approved application notice */}
        {app.status === 'APPROVED' && (
          <div className="rounded-md p-3 text-sm bg-emerald-50 text-emerald-800">
            <p className="font-medium">Aplikasi telah disetujui.</p>
          </div>
        )}

        {/* Precheck result */}
        {precheck && app.status !== 'APPROVED' && (
          <div className={`rounded-md p-3 text-sm ${precheck.ready === false ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
            {precheck.ready === false ? (
              <>
                <p className="font-medium">Belum siap untuk submit:</p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {(precheck.missing ?? []).map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </>
            ) : (
              <p className="font-medium">Siap untuk submit.</p>
            )}
          </div>
        )}
      </div>

      {/* Detail info */}
      {app.type === 'INDIVIDUAL' ? (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Informasi Individu</p>
          <Row label="Nama Lengkap" value={person?.full_name} />
          <Row label="Email" value={person?.email} />
          <Row label="Telepon" value={person?.phone} />
          <Row label="Tempat / Tgl Lahir" value={[person?.pob, person?.dob].filter(Boolean).join(', ')} />
          <Row label="Kewarganegaraan" value={person?.nationality} />
          <Row label="Jenis Identitas" value={person?.identity_type} />
          <Row label="Nomor Identitas" value={person?.identity_number} />
          <Row label="Alamat KTP" value={person?.address_identity} />
          <Row label="Alamat Domisili" value={person?.address_residential} />
          <Row label="Pekerjaan" value={person?.occupation} />
          <Row label="Gender" value={person?.gender} />
          <Row label="CIF Pengguna Jasa" value={formatCif(person?.cif_no)} />
          <Row label="Parameter CIF" value={getCifRelationshipLabel(person?.cif_relationship_type)} />
        </div>
      ) : (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Informasi Perusahaan</p>
          <Row label="Nama Legal" value={business?.legal_name} />
          <Row label="Nama Dagang" value={business?.trade_name} />
          <Row label="Bentuk Badan" value={business?.legal_form} />
          <Row label="Tempat Pendirian" value={business?.incorporation_place} />
          <Row label="Tanggal Pendirian" value={business?.incorporation_date} />
          <Row label="NIB" value={business?.nib} />
          <Row label="NPWP" value={business?.npwp} />
          <Row label="KBLI" value={business?.industry_code} />
          <Row label="Bidang Usaha" value={business?.business_activity} />
          <Row label="Alamat" value={business?.address_line} />
          <Row label="Kota" value={business?.city} />
          <Row label="Provinsi" value={business?.province} />
          <Row label="Kode Pos" value={business?.postal_code} />
          <Row label="Telepon" value={business?.phone} />
          <Row label="CIF Badan Hukum" value={formatCif(business?.cif_no)} />
        </div>
      )}

      {/* Risk Assessment */}
      {risk ? (
        <div className="rounded-xl border p-4 space-y-4">
          {/* Summary row */}
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Risk Assessment</p>
            </div>
            <div className="flex items-center gap-3 ml-auto">
              {risk.risk_level && (
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${
                  risk.risk_level === 'HIGH' || risk.risk_level === 'PROHIBITED'
                    ? 'bg-red-100 text-red-700'
                    : risk.risk_level === 'MEDIUM'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {risk.risk_level}
                </span>
              )}
              {risk.risk_score != null && (
                <span className="text-sm font-medium text-slate-700">
                  Score: {risk.risk_score}
                </span>
              )}
              {risk.override_level && (
                <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                  Override: {risk.override_level}
                </span>
              )}
            </div>
          </div>

          {/* Risk Factors */}
          {(risk.risk_factors?.length ?? 0) > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="pb-2 pr-3">Faktor</th>
                    <th className="pb-2 pr-3">Skor</th>
                    <th className="pb-2 pr-3">Tingkat</th>
                    <th className="pb-2 pr-3">Sumber</th>
                    <th className="pb-2">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {(risk.risk_factors ?? []).map((f, i) => {
                    const sevCls =
                      f.severity === 'CRITICAL' ? 'bg-red-200 text-red-800' :
                      f.severity === 'HIGH'     ? 'bg-red-100 text-red-700' :
                      f.severity === 'MEDIUM'   ? 'bg-amber-100 text-amber-700' :
                      f.severity === 'LOW'      ? 'bg-emerald-100 text-emerald-700' :
                                                  'bg-slate-100 text-slate-600';
                    return (
                      <tr key={f.code ?? i} className="border-b last:border-0 align-top">
                        <td className="py-2 pr-3">
                          <div className="font-medium text-slate-800">{getRiskFactorLabel(f.code, f.label)}</div>
                          {f.code && (
                            <div className="text-xs text-slate-400 font-mono">{f.code}</div>
                          )}
                          {f.metadata?.matched && (
                            <div className="text-xs text-slate-500 mt-0.5">
                              Teridentifikasi: {Array.isArray(f.metadata.matched) ? f.metadata.matched.join(', ') : f.metadata.matched}
                            </div>
                          )}
                        </td>
                        <td className="py-2 pr-3 font-medium text-slate-700">
                          {f.score != null ? f.score : '—'}
                        </td>
                        <td className="py-2 pr-3">
                          {f.severity ? (
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${sevCls}`}>
                              {f.severity}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-slate-600 capitalize">
                          {f.source ?? '—'}
                        </td>
                        <td className="py-2 text-slate-600 text-xs max-w-xs">
                          {f.details ?? '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Belum ada faktor risiko tercatat.</p>
          )}
        </div>
      ) : app.status === 'DRAFT' ? (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Risk Assessment</p>
          <p className="text-sm text-slate-500">
            Risk belum dihitung. Submit application untuk menjalankan screening dan risk scoring.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Risk Assessment</p>
          <p className="text-sm text-slate-400">Risk belum tersedia.</p>
        </div>
      )}

      {/* Documents */}
      <div className="rounded-xl border p-4 space-y-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Dokumen</p>

        {docErr && (
          <div className="rounded-md bg-red-50 p-2.5 text-sm text-red-700">{docErr}</div>
        )}

        {docs.length === 0 ? (
          <p className="text-sm text-slate-400">Belum ada dokumen.</p>
        ) : (
          <ul className="space-y-1.5">
            {docs.map((d) => {
              const filename = d.extracted_json?.original_name ?? d.original_name;
              // Documents are not separately reviewed — the label only reflects
              // whether the file was successfully uploaded.
              const uploaded = !!(d.file_uri ?? d.file_url);
              const statusLabel =
                d.status === 'UPLOADED' ? 'Berhasil Terupload' :
                d.status === 'FAILED' ? 'Gagal Upload' :
                d.status === 'REJECTED' ? 'Perlu Upload Ulang' :
                d.status === 'APPROVED' ? 'Berhasil Terupload' :
                d.status === 'PENDING' ? (uploaded ? 'Berhasil Terupload' : 'Belum Terupload') :
                d.status ? d.status :
                (uploaded ? 'Berhasil Terupload' : 'Belum Terupload');
              const failedLike = d.status === 'FAILED' || d.status === 'REJECTED';
              const uploadedLike =
                d.status === 'UPLOADED' || d.status === 'APPROVED' ||
                (d.status === 'PENDING' && uploaded) ||
                (!d.status && uploaded);
              const statusCls =
                uploadedLike ? 'bg-emerald-100 text-emerald-700' :
                failedLike ? 'bg-red-100 text-red-700' :
                'bg-slate-100 text-slate-600';
              return (
                <li key={String(d.id)} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-slate-700">{d.doc_type}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCls}`}>
                    {statusLabel}
                  </span>
                  {filename && <span className="text-slate-500">— {filename}</span>}
                  <button
                    type="button"
                    onClick={() => viewDocument(d.id)}
                    className="text-kesh-700 underline text-xs hover:text-kesh-600"
                  >
                    Lihat
                  </button>
                  {canSubmit && (
                    <button
                      onClick={() => deleteDocument(d.id)}
                      className="ml-auto text-xs text-red-600 hover:underline"
                    >
                      Hapus
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Upload form — DRAFT only */}
        {canSubmit && (
          <form onSubmit={uploadDocument} className="border-t pt-3 space-y-2">
            <p className="text-xs font-medium text-slate-600">Upload Dokumen Baru</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Tipe</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="rounded-md border bg-white px-2 py-1.5 text-sm"
                >
                  {(app.type === 'INDIVIDUAL'
                    ? ['KTP', 'SIM', 'PASPOR', 'SIGNATURE']
                    : ['AKTA_PENDIRIAN', 'NIB_SIUP', 'NPWP_BADAN', 'KTP_KUASA']
                  ).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">File *</label>
                <input
                  key={docInputKey}
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  required
                  onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                  className="text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={docUploading || !docFile}
                className="rounded-md bg-kesh-700 px-3 py-1.5 text-sm text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
              >
                {docUploading ? 'Mengunggah…' : 'Unggah'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Parties (Business only) */}
      {app.type === 'BUSINESS' && (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Pihak Terkait</p>
            {canSubmit && (
              <button
                type="button"
                onClick={() => setPartyOpen((v) => !v)}
                className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50"
              >
                {partyOpen ? 'Batal' : '+ Tambah Pihak'}
              </button>
            )}
          </div>

          {partyErr && (
            <div className="rounded-md bg-red-50 p-2.5 text-sm text-red-700">{partyErr}</div>
          )}

          {/* Add party form — DRAFT only */}
          {canSubmit && partyOpen && (
            <form onSubmit={addParty} className="rounded-lg border bg-slate-50 p-3 space-y-3">
              <p className="text-xs font-semibold text-slate-700">Tambah Pihak Terkait</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Role *</label>
                  <select
                    value={partyRole}
                    onChange={(e) => setPartyRole(e.target.value)}
                    className="rounded-md border bg-white px-2 py-1.5 text-sm"
                  >
                    {['DIRECTOR', 'COMMISSIONER', 'MANAGER', 'BO', 'AUTHORIZED_REP'].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Nama Lengkap *</label>
                  <input
                    required
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Jenis Identitas</label>
                  <select
                    value={partyIdType}
                    onChange={(e) => setPartyIdType(e.target.value)}
                    className="rounded-md border bg-white px-2 py-1.5 text-sm"
                  >
                    {['KTP', 'SIM', 'PASPOR', 'LAINNYA'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Nomor Identitas</label>
                  <input
                    value={partyIdNumber}
                    onChange={(e) => setPartyIdNumber(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={partyDob}
                    onChange={(e) => setPartyDob(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Kewarganegaraan</label>
                  <input
                    value={partyNat}
                    onChange={(e) => setPartyNat(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Telepon</label>
                  <input
                    value={partyPhone}
                    onChange={(e) => setPartyPhone(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Email</label>
                  <input
                    type="email"
                    value={partyEmail}
                    onChange={(e) => setPartyEmail(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPartyOpen(false)}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={partyLoading}
                  className="rounded-md bg-kesh-700 px-3 py-1.5 text-sm text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
                >
                  {partyLoading ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </form>
          )}

          {parties.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada pihak terkait.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-1 pr-4">Nama</th>
                    <th className="py-1 pr-4">Role</th>
                    <th className="py-1 pr-4">Identitas</th>
                    <th className="py-1 pr-4">Kewarganegaraan</th>
                    <th className="py-1 pr-4">CIF</th>
                    <th className="py-1">Parameter CIF</th>
                    {canSubmit && <th className="py-1" />}
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p) => (
                    <tr key={String(p.id)} className="border-b last:border-0">
                      <td className="py-1.5 pr-4 font-medium">{p.full_name}</td>
                      <td className="py-1.5 pr-4">{p.role}</td>
                      <td className="py-1.5 pr-4 text-slate-600">
                        {p.identity_type && p.identity_number
                          ? `${p.identity_type}: ${p.identity_number}`
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-4">{p.nationality || '—'}</td>
                      <td className="py-1.5 pr-4 text-slate-600">{formatCif(p.cif_no)}</td>
                      <td className="py-1.5">{getCifRelationshipLabel(p.cif_relationship_type)}</td>
                      {canSubmit && (
                        <td className="py-1.5 text-right">
                          <button
                            onClick={() => deleteParty(p.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Hapus
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* EDD — Enhanced Due Diligence */}
      {showEddSection && canViewEdd && (
        <div className="rounded-xl border border-red-200 bg-red-50/30 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Enhanced Due Diligence (EDD)</p>
              {eddCompleted && (
                <span className="mt-1 inline-block rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">EDD Lengkap</span>
              )}
            </div>
            {!canEditEdd && (
              <span className="text-xs text-slate-500 italic">Hanya dapat dilihat</span>
            )}
          </div>

          {eddSaveMsg && (
            <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{eddSaveMsg}</div>
          )}

          <EddForm
            initialData={{ ...DEFAULT_EDD, ...eddData }}
            canEdit={canEditEdd}
            eddCompleted={eddCompleted}
            saving={eddSaving}
            saveError={eddSaveError}
            onSaveDraft={(data) => saveEdd(data, false)}
            onComplete={(data) => saveEdd(data, true)}
          />
        </div>
      )}

      {/* Screening */}
      {app.status === 'DRAFT' ? (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Screening</p>
          <p className="text-sm text-slate-500">
            Screening belum dijalankan. Submit aplikasi terlebih dahulu.
          </p>
        </div>
      ) : screening ? (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Screening</p>
          {screening.status && (
            <p className="text-sm">
              <span className="font-medium">Status:</span> {{ DRAFT: 'Draft', SUBMITTED: 'Diajukan', IN_REVIEW: 'Dalam Review', APPROVED: 'Disetujui', REJECTED: 'Ditolak', CLEAN: 'Bersih', HIT: 'Terdeteksi' }[screening.status ?? ''] ?? screening.status}
            </p>
          )}
          {screening.checked_at && (
            <p className="text-xs text-slate-500">
              Diperiksa: {new Date(screening.checked_at).toLocaleString('id-ID')}
            </p>
          )}
          {Array.isArray(screening.matches) && screening.matches.length > 0 ? (
            <div className="mt-2">
              <p className="text-sm font-medium text-red-700 mb-1">
                Match ditemukan ({screening.matches.length}):
              </p>
              <ul className="space-y-1">
                {screening.matches.map((m, i) => (
                  <li key={i} className="text-sm text-red-600">
                    {m.name} — {m.list_type}
                    {m.match_score != null ? ` (score: ${m.match_score})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-emerald-700">Tidak ada match pada watchlist.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
