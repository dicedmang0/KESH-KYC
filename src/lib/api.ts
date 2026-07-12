// src/lib/api.ts

const RAW_API = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:4000/api";
export const API = RAW_API.replace(/\/+$/, ""); // hapus trailing "/"

const TOKEN_KEY = "access_token";

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function buildUrl(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API}${p}`;
}

/**
 * Supaya TS tidak menganggap opts.body hanya BodyInit.
 * Kita override tipe body jadi "any" (support object JSON).
 */
export type ApiFetchOptions = Omit<RequestInit, "body"> & {
  body?: BodyInit | Record<string, unknown> | unknown[] | null;
};

function isJsonObjectBody(body: unknown): boolean {
  if (!body) return false;
  if (typeof body === "string") return false;
  if (body instanceof FormData) return false;
  if (body instanceof Blob) return false;
  if (body instanceof ArrayBuffer) return false;
  if (body instanceof URLSearchParams) return false;
  // ReadableStream mungkin tidak ada di semua env
  if (typeof ReadableStream !== "undefined" && body instanceof ReadableStream) return false;
  return typeof body === "object";
}

export async function apiFetch<T>(
  path: string,
  opts: ApiFetchOptions = {},
  withAuth = true
): Promise<T> {
  const headers = new Headers(opts.headers || {});
  const url = buildUrl(path);

  if (withAuth) {
    const t = getToken();
    if (t) headers.set("Authorization", `Bearer ${t}`);
  }

  let body: BodyInit | null | undefined;
  if (isJsonObjectBody(opts.body)) {
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.body);
  } else {
    body = opts.body as BodyInit | null | undefined;
    if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
  }

  const res = await fetch(url, {
    ...opts,
    headers,
    body,
    cache: "no-store",
  });

  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const j = await res.json();
        msg = j?.message || j?.error || JSON.stringify(j);
      } else {
        const t = await res.text();
        if (t) msg = t;
      }
    } catch {}
    throw new Error(msg);
  }

  // handle empty / non-json response
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text().catch(() => "");
    // kalau endpoint memang return text, kamu bisa cast manual di caller
    return (text as unknown) as T;
  }

  // json response (atau empty)
  return res.json().catch(() => ({} as T));
}

export async function apiUpload(path: string, form: FormData, withAuth = true) {
  const headers: Record<string, string> = {};

  if (withAuth) {
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(buildUrl(path), {
    method: "POST",
    headers, // jangan set Content-Type untuk FormData
    body: form,
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j?.message || j?.error || msg;
    } catch {
      try {
        const t = await res.text();
        if (t) msg = t;
      } catch {}
    }
    throw new Error(msg);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return res.text().catch(() => ({}));
  return res.json().catch(() => ({}));
}

// Decode role from a JWT access token (client-side only — no verification).
export function getRoleFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

// Decode the display name from a JWT access token, if present (client-side only).
export function getNameFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { full_name?: unknown; name?: unknown };
    const name = payload.full_name ?? payload.name;
    return typeof name === "string" && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}
