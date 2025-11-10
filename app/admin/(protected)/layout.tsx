import { ReactNode } from 'react';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { AdminSidebar } from './AdminSidebar';

export default async function AdminProtectedLayout({
  children
}: {
  children: ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-7xl flex-col lg:flex-row">
        <AdminSidebar />
        <div className="flex-1">
          <header className="border-b border-border/60 bg-card/80 px-6 py-4 lg:hidden">
            <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Admin Area
            </p>
          </header>
          <main className="px-6 py-8 lg:px-12 lg:py-12">{children}</main>
        </div>
      </div>
    </div>
  );
}
