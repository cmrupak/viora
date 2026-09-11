import {
  Bell,
  Bookmark,
  Calendar,
  Home,
  LogOut,
  MessageCircle,
  Moon,
  Search,
  Settings,
  Smartphone,
  Sun,
  Users,
  User,
  Compass,
  Clapperboard,
  PlusSquare,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { brand } from '../../design/tokens';
import { useTheme } from '../../design/ThemeProvider';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';

const links: Array<{ to: string; label: string; icon: typeof Home; badge?: string }> = [
  { to: '/feed', label: 'Home', icon: Home },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/search', label: 'Search', icon: Search },
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
  { to: '/app', label: 'Get the app', icon: Smartphone },
];

export function DesktopSidebar({
  displayName,
  avatarUrl,
  onLogout,
}: {
  displayName?: string;
  avatarUrl?: string | null;
  onLogout?: () => void;
}) {
  const { mode, toggle } = useTheme();

  return (
    <aside className="sticky top-0 hidden h-full w-[260px] shrink-0 flex-col overflow-hidden border-r border-border bg-surface px-3 py-4 lg:flex">
      <div className="mb-4 flex items-center gap-3 rounded-[16px] bg-surface-2 p-3">
        <Avatar src={avatarUrl} name={displayName} size={40} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{displayName || brand.name}</p>
          <p className="truncate text-xs text-muted">Your workspace</p>
        </div>
      </div>

      <nav className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" aria-label="Primary">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-semibold transition ${
                  isActive ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-surface-2'
                }`
              }
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="flex-1">{link.label}</span>
              {link.badge ? <Badge>{link.badge}</Badge> : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="mt-3 space-y-1 border-t border-border pt-3">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-semibold text-ink hover:bg-surface-2"
        >
          {mode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          {mode === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        {onLogout ? (
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-semibold text-danger hover:bg-danger/10"
          >
            <LogOut className="h-5 w-5" />
            Log out
          </button>
        ) : null}
      </div>
    </aside>
  );
}
