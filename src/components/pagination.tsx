"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
  disabled?: boolean;
  pageSizeOptions?: number[];
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  pageSizeOptions = [20, 50, 100],
}: PaginationProps) {
  if (total <= 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 mt-3 text-sm">
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-500">
          Showing {from}–{to} of {total}
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          disabled={disabled}
          className="rounded-md border bg-white px-2 py-1 text-xs"
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">
          Page {page} of {totalPages}
        </span>
        <button
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50 hover:bg-slate-50"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <button
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs disabled:opacity-50 hover:bg-slate-50"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
