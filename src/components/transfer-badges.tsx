import { Badge } from "@/components/ui/badge";
import type { TransferResult, TransferStatus } from "@/lib/transfers";

// Semantic colors per Transfer Recording v2 spec.
const STATUS_STYLES: Record<TransferStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  SUBMITTED: "bg-amber-100 text-amber-700",
  PENDING_FINANCE_STAFF_REVIEW: "bg-orange-100 text-orange-700",
  PENDING_FINANCE_MANAGER_APPROVAL: "bg-purple-100 text-purple-700",
  APPROVED: "bg-blue-100 text-blue-700",
  REJECTED: "bg-red-100 text-red-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

const STATUS_LABELS: Record<TransferStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  PENDING_FINANCE_STAFF_REVIEW: "Review Finance Staff",
  PENDING_FINANCE_MANAGER_APPROVAL: "Menunggu Approval Finance Manager",
  APPROVED: "Disetujui",
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

export function TransferResultBadge({ result }: { result?: TransferResult }) {
  if (!result) return <span className="text-xs text-slate-400">-</span>;
  const cls = RESULT_STYLES[result] || "bg-slate-100 text-slate-600";
  const label = RESULT_LABELS[result] || result;
  return (
    <Badge className={`border-0 text-xs font-medium ${cls}`}>{label}</Badge>
  );
}
