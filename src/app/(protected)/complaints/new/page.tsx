'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { formatCif } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { formatMonitoringAmount, formatDateTime } from '@/lib/monitoring';
import { SearchableDropdown } from '@/components/SearchableDropdown';
import {
  searchComplaintCustomers,
  searchComplaintTransactions,
  createComplaint,
  canCreateComplaint,
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_CHANNEL_LABELS,
  COMPLAINT_PRIORITY_LABELS,
  type ComplaintCategory,
  type ComplaintChannel,
  type ComplaintPriority,
  type ComplaintCustomerSearchItem,
  type ComplaintTransactionSearchItem,
} from '@/lib/complaints';

function clean(v: string): string | undefined {
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

export default function NewComplaintPage() {
  const router = useRouter();
  const { token } = useAuth();
  const role = getRoleFromToken(token);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  // ── Customer combobox ─────────────────────────────────────────────────────
  const [customerQuery, setCustomerQuery]     = useState('');
  const [customerOptions, setCustomerOptions] = useState<ComplaintCustomerSearchItem[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<ComplaintCustomerSearchItem | null>(null);
  const customerSeq   = useRef(0);
  const customerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Transaction combobox ──────────────────────────────────────────────────
  const [txMode, setTxMode]           = useState<'search' | 'manual'>('search');
  const [txQuery, setTxQuery]         = useState('');
  const [txOptions, setTxOptions]     = useState<ComplaintTransactionSearchItem[]>([]);
  const [txLoading, setTxLoading]     = useState(false);
  const [selectedTx, setSelectedTx]   = useState<ComplaintTransactionSearchItem | null>(null);
  const [transactionRef, setTransactionRef] = useState('');
  const txSeq   = useRef(0);
  const txTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Form enum fields ──────────────────────────────────────────────────────
  const [category, setCategory] = useState<ComplaintCategory>('TRANSFER');
  const [channel, setChannel]   = useState<ComplaintChannel>('WALK_IN');
  const [priority, setPriority] = useState<ComplaintPriority>('MEDIUM');
  const [complaintNotes, setComplaintNotes] = useState('');

  // ── Customer search ───────────────────────────────────────────────────────

  function doCustomerSearch(q: string) {
    const seq = ++customerSeq.current;
    setCustomerLoading(true);
    searchComplaintCustomers(q)
      .then((list) => {
        if (seq !== customerSeq.current) return;
        setCustomerOptions(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (seq !== customerSeq.current) return;
        toast.error('Gagal memuat data customer. Silakan coba lagi.');
        setCustomerOptions([]);
      })
      .finally(() => { if (seq === customerSeq.current) setCustomerLoading(false); });
  }

  function scheduleCustomerSearch(q: string) {
    if (customerTimer.current) clearTimeout(customerTimer.current);
    customerTimer.current = setTimeout(() => doCustomerSearch(q), 300);
  }

  function resetTransaction() {
    txSeq.current++;               // cancel any in-flight tx search
    if (txTimer.current) clearTimeout(txTimer.current);
    setSelectedTx(null);
    setTxQuery('');
    setTxOptions([]);
    setTxLoading(false);
    setTransactionRef('');
    setTxMode('search');
  }

  function onCustomerQueryChange(v: string) {
    setCustomerQuery(v);
    if (selectedCustomer) {
      setSelectedCustomer(null);
      resetTransaction();
    }
    scheduleCustomerSearch(v);
  }

  function onCustomerOpen() {
    scheduleCustomerSearch(customerQuery);
  }

  function onCustomerSelect(key: string) {
    const c = customerOptions.find((x) => String(x.application_id) === key);
    if (!c) return;
    setSelectedCustomer(c);
    setCustomerQuery(c.display_name ?? `Customer #${c.application_id}`);
    resetTransaction();
  }

  function onCustomerClear() {
    setSelectedCustomer(null);
    setCustomerQuery('');
    setCustomerOptions([]);
    resetTransaction();
  }

  // ── Transaction search ────────────────────────────────────────────────────

  function doTxSearch(customerId: number | string, q: string) {
    const seq = ++txSeq.current;
    setTxLoading(true);
    searchComplaintTransactions(customerId, q)
      .then((list) => {
        if (seq !== txSeq.current) return;
        setTxOptions(Array.isArray(list) ? list : []);
      })
      .catch(() => { if (seq === txSeq.current) setTxOptions([]); })
      .finally(() => { if (seq === txSeq.current) setTxLoading(false); });
  }

  function scheduleTxSearch(customerId: number | string, q: string) {
    if (txTimer.current) clearTimeout(txTimer.current);
    txTimer.current = setTimeout(() => doTxSearch(customerId, q), 300);
  }

  function onTxQueryChange(v: string) {
    setTxQuery(v);
    if (selectedCustomer) scheduleTxSearch(selectedCustomer.application_id, v);
  }

  function onTxOpen() {
    if (selectedCustomer) scheduleTxSearch(selectedCustomer.application_id, txQuery);
  }

  function onTxSelect(key: string) {
    const tx = txOptions.find((x) => String(x.transfer_id) === key);
    if (!tx) return;
    setSelectedTx(tx);
    setTransactionRef(tx.transaction_reference ?? '');
  }

  function onTxClear() {
    resetTransaction();
  }

  // ── Validation ────────────────────────────────────────────────────────────
  const notesError =
    complaintNotes.trim().length > 0 && complaintNotes.trim().length < 10
      ? 'Catatan keluhan minimal 10 karakter.'
      : '';

  const formValid = !!selectedCustomer && complaintNotes.trim().length >= 10;

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    if (!selectedCustomer) {
      setErr('Silakan pilih customer dari hasil pencarian.');
      return;
    }
    if (complaintNotes.trim().length < 10) {
      setErr('Catatan keluhan minimal 10 karakter.');
      return;
    }
    setSubmitting(true);
    setErr('');
    try {
      const created = await createComplaint({
        customer_application_id: selectedCustomer.application_id,
        transfer_id: selectedTx ? Number(selectedTx.transfer_id) : undefined,
        transaction_reference: clean(transactionRef),
        category,
        channel,
        priority,
        complaint_notes: complaintNotes.trim(),
      });
      toast.success('Pengaduan berhasil dicatat.');
      router.push(created.id ? `/complaints/${created.id}` : '/complaints');
    } catch (e: unknown) {
      toast.error('Gagal mencatat pengaduan. Silakan coba lagi.');
      setErr(e instanceof Error ? e.message : 'Gagal mencatat pengaduan. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Access guard ──────────────────────────────────────────────────────────
  if (token !== null && !canCreateComplaint(role)) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <ShieldOff className="h-10 w-10 text-slate-300" />
          <p className="text-base font-medium text-slate-700">Akses Ditolak</p>
          <p className="text-sm">Anda tidak memiliki izin untuk mencatat pengaduan.</p>
          <button
            onClick={() => router.push('/complaints')}
            className="mt-1 text-sm text-kesh-700 hover:underline"
          >
            Ke Pencatatan Pengaduan
          </button>
        </div>
      </div>
    );
  }

  // ── Build dropdown option arrays ──────────────────────────────────────────

  const customerDropdownOptions = customerOptions.map((c) => ({
    key: String(c.application_id),
    primary: (
      <>
        {c.display_name ?? `Customer #${c.application_id}`}
        {' '}—{' '}
        <span className="font-mono text-xs text-slate-600">{formatCif(c.cif_no)}</span>
      </>
    ),
    secondary: c.customer_type ?? undefined,
  }));

  const txDropdownOptions = txOptions.map((tx) => {
    const meta = [
      tx.status,
      tx.result,
      tx.amount != null ? formatMonitoringAmount(tx.amount, tx.currency ?? 'IDR') : null,
      tx.created_at ? formatDateTime(tx.created_at) : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      key: String(tx.transfer_id),
      primary: (
        <span className="font-mono">
          {tx.transaction_reference ?? `#${tx.transfer_id}`}
        </span>
      ),
      secondary: meta || undefined,
    };
  });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Catat Pengaduan Baru</h1>
        <p className="text-sm text-slate-500">Isi data pengaduan customer</p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="rounded-2xl border p-4 space-y-4">

        {/* A. Nama Customer Approved */}
        <div>
          <label className="text-xs text-slate-500">
            Nama Customer Approved <span className="text-red-500">*</span>
          </label>
          <div className="mt-1">
            <SearchableDropdown
              query={customerQuery}
              onChange={onCustomerQueryChange}
              onOpen={onCustomerOpen}
              options={customerDropdownOptions}
              loading={customerLoading}
              onSelect={onCustomerSelect}
              isSelected={!!selectedCustomer}
              selectedLabel={
                selectedCustomer
                  ? (selectedCustomer.display_name ?? `Customer #${selectedCustomer.application_id}`)
                  : ''
              }
              selectedMeta={
                selectedCustomer ? (
                  <>
                    <span className="font-mono">{formatCif(selectedCustomer.cif_no)}</span>
                    <span>·</span>
                    <span>{selectedCustomer.customer_type ?? '—'}</span>
                    <span>·</span>
                    <span className="text-slate-400">ID #{selectedCustomer.application_id}</span>
                  </>
                ) : undefined
              }
              onClear={onCustomerClear}
              placeholder="Cari nama atau CIF customer…"
              emptyText="Customer approved tidak ditemukan."
              loadingText="Memuat customer..."
            />
          </div>
        </div>

        {/* B. Nomor Transaksi yang Diadukan */}
        <div>
          <label className="text-xs text-slate-500">Nomor Transaksi yang Diadukan</label>

          {/* No customer yet */}
          {!selectedCustomer && (
            <input
              disabled
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-400"
              placeholder="Pilih customer terlebih dahulu"
            />
          )}

          {/* Transaction picked */}
          {selectedCustomer && selectedTx && (
            <div className="mt-1 rounded-lg border bg-slate-50 p-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-mono font-medium text-slate-800">
                  {selectedTx.transaction_reference ?? `#${selectedTx.transfer_id}`}
                </div>
                {(selectedTx.status || selectedTx.result || selectedTx.amount != null) && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    {[
                      selectedTx.status,
                      selectedTx.result,
                      selectedTx.amount != null
                        ? formatMonitoringAmount(selectedTx.amount, selectedTx.currency ?? 'IDR')
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={onTxClear}
                className="shrink-0 text-xs text-kesh-700 hover:underline"
              >
                Ganti
              </button>
            </div>
          )}

          {/* Search mode */}
          {selectedCustomer && !selectedTx && txMode === 'search' && (
            <div className="mt-1 space-y-1">
              <SearchableDropdown
                query={txQuery}
                onChange={onTxQueryChange}
                onOpen={onTxOpen}
                options={txDropdownOptions}
                loading={txLoading}
                onSelect={onTxSelect}
                placeholder="Cari nomor referensi transaksi…"
                emptyText="Transaksi tidak ditemukan."
                loadingText="Memuat transaksi..."
              />
              <button
                type="button"
                onClick={() => setTxMode('manual')}
                className="text-xs text-kesh-700 hover:underline"
              >
                Input nomor transaksi manual
              </button>
            </div>
          )}

          {/* Manual mode */}
          {selectedCustomer && !selectedTx && txMode === 'manual' && (
            <div className="mt-1 space-y-1">
              <input
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-kesh-700"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
                placeholder="Ketik nomor transaksi…"
              />
              <button
                type="button"
                onClick={() => { setTxMode('search'); setTransactionRef(''); }}
                className="text-xs text-kesh-700 hover:underline"
              >
                ← Kembali ke pencarian
              </button>
            </div>
          )}
        </div>

        {/* C. Kategori */}
        <div>
          <label className="text-xs text-slate-500">Kategori Pengaduan</label>
          <select
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
            value={category}
            onChange={(e) => setCategory(e.target.value as ComplaintCategory)}
          >
            {Object.entries(COMPLAINT_CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* D. Kanal */}
        <div>
          <label className="text-xs text-slate-500">Kanal Pengaduan</label>
          <select
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
            value={channel}
            onChange={(e) => setChannel(e.target.value as ComplaintChannel)}
          >
            {Object.entries(COMPLAINT_CHANNEL_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* E. Prioritas */}
        <div>
          <label className="text-xs text-slate-500">Prioritas</label>
          <select
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
            value={priority}
            onChange={(e) => setPriority(e.target.value as ComplaintPriority)}
          >
            {Object.entries(COMPLAINT_PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        {/* F. Catatan Keluhan */}
        <div>
          <label className="text-xs text-slate-500">
            Pencatatan Keluhan <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={5}
            className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y ${
              notesError ? 'border-red-400' : ''
            }`}
            value={complaintNotes}
            onChange={(e) => setComplaintNotes(e.target.value)}
            placeholder="Tuliskan kronologi dan detail keluhan customer."
          />
          {notesError && <p className="mt-1 text-xs text-red-600">{notesError}</p>}
          <p className="mt-1 text-xs text-slate-400">Minimal 10 karakter.</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={submit}
          disabled={submitting || !formValid}
          className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-60 transition-colors"
        >
          {submitting ? 'Menyimpan…' : 'Catat Pengaduan'}
        </button>
        <button
          type="button"
          onClick={() => router.push('/complaints')}
          className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
