import { Badge } from "@/components/ui/badge";
import { isBlockingListType, type TransferResult, type TransferStatus } from "@/lib/transfers";

// Semantic colors per Transfer Recording v2 spec.
const STATUS_STYLES: Record<TransferStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  PENDING_COMPLIANCE_REVIEW: "bg-amber-100 text-amber-800",
  SUBMITTED: "bg-amber-100 text-amber-700",
  PENDING_FINANCE_STAFF_REVIEW: "bg-orange-100 text-orange-700",
  PENDING_FINANCE_MANAGER_APPROVAL: "bg-purple-100 text-purple-700",
  // Returned by FinanceStaff for correction — a warning, not a final state.
  REVISION_REQUIRED: "bg-amber-100 text-amber-900 ring-1 ring-amber-400",
  APPROVED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-red-100 text-red-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

const STATUS_LABELS: Record<TransferStatus, string> = {
  DRAFT: "Draft",
  PENDING_COMPLIANCE_REVIEW: "Menunggu Review Compliance",
  SUBMITTED: "Menunggu Review Operation Supervisor",
  PENDING_FINANCE_STAFF_REVIEW: "Menunggu Review Finance Staff",
  PENDING_FINANCE_MANAGER_APPROVAL: "Menunggu Approval Finance Manager",
  REVISION_REQUIRED: "Dikembalikan",
  APPROVED: "Disetujui (Legacy)",
  REJECTED: "Ditolak",
  COMPLETED: "Selesai",
};

const RESULT_STYLES: Record<"SUCCESS" | "FAILED", string> = {
  SUCCESS: "bg-emerald-100 text-emerald-700",
  FAILED: "bg-red-100 text-red-700",
};

const RESULT_LABELS: Record<"SUCCESS" | "FAILED", string> = {
  SUCCESS: "Berhasil",
  FAILED: "Gagal",
};

export function TransferStatusBadge({
  status,
}: {
  status?: TransferStatus | string | null;
}) {
  if (!status) return <span className="text-xs text-slate-400">-</span>;
  const cls =
    STATUS_STYLES[status as TransferStatus] || "bg-slate-100 text-slate-600";
  const label = STATUS_LABELS[status as TransferStatus] || status;
  return (
    <Badge className={`border-0 text-xs font-medium ${cls}`}>{label}</Badge>
  );
}

/**
 * Compact "Watchlist Hit" marker for table rows, plus one badge per matched
 * list type. Renders nothing when the row is clean, so it can be dropped into
 * an existing cell without reserving space.
 */
export function WatchlistHitBadge({
  hasHit,
  listTypes,
}: {
  hasHit?: boolean | null;
  listTypes?: string[] | null;
}) {
  const types = (listTypes ?? []).filter(Boolean);
  if (!hasHit && types.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      <Badge className="border-0 bg-red-100 text-xs font-medium text-red-700">
        Watchlist Hit
      </Badge>
      {types.map((t) => (
        <Badge
          key={t}
          className={`border-0 text-xs font-medium ${
            isBlockingListType(t) ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {t}
        </Badge>
      ))}
    </span>
  );
}

export function TransferResultBadge({ result }: { result?: TransferResult }) {
  if (!result) return <span className="text-xs text-slate-400">-</span>;
  const cls = RESULT_STYLES[result] || "bg-slate-100 text-slate-600";
  const label = RESULT_LABELS[result] || result;
  return (
    <Badge className={`border-0 text-xs font-medium ${cls}`}>{label}</Badge>
  );
}
