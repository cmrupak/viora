import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage, type Conversation, type Profile } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Button, Input } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

export function MessagesPage() {
  const { api, user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [requests, setRequests] = useState<Conversation[]>([]);
  const [tab, setTab] = useState<'inbox' | 'requests'>('inbox');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchHits, setSearchHits] = useState<
    Array<{ conversationId: string; body: string; createdAt: string }>
  >([]);
  const [groupTitle, setGroupTitle] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [memberHits, setMemberHits] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Profile[]>([]);

  async function load() {
    if (!api || !user) return;
    setLoading(true);
    setError('');
    try {
      const [inbox, reqs] = await Promise.all([
        api.messages.listConversations(user.id),
        api.messages.listMessageRequests(user.id),
      ]);
      setConversations(inbox);
      setRequests(reqs);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user]);

  useEffect(() => {
    if (!api || search.trim().length < 2) {
      setSearchHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const hits = await api.messages.searchMessages(user!.id, search.trim());
          setSearchHits(
            hits.map((h) => ({
              conversationId: h.conversationId,
              body: h.message.body,
              createdAt: h.message.createdAt,
            })),
          );
        } catch {
          setSearchHits([]);
        }
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [api, search, user]);

  useEffect(() => {
    if (!api || memberQuery.trim().length < 2) {
      setMemberHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const hits = await api.profiles.search(memberQuery.trim(), 8);
          setMemberHits(
            hits.filter(
              (p) => p.id !== user?.id && !selectedMembers.some((s) => s.id === p.id),
            ),
          );
        } catch {
          setMemberHits([]);
        }
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [api, memberQuery, selectedMembers, user?.id]);

  async function onCreateGroup(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !groupTitle.trim() || selectedMembers.length === 0) return;
    try {
      const conv = await api.messages.createGroup(
        user.id,
        groupTitle.trim(),
        selectedMembers.map((m) => m.id),
      );
      navigate(`/messages/${conv.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function acceptRequest(conversationId: string) {
    if (!api || !user) return;
    try {
      await api.messages.acceptRequest(conversationId, user.id);
      await load();
      navigate(`/messages/${conversationId}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function declineRequest(conversationId: string) {
    if (!api || !user) return;
    try {
      await api.messages.declineRequest(conversationId, user.id);
      setRequests((prev) => prev.filter((c) => c.id !== conversationId));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function pinConversation(c: Conversation) {
    if (!api || !user) return;
    try {
      await api.messages.setMemberPrefs(c.id, user.id, { pinned: !c.pinnedAt });
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  const list = tab === 'inbox' ? conversations : requests;

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-primary uppercase">Inbox</p>
          <h1 className="text-2xl font-bold text-ink">Messages</h1>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === 'inbox' ? 'primary' : 'secondary'}
            onClick={() => setTab('inbox')}
          >
            Chats
          </Button>
          <Button
            size="sm"
            variant={tab === 'requests' ? 'primary' : 'secondary'}
            onClick={() => setTab('requests')}
          >
            Requests{requests.length ? ` (${requests.length})` : ''}
          </Button>
        </div>
      </header>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search messages…"
      />
      {searchHits.length > 0 ? (
        <ul className="space-y-1 rounded-[14px] border border-border bg-surface p-2">
          {searchHits.map((hit, i) => (
            <li key={`${hit.conversationId}-${i}`}>
              <Link
                to={`/messages/${hit.conversationId}`}
                className="block rounded-lg px-2 py-2 text-sm hover:bg-surface-2"
              >
                <p className="truncate font-semibold text-ink">{hit.body}</p>
                <p className="text-xs text-muted">{new Date(hit.createdAt).toLocaleString()}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        onSubmit={(e) => void onCreateGroup(e)}
        className="space-y-2 rounded-[16px] border border-border bg-surface p-4"
      >
        <p className="text-sm font-semibold text-ink">New group chat</p>
        <Input
          value={groupTitle}
          onChange={(e) => setGroupTitle(e.target.value)}
          placeholder="Group name"
        />
        <Input
          value={memberQuery}
          onChange={(e) => setMemberQuery(e.target.value)}
          placeholder="Add members by username…"
        />
        {memberHits.length > 0 ? (
          <div className="max-h-32 overflow-auto rounded-xl border border-border">
            {memberHits.map((p) => (
              <button
                key={p.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
                onClick={() => {
                  setSelectedMembers((prev) => [...prev, p]);
                  setMemberQuery('');
                  setMemberHits([]);
                }}
              >
                @{p.username}
              </button>
            ))}
          </div>
        ) : null}
        {selectedMembers.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {selectedMembers.map((p) => (
              <span
                key={p.id}
                className="rounded-full bg-primary-soft px-2 py-1 text-xs font-semibold text-primary"
              >
                @{p.username}
                <button
                  type="button"
                  className="ml-1"
                  onClick={() => setSelectedMembers((prev) => prev.filter((x) => x.id !== p.id))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={!groupTitle.trim() || selectedMembers.length === 0}
        >
          Create group
        </Button>
      </form>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}
      {!loading && list.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-surface p-8 text-center">
          <p className="font-semibold text-ink">
            {tab === 'requests' ? 'No message requests' : 'No conversations yet'}
          </p>
          <p className="mt-1 text-sm text-muted">
            {tab === 'requests'
              ? 'Messages from people you don’t follow appear here.'
              : 'Message someone from their profile or start a group.'}
          </p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {list.map((c) => {
          const other = c.members?.find((m) => m.userId !== user?.id)?.profile;
          const title =
            c.nickname ||
            c.title ||
            other?.displayName ||
            other?.username ||
            'Conversation';
          return (
            <li key={c.id}>
              <div className="flex items-center gap-2 rounded-[14px] border border-border bg-surface p-3">
                <Link to={`/messages/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar src={other?.avatarUrl} name={title} size={44} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {c.pinnedAt ? '📌 ' : ''}
                      {title}
                      {c.muted ? ' · muted' : ''}
                      {c.isGroup ? ' · group' : ''}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {c.lastMessageAt
                        ? new Date(c.lastMessageAt).toLocaleString()
                        : 'No messages yet'}
                    </p>
                  </div>
                </Link>
                {tab === 'requests' ? (
                  <div className="flex flex-col gap-1">
                    <Button size="sm" onClick={() => void acceptRequest(c.id)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => void declineRequest(c.id)}>
                      Decline
                    </Button>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => void pinConversation(c)}>
                    {c.pinnedAt ? 'Unpin' : 'Pin'}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
