'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

type UserDetail = {
  id: number;
  full_name: string;
  email: string | null;
  phone: string;
  dob?: string;
  pob?: string;
  nationality?: string;
  identity_type?: string;
  identity_number?: string;
  address_identity?: string;
  address_residential?: string;
  verification_status: 'DRAFT' | 'APPROVED' | 'REJECTED';
  risk?: string;
  documents?: { name: string; url: string }[];
};

export default function UserDetailPage() {
  const { id } = useParams();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    async function loadUser() {
      setLoading(true);
      setErr('');
      try {
        const data = await apiFetch<UserDetail>(`/users/${id}`);
        setUser(data);
      } catch (e: any) {
        setErr(e?.message || 'Gagal load user');
      } finally {
        setLoading(false);
      }
    }
    if (id) loadUser();
  }, [id]);

  if (loading) return <p className="text-sm text-neutral-500">Loading…</p>;
  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!user) return <p className="text-sm text-neutral-500">User tidak ditemukan</p>;

  return (
    <div className="p-6 space-y-4 max-w-2xl">
      <h1 className="text-xl font-semibold">{user.full_name}</h1>
      <p className="text-sm text-neutral-500">Status: {user.verification_status}</p>

      <div className="border rounded-lg p-4 space-y-2">
        <h2 className="font-medium text-sm">Informasi Personal</h2>
        <p><strong>Email:</strong> {user.email ?? '-'}</p>
        <p><strong>Phone:</strong> {user.phone}</p>
        <p><strong>Place/Date of Birth:</strong> {user.pob ?? '-'}, {user.dob ?? '-'}</p>
        <p><strong>Nationality:</strong> {user.nationality ?? '-'}</p>
      </div>

      <div className="border rounded-lg p-4 space-y-2">
        <h2 className="font-medium text-sm">Identitas</h2>
        <p><strong>Type:</strong> {user.identity_type ?? '-'}</p>
        <p><strong>Number:</strong> {user.identity_number ?? '-'}</p>
        <p><strong>Identity Address:</strong> {user.address_identity ?? '-'}</p>
        <p><strong>Residential Address:</strong> {user.address_residential ?? '-'}</p>
      </div>

      {user.documents && user.documents.length > 0 && (
        <div className="border rounded-lg p-4 space-y-2">
          <h2 className="font-medium text-sm">Dokumen KYC/KYB</h2>
          <ul className="list-disc pl-5">
            {user.documents.map((doc, idx) => (
              <li key={idx}>
                <a href={doc.url} target="_blank" className="text-blue-600 underline">{doc.name}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
