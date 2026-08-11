'use client';

// Shared shell for printable receipts (/transfers/:id/receipt,
// /complaints/:id/receipt). These routes live in the (print) route group so
// they never render the app sidebar/topbar — on screen or on paper — and the
// only chrome here (Cetak / Kembali) is print:hidden.
//
// Laid out for 80mm x 210mm stock: a fixed character grid, black on white, no
// letter-spacing, no background fills. The physical sizing lives in globals.css
// under `.receipt`, where --receipt-cols is the single knob.

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

/** Characters per line. Must match --receipt-cols in globals.css. */
export const RECEIPT_COLS = 44;

/** 18 label + 2 separator + 24 value = 44. Labels must fit 18 characters. */
const LABEL_COLS = 18;

/** A horizontal rule drawn with characters, so it is exactly RECEIPT_COLS columns. */
function Rule({ char = '-' }: { char?: string }) {
  return <div aria-hidden>{char.repeat(RECEIPT_COLS)}</div>;
}

export function ReceiptRow({
  label,
  value,
  /** Long free text: label on its own line, value across all columns. */
  block,
}: {
  label: string;
  value?: React.ReactNode;
  block?: boolean;
}) {
  const empty = value === null || value === undefined || value === '';
  // A plain hyphen, not an em dash: thermal fonts do not all carry one.
  const shown = empty ? '-' : value;

  if (block) {
    return (
      <div data-receipt-row={label}>
        <div>{label}:</div>
        <div data-receipt-value className="break-words whitespace-pre-wrap">
          {shown}
        </div>
      </div>
    );
  }

  return (
    <div data-receipt-row={label} className="flex">
      <div className="shrink-0" style={{ width: `${LABEL_COLS}ch` }}>
        {label}
      </div>
      <div className="w-[2ch] shrink-0">:</div>
      <div data-receipt-value className="min-w-0 flex-1 break-words">
        {shown}
      </div>
    </div>
  );
}

export function ReceiptSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <Rule />
      <div className="font-bold uppercase">{title}</div>
      {children}
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

  // Vertical padding only. `.receipt` is a border-box sized to exactly
  // --receipt-cols characters, so horizontal padding here would come *out* of
  // the character grid and every full-width rule would then overflow it.
  return (
    <div className="receipt mx-auto py-2 print:py-0">
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

      <header className="text-center">
        <div className="font-bold">KESH</div>
        <div>PT Radhana Solusi Indonesia</div>
        <Rule char="=" />
        <h1 className="font-bold uppercase">{title}</h1>
        <div className="break-all">{documentNo || '-'}</div>
        <div>{documentLabel}</div>
        <div>Dicetak: {printedAt || '-'}</div>
      </header>

      {children}

      <Rule char="=" />
      <p className="break-words">{footerNote}</p>

      {/* Feeds a little paper clear of the cutter before the tear line. */}
      <div className="mt-[2em] text-center">{'- '.repeat(16).trim()}</div>
    </div>
  );
}
