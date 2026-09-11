import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, type Notification, type PostTag } from '@viora/core';
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
  const extras =
    (n.groupCount ?? 1) > 1
      ? ` and ${(n.groupCount ?? 1) - 1} other${(n.groupCount ?? 1) - 1 === 1 ? '' : 's'}`
      : '';
  switch (n.type) {
    case 'like':
      return `${who}${extras} liked your post`;
    case 'comment':
      return `${who}${extras} commented`;
    case 'reply':
      return `${who}${extras} replied`;
    case 'follow':
      return `${who}${extras} followed you`;
    case 'share':
      return `${who}${extras} shared your post`;
    case 'message':
      return `${who} sent a message`;
    case 'mention':
      return n.body?.includes('tag') ? `${who} tagged you` : `${who} mentioned you`;
    case 'birthday':
      return n.body || `${who}'s birthday is today`;
    case 'memory':
      return n.body || 'On this day';
    default:
      return n.body || 'Notification';
  }
}

export function NotificationsPage() {
  const { api, user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [pendingTags, setPendingTags] = useState<PostTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyTagId, setBusyTagId] = useState<string | null>(null);

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const [list, tags] = await Promise.all([
          api.notifications.list(user.id),
          api.posts.listPendingTags(user.id),
        ]);
        if (active) {
          setItems(list);
          setPendingTags(tags);
        }
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

  async function respondTag(tagId: string, status: 'approved' | 'rejected') {
    if (!api || !user) return;
    setBusyTagId(tagId);
    setError('');
    try {
      await api.posts.respondToTag(tagId, user.id, status);
      setPendingTags((prev) => prev.filter((t) => t.id !== tagId));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyTagId(null);
    }
  }

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

      {pendingTags.length > 0 ? (
        <div className="space-y-2 rounded-[16px] border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-ink">Photo / post tags to review</p>
          {pendingTags.map((tag) => (
            <div
              key={tag.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface-2 px-3 py-2"
            >
              <Link to={`/posts/${tag.postId}`} className="text-sm font-semibold text-primary">
                Review tagged post
              </Link>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busyTagId === tag.id}
                  onClick={() => void respondTag(tag.id, 'approved')}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyTagId === tag.id}
                  onClick={() => void respondTag(tag.id, 'rejected')}
                >
                  Decline
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : null}
      {!loading && items.length === 0 && pendingTags.length === 0 ? (
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
