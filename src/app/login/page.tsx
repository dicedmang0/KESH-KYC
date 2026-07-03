'use client';

import { apiFetch } from '@/lib/api';
import { useAuth } from '@/app/providers';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const { token, setToken } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('Admin123!');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (token) router.replace('/dashboard');
  }, [token, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ access_token: string }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) },
        false
      );
      setToken(res.access_token);
      try { await apiFetch('/auth/me'); } catch {}
      router.replace('/dashboard');
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Login gagal');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-kesh-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo + title */}
        <div className="flex flex-col items-center mb-7">
          <div className="h-12 w-12 rounded-full bg-kesh-700 flex items-center justify-center mb-3 shadow-lg ring-4 ring-white/10">
            <span className="text-white font-bold text-lg select-none">K</span>
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">KESH Admin</h1>
          <p className="text-sm text-white/55 mt-1">Silakan masuk ke akun Anda</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-kesh-700 focus:ring-2 focus:ring-kesh-700/15"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-kesh-700 focus:ring-2 focus:ring-kesh-700/15"
                required
              />
            </div>

            {err && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-600">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-kesh-700 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-kesh-600 disabled:opacity-60"
            >
              {loading ? 'Sedang masuk…' : 'Masuk'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-white/35">
          Gunakan akun admin yang telah didaftarkan
        </p>
      </div>
    </div>
  );
}
