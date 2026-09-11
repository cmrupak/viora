import { useEffect, useRef, useState } from 'react';
import { Heart } from 'lucide-react';
import { getErrorMessage, optimisticMutation, type Reel } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Button } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

export function ReelsPage() {
  const { api, user } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const viewed = useRef(new Set<string>());

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const feed = await api.reels.listFeed({ currentUserId: user.id, limit: 20 });
        if (active) setReels(feed);
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

  async function onLike(reel: Reel) {
    if (!api || !user) return;
    const previous = reel;
    const nextLiked = !reel.likedByCurrentUser;
    const optimistic: Reel = {
      ...reel,
      likedByCurrentUser: nextLiked,
      likeCount: Math.max(0, reel.likeCount + (nextLiked ? 1 : -1)),
    };
    setReels((prev) => prev.map((r) => (r.id === reel.id ? optimistic : r)));
    try {
      await optimisticMutation({
        apply: () => undefined,
        mutation: async () => {
          const result = await api.reels.toggleLike(reel.id, user.id);
          setReels((prev) =>
            prev.map((r) =>
              r.id === reel.id
                ? {
                    ...r,
                    likedByCurrentUser: result.active,
                    likeCount: Math.max(
                      0,
                      previous.likeCount +
                        (result.active === previous.likedByCurrentUser ? 0 : result.active ? 1 : -1),
                    ),
                  }
                : r,
            ),
          );
        },
        rollback: () => setReels((prev) => prev.map((r) => (r.id === reel.id ? previous : r))),
        onError: (err) => setError(getErrorMessage(err)),
      });
    } catch {
      /* rolled back */
    }
  }

  async function onPlay(reelId: string) {
    if (!api || viewed.current.has(reelId)) return;
    viewed.current.add(reelId);
    try {
      await api.reels.incrementView(reelId);
      setReels((prev) =>
        prev.map((r) => (r.id === reelId ? { ...r, viewCount: r.viewCount + 1 } : r)),
      );
    } catch {
      viewed.current.delete(reelId);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-4">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Watch</p>
        <h1 className="text-2xl font-bold text-ink">Reels</h1>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="aspect-[9/16] w-full rounded-[16px]" />
        </div>
      ) : null}

      {!loading && reels.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-surface p-8 text-center">
          <p className="font-semibold text-ink">No reels yet</p>
          <p className="mt-1 text-sm text-muted">Short videos will show up here.</p>
        </div>
      ) : null}

      <div className="space-y-6">
        {reels.map((reel) => {
          const media = reel.media?.[0];
          const author = reel.author;
          return (
            <article
              key={reel.id}
              className="overflow-hidden rounded-[16px] border border-border bg-surface shadow-[var(--shadow-card)]"
            >
              <div className="relative aspect-[9/16] bg-black">
                {media ? (
                  <video
                    src={media.url}
                    className="h-full w-full object-contain"
                    controls
                    playsInline
                    poster={media.thumbnailUrl ?? undefined}
                    onPlay={() => void onPlay(reel.id)}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-muted">
                    No media
                  </div>
                )}
              </div>
              <div className="flex items-start justify-between gap-3 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar
                    src={author?.avatarUrl}
                    name={author?.displayName || author?.username || 'User'}
                    size={36}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">
                      {author?.displayName || author?.username || 'User'}
                    </p>
                    {reel.caption ? (
                      <p className="line-clamp-2 text-xs text-muted">{reel.caption}</p>
                    ) : null}
                    <p className="text-xs text-muted">{reel.viewCount} views</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={reel.likedByCurrentUser ? 'primary' : 'secondary'}
                  onClick={() => void onLike(reel)}
                  aria-label={reel.likedByCurrentUser ? 'Unlike' : 'Like'}
                >
                  <Heart className={`h-4 w-4 ${reel.likedByCurrentUser ? 'fill-current' : ''}`} />
                  {reel.likeCount}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
