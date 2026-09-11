import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, type Conversation } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

export function MessagesPage() {
  const { api, user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const list = await api.messages.listConversations(user.id);
        if (active) setConversations(list);
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

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Inbox</p>
        <h1 className="text-2xl font-bold text-ink">Messages</h1>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {!loading && conversations.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-surface p-8 text-center">
          <p className="font-semibold text-ink">No conversations yet</p>
          <p className="mt-1 text-sm text-muted">Message someone from their profile.</p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {conversations.map((c) => {
          const other = c.members?.find((m) => m.userId !== user?.id)?.profile;
          const title = c.title || other?.displayName || other?.username || 'Conversation';
          return (
            <li key={c.id}>
              <Link
                to={`/messages/${c.id}`}
                className="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-3 transition hover:bg-surface-2"
              >
                <Avatar src={other?.avatarUrl} name={title} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{title}</p>
                  <p className="truncate text-xs text-muted">
                    {c.lastMessageAt ? new Date(c.lastMessageAt).toLocaleString() : 'No messages yet'}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
