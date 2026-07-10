import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Display-normalize a CIF number. Backend already returns the new dash-less
 * format (KSHI/KSHB…), but legacy rows may still contain dashes — strip them
 * for display only. Does not mutate any backend payload.
 */
export function formatCif(value?: string | number | null, fallback = "—"): string {
  if (value === null || value === undefined) return fallback
  const s = String(value).replaceAll("-", "")
  return s.length > 0 ? s : fallback
}
