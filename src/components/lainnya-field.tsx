"use client";

import { isLainnya } from "@/lib/utils";

/**
 * "Keterangan Lainnya" companion input.
 *
 * Renders a free-text field directly below a dropdown, but only when that
 * dropdown's value is "Lainnya" (case-insensitive). The typed text is saved to
 * the backend `*_other` column — it never replaces the dropdown value. Hidden
 * (and expected to be cleared by the parent) when the value is not "Lainnya".
 */
export default function LainnyaField({
  when,
  value,
  onChange,
  label = "Keterangan Lainnya",
  placeholder = "Tuliskan keterangan lainnya",
  required = true,
  labelClassName = "text-sm font-medium",
  inputClassName = "rounded-md border px-3 py-2 text-sm",
  error,
}: {
  when?: string | null;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  labelClassName?: string;
  inputClassName?: string;
  error?: string;
}) {
  if (!isLainnya(when)) return null;
  return (
    <div className="grid gap-1 mt-2">
      <label className={labelClassName}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        className={`${inputClassName}${error ? " border-red-400" : ""}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
