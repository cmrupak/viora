import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { getErrorMessage, type Profile } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Button } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

type Tab = 'followers' | 'following';

export function ConnectionsPage() {
  const { username } = useParams<{ username: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get('tab') === 'following' ? 'following' : 'followers';
  const { api, user, profile: me } = useAuth();

  const [owner, setOwner] = useState<Profile | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const isOwn = Boolean(me && owner && me.id === owner.id);

  useEffect(() => {
    if (!api || !username) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const found = await api.profiles.getByUsername(username);
        if (!active) return;
        if (!found) {
          setOwner(null);
          setPeople([]);
          return;
        }
        setOwner(found);
        const list =
          tab === 'followers'
            ? await api.follows.listFollowers(found.id)
            : await api.follows.listFollowing(found.id);
        if (!active) return;
        setPeople(list);
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, username, tab]);

  async function onRemoveFollower(person: Profile) {
    if (!api || !user || !isOwn) return;
    const ok = window.confirm(
      `Remove @${person.username} as a follower? They can still follow you again later.`,
    );
    if (!ok) return;
    setBusyId(person.id);
    setError('');
    const previous = people;
    setPeople((prev) => prev.filter((p) => p.id !== person.id));
    try {
      await api.follows.removeFollower(user.id, person.id);
    } catch (err) {
      setPeople(previous);
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  function setTab(next: Tab) {
    setSearchParams(next === 'following' ? { tab: 'following' } : {});
  }

  if (!loading && !owner) {
    return (
      <section className="mx-auto w-full max-w-2xl rounded-[16px] border border-border bg-surface p-8 text-center">
        <h1 className="text-xl font-bold text-ink">User not found</h1>
        <Link to="/explore" className="mt-4 inline-block">
          <Button variant="secondary">Explore</Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Connections</p>
        <h1 className="text-2xl font-bold text-ink">
          {owner ? `@${owner.username}` : '…'}
        </h1>
        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            variant={tab === 'followers' ? 'primary' : 'secondary'}
            onClick={() => setTab('followers')}
          >
            Followers
          </Button>
          <Button
            size="sm"
            variant={tab === 'following' ? 'primary' : 'secondary'}
            onClick={() => setTab('following')}
          >
            Following
          </Button>
        </div>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {!loading && people.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-surface p-8 text-center">
          <p className="font-semibold text-ink">
            {tab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
          </p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {people.map((person) => (
          <li
            key={person.id}
            className="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-3"
          >
            <Link to={`/u/${person.username}`} className="flex min-w-0 flex-1 items-center gap-3">
              <Avatar src={person.avatarUrl} name={person.displayName} size={44} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{person.displayName}</p>
                <p className="truncate text-xs text-muted">@{person.username}</p>
              </div>
            </Link>
            {isOwn && tab === 'followers' ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busyId === person.id}
                onClick={() => void onRemoveFollower(person)}
              >
                Remove
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
