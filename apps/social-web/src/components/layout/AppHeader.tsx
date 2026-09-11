import { FormEvent, useEffect, useState } from 'react';
import { Bell, Menu, MessageCircle, Search, X } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { brand } from '../../design/tokens';
import { useAuth } from '../../auth/AuthProvider';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Input } from '../ui/Input';

export function AppHeader({
  displayName,
  avatarUrl,
  mobileNavOpen,
  onToggleMobileNav,
}: {
  displayName?: string;
  avatarUrl?: string | null;
  mobileNavOpen: boolean;
  onToggleMobileNav: () => void;
}) {
  const { api, user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    void (async () => {
      try {
        const count = await api.notifications.unreadCount(user.id);
        if (active) setUnread(count);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, [api, user]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4">
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-[12px] text-ink hover:bg-surface-2 lg:hidden"
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          onClick={onToggleMobileNav}
        >
          {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        <Link to="/feed" className="font-[family-name:var(--font-display)] text-2xl font-bold text-primary">
          {brand.name}
        </Link>

        <form onSubmit={onSearch} className="mx-auto hidden w-full max-w-md md:block">
          <label className="relative block">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              className="pl-10"
              placeholder="Search people, posts, groups…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </form>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            to="/search"
            className="grid h-10 w-10 place-items-center rounded-[12px] text-ink hover:bg-surface-2 md:hidden"
            aria-label="Search"
          >
            <Search className="h-5 w-5" />
          </Link>
          <Link
            to="/messages"
            className="relative grid h-10 w-10 place-items-center rounded-[12px] text-ink hover:bg-surface-2"
            aria-label="Messages"
          >
            <MessageCircle className="h-5 w-5" />
          </Link>
          <Link
            to="/notifications"
            className="relative grid h-10 w-10 place-items-center rounded-[12px] text-ink hover:bg-surface-2"
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unread > 0 ? (
              <span className="absolute top-1.5 right-1.5">
                <Badge>{unread > 9 ? '9+' : unread}</Badge>
              </span>
            ) : null}
          </Link>
          <Link to="/profile" className="ml-1" aria-label="Your profile">
            <Avatar src={avatarUrl} name={displayName} size={36} />
          </Link>
        </div>
      </div>
    </header>
  );
}
