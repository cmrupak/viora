import { FormEvent, useEffect, useState } from 'react';
import { getErrorMessage, type Group } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Button, Input, Label, Textarea } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

export function GroupsPage() {
  const { api, user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [joinedIds, setJoinedIds] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    if (!api || !user) return;
    setLoading(true);
    setError('');
    try {
      const list = await api.groups.list({ limit: 40 });
      setGroups(list);
      const memberships = await Promise.all(
        list.map(async (g) => {
          if (g.ownerId === user.id) return g.id;
          try {
            const members = await api.groups.listMembers(g.id, { limit: 100 });
            return members.some((m) => m.userId === user.id) ? g.id : null;
          } catch {
            return null;
          }
        }),
      );
      setJoinedIds(new Set(memberships.filter((id): id is string => Boolean(id))));
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

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !name.trim()) return;
    setCreating(true);
    setError('');
    try {
      const created = await api.groups.create({
        name: name.trim(),
        ownerId: user.id,
        description: description.trim() || null,
      });
      try {
        await api.groups.join(created.id, user.id);
      } catch {
        /* owner may already be a member via trigger */
      }
      setName('');
      setDescription('');
      setGroups((prev) => [created, ...prev]);
      setJoinedIds((prev) => new Set([...prev, created.id]));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function onToggle(group: Group) {
    if (!api || !user) return;
    const joined = joinedIds.has(group.id);
    setBusyId(group.id);
    setError('');
    try {
      if (joined) {
        await api.groups.leave(group.id, user.id);
        setJoinedIds((prev) => {
          const next = new Set(prev);
          next.delete(group.id);
          return next;
        });
      } else {
        await api.groups.join(group.id, user.id);
        setJoinedIds((prev) => new Set([...prev, group.id]));
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Community</p>
        <h1 className="text-2xl font-bold text-ink">Groups</h1>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      <form
        onSubmit={(e) => void onCreate(e)}
        className="space-y-3 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
      >
        <h2 className="text-sm font-semibold text-ink">Create a group</h2>
        <div>
          <Label htmlFor="group-name">Name</Label>
          <Input
            id="group-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name"
            required
            maxLength={80}
          />
        </div>
        <div>
          <Label htmlFor="group-desc">Description</Label>
          <Textarea
            id="group-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this group about?"
            maxLength={500}
          />
        </div>
        <Button type="submit" disabled={creating || !name.trim()}>
          {creating ? 'Creating…' : 'Create group'}
        </Button>
      </form>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}

      {!loading && groups.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-surface p-8 text-center">
          <p className="font-semibold text-ink">No groups yet</p>
          <p className="mt-1 text-sm text-muted">Create the first one above.</p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {groups.map((group) => {
          const joined = joinedIds.has(group.id);
          const isOwner = group.ownerId === user?.id;
          return (
            <li
              key={group.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-[14px] border border-border bg-surface p-4"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{group.name}</p>
                {group.description ? (
                  <p className="mt-1 text-sm text-muted">{group.description}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted">
                  {isOwner ? 'You own this group' : `Hosted by @${group.owner?.username ?? 'user'}`}
                </p>
              </div>
              <Button
                size="sm"
                variant={joined ? 'secondary' : 'primary'}
                disabled={busyId === group.id || (isOwner && joined)}
                onClick={() => void onToggle(group)}
              >
                {joined ? 'Leave' : 'Join'}
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
