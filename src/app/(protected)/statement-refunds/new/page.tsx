'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { toast } from '@/lib/toast';
import {
  createStatementRefund,
  canCreateStatementRefund,
  type CreateStatementRefundPayload,
} from '@/lib/statement-refunds';

function clean(v: string): string | undefined {
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

export default function NewStatementRefundPage() {
  const router = useRouter();
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const [complaintNo, setComplaintNo] = useState('');
  const [transferRefNo, setTransferRefNo] = useState('');
  const [statementDate, setStatementDate] = useState('');
  const [receivedAt, setReceivedAt] = useState('');
  const [amount, setAmount] = useState('');
  const [currency] = useState('IDR');
  const [bankAccountNo, setBankAccountNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankRefNo, setBankRefNo] = useState('');
  const [description, setDescription] = useState('');
  const [investigationNotes, setInvestigationNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');

  if (!canCreateStatementRefund(role)) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        <div className="flex items-center gap-2 font-medium">
          <ShieldOff className="h-4 w-4 shrink-0" />
          Akses ditolak
        </div>
        <p className="mt-1">
          Pencatatan refund hanya dapat dibuat oleh Finance Staff. Finance Manager berperan sebagai
          approver, bukan pembuat catatan.
        </p>
      </div>
    );
  }

  const amountNum = Number(amount);
  const amountValid = amount.trim() !== '' && !Number.isNaN(amountNum) && amountNum > 0;
  const formValid = !!statementDate && !!receivedAt && amountValid;

  async function submit() {
    if (!formValid || submitting) return;
    setSubmitting(true);
    setErr('');
    try {
      const payload: CreateStatementRefundPayload = {
        statement_date: statementDate,
        // datetime-local tidak membawa zona waktu — normalkan ke ISO absolut
        received_at: new Date(receivedAt).toISOString(),
        amount: amountNum,
        currency,
        complaint_no: clean(complaintNo),
        original_transfer_reference_no: clean(transferRefNo),
        bank_account_no: clean(bankAccountNo),
        bank_name: clean(bankName),
        bank_reference_no: clean(bankRefNo),
        statement_description: clean(description),
        investigation_notes: clean(investigationNotes),
      };
      const created = await createStatementRefund(payload);
      toast.success(`Refund ${created.refund_no} berhasil dicatat.`);
      router.push(created.id ? `/statement-refunds/${created.id}` : '/statement-refunds');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal menyimpan pencatatan refund.';
      // Backend menolak mutasi bank kembar dengan 409 — tampilkan apa adanya.
      setErr(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <button
          onClick={() => router.push('/statement-refunds')}
          className="text-sm text-kesh-700 hover:underline"
        >
          ← Pencatatan Refund
        </button>
        <h1 className="mt-1 text-xl font-semibold">Catat Refund Statement</h1>
        <p className="text-sm text-slate-500">
          Catat dana refund/return yang masuk di rekening koran KESH. Pencatatan ini belum
          mengkreditkan saldo partner — kredit saldo menunggu approval Finance Manager.
        </p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 break-words">
          {err}
        </div>
      )}

      <div className="rounded-2xl border p-4 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data Mutasi</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-slate-500">
              Tanggal Statement <span className="text-red-600">*</span>
            </label>
            <input
              type="date"
              value={statementDate}
              onChange={(e) => setStatementDate(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">
              Tanggal &amp; Jam Dana Masuk <span className="text-red-600">*</span>
            </label>
            <input
              type="datetime-local"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">
              Nominal <span className="text-red-600">*</span>
            </label>
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100000"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
            />
            {amount.trim() !== '' && !amountValid && (
              <p className="mt-1 text-xs text-red-600">Nominal harus lebih besar dari 0.</p>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-500">Mata Uang</label>
            <input
              value={currency}
              disabled
              className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Nama Bank</label>
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Bank KESH"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">No. Rekening</label>
            <input
              value={bankAccountNo}
              onChange={(e) => setBankAccountNo(e.target.value)}
              placeholder="1234567890"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-500">No. Referensi Bank</label>
            <input
              value={bankRefNo}
              onChange={(e) => setBankRefNo(e.target.value)}
              placeholder="Referensi mutasi dari rekening koran"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
            />
            <p className="mt-1 text-xs text-slate-400">
              Mutasi dengan rekening, referensi, nominal, dan waktu yang sama akan ditolak sebagai duplikat.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-500">Deskripsi Statement</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Keterangan mutasi pada rekening koran…"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border p-4 space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Keterkaitan (Opsional)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="original-transfer-reference-no" className="text-xs text-slate-500">
              Nomor Referensi Transaksi Awal
            </label>
            <input
              id="original-transfer-reference-no"
              value={transferRefNo}
              onChange={(e) => setTransferRefNo(e.target.value)}
              placeholder="TRF-A8K3P9Q2"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:border-kesh-700"
            />
            <p className="mt-1 text-xs text-slate-400">
              Gunakan nomor referensi yang tampil pada detail transfer, contoh: TRF-A8K3P9Q2.
              Referensi lama yang panjang (KESH-TRF-…) tetap diterima.
              Boleh dikosongkan — refund dapat dicocokkan belakangan lewat aksi Match.
            </p>
          </div>
          <div>
            <label htmlFor="complaint-no" className="text-xs text-slate-500">
              Nomor Pengaduan
            </label>
            <input
              id="complaint-no"
              value={complaintNo}
              onChange={(e) => setComplaintNo(e.target.value)}
              placeholder="CMP-M4X7B2D9"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:border-kesh-700"
            />
            <p className="mt-1 text-xs text-slate-400">
              Gunakan nomor pengaduan yang tampil pada detail pengaduan.
              Menautkan pengaduan tidak menutup pengaduan tersebut.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-500">Catatan Investigasi</label>
            <textarea
              rows={3}
              value={investigationNotes}
              onChange={(e) => setInvestigationNotes(e.target.value)}
              placeholder="Wajib diisi jika nominal refund berbeda dengan transaksi asal…"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={submit}
          disabled={submitting || !formValid}
          className="rounded-lg bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-60"
        >
          {submitting ? 'Menyimpan…' : 'Simpan Pencatatan Refund'}
        </button>
        <button
          onClick={() => router.push('/statement-refunds')}
          className="rounded-lg border px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Batal
        </button>
      </div>
    </div>
  );
}
