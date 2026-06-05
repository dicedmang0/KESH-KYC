"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/app/providers";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileBarChart, Download } from "lucide-react";
import { Pagination } from "@/components/pagination";

// ── Types ─────────────────────────────────────────────────────────────────────

type AppStatus = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "REJECTED";
type AppType = "INDIVIDUAL" | "BUSINESS";

type Submission = {
  id?: number | string | null;
  application_id?: number | string | null;
  type?: AppType | null;
  status?: AppStatus | string | null;
  risk_score?: number | null;
  risk_level?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  legal_name?: string | null;
  email?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
};

type WatchlistItem = {
  id?: number | string | null;
  list_type?: string | null;
  list_source?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  actor_id?: string | null;
  count?: number | null;
  total_rows?: number | null;
  inserted?: number | null;
  updated?: number | null;
  filename?: string | null;
};

type TransferRow = {
  id?: number | string | null;
  sender_application_id?: number | string | null;
  amount?: string | number | null;
  currency?: string | null;
  status?: string | null;
  result?: string | null;
  beneficiary_bank_name?: string | null;
  beneficiary_account_name?: string | null;
  created_at?: string | null;
  created_by?: string | null;
};

type DashSummary = {
  totals?: {
    total?: number | null;
    status?: Record<string, number> | null;
    risk?: Record<string, number> | null;
  } | null;
};

// Submissions endpoint may return array or paginated object
type SubApiRes =
  | { items?: Submission[]; total?: number }
  | Submission[];

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeSubmissions(raw: SubApiRes): Submission[] {
  if (Array.isArray(raw)) return raw;
  return raw.items ?? [];
}

function resolveSubId(row: Submission): string {
  return String(row.application_id ?? row.id ?? "");
}

function resolveSubName(row: Submission): string {
  return (
    row.display_name ||
    row.full_name ||
    row.legal_name ||
    (row.type === "BUSINESS" ? "Business" : "Individual")
  );
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtIDR(v?: string | number | null): string {
  if (v == null) return "-";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
  }).format(n);
}

function inDateRange(
  iso: string | null | undefined,
  from: string,
  to: string
): boolean {
  if (!iso) return true;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  if (from) {
    const fromTs = new Date(from);
    fromTs.setHours(0, 0, 0, 0);
    if (t < fromTs.getTime()) return false;
  }
  if (to) {
    const toTs = new Date(to);
    toTs.setHours(23, 59, 59, 999);
    if (t > toTs.getTime()) return false;
  }
  return true;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ s }: { s?: string | null }) {
  const map: Record<string, string> = {
    DRAFT: "bg-slate-100 text-slate-700",
    SUBMITTED: "bg-amber-100 text-amber-700",
    IN_REVIEW: "bg-blue-100 text-blue-700",
    APPROVED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-700",
    COMPLETED: "bg-purple-100 text-purple-700",
  };
  const cls = (s && map[s]) || "bg-slate-100 text-slate-600";
  return (
    <Badge className={`border-0 text-xs font-medium ${cls}`}>
      {s?.replace("_", " ") ?? "-"}
    </Badge>
  );
}

function RiskPill({ level }: { level?: string | null }) {
  if (!level) return <span className="text-xs text-slate-400">-</span>;
  const cls =
    level === "HIGH"
      ? "bg-red-100 text-red-700"
      : level === "MEDIUM"
      ? "bg-amber-100 text-amber-700"
      : level === "PROHIBITED"
      ? "bg-black text-white"
      : "bg-emerald-100 text-emerald-700";
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{level}</span>
  );
}

