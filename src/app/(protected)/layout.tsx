// src/app/(protected)/layout.tsx
import Sidebar from '@/components/sidebar';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#F8FAFB]">
      <Sidebar />

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200/80 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="hidden lg:block">
              <p className="text-sm font-semibold text-slate-800 leading-tight">KESH KYC Admin</p>
              <p className="text-xs text-slate-400 leading-tight">Portal Kepatuhan Internal</p>
            </div>
            <div className="flex items-center gap-3 ml-auto">
              <div className="h-8 w-8 rounded-full bg-kesh-700 flex items-center justify-center text-xs font-bold text-white shadow-sm select-none">
                K
              </div>
            </div>
          </div>
        </header>

        <main>
          <div className="max-w-6xl mx-auto px-4 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
