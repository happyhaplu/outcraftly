import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const experimental_ppr = false;

export const metadata: Metadata = {
  title: 'Outcraftly',
  description: 'Automate your cold outreach with intelligent email sequences and deliverability monitoring.'
};

export const viewport: Viewport = {
  maximumScale: 1
};

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap'
});

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`bg-white dark:bg-gray-900 text-slate-900 dark:text-white ${inter.className}`}
    >
      <body className="min-h-[100dvh] bg-gray-50">
        {/* Client-only UI like Toaster and Error boundary are mounted in the client layout
            under `app/(client)/layout.tsx`. Keep this server layout free of client imports. */}
        {children}
      </body>
    </html>
  );
}
