import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, type FriendRequest, type Profile } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Button } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

export function FriendsPage() {
  const { api, user } = useAuth();
  const [friends, setFriends] = useState<Profile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!api || !user) return;
    setLoading(true);
    setError('');
    try {
      const [nextFriends, nextRequests] = await Promise.all([
        api.friends.listFriends(user.id),
        api.friends.listRequests(user.id, { direction: 'incoming' }),
      ]);
      setFriends(nextFriends);
      setRequests(nextRequests);
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

  async function onAccept(requestId: string) {
    if (!api || !user) return;
    setBusyId(requestId);
    setError('');
    try {
      await api.friends.acceptRequest(requestId, user.id);
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(requestId: string) {
    if (!api || !user) return;
    setBusyId(requestId);
    setError('');
    try {
      await api.friends.rejectRequest(requestId, user.id);
      setRequests((prev) => prev.filter((r) => r.id !== requestId));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Connections</p>
        <h1 className="text-2xl font-bold text-ink">Friends</h1>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : null}

      {!loading && requests.length > 0 ? (
        <div className="space-y-2 rounded-[16px] border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Incoming requests</h2>
          <ul className="space-y-2">
            {requests.map((req) => {
              const from = req.fromUser;
              const name = from?.displayName || from?.username || 'User';
              return (
                <li
                  key={req.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-surface-2/50 p-3"
                >
                  <Link to={`/u/${from?.username ?? ''}`} className="flex min-w-0 items-center gap-3">
                    <Avatar src={from?.avatarUrl} name={name} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{name}</p>
                      <p className="truncate text-xs text-muted">@{from?.username}</p>
                    </div>
                  </Link>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === req.id}
                      onClick={() => void onAccept(req.id)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busyId === req.id}
                      onClick={() => void onReject(req.id)}
                    >
                      Reject
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="space-y-2">
        <h2 className="text-lg font-bold text-ink">Your friends</h2>
        {!loading && friends.length === 0 ? (
          <div className="rounded-[16px] border border-border bg-surface p-8 text-center">
            <p className="font-semibold text-ink">No friends yet</p>
            <p className="mt-1 text-sm text-muted">Accept requests or find people on Explore.</p>
          </div>
        ) : null}
        <ul className="space-y-2">
          {friends.map((friend) => (
            <li key={friend.id}>
              <Link
                to={`/u/${friend.username}`}
                className="flex items-center gap-3 rounded-[14px] border border-border bg-surface p-3 transition hover:bg-surface-2"
              >
                <Avatar src={friend.avatarUrl} name={friend.displayName} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{friend.displayName}</p>
                  <p className="truncate text-xs text-muted">@{friend.username}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
