'use client';

import { useAuth } from '@/app/providers';
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

export default function Guard({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const t = token ?? localStorage.getItem('access_token');
    if (!t && pathname !== '/login') router.replace('/login');
  }, [token, pathname, router]);

  return <>{children}</>;
}
