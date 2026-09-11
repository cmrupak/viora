import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, type AudienceList, type Profile } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Button, Input, Label } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

export function AudienceListsPage() {
  const { api, user } = useAuth();
  const [lists, setLists] = useState<AudienceList[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [name, setName] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [searchHits, setSearchHits] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadLists() {
    if (!api || !user) return;
    setLoading(true);
    setError('');
    try {
      const next = await api.audiences.listLists(user.id);
      setLists(next);
      if (selectedId && !next.some((l) => l.id === selectedId)) {
        setSelectedId(null);
        setMembers([]);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user]);

  useEffect(() => {
    if (!api || !selectedId) {
      setMembers([]);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const next = await api.audiences.listMembers(selectedId);
        if (active) setMembers(next);
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      }
    })();
    return () => {
      active = false;
    };
  }, [api, selectedId]);

  useEffect(() => {
    if (!api || memberQuery.trim().length < 2) {
      setSearchHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          setSearchHits(await api.profiles.search(memberQuery.trim(), 8));
        } catch {
          setSearchHits([]);
        }
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [api, memberQuery]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await api.audiences.createList(user.id, name);
      setName('');
      setLists((prev) => [created, ...prev]);
      setSelectedId(created.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(list: AudienceList) {
    if (!api || !user) return;
    const ok = window.confirm(`Delete list “${list.name}”?`);
    if (!ok) return;
    setBusy(true);
    try {
      await api.audiences.deleteList(list.id, user.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
      if (selectedId === list.id) {
        setSelectedId(null);
        setMembers([]);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onAddMember(person: Profile) {
    if (!api || !user || !selectedId) return;
    setBusy(true);
    setError('');
    try {
      await api.audiences.addMember(selectedId, user.id, person.id);
      setMembers((prev) => (prev.some((p) => p.id === person.id) ? prev : [person, ...prev]));
      setMemberQuery('');
      setSearchHits([]);
      await loadLists();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onRemoveMember(person: Profile) {
    if (!api || !user || !selectedId) return;
    setBusy(true);
    try {
      await api.audiences.removeMember(selectedId, user.id, person.id);
      setMembers((prev) => prev.filter((p) => p.id !== person.id));
      await loadLists();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Privacy</p>
        <h1 className="text-2xl font-bold text-ink">Audience lists</h1>
        <p className="mt-1 text-sm text-muted">
          Use custom lists when creating posts with “Custom list” visibility.
        </p>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      <form onSubmit={(e) => void onCreate(e)} className="flex flex-wrap gap-2">
        <div className="min-w-[200px] flex-1">
          <Label>New list name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Close coworkers" />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy || !name.trim()}>
            Create
          </Button>
        </div>
      </form>

      {loading ? <Skeleton className="h-20 w-full" /> : null}

      <ul className="space-y-2">
        {lists.map((list) => (
          <li
            key={list.id}
            className={`flex items-center gap-3 rounded-[14px] border p-3 ${
              selectedId === list.id ? 'border-primary bg-primary-soft/40' : 'border-border bg-surface'
            }`}
          >
            <button
              type="button"
              className="min-w-0 flex-1 text-left"
              onClick={() => setSelectedId(list.id)}
            >
              <p className="truncate text-sm font-semibold text-ink">{list.name}</p>
              <p className="text-xs text-muted">{list.memberCount ?? 0} members</p>
            </button>
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void onDelete(list)}>
              Delete
            </Button>
          </li>
        ))}
      </ul>

      {selectedId ? (
        <div className="space-y-3 rounded-[16px] border border-border bg-surface p-4">
          <h2 className="text-lg font-bold text-ink">Members</h2>
          <div>
            <Label>Add people</Label>
            <Input
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="Search username…"
            />
            {searchHits.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {searchHits.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-[10px] px-2 py-1.5 text-left hover:bg-surface-2"
                      onClick={() => void onAddMember(person)}
                    >
                      <Avatar src={person.avatarUrl} name={person.displayName} size={28} />
                      <span className="text-sm text-ink">
                        {person.displayName}{' '}
                        <span className="text-muted">@{person.username}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <ul className="space-y-2">
            {members.map((person) => (
              <li key={person.id} className="flex items-center gap-3">
                <Link to={`/u/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar src={person.avatarUrl} name={person.displayName} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{person.displayName}</p>
                    <p className="truncate text-xs text-muted">@{person.username}</p>
                  </div>
                </Link>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void onRemoveMember(person)}
                >
                  Remove
                </Button>
              </li>
            ))}
            {members.length === 0 ? (
              <p className="text-sm text-muted">No members yet.</p>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
