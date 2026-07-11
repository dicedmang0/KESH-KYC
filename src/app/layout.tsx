// src/app/layout.tsx
import type { Metadata } from 'next';
import './globals.css';
import Providers from './providers';
import Toaster from '@/components/Toaster';

export const metadata: Metadata = {
  title: 'KYC/KYB Internal',
  description: 'Internal Console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-neutral-50 text-neutral-900">
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
