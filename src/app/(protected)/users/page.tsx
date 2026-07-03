"use client";

import { Suspense, useEffect, useState } from "react";
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
import { Plus } from "lucide-react";
import { Pagination } from "@/components/pagination";

type Kind = "INDIVIDUAL" | "BUSINESS";
type Status =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "APPROVED"
  | "REJECTED";

type Item = {
  application_id: number | string;
  type: Kind;
  status: Status;
  created_at: string;
  risk_level?: "LOW" | "MEDIUM" | "HIGH" | "PROHIBITED" | null;
  risk_score?: number | null;
  display_name: string | null;
  email?: string | null;
  phone?: string | null;
  nib?: string | null;
  npwp?: string | null;
};

type ApiRes = {
  total: number;
  limit: number;
  offset: number;
  items: Item[];
};

const STATUS_OPTIONS: (Status | "ALL")[] = [
  "ALL",
  "DRAFT",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
];

const STATUS_LABELS: Record<Status | "ALL", string> = {
  ALL: "Semua",
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  IN_REVIEW: "Dalam Review",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

const STATUS_DISPLAY: Record<Status, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Diajukan",
  IN_REVIEW: "Dalam Review",
  APPROVED: "Disetujui",
  REJECTED: "Ditolak",
};

function StatusBadge({ s }: { s: Status }) {
  const colorMap: Record<Status, string> = {
    DRAFT: "bg-slate-100 text-slate-700",
    SUBMITTED: "bg-amber-100 text-amber-700",
    IN_REVIEW: "bg-blue-100 text-blue-700",
    APPROVED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-700",
  };
  return (
    <Badge className={`border-0 text-xs font-medium ${colorMap[s]}`}>
      {STATUS_DISPLAY[s]}
    </Badge>
  );
}

function RiskPill({ level }: { level?: Item["risk_level"] }) {
  if (!level) return <span className="text-xs text-slate-400">-</span>;
  const cls =
    level === "HIGH"
      ? "bg-red-100 text-red-700"
      : level === "MEDIUM"
      ? "bg-amber-100 text-amber-700"
      : level === "PROHIBITED"
      ? "bg-black text-white"
      : "bg-emerald-100 text-emerald-700";
  return <span className={`px-2 py-0.5 rounded text-xs ${cls}`}>{level}</span>;
}

function UsersPageInner() {
  const { token } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();

  const [kind, setKind] = useState<Kind>(
    (sp.get("type") as Kind) || "INDIVIDUAL"
  );
  const [q, setQ] = useState(sp.get("q") || "");
  const [status, setStatus] = useState<Status | "ALL">(
    (sp.get("status") as Status | null) || "ALL"
  );
  const [pageSize, setPageSize] = useState(Number(sp.get("limit") || 20));
  const [page, setPage] = useState(Math.max(1, Number(sp.get("page") || 1)));

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<ApiRes>({
    total: 0,
    limit: pageSize,
    offset: 0,
    items: [],
  });

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const p = new URLSearchParams();
        p.set("type", kind);
        if (q) p.set("q", q);
        if (status && status !== "ALL") p.set("status", status);
        p.set("limit", String(pageSize));
        p.set("offset", String((page - 1) * pageSize));

        const res = await apiFetch<ApiRes>(`/kyc/registrants?${p.toString()}`);
        setData(res);
      } catch (e: unknown) {
        setErr(e instanceof Error ? e.message : "Gagal memuat pengguna");
      } finally {
        setLoading(false);
      }
    })();
  }, [kind, q, status, page, pageSize]);

  const fmtDate = (iso?: string) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("id-ID", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header + Add */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Manajemen Pengguna</h1>
          <p className="text-xs text-slate-500">
            Kelola dan pantau semua pengguna terdaftar
          </p>
        </div>

        <div className="flex gap-2">
          <div className="flex items-center gap-2">
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
      </div>

      {/* Search + total */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* Segmented switch */}
              <div className="grid grid-cols-2 rounded-lg border bg-white p-0.5">
                <button
                  onClick={() => {
                    setKind("INDIVIDUAL");
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-sm rounded-md ${
                    kind === "INDIVIDUAL"
                      ? "bg-kesh-700 text-white shadow-sm"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Individu
                </button>
                <button
                  onClick={() => {
                    setKind("BUSINESS");
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-sm rounded-md ${
                    kind === "BUSINESS"
                      ? "bg-kesh-700 text-white shadow-sm"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Perusahaan
                </button>
              </div>

              <div className="relative">
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder={
                    kind === "INDIVIDUAL"
                      ? "Cari nama, email, atau telepon..."
                      : "Cari nama legal/dagang, NIB, NPWP..."
                  }
                  className="w-[320px] rounded-md border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-200"
                />
                <span className="absolute right-2 top-2 text-xs text-slate-400">
                  Total: {data.total}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as Status | "ALL");
                  setPage(1);
                }}
                className="rounded-md border bg-white px-2 py-1.5 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Semua Pengguna</CardTitle>
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
          ) : data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Belum ada data.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {kind === "INDIVIDUAL" ? "Nama Lengkap" : "Nama Legal"}
                    </TableHead>
                    <TableHead>
                      {kind === "INDIVIDUAL" ? "Email" : "NIB / NPWP"}
                    </TableHead>
                    <TableHead>
                      {kind === "INDIVIDUAL" ? "Nomor Telepon" : "—"}
                    </TableHead>
                    <TableHead>Tanggal Daftar</TableHead>
                    <TableHead>Status Verifikasi</TableHead>
                    <TableHead>Risiko</TableHead>
                    <TableHead>Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((row) => (
                    <TableRow key={row.application_id}>
                      <TableCell className="font-medium">
                        {row.display_name ||
                          (kind === "INDIVIDUAL" ? "Individu" : "Perusahaan")}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {kind === "INDIVIDUAL"
                          ? row.email || "—"
                          : [row.nib, row.npwp].filter(Boolean).join(" / ") ||
                            "—"}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {kind === "INDIVIDUAL" ? row.phone || "—" : "—"}
                      </TableCell>
                      <TableCell>{fmtDate(row.created_at)}</TableCell>
                      <TableCell>
                        <StatusBadge s={row.status} />
                      </TableCell>
                      <TableCell>
                        <RiskPill level={row.risk_level || undefined} />
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() =>
                            router.push(`/users/${row.application_id}`)
                          }
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

          {/* Pagination */}
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.total}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
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
