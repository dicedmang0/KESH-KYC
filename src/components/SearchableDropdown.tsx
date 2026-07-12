'use client';

import { useState, type ReactNode } from 'react';

export type SearchableDropdownOption = {
  key: string;
  primary: ReactNode;
  secondary?: ReactNode;
};

type Props = {
  // Controlled query text (parent owns it)
  query: string;
  onChange: (value: string) => void;
  // Called when dropdown opens — use to trigger initial data load
  onOpen: () => void;

  // Results
  options: SearchableDropdownOption[];
  loading?: boolean;

  // Selection
  onSelect: (key: string) => void;
  isSelected?: boolean;
  selectedLabel?: string;
  selectedMeta?: ReactNode;
  onClear?: () => void;
  clearLabel?: string;

  // Display
  placeholder?: string;
  emptyText?: string;
  loadingText?: string;
  disabled?: boolean;
};

export function SearchableDropdown({
  query,
  onChange,
  onOpen,
  options,
  loading = false,
  onSelect,
  isSelected = false,
  selectedLabel = '',
  selectedMeta,
  onClear,
  clearLabel = 'Ganti',
  placeholder = 'Cari...',
  emptyText = 'Tidak ditemukan.',
  loadingText = 'Memuat...',
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false);

  function handleFocus() {
    setOpen(true);
    onOpen();
  }

  function handleBlur() {
    // Delay so onMouseDown on an option fires before the dropdown disappears.
    setTimeout(() => setOpen(false), 150);
  }

  function handleChange(v: string) {
    onChange(v);
    if (!open) setOpen(true);
  }

  function handleSelect(key: string) {
    onSelect(key);
    setOpen(false);
  }

  if (isSelected) {
    return (
      <div>
        <div className="w-full border border-kesh-700 rounded-lg px-3 py-2 text-sm text-slate-800">
          {selectedLabel}
        </div>
        {(selectedMeta || onClear) && (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-slate-500 flex-wrap">
            {selectedMeta}
            {onClear && (
              <>
                <span>·</span>
                <button type="button" onClick={onClear} className="text-kesh-700 hover:underline">
                  {clearLabel}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        autoComplete="off"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-kesh-700 disabled:bg-slate-50 disabled:text-slate-400 transition-colors"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg overflow-hidden">
          {loading ? (
            <div className="px-3 py-3 text-xs text-slate-400">{loadingText}</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-3 text-xs text-slate-400">{emptyText}</div>
          ) : (
            <ul className="max-h-60 overflow-auto divide-y">
              {options.map((opt) => (
                <li key={opt.key}>
                  <button
                    type="button"
                    onMouseDown={() => handleSelect(opt.key)}
                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50 transition-colors"
                  >
                    <div className="text-sm font-medium text-slate-800">{opt.primary}</div>
                    {opt.secondary && (
                      <div className="text-xs text-slate-400 mt-0.5">{opt.secondary}</div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
