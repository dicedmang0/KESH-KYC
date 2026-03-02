"use client";

import { useEffect, useMemo, useState } from "react";
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
import { ChevronLeft, ChevronRight, Plus, Eye } from "lucide-react";

type Kind = "INDIVIDUAL" | "BUSINESS";
type Status =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "ESCALATED"
  | "APPROVED"
  | "REJECTED";

type Item = {
  application_id: number;
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
  "ESCALATED",
  "APPROVED",
  "REJECTED",
];

function StatusBadge({ s }: { s: Status }) {
  const map: Record<Status, string> = {
    DRAFT: "bg-slate-100 text-slate-700",
    SUBMITTED: "bg-amber-100 text-amber-700",
    IN_REVIEW: "bg-blue-100 text-blue-700",
    ESCALATED: "bg-purple-100 text-purple-700",
    APPROVED: "bg-emerald-100 text-emerald-700",
    REJECTED: "bg-red-100 text-red-700",
  };
  return (
    <Badge className={`border-0 text-xs font-medium ${map[s]}`}>
      {s.replace("_", " ")}
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

export default function UsersPage() {
  const { token } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();

  // URL-state
  const [kind, setKind] = useState<Kind>(
    (sp.get("type") as Kind) || "INDIVIDUAL"
  );
  const [q, setQ] = useState(sp.get("q") || "");
  const [status, setStatus] = useState<Status | "ALL">(
    (sp.get("status") as any) || "ALL"
  );
  const [pageSize, setPageSize] = useState(Number(sp.get("limit") || 50));
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

  // fetch
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
      } catch (e: any) {
        setErr(e.message || "Failed to load users");
      } finally {
        setLoading(false);
      }
    })();
  }, [kind, q, status, page, pageSize]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data.total || 0) / pageSize)),
    [data.total, pageSize]
  );
  const fmtDate = (iso?: string) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", {
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
          <h1 className="text-xl font-semibold">User Management</h1>
          <p className="text-xs text-slate-500">
            Manage and monitor all registered users
          </p>
        </div>

        <div className="flex gap-2">
          {/* Add New dropdown sederhana */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/applications/new?type=individual")}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm shadow-sm hover:bg-slate-50 active:scale-[0.99]"
              title="Add Individual (KYC)"
            >
              <Plus className="h-4 w-4" />
              Add Individual
            </button>

            <button
              type="button"
              onClick={() => router.push("/applications/new?type=business")}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm shadow-sm hover:bg-slate-50 active:scale-[0.99]"
              title="Add Business (KYB)"
            >
              <Plus className="h-4 w-4" />
              Add Business
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
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Individuals
                </button>
                <button
                  onClick={() => {
                    setKind("BUSINESS");
                    setPage(1);
                  }}
                  className={`px-3 py-1.5 text-sm rounded-md ${
                    kind === "BUSINESS"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Businesses
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
                      ? "Search name, email, or phone..."
                      : "Search legal/trade name, NIB, NPWP..."
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
                  setStatus(e.target.value as any);
                  setPage(1);
                }}
                className="rounded-md border bg-white px-2 py-1.5 text-sm"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border bg-white px-2 py-1.5 text-sm"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n} per page
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
          <CardTitle className="text-base">All Users</CardTitle>
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
            <p className="py-6 text-center text-sm text-slate-500">No data.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {kind === "INDIVIDUAL" ? "Full Name" : "Legal Name"}
                    </TableHead>
                    <TableHead>
                      {kind === "INDIVIDUAL" ? "Email" : "NIB / NPWP"}
                    </TableHead>
                    <TableHead>
                      {kind === "INDIVIDUAL" ? "Phone Number" : "—"}
                    </TableHead>
                    <TableHead>Registration Date</TableHead>
                    <TableHead>Verification Status</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((row) => (
                    <TableRow key={row.application_id}>
                      <TableCell className="font-medium">
                        {row.display_name ||
                          (kind === "INDIVIDUAL" ? "Individual" : "Business")}
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
                          className="text-amber-700 hover:underline text-xs"
                        >
                          View
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between border-t pt-3 mt-3 text-sm">
            <div>
              Showing {data.items.length ? data.offset + 1 : 0} to{" "}
              {Math.min(data.offset + data.items.length, data.total)} of{" "}
              {data.total} results
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 disabled:opacity-50"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <span>{page}</span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-md border px-2 py-1 disabled:opacity-50"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
