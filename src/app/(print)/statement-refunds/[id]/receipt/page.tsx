'use client';

// Printable refund receipt. Lives in the (print) route group — see the sibling
// transfer/complaint receipts for why, and for the 18-character label limit
// the 80mm layout imposes.
//
// Backend gates this at GET /statement-refunds/:id/receipt: 400 unless the
// refund is APPROVED (the only status actually reachable via the API today —
// see statement-refunds.service.ts getReceipt()). This page mirrors that
// error rather than re-deciding eligibility on the client.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatDateTime, formatMonitoringAmount } from '@/lib/monitoring';
import {
  getStatementRefundReceipt,
  type StatementRefundReceipt,
} from '@/lib/statement-refunds';
import ReceiptLayout, {
  ReceiptRow,
  ReceiptSection,
  ReceiptSignatures,
} from '@/components/print/receipt-layout';

const FOOTER_NOTE =
  'Bukti ini diterbitkan oleh PT Radhana Solusi Indonesia / KESH. ' +
  'Simpan bukti ini sebagai referensi refund.';

const dt = (v?: string | null) => (v ? formatDateTime(v) : null);

export default function RefundReceiptPage() {
  const params = useParams();
  const id = params?.id as string;

  const [r, setReceipt] = useState<StatementRefundReceipt | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const data = await getStatementRefundReceipt(id);
        if (alive) setReceipt(data);
      } catch (e: unknown) {
        if (alive) {
          setErr(
            e instanceof Error
              ? e.message
              : 'Gagal memuat bukti refund',
          );
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-neutral-500">Memuat bukti refund…</div>;
  if (err) {
    return (
      <div className="m-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {err}
      </div>
    );
  }
  if (!r) return null;

  return (
    <ReceiptLayout
      title="Bukti Refund"
      documentLabel="Nomor Refund"
      documentNo={r.refund_no}
      backHref={`/statement-refunds/${id}`}
      footerNote={FOOTER_NOTE}
    >
      <ReceiptSection title="Refund">
        <ReceiptRow label="Nomor Refund" value={r.refund_no} />
        <ReceiptRow label="Tanggal Refund" value={dt(r.approved_at ?? r.statement_date)} />
        <ReceiptRow label="Status" value={r.status} />
        <ReceiptRow label="Nominal Refund" value={formatMonitoringAmount(r.amount, r.currency ?? 'IDR')} />
      </ReceiptSection>

      <ReceiptSection title="Nasabah">
        <ReceiptRow label="Nama" value={r.customer_name} />
      </ReceiptSection>

      <ReceiptSection title="Transaksi Terkait">
        <ReceiptRow label="No. Ref Transaksi" value={r.original_transfer_reference_no} />
        <ReceiptRow
          label="Nominal Transaksi"
          value={
            r.original_transfer_amount != null
              ? formatMonitoringAmount(r.original_transfer_amount, r.currency ?? 'IDR')
              : null
          }
        />
        <ReceiptRow label="Nomor Pengaduan" value={r.complaint_no} />
      </ReceiptSection>

      <ReceiptSection title="Bank/Rekening Mutasi">
        <ReceiptRow label="Bank" value={r.bank_name} />
        <ReceiptRow label="No. Rekening" value={r.bank_account_no} />
      </ReceiptSection>

      <ReceiptSection title="Keterangan">
        <ReceiptRow block label="Alasan/Catatan" value={r.reason} />
        {/* Nama petugas, bukan ID numerik internal. */}
        <ReceiptRow label="Disetujui Oleh" value={r.approved_by_name} />
      </ReceiptSection>

      <ReceiptSignatures left="Petugas KESH" right="Nasabah/Penerima" />
    </ReceiptLayout>
  );
}
