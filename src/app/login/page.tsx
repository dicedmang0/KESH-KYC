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
    if (token) router.replace('/dashboard'); // sudah login
  }, [token, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      const res = await apiFetch<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }, false);
      setToken(res.access_token);

      // (opsional) sanity check ping /auth/me
      try { await apiFetch('/auth/me'); } catch {}
      router.replace('/dashboard');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-semibold mb-4">Sign in</h1>
      <form onSubmit={onSubmit} className="space-y-3 bg-white p-4 rounded-xl border">
        <div>
          <label className="text-sm">Email</label>
          <input className="border rounded w-full px-2 py-2" value={email} onChange={e=>setEmail(e.target.value)} />
        </div>
        <div>
          <label className="text-sm">Password</label>
          <input className="border rounded w-full px-2 py-2" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button disabled={loading} className="w-full bg-black text-white rounded py-2">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p className="text-xs text-neutral-500 mt-3">Gunakan akun seed: <code>admin@example.com / Admin123!</code></p>
    </div>
  );
}
