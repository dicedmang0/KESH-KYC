'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3,
  Users,
  ShieldCheck,
  FileBarChart,
  Settings,
  Menu,
  LogOut,
  ArrowLeftRight,
  ClipboardList,
  AlertTriangle,
  X,
} from 'lucide-react';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';

function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const allItems: Item[] = [
  { href: '/dashboard',  label: 'Dashboard',               icon: BarChart3      },
  { href: '/users',      label: 'Manajemen Pengguna Jasa', icon: Users          },
  { href: '/kyc',        label: 'Verifikasi KYC/KYB',      icon: ShieldCheck    },
  { href: '/transfers',  label: 'Pencatatan Transfer',      icon: ArrowLeftRight },
  { href: '/watchlist',  label: 'Daftar Pengawasan',        icon: ClipboardList  },
  { href: '/monitoring', label: 'Monitoring',               icon: AlertTriangle  },
  { href: '/reports',    label: 'Laporan',                  icon: FileBarChart   },
  { href: '/settings',   label: 'Pengaturan',               icon: Settings       },
];

// Director sees a different label for the monitoring menu entry.
const ROLE_ITEM_LABEL: Record<string, Partial<Record<string, string>>> = {
  Director: { '/monitoring': 'Monitoring Dirut' },
};

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { token, logout } = useAuth();
  const role = getRoleFromToken(token);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMounted(true); }, []);

  const ROLE_MENU: Record<string, string[]> = {
    SystemAdmin:    ['/dashboard', '/users', '/kyc', '/transfers', '/watchlist', '/monitoring', '/reports', '/settings'],
    BranchAdmin:    [],
    ComplianceLead: ['/dashboard', '/kyc', '/watchlist', '/monitoring', '/reports'],
    Director:       ['/dashboard', '/monitoring'],
    FrontDesk:      ['/dashboard', '/users', '/kyc', '/transfers'],
    Auditor:        ['/dashboard', '/kyc', '/monitoring', '/reports'],
    FinanceStaff:   ['/dashboard', '/transfers', '/reports'],
    FinanceManager: ['/dashboard', '/transfers', '/reports'],
  };

  const allowedHrefs = new Set(ROLE_MENU[role ?? ''] ?? ['/dashboard']);
  const visibleItems = allItems.filter(({ href }) => allowedHrefs.has(href));

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 bg-kesh-900 border-b border-white/10">
        <div className="px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-kesh-700 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-xs select-none">K</span>
            </div>
            <span className="font-semibold text-white text-sm">KESH Admin</span>
          </div>
          <button
            aria-label="Toggle sidebar"
            onClick={() => setOpen((v) => !v)}
            className="p-2 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={cn(
          'fixed z-40 inset-y-0 left-0 w-64 flex flex-col',
          'bg-kesh-900 border-r border-white/10',
          'transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand header */}
        <div className="px-4 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-kesh-700 flex items-center justify-center shrink-0 shadow-md ring-2 ring-white/10">
              <span className="text-white font-bold text-sm select-none">K</span>
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-tight">KESH Admin</p>
              <p className="text-xs text-white/45 leading-tight">Portal KYC</p>
            </div>
          </div>
        </div>

        {/* Navigation — rendered only after mount so server and client initial
            output are identical (empty nav), avoiding className attribute mismatches
            from role/pathname-dependent active state. */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {mounted && visibleItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href + '/');
            const displayLabel = ROLE_ITEM_LABEL[role ?? '']?.[href] ?? label;
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-white/60 hover:bg-white/8 hover:text-white/90'
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-white' : 'text-white/50')} />
                <span>{displayLabel}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer / logout */}
        <div className="p-3 border-t border-white/10">
          {token && (
            <button
              onClick={() => { logout(); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/55 hover:bg-white/8 hover:text-white transition-colors"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>Keluar</span>
            </button>
          )}
          {/* Year rendered only after mount — new Date() at SSR time is
              non-deterministic and would mismatch at year boundaries. */}
          <p className="mt-2 px-3 text-[10px] text-white/25">
            {mounted ? `© ${new Date().getFullYear()} KESH` : '© KESH'}
          </p>
        </div>
      </aside>
    </>
  );
}
