import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, type Notification } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

function notificationHref(n: Notification): string | null {
  if (n.postId) return `/posts/${n.postId}`;
  if (n.conversationId) return `/messages/${n.conversationId}`;
  if (n.actor?.username) return `/u/${n.actor.username}`;
  return null;
}

function labelFor(n: Notification): string {
  const who = n.actor?.displayName || n.actor?.username || 'Someone';
  switch (n.type) {
    case 'like':
      return `${who} liked your post`;
    case 'comment':
      return `${who} commented`;
    case 'reply':
      return `${who} replied`;
    case 'follow':
      return `${who} followed you`;
    case 'share':
      return `${who} shared your post`;
    case 'message':
      return `${who} sent a message`;
    case 'mention':
      return `${who} mentioned you`;
    default:
      return n.body || 'Notification';
  }
}

export function NotificationsPage() {
  const { api, user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const list = await api.notifications.list(user.id);
        if (active) setItems(list);
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, user]);

  async function markOne(n: Notification) {
    if (!api || !user || n.isRead) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
    try {
      await api.notifications.markRead(n.id, user.id);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function markAll() {
    if (!api || !user) return;
    setItems((prev) => prev.map((x) => ({ ...x, isRead: true })));
    try {
      await api.notifications.markAllRead(user.id);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-primary uppercase">Activity</p>
          <h1 className="text-2xl font-bold text-ink">Notifications</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void markAll()}>
          Mark all read
        </Button>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : null}
      {!loading && items.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-surface p-8 text-center text-sm text-muted">
          You&apos;re all caught up.
        </div>
      ) : null}

      <ul className="space-y-2">
        {items.map((n) => {
          const href = notificationHref(n);
          const className = `flex w-full items-start justify-between gap-3 rounded-[14px] border p-3 text-left transition ${
            n.isRead ? 'border-border bg-surface' : 'border-primary/20 bg-primary-soft/40'
          }`;
          const content = (
            <>
              <div>
                <p className="text-sm font-semibold text-ink">{labelFor(n)}</p>
                {n.body ? <p className="mt-0.5 text-xs text-muted">{n.body}</p> : null}
              </div>
              {!n.isRead ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" /> : null}
            </>
          );
          return (
            <li key={n.id}>
              {href ? (
                <Link to={href} className={className} onClick={() => void markOne(n)}>
                  {content}
                </Link>
              ) : (
                <button type="button" className={className} onClick={() => void markOne(n)}>
                  {content}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