function SectionSkeleton() {
  return (
    <div className="space-y-2 p-2">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

function SectionErr({ msg }: { msg: string }) {
  return (
    <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{msg}</div>
  );
}

// ── Page Inner ────────────────────────────────────────────────────────────────

function ReportsPageInner() {
  const { token } = useAuth();
  const router = useRouter();

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [typeFilter, setTypeFilter] = useState<AppType | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<AppStatus | "ALL">("ALL");

  // ── Data state ───────────────────────────────────────────────────────────────
  const [summary, setSummary] = useState<DashSummary | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [transferAccessDenied, setTransferAccessDenied] = useState(false);

  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [loadingTransfers, setLoadingTransfers] = useState(true);

  const [errSummary, setErrSummary] = useState("");
  const [errSubs, setErrSubs] = useState("");
  const [errWatchlist, setErrWatchlist] = useState("");

  // refreshKey allows the Apply button to re-trigger the fetch effect
  const [refreshKey, setRefreshKey] = useState(0);

  // independent pagination state for each table
  const [subPage, setSubPage] = useState(1);
  const [subPageSize, setSubPageSize] = useState(20);
  const [wlPage, setWlPage] = useState(1);
  const [wlPageSize, setWlPageSize] = useState(20);
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(20);

  // ── Fetch all data in parallel (async IIFE avoids "setState in effect" lint) ─
  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }

    (async () => {
      // Reset all loading / error states
      setLoadingSummary(true);
      setLoadingSubs(true);
      setLoadingWatchlist(true);
      setLoadingTransfers(true);
      setErrSummary("");
      setErrSubs("");
      setErrWatchlist("");
      setTransferAccessDenied(false);

      const [sumRes, subRes, wlRes, txRes] = await Promise.allSettled([
        apiFetch<DashSummary>("/kyc/dashboard-summary"),
        apiFetch<SubApiRes>("/kyc/submissions?limit=200"),
        apiFetch<WatchlistItem[]>("/watchlist/history?limit=50"),
        apiFetch<TransferRow[]>("/transfers?limit=200"),
      ]);

      // 1) Summary
      if (sumRes.status === "fulfilled") {
        setSummary(sumRes.value);
      } else {
        const msg =
          sumRes.reason instanceof Error
            ? sumRes.reason.message
            : "Failed to load summary";
        if (msg.includes("401")) {
          router.replace("/login");
          return;
        }
        setErrSummary(
          msg.includes("403")
            ? "Access denied — you don't have permission to view this summary."
            : msg
        );
      }
      setLoadingSummary(false);

      // 2) Submissions
      if (subRes.status === "fulfilled") {
        setSubmissions(normalizeSubmissions(subRes.value));
      } else {
        const msg =
          subRes.reason instanceof Error
            ? subRes.reason.message
            : "Failed to load submissions";
        if (msg.includes("401")) {
          router.replace("/login");
          return;
        }
        setErrSubs(
          msg.includes("403")
            ? "Access denied — you don't have permission to view submissions."
            : msg
        );
      }
      setLoadingSubs(false);

      // 3) Watchlist
      if (wlRes.status === "fulfilled") {
        setWatchlist(Array.isArray(wlRes.value) ? wlRes.value : []);
      } else {
        const msg =
          wlRes.reason instanceof Error
            ? wlRes.reason.message
            : "Failed to load watchlist history";
        setErrWatchlist(
          msg.includes("403")
            ? "Access denied — you don't have permission to view watchlist history."
            : msg
        );
      }
      setLoadingWatchlist(false);

      // 4) Transfers — 403 means no access (non-finance role)
      if (txRes.status === "fulfilled") {
        setTransfers(Array.isArray(txRes.value) ? txRes.value : []);
      } else {
        const msg =
          txRes.reason instanceof Error ? txRes.reason.message : "";
        if (msg.includes("403")) setTransferAccessDenied(true);
        // other errors → empty list, no crash
      }
      setLoadingTransfers(false);
    })();
  }, [token, router, refreshKey]);

  // ── Client-side filtered views ───────────────────────────────────────────────

  const filteredSubs = useMemo(() => {
    return submissions.filter((row) => {
      if (typeFilter !== "ALL" && row.type !== typeFilter) return false;
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      const date = row.submitted_at || row.created_at;
      return inDateRange(date, fromDate, toDate);
    });
  }, [submissions, typeFilter, statusFilter, fromDate, toDate]);

  const filteredWatchlist = useMemo(
    () => watchlist.filter((row) => inDateRange(row.created_at, fromDate, toDate)),
    [watchlist, fromDate, toDate]
  );

  const filteredTransfers = useMemo(
    () => transfers.filter((row) => inDateRange(row.created_at, fromDate, toDate)),
    [transfers, fromDate, toDate]
  );

  // ── KPI values ───────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const s = summary?.totals?.status ?? {};
    const r = summary?.totals?.risk ?? {};
    return {
      total: summary?.totals?.total ?? 0,
      submitted: s.SUBMITTED ?? 0,
      approved: s.APPROVED ?? 0,
      rejected: s.REJECTED ?? 0,
      highRisk: r.HIGH ?? 0,
    };
  }, [summary]);

  const hasActiveFilter =
    !!fromDate || !!toDate || typeFilter !== "ALL" || statusFilter !== "ALL";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <FileBarChart className="h-6 w-6 text-slate-700" />
          <div>
            <h1 className="text-xl font-semibold">Reports</h1>
            <p className="text-xs text-slate-500">
              KYC/KYB, risk, watchlist, and transfer operational summary
            </p>
          </div>
        </div>

        {/* Export buttons — disabled (coming soon) */}
        <div className="flex items-center gap-2">
          <button
            disabled
            title="Coming soon"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm opacity-40"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            disabled
            title="Coming soon"
            className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm opacity-40"
          >
            <Download className="h-4 w-4" />
            Export PDF
          </button>
        </div>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">
                From Date
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => { setFromDate(e.target.value); setSubPage(1); setWlPage(1); setTxPage(1); }}
                className="rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">
                To Date
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => { setToDate(e.target.value); setSubPage(1); setWlPage(1); setTxPage(1); }}
                className="rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Type</label>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as AppType | "ALL");
                  setSubPage(1);
                }}
                className="rounded-md border bg-white px-2 py-1.5 text-sm"
              >
                {(["ALL", "INDIVIDUAL", "BUSINESS"] as const).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">
                Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as AppStatus | "ALL");
                  setSubPage(1);
                }}
                className="rounded-md border bg-white px-2 py-1.5 text-sm"
              >
                {(
                  [
                    "ALL",
                    "DRAFT",
                    "SUBMITTED",
                    "IN_REVIEW",
                    "APPROVED",
                    "REJECTED",
                  ] as const
                ).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pb-0.5">
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:opacity-90"
              >
                Apply
              </button>
              <button
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setTypeFilter("ALL");
                  setStatusFilter("ALL");
                  setSubPage(1);
                  setWlPage(1);
                  setTxPage(1);
                }}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </div>
          {hasActiveFilter && (
            <p className="mt-2 text-xs text-amber-700">
              Date/type/status filters apply client-side on loaded data.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loadingSummary ? (
          [...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-2 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : errSummary ? (
          <div className="col-span-4">
            <SectionErr msg={errSummary} />
          </div>
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Applications</p>
                <p className="mt-1.5 text-2xl font-semibold">
                  {kpis.total.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Submitted</p>
                <p className="mt-1.5 text-2xl font-semibold text-amber-700">
                  {kpis.submitted.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Approved</p>
                <p className="mt-1.5 text-2xl font-semibold text-emerald-700">
                  {kpis.approved.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Rejected</p>
                <p className="mt-1.5 text-2xl font-semibold text-red-700">
                  {kpis.rejected.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">High Risk</p>
                <p className="mt-1.5 text-2xl font-semibold text-red-600">
                  {kpis.highRisk.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Watchlist Uploads</p>
                <p className="mt-1.5 text-2xl font-semibold">
                  {loadingWatchlist ? "—" : watchlist.length.toLocaleString()}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Transfers</p>
                <p className="mt-1.5 text-2xl font-semibold">
                  {loadingTransfers
                    ? "—"
                    : transferAccessDenied
                    ? "N/A"
                    : transfers.length.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ── Table A: KYC/KYB Submissions ───────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">KYC / KYB Submissions</CardTitle>
          <span className="text-xs text-slate-400">
            {filteredSubs.length} records
          </span>
        </CardHeader>
        <CardContent className="pt-0">
          {errSubs && <SectionErr msg={errSubs} />}
          {!errSubs && loadingSubs ? (
            <SectionSkeleton />
          ) : !errSubs && filteredSubs.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No submissions match current filters.
            </p>
          ) : !errSubs ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Risk Level</TableHead>
                      <TableHead>Score</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSubs.slice((subPage - 1) * subPageSize, subPage * subPageSize).map((row, i) => {
                      const id = resolveSubId(row);
                      return (
                        <TableRow key={id || String(i)}>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {id || "-"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {resolveSubName(row)}
                            {row.email && (
                              <div className="text-xs font-normal text-slate-400">
                                {row.email}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-medium ${
                                row.type === "BUSINESS"
                                  ? "bg-purple-100 text-purple-700"
                                  : "bg-sky-100 text-sky-700"
                              }`}
                            >
                              {row.type ?? "-"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <StatusBadge s={row.status} />
                          </TableCell>
                          <TableCell>
                            <RiskPill level={row.risk_level} />
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.risk_score != null ? (
                              row.risk_score
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {fmtDate(row.submitted_at || row.created_at)}
                          </TableCell>
                          <TableCell>
                            {id ? (
                              <button
                                onClick={() => router.push(`/users/${id}`)}
                                className="text-xs text-amber-700 hover:underline"
                              >
                                View
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={subPage}
                pageSize={subPageSize}
                total={filteredSubs.length}
                onPageChange={setSubPage}
                onPageSizeChange={(s) => { setSubPageSize(s); setSubPage(1); }}
                disabled={loadingSubs}
              />
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Table B: Watchlist Upload History ──────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Watchlist Upload History</CardTitle>
          <span className="text-xs text-slate-400">
            {filteredWatchlist.length} records
          </span>
        </CardHeader>
        <CardContent className="pt-0">
          {errWatchlist && <SectionErr msg={errWatchlist} />}
          {!errWatchlist && loadingWatchlist ? (
            <SectionSkeleton />
          ) : !errWatchlist && filteredWatchlist.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No watchlist uploads found.
            </p>
          ) : !errWatchlist ? (
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>List Type</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Count / Rows</TableHead>
                    <TableHead>Uploaded By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredWatchlist.slice((wlPage - 1) * wlPageSize, wlPage * wlPageSize).map((row, i) => (
                    <TableRow key={String(row.id ?? i)}>
                      <TableCell className="text-sm text-slate-600">
                        {fmtDate(row.created_at)}
                      </TableCell>
                      <TableCell>
                        {row.list_type ? (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {row.list_type}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.list_source ?? row.filename ?? "-"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {row.count != null
                          ? row.count
                          : row.total_rows != null
                          ? `${row.total_rows} rows`
                          : [
                              row.inserted != null && `+${row.inserted}`,
                              row.updated != null && `~${row.updated}`,
                            ]
                              .filter(Boolean)
                              .join(" / ") || "-"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600">
                        {row.created_by ?? row.actor_id ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Pagination
              page={wlPage}
              pageSize={wlPageSize}
              total={filteredWatchlist.length}
              onPageChange={setWlPage}
              onPageSizeChange={(s) => { setWlPageSize(s); setWlPage(1); }}
              disabled={loadingWatchlist}
            />
            </>
          ) : null}
        </CardContent>
      </Card>

      {/* ── Table C: Transfer Summary ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Transfer Summary</CardTitle>
          {!transferAccessDenied && !loadingTransfers && (
            <span className="text-xs text-slate-400">
              {filteredTransfers.length} records
            </span>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {loadingTransfers ? (
            <SectionSkeleton />
          ) : transferAccessDenied ? (
            <div className="flex flex-col items-center gap-1 py-8 text-center">
              <p className="text-sm font-medium text-slate-500">
                No access to transfer report
              </p>
              <p className="text-xs text-slate-400">
                Transfer data is only visible to Finance roles.
              </p>
            </div>
          ) : filteredTransfers.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No transfers found.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Sender App ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created By</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransfers.slice((txPage - 1) * txPageSize, txPage * txPageSize).map((row, i) => {
                      const id = String(row.id ?? "");
                      return (
                        <TableRow key={id || String(i)}>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {id ? `#${id}` : "-"}
                          </TableCell>
                          <TableCell className="text-sm">
                            {row.sender_application_id != null
                              ? String(row.sender_application_id)
                              : "-"}
                          </TableCell>
                          <TableCell className="text-sm font-medium">
                            {fmtIDR(row.amount)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge s={row.status} />
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {row.created_by ?? "-"}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {fmtDate(row.created_at)}
                          </TableCell>
                          <TableCell>
                            {id ? (
                              <button
                                onClick={() =>
                                  router.push(`/transfers/${id}`)
                                }
                                className="text-xs text-amber-700 hover:underline"
                              >
                                View
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <Pagination
                page={txPage}
                pageSize={txPageSize}
                total={filteredTransfers.length}
                onPageChange={setTxPage}
                onPageSizeChange={(s) => { setTxPageSize(s); setTxPage(1); }}
                disabled={loadingTransfers}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={<p className="p-6 text-sm text-slate-500">Loading…</p>}
    >
      <ReportsPageInner />
    </Suspense>
  );
}
