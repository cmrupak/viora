import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getErrorMessage,
  optimisticMutation,
  type Message,
  type MessageReactionType,
  type Profile,
} from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { ReportButton } from '../components/ReportModal';
import { Avatar, Button, Input } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

const REACTIONS: MessageReactionType[] = ['like', 'love', 'haha', 'wow', 'sad', 'angry'];
const REACTION_EMOJI: Record<MessageReactionType, string> = {
  like: '👍',
  love: '❤️',
  haha: '😆',
  wow: '😮',
  sad: '😢',
  angry: '😡',
};

function mapRealtimeRow(row: Record<string, unknown>, sender?: Profile | null): Message {
  return {
    id: String(row.id),
    conversationId: String(row.conversationId ?? row.conversation_id),
    senderId: String(row.senderId ?? row.sender_id),
    body: row.deletedAt || row.deleted_at ? '' : String(row.body ?? ''),
    replyToId:
      row.replyToId == null && row.reply_to_id == null
        ? null
        : String(row.replyToId ?? row.reply_to_id),
    expiresAt:
      row.expiresAt == null && row.expires_at == null
        ? null
        : String(row.expiresAt ?? row.expires_at),
    deletedAt:
      row.deletedAt == null && row.deleted_at == null
        ? null
        : String(row.deletedAt ?? row.deleted_at),
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    updatedAt:
      row.updatedAt == null && row.updated_at == null
        ? undefined
        : String(row.updatedAt ?? row.updated_at),
    status: 'ready',
    sender: sender ?? null,
    attachments: [],
    reactions: [],
  };
}

