import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getErrorMessage, optimisticMutation, type Message, type Profile } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Button, Input } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

function mapRealtimeRow(row: Record<string, unknown>, sender?: Profile | null): Message {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    body: row.deleted_at ? '' : String(row.body ?? ''),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    status: 'ready',
    sender: sender ?? null,
  };
}

export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const { api, user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Profile | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api || !user || !id) return;
    let active = true;

    void (async () => {
      setLoading(true);
      setError('');
      try {
        const [list, conversations] = await Promise.all([
          api.messages.listMessages(id),
          api.messages.listConversations(user.id),
        ]);
        if (!active) return;
        setMessages(list);
        const conv = conversations.find((c) => c.id === id);
        if (conv) {
          setOther(await api.messages.otherParticipant(conv, user.id));
        }
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();

    const channel = api.client
      .channel(`messages:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const incoming = mapRealtimeRow(row);
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) return prev;
            const withoutPending = prev.filter(
              (m) =>
                !(
                  m.status === 'pending' &&
                  m.senderId === incoming.senderId &&
                  m.body === incoming.body
                ),
            );
            return [...withoutPending, incoming];
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      void api.client.removeChannel(channel);
    };
  }, [api, user, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !profile || !id || !body.trim()) return;
    setSending(true);
    setError('');

    const text = body.trim();
    const tempId = `pending-msg-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversationId: id,
      senderId: user.id,
      body: text,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
      sender: profile,
    };
    setBody('');

    try {
      await optimisticMutation({
        apply: () => setMessages((prev) => [...prev, optimistic]),
        mutation: async () => {
          const created = await api.messages.send(id, user.id, text);
          setMessages((prev) => {
            if (prev.some((m) => m.id === created.id)) {
              return prev.filter((m) => m.id !== tempId);
            }
            return prev.map((m) => (m.id === tempId ? { ...created, status: 'ready' } : m));
          });
        },
        rollback: () => {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setBody(text);
        },
        onError: (err) => setError(getErrorMessage(err)),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <Link to="/messages" className="text-sm font-semibold text-primary hover:underline">
          ← Inbox
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <Avatar
            src={other?.avatarUrl}
            name={other?.displayName || other?.username || 'Conversation'}
            size={44}
          />
          <div>
            <h1 className="text-xl font-bold text-ink">
              {other?.displayName || other?.username || 'Conversation'}
            </h1>
            {other ? (
              <Link to={`/u/${other.username}`} className="text-sm text-muted hover:underline">
                @{other.username}
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="ml-auto h-12 w-1/2" />
        </div>
      ) : null}

      <div className="flex min-h-[320px] flex-col gap-2 rounded-[16px] border border-border bg-surface p-4">
        {messages.map((m) => {
          const mine = m.senderId === user?.id;
          return (
            <div
              key={m.id}
              className={`max-w-[80%] rounded-[14px] px-3 py-2 ${
                mine
                  ? 'ml-auto bg-primary text-white'
                  : 'mr-auto border border-border bg-surface-2 text-ink'
              } ${m.status === 'pending' ? 'opacity-70' : ''}`}
            >
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              <span className={`mt-1 block text-[10px] ${mine ? 'text-white/70' : 'text-muted'}`}>
                {new Date(m.createdAt).toLocaleTimeString()}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => void onSend(e)}
        className="sticky bottom-2 flex gap-2 rounded-[14px] border border-border bg-surface p-2 shadow-[var(--shadow-card)]"
      >
        <Input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write a message…"
          maxLength={2000}
          required
        />
        <Button type="submit" disabled={sending || !body.trim()}>
          Send
        </Button>
      </form>
    </section>
  );
}
