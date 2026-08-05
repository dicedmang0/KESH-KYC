'use client';

// Shared shell for printable receipts (/transfers/:id/receipt,
// /complaints/:id/receipt). These routes live in the (print) route group so
// they never render the app sidebar/topbar — on screen or on paper — and the
// only chrome here (Cetak / Kembali) is print:hidden.
//
// Black on white by design: receipts are handed to the customer, so no brand
// colours, no badges, no background fills that eat toner.

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function ReceiptRow({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="flex gap-3 py-1 text-sm">
      <div className="w-56 shrink-0 text-neutral-600">{label}</div>
      <div className="flex-1 font-medium break-words">{empty ? '—' : value}</div>
    </div>
  );
}

export function ReceiptSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-neutral-300 pt-3">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-700">
        {title}
      </h2>
      <div className="divide-y divide-neutral-100">{children}</div>
    </section>
  );
}

export default function ReceiptLayout({
  title,
  documentLabel,
  documentNo,
  backHref,
  footerNote,
  children,
}: {
  title: string;
  /** Label for the primary, user-facing number (never an internal id). */
  documentLabel: string;
  documentNo?: string | null;
  backHref: string;
  footerNote: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  // Rendered after mount only: a print timestamp baked at SSR time would be
  // wrong by the time anyone reads it, and would break hydration.
  const [printedAt, setPrintedAt] = useState('');
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setPrintedAt(new Date().toLocaleString('id-ID')), []);

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-6 text-neutral-900 print:p-0">
      <div className="mb-4 flex gap-2 print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600"
        >
          Cetak
        </button>
        <button
          onClick={() => router.push(backHref)}
          className="rounded-lg border px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Kembali
        </button>
      </div>

      <header className="border-b-2 border-neutral-800 pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xl font-bold tracking-wide">KESH</p>
            <p className="text-xs text-neutral-600">PT Radhana Solusi Indonesia</p>
          </div>
          <div className="text-right text-xs text-neutral-600">
            <p>Dicetak pada</p>
            <p className="font-medium text-neutral-800">{printedAt || '—'}</p>
          </div>
        </div>
        <h1 className="mt-3 text-base font-bold uppercase tracking-wide">{title}</h1>
        <p className="mt-0.5 text-sm">
          <span className="text-neutral-600">{documentLabel}: </span>
          <span className="font-mono font-semibold break-all">{documentNo || '—'}</span>
        </p>
      </header>

      <div className="mt-4 space-y-4">{children}</div>

      <p className="mt-6 border-t border-neutral-300 pt-3 text-xs text-neutral-600">
        {footerNote}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-8 text-center text-xs">
        <div>
          <p className="text-neutral-600">Petugas</p>
          <div className="mt-12 border-t border-neutral-400 pt-1">Nama &amp; Tanda Tangan</div>
        </div>
        <div>
          <p className="text-neutral-600">Customer</p>
          <div className="mt-12 border-t border-neutral-400 pt-1">Nama &amp; Tanda Tangan</div>
        </div>
      </div>

      <div className="mt-8 border-t border-dashed border-neutral-400 pt-1 text-center text-[10px] text-neutral-400">
        — — — potong di sini — — —
      </div>
    </div>
  );
}
