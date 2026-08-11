'use client';

// Printable complaint intake receipt — see the sibling transfer receipt for why
// this lives in the (print) route group, and for the 18-character label limit
// the 80mm layout imposes.

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { formatCif } from '@/lib/utils';
import { formatDateTime } from '@/lib/monitoring';
import { formatTransferAmount } from '@/lib/transfers';
import {
  getComplaint,
  formatComplaintStatus,
  formatComplaintLevel,
  formatComplaintCategory,
  formatComplaintChannel,
  formatLevel3Risk,
  type Complaint,
} from '@/lib/complaints';
import ReceiptLayout, { ReceiptRow, ReceiptSection } from '@/components/print/receipt-layout';

const FOOTER_NOTE =
  'Pengaduan telah diterima dan akan diproses sesuai prosedur internal KESH. ' +
  'Nomor pengaduan ini dapat digunakan untuk pengecekan status.';

const dt = (v?: string | null) => (v ? formatDateTime(v) : null);

export default function ComplaintReceiptPage() {
  const params = useParams();
  const id = params?.id as string;

  const [c, setComplaint] = useState<Complaint | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      try {
        const data = await getComplaint(id);
        if (alive) setComplaint(data);
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : 'Gagal memuat data pengaduan');
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
  if (!c) return null;

  return (
    <ReceiptLayout
      title="Bukti Penerimaan Pengaduan"
      documentLabel="Nomor Pengaduan"
      documentNo={c.complaint_no}
      backHref={`/complaints/${id}`}
      footerNote={FOOTER_NOTE}
    >
      <ReceiptSection title="Pengaduan">
        <ReceiptRow label="Nomor Pengaduan" value={c.complaint_no} />
        <ReceiptRow label="Tanggal Pengaduan" value={dt(c.created_at)} />
        <ReceiptRow label="Status Pengaduan" value={formatComplaintStatus(c.status)} />
        <ReceiptRow label="Level Pengaduan" value={formatComplaintLevel(c.complaint_level)} />
        <ReceiptRow label="Jenis Pengaduan" value={formatComplaintCategory(c.category)} />
        <ReceiptRow
          label="Kategori Risiko"
          value={c.level_3_risk_category ? formatLevel3Risk(c.level_3_risk_category) : null}
        />
        <ReceiptRow label="Kanal Pengaduan" value={formatComplaintChannel(c.channel)} />
      </ReceiptSection>

      <ReceiptSection title="Customer / Pelapor">
        <ReceiptRow label="Nama Customer" value={c.customer_name} />
        <ReceiptRow label="CIF" value={c.customer_cif_no ? formatCif(c.customer_cif_no) : null} />
        <ReceiptRow label="Tipe Customer" value={c.customer_type} />
        <ReceiptRow label="Kontak" value={c.customer_contact} />
      </ReceiptSection>

      <ReceiptSection title="Transaksi Terkait">
        <ReceiptRow
          label="No. Ref Transaksi"
          value={c.transaction_partner_reference_no || c.transaction_reference}
        />
        <ReceiptRow
          label="Nominal"
          value={c.transaction_amount != null ? formatTransferAmount({ amount: c.transaction_amount }) : null}
        />
        <ReceiptRow label="Tanggal Transaksi" value={dt(c.transaction_date)} />
        <ReceiptRow label="Status Transaksi" value={c.transaction_status} />
      </ReceiptSection>

      {/* Free text runs full width — a 26-column label gutter beside it would
          wrap the description to twice the paper. */}
      <ReceiptSection title="Detail Pengaduan">
        <ReceiptRow block label="Deskripsi Pengaduan" value={c.complaint_notes} />
        <ReceiptRow block label="Catatan Awal" value={c.data_verification_notes} />
        {/* Nama petugas, bukan ID numerik internal. */}
        <ReceiptRow label="Petugas Penerima" value={c.created_by_name} />
      </ReceiptSection>
    </ReceiptLayout>
  );
}
