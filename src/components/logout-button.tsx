'use client';

import { useAuth } from '@/app/providers';

export default function LogoutButton() {
  const { token, logout } = useAuth();
  if (!token) return null;
  return (
    <button onClick={logout} className="text-red-600 hover:underline">
      Logout
    </button>
  );
}
