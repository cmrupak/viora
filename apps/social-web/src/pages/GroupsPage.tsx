import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, type Group, type GroupVisibility } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Button, Input, Label, Textarea } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

export function GroupsPage() {
  const { api, user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('public');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    if (!api || !user) return;
    setLoading(true);
    setError('');
    try {
      const list = await api.groups.list({ limit: 40, currentUserId: user.id });
      setGroups(list);
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
        visibility,
        requiresPostApproval: requiresApproval,
      });
      setName('');
      setDescription('');
      setVisibility('public');
      setRequiresApproval(false);
      setGroups((prev) => [
        {
          ...created,
          myMembership: {
            id: 'local',
            groupId: created.id,
            userId: user.id,
            role: 'owner',
            status: 'active',
            createdAt: created.createdAt,
          },
        },
        ...prev,
      ]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  }

  async function onToggle(group: Group) {
    if (!api || !user) return;
    const membership = group.myMembership;
    const joined = membership?.status === 'active' || membership?.status === 'pending';
    setBusyId(group.id);
    setError('');
    try {
      if (joined) {
        await api.groups.leave(group.id, user.id);
        setGroups((prev) =>
          prev.map((g) => (g.id === group.id ? { ...g, myMembership: null } : g)),
        );
      } else {
        const questions = await api.groups.listJoinQuestions(group.id);
        const answers =
          questions.length > 0
            ? questions.map((q) => ({
                questionId: q.id,
                answer: window.prompt(q.prompt) || '',
              }))
            : undefined;
        const mem = await api.groups.requestJoin({
          groupId: group.id,
          userId: user.id,
          answers,
        });
        setGroups((prev) =>
          prev.map((g) => (g.id === group.id ? { ...g, myMembership: mem } : g)),
        );
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
        <div>
          <Label>Visibility</Label>
          <div className="mt-1 flex flex-wrap gap-2">
            {(['public', 'private', 'hidden'] as GroupVisibility[]).map((v) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={visibility === v ? 'primary' : 'secondary'}
                onClick={() => setVisibility(v)}
              >
                {v}
              </Button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Public = open join · Private = approval · Hidden = invite-only / unlisted
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={requiresApproval}
            onChange={(e) => setRequiresApproval(e.target.checked)}
          />
          Require post approval
        </label>
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
          const membership = group.myMembership;
          const joined = membership?.status === 'active';
          const pending = membership?.status === 'pending';
          const isOwner = group.ownerId === user?.id;
          return (
            <li
              key={group.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-[14px] border border-border bg-surface p-4"
            >
              <div className="min-w-0">
                <Link to={`/groups/${group.id}`} className="text-sm font-semibold text-ink hover:underline">
                  {group.name}
                </Link>
                {group.description ? (
                  <p className="mt-1 text-sm text-muted">{group.description}</p>
                ) : null}
                <p className="mt-1 text-xs text-muted capitalize">
                  {group.visibility ?? (group.isPrivate ? 'private' : 'public')}
                  {isOwner ? ' · You own this' : ` · @${group.owner?.username ?? 'user'}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to={`/groups/${group.id}`}>
                  <Button size="sm" variant="secondary">
                    Open
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant={joined || pending ? 'secondary' : 'primary'}
                  disabled={busyId === group.id || (isOwner && joined)}
                  onClick={() => void onToggle(group)}
                >
                  {pending ? 'Pending' : joined ? 'Leave' : group.visibility === 'private' ? 'Request' : 'Join'}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
