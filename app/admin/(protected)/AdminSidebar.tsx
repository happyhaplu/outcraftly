'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/admin/dashboard', label: 'Overview' },
  { href: '/admin/users', label: 'User Management' },
  { href: '/admin/plans', label: 'Plans' }
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-64 border-r border-border/60 bg-card/80 p-6 lg:flex lg:flex-col">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Admin
      </div>
      <nav className="mt-6 flex flex-col gap-2 text-sm">
        {links.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center rounded-md px-3 py-2 font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
