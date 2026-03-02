'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  BarChart3,
  Users,
  ShieldCheck,
  FileBarChart,
  Settings,
  Menu,
  LogOut,
  ArrowLeftRight, // icon Transfers
} from 'lucide-react';
import { useAuth } from '@/app/providers';

function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// decode role dari JWT (payload.role)
function getRoleFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return null;
    const payloadPart = parts[1];
    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = atob(padded);
    const payload = JSON.parse(json);
    return payload.role ?? null;
  } catch {
    return null;
  }
}

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const allItems: Item[] = [
  { href: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { href: '/users', label: 'User Management', icon: Users },
  { href: '/kyc', label: 'KYC Verification', icon: ShieldCheck },
  { href: '/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { token, logout } = useAuth();

  const role = getRoleFromToken(token);

  // 🔒 Aturan visibilitas menu:
  // - FinanceStaff / FinanceManager: hanya Transfers + Reports
  // - SystemAdmin: semua menu
  // - Lainnya: semua KECUALI Transfers & Settings (boleh dikustom lagi nanti)
  let visibleItems: Item[];

  if (role === 'FinanceStaff' || role === 'FinanceManager') {
    visibleItems = allItems.filter((item) =>
      item.href === '/transfers' || item.href === '/reports'
    );
  } else if (role === 'SystemAdmin') {
    visibleItems = allItems;
  } else {
    visibleItems = allItems.filter((item) => {
      // sembunyikan Transfers & Settings untuk non-finance, non-SystemAdmin
      if (item.href === '/transfers') return false;
      if (item.href === '/settings') return false;
      return true;
    });
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="font-semibold">KESH</div>
          <button
            aria-label="Toggle sidebar"
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded hover:bg-neutral-100"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed z-40 inset-y-0 left-0 w-64 bg-white border-r flex flex-col',
          'transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* brand */}
        <div className="px-4 py-4 border-b">
          <div className="text-lg font-semibold">KESH</div>
          <div className="text-xs text-neutral-500">KYC Admin Portal</div>
        </div>

        {/* nav */}
        <nav className="p-2 space-y-1 overflow-y-auto">
          {visibleItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm',
                  active
                    ? 'bg-neutral-100 font-medium text-neutral-900'
                    : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                )}
                onClick={() => setOpen(false)}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* footer / logout */}
        <div className="mt-auto p-3 border-t">
          {token && (
            <button
              onClick={() => {
                logout();
                setOpen(false);
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          )}
          <div className="mt-2 text-[10px] text-neutral-400">
            © {new Date().getFullYear()} KESH
          </div>
        </div>
      </aside>
    </>
  );
}
