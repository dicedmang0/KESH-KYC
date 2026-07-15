"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/app/providers";
import { formatCif } from "@/lib/utils";

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
import { Plus } from "lucide-react";
import { Pagination } from "@/components/pagination";

type AppType = "INDIVIDUAL" | "BUSINESS";
type Status = "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "REVISION_REQUIRED";

type Item = {
  id: number | string;
  application_type: AppType;
  status: Status;
  created_at: string;
  updated_at?: string;
  risk_level?: "LOW" | "MEDIUM" | "HIGH" | "PROHIBITED" | null;
  cif_no?: string | null;
  display_name: string | null;
  display_type?: string | null;
};

type ApiRes = {
  data: Item[];
  total: number;
  page: number;
  limit: number;
};

const STATUS_OPTIONS: (Status | "ALL")[] = [
  "ALL", "DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "REJECTED", "REVISION_REQUIRED",
];

const STATUS_LABELS: Record<Status | "ALL", string> = {
  ALL: "Semua",
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  IN_REVIEW: "Dalam Review",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  REVISION_REQUIRED: "Perlu Perbaikan",
};

const STATUS_DISPLAY: Record<Status, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  IN_REVIEW: "Dalam Review",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
  REVISION_REQUIRED: "Perlu Perbaikan",
};

const APP_TYPE_OPTIONS: (AppType | "ALL")[] = ["ALL", "INDIVIDUAL", "BUSINESS"];
const APP_TYPE_LABELS: Record<AppType | "ALL", string> = {
  ALL: "Semua Jenis",
  INDIVIDUAL: "Individual",
  BUSINESS: "Badan Usaha",
};

function StatusBadge({ s }: { s: Status }) {
  const colorMap: Record<Status, string> = {
    DRAFT: "bg-slate-100 text-slate-700",
    SUBMITTED: "bg-amber-100 text-amber-700",
    IN_REVIEW: "bg-blue-100 text-blue-700",
    APPROVED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-700",
    REVISION_REQUIRED: "bg-orange-100 text-orange-700",
  };
  return (
    <Badge className={`border-0 text-xs font-medium ${colorMap[s]}`}>
      {STATUS_DISPLAY[s]}
    </Badge>
  );
}

const EMPTY_API: ApiRes = { data: [], total: 0, page: 1, limit: 20 };

function UsersPageInner() {
  const { token } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();

  const [appType, setAppType] = useState<AppType | "ALL">(
    (sp.get("application_type") as AppType | null) || "ALL"
  );
  const [q, setQ] = useState(sp.get("q") || "");
  const [cif, setCif] = useState(sp.get("cif") || "");
  const [dateFrom, setDateFrom] = useState(sp.get("date_from") || "");
  const [dateTo, setDateTo] = useState(sp.get("date_to") || "");
  const [status, setStatus] = useState<Status | "ALL">(
    (sp.get("status") as Status | null) || "ALL"
  );
  const [pageSize, setPageSize] = useState(Number(sp.get("limit") || 20));
  const [page, setPage] = useState(Math.max(1, Number(sp.get("page") || 1)));

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiRes>(EMPTY_API);

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const p = new URLSearchParams();
        if (appType !== "ALL") p.set("application_type", appType);
        if (q) p.set("q", q);
        if (cif) p.set("cif", cif);
        if (dateFrom) p.set("date_from", dateFrom);
        if (dateTo) p.set("date_to", dateTo);
        if (status !== "ALL") p.set("status", status);
        p.set("page", String(page));
        p.set("limit", String(pageSize));

        const res = await apiFetch<ApiRes>(`/applications?${p.toString()}`);
        setData(res ?? EMPTY_API);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Gagal memuat pengguna jasa");
      } finally {
        setLoading(false);
      }
    })();
  }, [appType, q, cif, dateFrom, dateTo, status, page, pageSize]);

  function resetFilters() {
    setAppType("ALL");
    setQ("");
    setCif("");
    setDateFrom("");
    setDateTo("");
    setStatus("ALL");
    setPage(1);
  }

  const fmtDate = (iso?: string) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("id-ID", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    });
  };

  const hasActiveFilter =
    appType !== "ALL" || q || cif || dateFrom || dateTo || status !== "ALL";

  return (
    <div className="space-y-6">
      {/* Header + Add */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Manajemen Pengguna Jasa</h1>
          <p className="text-xs text-slate-500">
            Kelola dan pantau semua pengguna jasa terdaftar
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push("/applications/new?type=individual")}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm shadow-sm hover:bg-slate-50 active:scale-[0.99]"
            title="Tambah Individu (KYC)"
          >
            <Plus className="h-4 w-4" />
            Tambah Individu
          </button>

          <button
            type="button"
            onClick={() => router.push("/applications/new?type=business")}
            className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm shadow-sm hover:bg-slate-50 active:scale-[0.99]"
            title="Tambah Perusahaan (KYB)"
          >
            <Plus className="h-4 w-4" />
            Tambah Perusahaan
          </button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Pencarian Umum</label>
              <input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                placeholder="Nama, email, telepon…"
                className="rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Cari CIF</label>
              <input
                value={cif}
                onChange={(e) => {
                  setCif(e.target.value);
                  setPage(1);
                }}
                placeholder="Nomor CIF…"
                className="rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Jenis Pengguna</label>
              <select
                value={appType}
                onChange={(e) => {
                  setAppType(e.target.value as AppType | "ALL");
                  setPage(1);
                }}
                className="rounded-md border bg-white px-2 py-2 text-sm"
              >
                {APP_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {APP_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Status</label>
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as Status | "ALL");
                  setPage(1);
                }}
                className="rounded-md border bg-white px-2 py-2 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Tanggal Dari</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Tanggal Sampai</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">Total: {data.total}</span>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs text-slate-500 hover:text-slate-700 underline"
              >
                Reset Filter
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Semua Pengguna Jasa</CardTitle>
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
          ) : data.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Belum ada data.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CIF</TableHead>
                    <TableHead>Nama Pengguna Jasa</TableHead>
                    <TableHead>Jenis Pengguna</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal Dibuat</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {formatCif(row.cif_no)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.display_name || "—"}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {row.display_type ||
                          APP_TYPE_LABELS[row.application_type] ||
                          row.application_type}
                      </TableCell>
                      <TableCell>
                        <StatusBadge s={row.status} />
                      </TableCell>
                      <TableCell>{fmtDate(row.created_at)}</TableCell>
                      <TableCell>
                        <button
                          onClick={() => router.push(`/users/${row.id}`)}
                          className="text-kesh-700 hover:underline text-xs font-medium"
                        >
                          Lihat
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.total}
            onPageChange={setPage}
            onPageSizeChange={(s) => {
              setPageSize(s);
              setPage(1);
            }}
            disabled={loading}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Memuat…</p>}>
      <UsersPageInner />
    </Suspense>
  );
}
