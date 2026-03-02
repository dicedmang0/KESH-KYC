'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { setToken as persistToken, getToken as readToken } from '@/lib/api';

type AuthCtx = {
  token: string | null;
  setToken: (t: string | null) => void;
  logout: () => void;
};
const Ctx = createContext<AuthCtx>({ token: null, setToken: () => {}, logout: () => {} });
export const useAuth = () => useContext(Ctx);

export default function Providers({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => { setTokenState(readToken()); }, []);

  const setToken = (t: string | null) => {
    persistToken(t);
    setTokenState(t);
    if (!t && pathname !== '/login') router.replace('/login');
  };

  const logout = () => setToken(null);

  return <Ctx.Provider value={{ token, setToken, logout }}>{children}</Ctx.Provider>;
}
