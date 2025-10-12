'use client';

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Send,
  Users,
  Repeat,
  BarChart3,
  Settings,
  Menu,
  X,
  LogOut,
  UserRound,
  CreditCard,
  LifeBuoy,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import useSWR, { mutate } from 'swr';
import { User } from '@/lib/db/schema';
import { signOut } from '@/app/(login)/actions';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const primaryNavigation = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/senders', label: 'Senders', icon: Send },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/sequences', label: 'Sequences', icon: Repeat },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 }
];

const settingsNav = { href: '/dashboard/settings', label: 'Settings', icon: Settings };

const accountMenu = [
  { href: '/dashboard/general', label: 'Profile', icon: UserRound },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
  { href: '/pricing', label: 'Billing', icon: CreditCard },
  { href: '#', label: 'Help & Support', icon: LifeBuoy }
];

function useSignOutHandler() {
  const router = useRouter();

  return useCallback(async () => {
    await signOut();
    mutate('/api/user');
    router.push('/');
  }, [router]);
}

function SidebarLink({
  href,
  label,
  icon: Icon,
  active,
  onNavigate,
  collapsed
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        collapsed ? 'justify-center gap-0 px-0' : 'gap-3'
      } ${
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      }`}
    >
      <Icon className="h-4 w-4" />
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

function UserMenu() {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const router = useRouter();
  const handleSignOut = useSignOutHandler();

  if (!user) {
    return (
      <div className="flex items-center gap-3">
        <Button asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  const initials = (user.name || user.email || 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30">
        <Avatar className="size-10 cursor-pointer border border-primary/20">
          <AvatarImage alt={user.name || ''} />
          <AvatarFallback className="bg-primary/15 text-primary font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={12}
        className="w-60 space-y-1 p-2"
      >
        <DropdownMenuLabel className="py-2">
          <div className="text-sm font-semibold text-foreground">
            {user.name || 'Account'}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {user.email}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accountMenu.map((item) => (
          <DropdownMenuItem
            key={item.label}
            className="cursor-pointer rounded-md"
            onSelect={(event) => {
              event.preventDefault();
              if (item.href !== '#') {
                router.push(item.href);
              }
            }}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="w-full cursor-pointer rounded-md text-destructive focus:text-destructive"
          onSelect={(event) => {
            event.preventDefault();
            handleSignOut();
          }}
        >
          <LogOut className="h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarAccount({ collapsed }: { collapsed: boolean }) {
  const { data: user } = useSWR<User>('/api/user', fetcher);
  const handleSignOut = useSignOutHandler();

  if (!user) {
    return null;
  }

  const initials = (user.name || user.email || 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`flex items-center rounded-lg border border-border bg-secondary/40 px-3 py-3 transition-colors ${
        collapsed ? 'justify-center' : 'gap-3'
      }`}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-primary text-sm font-semibold text-primary-foreground">
        {initials}
      </div>
      {!collapsed && (
        <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {user.name || 'Account'}
            </p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
            aria-label="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}

function Header({ onToggle }: { onToggle: () => void }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onToggle}
          aria-label="Toggle navigation"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="ml-auto">
          <Suspense fallback={<div className="size-10" />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const closeMobile = () => setMobileOpen(false);
  const isSidebarCollapsed = isCollapsed && !mobileOpen;

  const isRouteActive = (href: string) => {
    if (href === '#') {
      return false;
    }

    if (href === '/dashboard') {
      return pathname === '/dashboard';
    }

    return pathname.startsWith(href);
  };

  return (
    <section className="flex min-h-screen bg-background">
      <div
        className={`fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity lg:hidden ${mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={closeMobile}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform border-r border-border bg-card px-4 py-6 shadow-xl transition-transform duration-300 lg:static lg:h-auto lg:translate-x-0 lg:shadow-none ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${isCollapsed ? 'lg:w-24' : 'lg:w-72'}`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-primary text-sm font-semibold text-primary-foreground">
                O
              </span>
              {!isSidebarCollapsed && <span>Outcraftly</span>}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={closeMobile}
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex"
                onClick={() => setIsCollapsed((prev) => !prev)}
                aria-label="Toggle sidebar"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          <div className="mt-8 flex-1 space-y-6 overflow-y-auto">
            <div>
              {!isSidebarCollapsed && (
                <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Main menu
                </p>
              )}
              <nav className={`mt-3 flex flex-col gap-1 ${isSidebarCollapsed ? 'items-center' : ''}`}>
                {primaryNavigation.map((item) => (
                  <SidebarLink
                    key={item.label}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    active={isRouteActive(item.href)}
                    onNavigate={closeMobile}
                    collapsed={isSidebarCollapsed}
                  />
                ))}
              </nav>
            </div>
          </div>
          <div className="mt-auto space-y-3 border-t border-border/70 pt-6">
            {!isSidebarCollapsed && (
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                Account
              </p>
            )}
            <SidebarLink
              href={settingsNav.href}
              label={settingsNav.label}
              icon={settingsNav.icon}
              active={pathname.startsWith(settingsNav.href)}
              onNavigate={closeMobile}
              collapsed={isSidebarCollapsed}
            />
            <SidebarAccount collapsed={isSidebarCollapsed} />
          </div>
        </div>
      </aside>
      <div className="flex flex-1 flex-col lg:pl-0">
        <Header onToggle={() => setMobileOpen((prev) => !prev)} />
        <main className="flex-1 bg-background px-4 py-8 sm:px-6 lg:px-10">
          <div className="mx-auto w-full max-w-6xl space-y-8">{children}</div>
        </main>
      </div>
    </section>
  );
}
