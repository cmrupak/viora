import { useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Bell,
  Bookmark,
  Calendar,
  Clapperboard,
  Compass,
  Home,
  MessageCircle,
  PlusSquare,
  Settings,
  User,
  Users,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { AppHeader } from './AppHeader';
import { DesktopSidebar } from './DesktopSidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { RightSidebar } from './RightSidebar';
import { Card } from '../ui/Card';
import { SkeletonPost } from '../ui/Skeleton';

const mobileLinks = [
  { to: '/feed', label: 'Home', icon: Home },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/friends', label: 'Friends', icon: Users },
  { to: '/reels', label: 'Reels', icon: Clapperboard },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/notifications', label: 'Notifications', icon: Bell },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/events', label: 'Events', icon: Calendar },
  { to: '/saved', label: 'Saved', icon: Bookmark },
  { to: '/create', label: 'Create', icon: PlusSquare },
  { to: '/profile', label: 'Profile', icon: User },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function ShellPreview({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-4">
      <Card>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Phase 1 shell</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-[28px] leading-tight font-bold text-ink">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Design system, navigation, and responsive shells are live. Feature screens from later phases will fill this
          main column.
        </p>
      </Card>
      {children}
      <SkeletonPost />
      <SkeletonPost />
    </div>
  );
}

export function AppShell() {
  const { profile, user, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const displayName = profile?.displayName || user?.email || 'Member';

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-ink">
      <AppHeader
        displayName={displayName}
        avatarUrl={profile?.avatarUrl}
        mobileNavOpen={mobileNavOpen}
        onToggleMobileNav={() => setMobileNavOpen((open) => !open)}
      />

      {mobileNavOpen ? (
        <div className="scrollbar-hide fixed inset-x-0 top-16 z-30 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-border bg-surface p-3 lg:hidden">
          <nav className="grid grid-cols-2 gap-2">
            {mobileLinks.map((link) => {
              const Icon = link.icon;
              return (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileNavOpen(false)}
                  className="flex items-center gap-2 rounded-[12px] bg-surface-2 px-3 py-2.5 text-sm font-semibold text-ink"
                >
                  <Icon className="h-4 w-4" />
                  {link.label}
                </NavLink>
              );
            })}
          </nav>
        </div>
      ) : null}

      <div className="mx-auto flex min-h-0 w-full max-w-[1440px] flex-1 gap-0 px-4">
        <DesktopSidebar
          displayName={displayName}
          avatarUrl={profile?.avatarUrl}
          onLogout={() => void logout()}
        />

        <main className="scrollbar-hide mx-auto min-h-0 min-w-0 w-full max-w-[680px] flex-1 overflow-y-auto overscroll-contain py-4 pb-24 lg:pb-6">
          <Outlet
            context={{
              ShellPreview,
            }}
          />
        </main>

        <RightSidebar />
      </div>

      <MobileBottomNav />
    </div>
  );
}

export { ShellPreview };
