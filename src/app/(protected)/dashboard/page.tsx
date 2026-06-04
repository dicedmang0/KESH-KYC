"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/providers";
import { apiFetch } from "@/lib/api";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/** ===== Types FE (tetap sesuai UI) ===== */
type DashboardSummary = {
  totalRegisteredUsers: number;
  verifiedUsers: number;
  pendingVerification: number;
  rejectedKyc: number;
  lastUpdated?: string;
};

type KycStatus = "PENDING" | "VERIFIED" | "REJECTED";

type KycSubmission = {
  id: string;
  userName: string;
  email: string;
  idType: string;
  submissionDate: string; // ISO
  status: KycStatus;
};

/** ===== Types BE (ringkas) ===== */
type BERecent = {
  id: number;
  type: "INDIVIDUAL" | "BUSINESS";
  status: string; // e.g. DRAFT | SUBMITTED | IN_REVIEW | APPROVED | REJECTED
  created_at?: string | null;
  submitted_at?: string | null;
  risk_level?: "LOW" | "MEDIUM" | "HIGH" | null;
  risk_score?: number | null;
  // (opsional) kalau nanti BE ikut kirim display fields:
  full_name?: string | null;
  email?: string | null;
  id_type?: string | null;
};
type BESummary = {
  totals: {
    total: number;
    status: Record<string, number>; // { APPROVED: 12, REJECTED: 3, ... }
    risk: Record<string, number>;
  };
  recent: BERecent[];
};

export default function DashboardPage() {
  const router = useRouter();
  const { token } = useAuth();

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [submissions, setSubmissions] = useState<KycSubmission[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guard kalau belum login
  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  // Helper aman format tanggal
  const formatDate = (iso?: string | null) => {
    if (!iso) return "-";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  // Map status BE -> status FE
  const mapStatusToKyc = (s: string): KycStatus => {
    const v = s?.toUpperCase?.() || "";
    if (v.includes("APPROVED") || v.includes("VERIFIED") || v.includes("ACCEPTED")) return "VERIFIED";
    if (v.includes("REJECTED") || v.includes("DECLINED")) return "REJECTED";
    return "PENDING"; // DRAFT/SUBMITTED/IN_REVIEW => PENDING
  };

  useEffect(() => {
    if (!token) return;

    (async () => {
      setLoadingSummary(true);
      setLoadingSubs(true);
      setError(null);
      try {
        // satu call saja ke BE
        const be = await apiFetch<BESummary>("/kyc/dashboard-summary");

        // ringkasan
        const total = be?.totals?.total ?? 0;
        const s = be?.totals?.status || {};
        const verified =
          (s.APPROVED ?? 0) + (s.VERIFIED ?? 0) + (s.ACCEPTED ?? 0);
        const rejected = s.REJECTED ?? 0;
        const pending =
          total - verified - rejected >= 0 ? total - verified - rejected : 0;

        setSummary({
          totalRegisteredUsers: total,
          verifiedUsers: verified,
          pendingVerification: pending,
          rejectedKyc: rejected,
          lastUpdated: new Date().toISOString(),
        });
        setLoadingSummary(false);

        // recent submissions
        const recent = (be?.recent ?? []).map<KycSubmission>((r) => ({
          id: String(r.id),
          userName: r.full_name || (r.type === "INDIVIDUAL" ? "Individual" : "Business"),
          email: r.email || "-",
          idType: r.id_type || (r.type === "INDIVIDUAL" ? "KTP/PASPOR" : "NPWP/NIB"),
          submissionDate: r.submitted_at || r.created_at || new Date().toISOString(),
          status: mapStatusToKyc(r.status),
        }));
        setSubmissions(recent);
        setLoadingSubs(false);
      } catch (e: any) {
        setError(e.message || "Failed to load dashboard");
        setLoadingSummary(false);
        setLoadingSubs(false);
      }
    })();
  }, [token]);

  const renderStatusBadge = (status: KycStatus) => {
    if (status === "PENDING") {
      return <Badge className="border-0 bg-amber-100 text-xs font-medium text-amber-700">Pending</Badge>;
    }
    if (status === "VERIFIED") {
      return <Badge className="border-0 bg-emerald-100 text-xs font-medium text-emerald-700">Verified</Badge>;
    }
    return <Badge className="border-0 bg-red-100 text-xs font-medium text-red-700">Rejected</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-2 rounded-xl bg-white p-4 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-xs text-slate-400">Dashboard Overview</p>
          <p className="text-sm font-medium text-slate-900">Welcome back, Administrator</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">Last updated</p>
          <p className="text-xs font-medium text-slate-700">
            {summary?.lastUpdated
              ? new Date(summary.lastUpdated).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) + " today"
              : "a few seconds ago"}
          </p>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {/* KPI cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loadingSummary || !summary ? (
          [...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-32" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Total Registered Users</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {summary.totalRegisteredUsers.toLocaleString("en-US")}
                </p>
                <p className="mt-1 text-xs text-emerald-600">+8.2% from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Verified Users</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {summary.verifiedUsers.toLocaleString("en-US")}
                </p>
                <p className="mt-1 text-xs text-emerald-600">+5.4% from last month</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Pending Verification</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {summary.pendingVerification.toLocaleString("en-US")}
                </p>
                <p className="mt-1 text-xs text-amber-600">+12.1% from yesterday</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Rejected KYC</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">
                  {summary.rejectedKyc.toLocaleString("en-US")}
                </p>
                <p className="mt-1 text-xs text-red-600">-2.3% from last month</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Recent KYC Submissions */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold text-slate-900">Recent KYC Submissions</CardTitle>
          <button onClick={() => router.push("/users")} className="text-xs font-medium text-amber-700 hover:underline">
            View All Submissions
          </button>
        </CardHeader>
        <CardContent className="pt-0">
          {loadingSubs ? (
            <div className="space-y-2 pt-4">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          ) : submissions.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Belum ada KYC submission.</p>
          ) : (
            <div className="overflow-x-auto pt-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>ID Type</TableHead>
                    <TableHead>Submission Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((sub) => (
                    <TableRow key={sub.id}>
                      <TableCell className="whitespace-nowrap text-sm font-medium text-slate-900">{sub.userName}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-slate-700">{sub.email}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-slate-700">{sub.idType}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-slate-700">{formatDate(sub.submissionDate)}</TableCell>
                      <TableCell className="whitespace-nowrap">{renderStatusBadge(sub.status)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
