import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage, optimisticMutation, type Post, type Profile } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { Avatar, Button } from '../components/ui';
import { Skeleton, SkeletonPost } from '../components/ui/Skeleton';

export function UserProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { api, user, profile: me } = useAuth();
  const navigate = useNavigate();
  const [person, setPerson] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isSelf = Boolean(me && person && me.id === person.id);

  useEffect(() => {
    if (!api || !user || !username) return;
    let active = true;

    void (async () => {
      setLoading(true);
      setError('');
      try {
        const found = await api.profiles.getByUsername(username);
        if (!active) return;
        if (!found) {
          setPerson(null);
          return;
        }
        if (me && found.id === me.id) {
          navigate('/profile', { replace: true });
          return;
        }
        setPerson(found);
        const [userPosts, isFollowing] = await Promise.all([
          api.posts.listByUser({ authorId: found.id, currentUserId: user.id }),
          api.follows.isFollowing(user.id, found.id),
        ]);
        if (!active) return;
        setPosts(userPosts);
        setFollowing(isFollowing);
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [api, user, username, me, navigate]);

  async function onFollow() {
    if (!api || !user || !person || isSelf) return;
    setBusy(true);
    setError('');
    const previousFollowing = following;
    const previousPerson = person;

    try {
      await optimisticMutation({
        apply: () => {
          const next = !previousFollowing;
          setFollowing(next);
          setPerson({
            ...previousPerson,
            followerCount: Math.max(0, previousPerson.followerCount + (next ? 1 : -1)),
          });
        },
        mutation: async () => {
          const result = await api.follows.toggleFollow(user.id, person.id);
          setFollowing(result.active);
          setPerson({
            ...previousPerson,
            followerCount: Math.max(
              0,
              previousPerson.followerCount +
                (result.active === previousFollowing ? 0 : result.active ? 1 : -1),
            ),
          });
        },
        rollback: () => {
          setFollowing(previousFollowing);
          setPerson(previousPerson);
        },
        onError: (err) => setError(getErrorMessage(err)),
      });
    } finally {
      setBusy(false);
    }
  }

  async function onMessage() {
    if (!api || !user || !person) return;
    setBusy(true);
    setError('');
    try {
      const conv = await api.messages.getOrCreateDM(user.id, person.id);
      navigate(`/messages/${conv.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-2xl space-y-4">
        <Skeleton className="h-36 w-full" />
        <SkeletonPost />
      </section>
    );
  }

  if (!person) {
    return (
      <section className="mx-auto w-full max-w-2xl rounded-[16px] border border-border bg-surface p-8 text-center">
        <h1 className="text-xl font-bold text-ink">User not found</h1>
        <p className="mt-1 text-sm text-muted">{error || `No profile for @${username}.`}</p>
        <Link to="/explore" className="mt-4 inline-block">
          <Button variant="secondary">Explore</Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <div className="rounded-[16px] border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar src={person.avatarUrl} name={person.displayName} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-ink">{person.displayName}</h1>
            <p className="text-sm text-muted">@{person.username}</p>
            {person.bio ? <p className="mt-2 text-sm text-ink">{person.bio}</p> : null}
            <p className="mt-2 flex gap-4 text-sm text-muted">
              <span>
                <strong className="text-ink">{person.followerCount}</strong> followers
              </span>
              <span>
                <strong className="text-ink">{person.followingCount}</strong> following
              </span>
            </p>
          </div>
        </div>

        {error ? <p className="mt-3 text-sm font-semibold text-danger">{error}</p> : null}

        {!isSelf ? (
          <div className="mt-4 flex gap-2">
            <Button disabled={busy} onClick={() => void onFollow()}>
              {following ? 'Following' : 'Follow'}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void onMessage()}>
              Message
            </Button>
          </div>
        ) : null}
      </div>

      <h2 className="text-lg font-bold text-ink">Posts</h2>
      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onChange={(next) => setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
            onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        ))}
        {posts.length === 0 ? (
          <p className="rounded-[16px] border border-border bg-surface p-6 text-center text-sm text-muted">
            No posts yet.
          </p>
        ) : null}
      </div>
    </section>
  );
}