export function ConversationPage() {
  const { id } = useParams<{ id: string }>();
  const { api, user, profile } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [other, setOther] = useState<Profile | null>(null);
  const [title, setTitle] = useState('Conversation');
  const [isGroup, setIsGroup] = useState(false);
  const [online, setOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const [body, setBody] = useState('');
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [vanishMinutes, setVanishMinutes] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [muted, setMuted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api || !user || !id) return;
    let active = true;

    void (async () => {
      setLoading(true);
      setError('');
      try {
        const [list, conversations] = await Promise.all([
          api.messages.listMessages(id, { currentUserId: user.id }),
          api.messages.listConversations(user.id),
        ]);
        if (!active) return;
        setMessages(list);
        const conv = conversations.find((c) => c.id === id);
        if (conv) {
          setIsGroup(conv.isGroup);
          setMuted(Boolean(conv.muted));
          if (conv.isGroup) {
            setTitle(conv.title || 'Group');
            setOther(null);
          } else {
            const peer = await api.messages.otherParticipant(conv, user.id);
            setOther(peer);
            setTitle(peer?.displayName || peer?.username || 'Conversation');
            if (peer) {
              const presence = await api.messages.getPresence([peer.id]);
              setOnline(Boolean(presence[0]?.isOnline));
            }
          }
        }
        await api.messages.markRead(id, user.id);
        await api.messages.heartbeat(user.id, true);
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();

    const unsubMessages = api.realtime.subscribeMessages(id, ({ message: row }) => {
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
      const senderId = String(row.senderId ?? row.sender_id ?? '');
      if (user && senderId && senderId !== user.id) {
        void api.messages.markRead(id, user.id);
      }
    });

    const unsubTyping = api.realtime.subscribeTyping(id, ({ userId: from }) => {
      if (from && from !== user.id) {
        setTyping(true);
        window.setTimeout(() => setTyping(false), 2000);
      }
    });

    return () => {
      active = false;
      unsubMessages();
      unsubTyping();
      void api.messages.heartbeat(user.id, false);
    };
  }, [api, user, id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  function broadcastTyping() {
    if (!api || !user || !id) return;
    void api.realtime.publishTyping(id, user.id, true);
  }

  async function uploadAttachment(authorId: string, mediaFile: File) {
    if (!api) throw new Error('Not configured');
    let mediaType: 'image' | 'video' | 'audio' | 'file' = 'file';
    if (mediaFile.type.startsWith('image/')) mediaType = 'image';
    else if (mediaFile.type.startsWith('video/')) mediaType = 'video';
    else if (mediaFile.type.startsWith('audio/')) mediaType = 'audio';
    if (api.media) {
      const uploaded = await api.media.upload({
        bucket: 'messages',
        file: mediaFile,
        filename: mediaFile.name || `${authorId}-${Date.now()}.bin`,
        contentType: mediaFile.type || 'application/octet-stream',
      });
      return { url: uploaded.url, mediaType, fileName: mediaFile.name };
    }
    if (!api.client) throw new Error('Message attachments are not configured.');
    const ext = mediaFile.name.split('.').pop() || 'bin';
    const path = `${authorId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await api.client.storage.from('messages').upload(path, mediaFile, {
      contentType: mediaFile.type || 'application/octet-stream',
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data } = api.client.storage.from('messages').getPublicUrl(path);
    return { url: data.publicUrl, mediaType, fileName: mediaFile.name };
  }

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !profile || !id) return;
    if (!body.trim() && !file) return;
    setSending(true);
    setError('');

    const text = body.trim();
    const tempId = `pending-msg-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversationId: id,
      senderId: user.id,
      body: text,
      replyToId: replyTo?.id ?? null,
      replyTo: replyTo,
      expiresAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
      sender: profile,
      attachments: file
        ? [
            {
              id: `${tempId}-att`,
              messageId: tempId,
              url: URL.createObjectURL(file),
              mediaType: file.type.startsWith('audio/')
                ? 'audio'
                : file.type.startsWith('video/')
                  ? 'video'
                  : file.type.startsWith('image/')
                    ? 'image'
                    : 'file',
              fileName: file.name,
              createdAt: new Date().toISOString(),
            },
          ]
        : [],
    };
    setBody('');
    const localFile = file;
    setFile(null);
    const parent = replyTo;
    setReplyTo(null);

    try {
      await optimisticMutation({
        apply: () => setMessages((prev) => [...prev, optimistic]),
        mutation: async () => {
          const attachments = localFile
            ? [await uploadAttachment(user.id, localFile)]
            : undefined;
          const created = await api.messages.sendMessage({
            conversationId: id,
            senderId: user.id,
            body: text,
            replyToId: parent?.id,
            expiresInMinutes: vanishMinutes,
            attachments,
          });
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

  async function onReact(message: Message, reaction: MessageReactionType) {
    if (!api || !user) return;
    const next = message.myReaction === reaction ? null : reaction;
    setMessages((prev) =>
      prev.map((m) => (m.id === message.id ? { ...m, myReaction: next } : m)),
    );
    try {
      await api.messages.setReaction(message.id, user.id, next);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function toggleMute() {
    if (!api || !user || !id) return;
    const next = !muted;
    setMuted(next);
    try {
      await api.messages.setMemberPrefs(id, user.id, { muted: next });
    } catch (err) {
      setMuted(!next);
      setError(getErrorMessage(err));
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <header className="rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
        <Link to="/messages" className="text-sm font-semibold text-primary hover:underline">
          ← Inbox
        </Link>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar
              src={other?.avatarUrl}
              name={title}
              size={44}
            />
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-ink">{title}</h1>
              {other ? (
                <Link to={`/u/${other.username}`} className="text-sm text-muted hover:underline">
                  @{other.username}
                  {online ? ' · Online' : ''}
                </Link>
              ) : isGroup ? (
                <p className="text-sm text-muted">Group chat</p>
              ) : null}
              {typing ? <p className="text-xs font-semibold text-primary">Typing…</p> : null}
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => void toggleMute()}>
            {muted ? 'Unmute' : 'Mute'}
          </Button>
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
              className={`max-w-[85%] rounded-[14px] px-3 py-2 ${
                mine
                  ? 'ml-auto bg-primary text-white'
                  : 'mr-auto border border-border bg-surface-2 text-ink'
              } ${m.status === 'pending' ? 'opacity-70' : ''}`}
            >
              {m.replyTo ? (
                <p className={`mb-1 truncate rounded-lg px-2 py-1 text-[11px] ${mine ? 'bg-white/15' : 'bg-black/5'}`}>
                  Replying to: {m.replyTo.body || 'attachment'}
                </p>
              ) : null}
              {m.body ? <p className="text-sm whitespace-pre-wrap">{m.body}</p> : null}
              {(m.attachments ?? []).map((a) =>
                a.mediaType === 'image' ? (
                  <img key={a.id} src={a.url} alt={a.fileName || ''} className="mt-2 max-h-48 rounded-lg" />
                ) : a.mediaType === 'audio' ? (
                  <audio key={a.id} controls src={a.url} className="mt-2 w-full" />
                ) : a.mediaType === 'video' ? (
                  <video key={a.id} controls src={a.url} className="mt-2 max-h-48 w-full rounded-lg" />
                ) : (
                  <a key={a.id} href={a.url} className="mt-2 block text-xs underline" target="_blank" rel="noreferrer">
                    {a.fileName || 'Attachment'}
                  </a>
                ),
              )}
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className={`text-[10px] ${mine ? 'text-white/70' : 'text-muted'}`}>
                  {new Date(m.createdAt).toLocaleTimeString()}
                  {m.expiresAt ? ' · vanishing' : ''}
                </span>
                <button
                  type="button"
                  className={`text-[10px] font-semibold ${mine ? 'text-white/80' : 'text-primary'}`}
                  onClick={() => setReplyTo(m)}
                >
                  Reply
                </button>
                {!mine ? (
                  <ReportButton
                    targetType="message"
                    targetId={m.id}
                    className="text-[10px] font-semibold text-muted hover:text-danger"
                  />
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {REACTIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`rounded-full px-1.5 text-xs ${
                      m.myReaction === r ? 'bg-white/30 ring-1 ring-white/50' : 'opacity-70 hover:opacity-100'
                    }`}
                    onClick={() => void onReact(m, r)}
                  >
                    {REACTION_EMOJI[r]}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => void onSend(e)}
        className="sticky bottom-2 space-y-2 rounded-[14px] border border-border bg-surface p-2 shadow-[var(--shadow-card)]"
      >
        {replyTo ? (
          <p className="px-2 text-xs text-muted">
            Replying to: {replyTo.body.slice(0, 60) || 'attachment'}{' '}
            <button type="button" className="font-semibold text-primary" onClick={() => setReplyTo(null)}>
              Cancel
            </button>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 px-1">
          <label className="cursor-pointer text-xs font-semibold text-primary">
            Attach
            <input
              type="file"
              className="sr-only"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {file ? (
            <span className="text-xs text-muted">
              {file.name}{' '}
              <button type="button" onClick={() => setFile(null)}>
                ×
              </button>
            </span>
          ) : null}
          <button
            type="button"
            className={`text-xs font-semibold ${vanishMinutes ? 'text-primary' : 'text-muted'}`}
            onClick={() => setVanishMinutes((v) => (v ? null : 60))}
          >
            {vanishMinutes ? `Vanish ${vanishMinutes}m` : 'Vanish off'}
          </button>
        </div>
        <div className="flex gap-2">
          <Input
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              broadcastTyping();
            }}
            placeholder="Write a message…"
            maxLength={2000}
            required={!file}
          />
          <Button type="submit" disabled={sending || (!body.trim() && !file)}>
            Send
          </Button>
        </div>
      </form>
    </section>
  );
}
