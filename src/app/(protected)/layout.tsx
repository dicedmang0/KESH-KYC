// src/app/(protected)/layout.tsx
import Sidebar from '@/components/sidebar';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-neutral-50">
      <Sidebar />
      <main className="lg:pl-64">
        <div className="max-w-6xl mx-auto px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
