"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { ShieldCheck, ShieldOff } from "lucide-react";
import { Pagination } from "@/components/pagination";

// ── Types ─────────────────────────────────────────────────────────────────────

type AppStatus = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "REJECTED";
type AppType = "INDIVIDUAL" | "BUSINESS";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "PROHIBITED";

type Submission = {
  // identifiers – backend may use id or application_id
  id?: number | string | null;
  application_id?: number | string | null;
  type?: AppType | null;
  status?: AppStatus | string | null;
  risk_score?: number | null;
  risk_level?: RiskLevel | null;
  // name fields
  display_name?: string | null;
  full_name?: string | null;
  legal_name?: string | null;
  trade_name?: string | null;
  // contact
  email?: string | null;
  // dates
  submitted_at?: string | null;
  created_at?: string | null;
};

// Backend may return { items, total, limit, offset } or just an array
type ApiRes =
  | { items: Submission[]; total?: number; limit?: number; offset?: number }
  | Submission[];

const STATUS_TABS: (AppStatus | "ALL")[] = [
  "ALL",
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
];

const STATUS_TAB_LABELS: Record<AppStatus | "ALL", string> = {
  ALL: "Semua",
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  IN_REVIEW: "Dalam Review",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

const STATUS_DISPLAY: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  IN_REVIEW: "Dalam Review",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

const TYPE_DISPLAY: Record<string, string> = {
  INDIVIDUAL: "Individu",
  BUSINESS: "Perusahaan",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveId(row: Submission): string {
  const v = row.application_id ?? row.id;
  return v != null ? String(v) : "";
}

function resolveName(row: Submission): string {
  return (
    row.display_name ||
    row.full_name ||
    row.legal_name ||
    row.trade_name ||
    (row.type === "BUSINESS" ? "Perusahaan" : "Individu")
  );
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeRes(raw: ApiRes): { items: Submission[]; total: number } {
  if (Array.isArray(raw)) return { items: raw, total: raw.length };
  return { items: raw.items ?? [], total: raw.total ?? raw.items?.length ?? 0 };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ s }: { s?: AppStatus | string | null }) {
  const colorMap: Record<string, string> = {
    DRAFT: "bg-slate-100 text-slate-700",
    SUBMITTED: "bg-amber-100 text-amber-700",
    IN_REVIEW: "bg-blue-100 text-blue-700",
    APPROVED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-700",
  };
  const cls = (s && colorMap[s]) || "bg-slate-100 text-slate-600";
  const label = (s && STATUS_DISPLAY[s]) || s || "-";
  return (
    <Badge className={`border-0 text-xs font-medium ${cls}`}>
      {label}
    </Badge>
  );
}

function RiskPill({ level, score }: { level?: RiskLevel | null; score?: number | null }) {
  if (!level) return <span className="text-xs text-slate-400">-</span>;
  const cls =
    level === "HIGH"
      ? "bg-red-100 text-red-700"
      : level === "MEDIUM"
      ? "bg-amber-100 text-amber-700"
      : level === "PROHIBITED"
      ? "bg-black text-white"
      : "bg-emerald-100 text-emerald-700";
  const scoreStr = score != null ? ` (${score})` : "";
  return (
    <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>
      {level}{scoreStr}
    </span>
  );
}

// ── Page Inner ────────────────────────────────────────────────────────────────

function KycPageInner() {
  const { token } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();

  const [activeTab, setActiveTab] = useState<AppStatus | "ALL">(
    (sp.get("status") as AppStatus) || "ALL"
  );
  const [q, setQ] = useState(sp.get("q") || "");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [allItems, setAllItems] = useState<Submission[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const params = new URLSearchParams();
        if (activeTab !== "ALL") params.set("status", activeTab);
        if (q) params.set("q", q);
        params.set("limit", String(pageSize));
        params.set("offset", String((page - 1) * pageSize));

        const qs = params.toString();
        const raw = await apiFetch<ApiRes>(`/kyc/submissions${qs ? `?${qs}` : ""}`);
        const { items, total: t } = normalizeRes(raw);
        setAllItems(items);
        setTotal(t);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Gagal memuat pengajuan KYC";
        if (msg.includes("401")) {
          router.replace("/login");
          return;
        }
        if (msg.includes("403")) {
          setAccessDenied(true);
          return;
        }
        setErr(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, activeTab, q, page, pageSize, router]);

  // Client-side filter
  const filtered = useMemo(() => {
    let result = allItems;
    if (activeTab !== "ALL") {
      result = result.filter(
        (row) => String(row.status ?? "").toUpperCase() === activeTab
      );
    }
    if (!q) return result;
    const lower = q.toLowerCase();
    return result.filter((row) => {
      const id = resolveId(row).toLowerCase();
      const name = resolveName(row).toLowerCase();
      const email = (row.email || "").toLowerCase();
      return id.includes(lower) || name.includes(lower) || email.includes(lower);
    });
  }, [allItems, q, activeTab]);

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center gap-3 py-20 text-slate-500">
        <ShieldOff className="h-10 w-10 text-slate-300" />
        <p className="text-base font-medium text-slate-700">Akses Ditolak</p>
        <p className="text-sm">Anda tidak memiliki izin untuk melihat Verifikasi KYC/KYB.</p>
        <button
          onClick={() => router.push("/dashboard")}
          className="mt-1 text-sm text-amber-700 hover:underline"
        >
          Ke Dasbor
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-slate-700" />
          <div>
            <h1 className="text-xl font-semibold">Verifikasi KYC/KYB</h1>
            <p className="text-xs text-slate-500">
              Tinjau dan proses semua pengajuan KYC/KYB
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Status tabs */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); setPage(1); }}
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? "bg-kesh-700 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  }`}
                >
                  {STATUS_TAB_LABELS[tab]}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="Cari berdasarkan nama, email, atau ID…"
                className="w-[280px] rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
              {total > 0 && (
                <span className="absolute right-2 top-2 text-xs text-slate-400">
                  {total}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar Pengajuan</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {err && (
            <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {err}
            </div>
          )}

          {loading ? (
            <div className="space-y-2 p-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-slate-500">
              <ShieldCheck className="h-8 w-8 text-slate-300" />
              <p className="text-sm">Belum ada pengajuan ditemukan.</p>
              {(activeTab !== "ALL" || q) && (
                <button
                  onClick={() => { setActiveTab("ALL"); setQ(""); setPage(1); }}
                  className="text-xs text-kesh-700 hover:underline font-medium"
                >
                  Bersihkan filter
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Nama</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risiko</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const id = resolveId(row);
                    return (
                      <TableRow key={id || Math.random()}>
                        <TableCell className="font-mono text-xs text-slate-500">
                          {id || "-"}
                        </TableCell>
                        <TableCell className="font-medium">
                          {resolveName(row)}
                          {row.email && (
                            <div className="text-xs text-slate-400 font-normal">
                              {row.email}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                            row.type === "BUSINESS"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-sky-100 text-sky-700"
                          }`}>
                            {row.type ? (TYPE_DISPLAY[row.type] || row.type) : "-"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StatusBadge s={row.status} />
                        </TableCell>
                        <TableCell>
                          <RiskPill level={row.risk_level} score={row.risk_score} />
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {fmtDate(row.submitted_at || row.created_at)}
                        </TableCell>
                        <TableCell>
                          {id ? (
                            <button
                              onClick={() => router.push(`/users/${id}`)}
                              className="text-kesh-700 hover:underline text-xs font-medium"
                            >
                              Lihat
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
          )}

          {/* Pagination */}
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            disabled={loading}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function KycPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Memuat…</p>}>
      <KycPageInner />
    </Suspense>
  );
}
