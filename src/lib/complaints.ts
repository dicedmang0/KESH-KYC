import { apiFetch } from './api';

// ── Status / type enums ───────────────────────────────────────────────────────

export type ComplaintStatus   = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export type ComplaintCategory = 'TRANSFER' | 'KYC_DATA' | 'DOCUMENT' | 'SERVICE' | 'OTHER';
export type ComplaintChannel  = 'WALK_IN' | 'WHATSAPP' | 'EMAIL' | 'PHONE' | 'OTHER';
export type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH';

// ── Entity types ──────────────────────────────────────────────────────────────

export type Complaint = {
  id: number | string;
  complaint_no?: string | null;
  customer_application_id?: number | string | null;
  customer_name?: string | null;
  cif_no?: string | null;
  customer_type?: string | null;
  transfer_id?: number | string | null;
  transaction_reference?: string | null;
  category?: ComplaintCategory | null;
  channel?: ComplaintChannel | null;
  priority?: ComplaintPriority | null;
  status?: ComplaintStatus | null;
  complaint_notes?: string | null;
  resolution_notes?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  updated_at?: string | null;
};

export type ComplaintCustomerSearchItem = {
  application_id: number | string;
  display_name?: string | null;
  cif_no?: string | null;
  customer_type?: string | null;
};

export type ComplaintTransactionSearchItem = {
  transfer_id: number | string;
  transaction_reference?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  result?: string | null;
  created_at?: string | null;
};

export type CreateComplaintPayload = {
  customer_application_id: number | string;
  transfer_id?: number | string;
  transaction_reference?: string;
  category: ComplaintCategory;
  channel: ComplaintChannel;
  priority: ComplaintPriority;
  complaint_notes: string;
};

export type UpdateComplaintPayload = {
  category?: ComplaintCategory;
  channel?: ComplaintChannel;
  priority?: ComplaintPriority;
  status?: ComplaintStatus;
  complaint_notes?: string;
  resolution_notes?: string;
};

export type PaginatedComplaints = {
  data: Complaint[];
  page: number;
  limit: number;
  total: number;
};

// ── Display labels ────────────────────────────────────────────────────────────

export const COMPLAINT_CATEGORY_LABELS: Record<string, string> = {
  TRANSFER:  'Transfer',
  KYC_DATA:  'Data KYC',
  DOCUMENT:  'Dokumen',
  SERVICE:   'Layanan',
  OTHER:     'Lainnya',
};

export const COMPLAINT_CHANNEL_LABELS: Record<string, string> = {
  WALK_IN:   'Walk-in',
  WHATSAPP:  'WhatsApp',
  EMAIL:     'Email',
  PHONE:     'Telepon',
  OTHER:     'Lainnya',
};

export const COMPLAINT_PRIORITY_LABELS: Record<string, string> = {
  LOW:    'Low',
  MEDIUM: 'Medium',
  HIGH:   'High',
};

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  OPEN:        'Open',
  IN_PROGRESS: 'Dalam Proses',
  RESOLVED:    'Selesai',
  CLOSED:      'Ditutup',
};

// ── Formatters ────────────────────────────────────────────────────────────────

export function formatComplaintStatus(status?: string | null): string {
  return (status && COMPLAINT_STATUS_LABELS[status]) || status || '—';
}

export function formatComplaintCategory(category?: string | null): string {
  return (category && COMPLAINT_CATEGORY_LABELS[category]) || category || '—';
}

export function formatComplaintChannel(channel?: string | null): string {
  return (channel && COMPLAINT_CHANNEL_LABELS[channel]) || channel || '—';
}

export function formatComplaintPriority(priority?: string | null): string {
  return (priority && COMPLAINT_PRIORITY_LABELS[priority]) || priority || '—';
}

// ── Query builder ─────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

// ── API functions ─────────────────────────────────────────────────────────────

// Both search endpoints may return a plain array or a paginated envelope.
// Always extract to a plain array so callers never need to handle the envelope.
type MaybeList<T> = T[] | { data: T[] };

function extractList<T>(res: MaybeList<T>): T[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as { data: T[] }).data)) return (res as { data: T[] }).data;
  return [];
}

export async function searchComplaintCustomers(q: string): Promise<ComplaintCustomerSearchItem[]> {
  const res = await apiFetch<MaybeList<ComplaintCustomerSearchItem>>(
    `/complaints/customers/search${buildQuery({ q })}`
  );
  return extractList(res);
}

export async function searchComplaintTransactions(
  customer_application_id: number | string,
  q: string,
): Promise<ComplaintTransactionSearchItem[]> {
  const res = await apiFetch<MaybeList<ComplaintTransactionSearchItem>>(
    `/complaints/transactions/search${buildQuery({ customer_application_id, q })}`
  );
  return extractList(res);
}

export function getComplaints(params: {
  status?: string;
  q?: string;
  customer_application_id?: number | string;
  page?: number;
  limit?: number;
} = {}) {
  return apiFetch<PaginatedComplaints>(
    `/complaints${buildQuery(params as Record<string, string | number | undefined>)}`
  );
}

export function getComplaint(id: number | string) {
  return apiFetch<Complaint>(`/complaints/${id}`);
}

export function createComplaint(body: CreateComplaintPayload) {
  return apiFetch<Complaint>('/complaints', { method: 'POST', body });
}

export function updateComplaint(id: number | string, body: UpdateComplaintPayload) {
  return apiFetch<Complaint>(`/complaints/${id}`, { method: 'PATCH', body });
}

// ── Permission helpers ────────────────────────────────────────────────────────

export function canCreateComplaint(role?: string | null): boolean {
  return role === 'FrontDesk' || role === 'SystemAdmin';
}

export function canResolveComplaint(role?: string | null): boolean {
  return role === 'OperationSupervisor' || role === 'FinanceManager' || role === 'SystemAdmin' || role === 'Director';
}

export function canUpdateComplaint(role?: string | null, complaint?: Complaint | null): boolean {
  if (role === 'OperationSupervisor' || role === 'FinanceManager' || role === 'SystemAdmin' || role === 'Director') return true;
  if (role === 'FrontDesk') return complaint?.status === 'OPEN';
  return false;
}

export function isComplaintReadOnly(role?: string | null, complaint?: Complaint | null): boolean {
  if (role === 'Auditor') return true;
  if (role === 'FrontDesk' && complaint?.status !== 'OPEN') return true;
  return false;
}
