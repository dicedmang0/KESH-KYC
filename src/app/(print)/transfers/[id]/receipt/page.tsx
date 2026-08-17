'use client';

// Printable transfer receipt. Lives in the (print) route group: same URL space
// as /transfers/:id, but outside the (protected) layout, so no sidebar/topbar
// is rendered here at all.
//
// 80mm stock: labels below must stay within 18 characters (see ReceiptRow),
// or they wrap into the value column.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatCif } from '@/lib/utils';
import {
  getTransfer,
  transferReference,
  formatTransferAmount,
  formatDateTime,
  type TransferDetail,
} from '@/lib/transfers';
import { transferStatusLabel, transferResultLabel } from '@/components/transfer-badges';
import ReceiptLayout, {
  ReceiptRow,
  ReceiptSection,
  ReceiptSignatures,
} from '@/components/print/receipt-layout';

const FOOTER_NOTE =
  'Bukti ini diterbitkan oleh PT Radhana Solusi Indonesia / KESH. ' +
  'Simpan bukti ini sebagai referensi transaksi.';

/** Absent dates fall through to ReceiptRow's own placeholder. */
const dt = (v?: string | null) => (v ? formatDateTime(v) : null);

export default function TransferReceiptPage() {
  const params = useParams();
  const id = params?.id as string;

  const [row, setRow] = useState<TransferDetail | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const data = await getTransfer(id);
        if (alive) setRow(data);
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : 'Gagal memuat detail transfer');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-neutral-500">Memuat resi…</div>;
  if (err) {
    return (
      <div className="m-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        {err}
      </div>
    );
  }
  if (!row) return null;

  return (
    <ReceiptLayout
      title="Bukti Transaksi Transfer"
      documentLabel="Nomor Referensi Transaksi"
      documentNo={transferReference(row)}
      backHref={`/transfers/${id}`}
      footerNote={FOOTER_NOTE}
    >
      <ReceiptSection title="Transaksi">
        <ReceiptRow label="No. Ref Transaksi" value={transferReference(row)} />
        <ReceiptRow label="Tanggal Transaksi" value={dt(row.transaction_date ?? row.created_at)} />
        <ReceiptRow label="Selesai Pada" value={dt(row.completed_at)} />
        <ReceiptRow label="Status" value={transferStatusLabel(row.status)} />
        <ReceiptRow label="Hasil" value={transferResultLabel(row.result)} />
        <ReceiptRow label="Nominal" value={formatTransferAmount(row)} />
        <ReceiptRow label="Metode Transfer" value={row.transfer_method} />
        <ReceiptRow label="Kanal Transfer" value={row.transfer_channel} />
      </ReceiptSection>

      <ReceiptSection title="Pengirim">
        <ReceiptRow label="Nama Pengirim" value={row.sender_name} />
        <ReceiptRow label="CIF Pengirim" value={row.sender_cif_no ? formatCif(row.sender_cif_no) : null} />
        <ReceiptRow label="Tipe Pengirim" value={row.sender_type} />
        <ReceiptRow label="Sumber Dana" value={row.source_of_funds} />
        <ReceiptRow label="Tujuan Transaksi" value={row.transaction_purpose} />
      </ReceiptSection>

      <ReceiptSection title="Penerima">
        <ReceiptRow label="Nama Penerima" value={row.beneficiary_account_name} />
        <ReceiptRow label="Nomor Rekening" value={row.beneficiary_account_number} />
        <ReceiptRow label="Bank" value={row.beneficiary_bank_name} />
        <ReceiptRow label="Kode Bank" value={row.beneficiary_bank_code} />
        <ReceiptRow label="Hub. dgn Pengirim" value={row.beneficiary_relationship_to_sender} />
      </ReceiptSection>

      {/* Nama petugas, bukan ID numerik internal. */}
      <ReceiptSection title="Petugas">
        <ReceiptRow label="Dibuat Oleh" value={row.created_by_name} />
        <ReceiptRow label="Diajukan Oleh" value={row.submitted_by_name} />
        <ReceiptRow label="Direview Finance" value={row.finance_reviewed_by_name} />
        <ReceiptRow label="Disetujui Oleh" value={row.approved_by_name} />
      </ReceiptSection>

      <ReceiptSignatures left="Petugas KESH" right="Nasabah/Pengirim" />
    </ReceiptLayout>
  );
}
