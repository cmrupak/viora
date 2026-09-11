import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Heart, MessageCircle, Music2, Plus } from 'lucide-react';
import {
  getErrorMessage,
  optimisticMutation,
  type Reel,
  type ReelComment,
} from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Button, Input } from '../components/ui';
import { Skeleton } from '../components/ui/Skeleton';

export function ReelsPage() {
  const { api, user } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeComments, setActiveComments] = useState<string | null>(null);
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);
  const viewed = useState(() => new Set<string>())[0];

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

  async function onSave(reel: Reel) {
    if (!api || !user) return;
    const previous = reel;
    const next = !reel.savedByCurrentUser;
    setReels((prev) =>
      prev.map((r) => (r.id === reel.id ? { ...r, savedByCurrentUser: next } : r)),
    );
    try {
      const result = await api.reels.toggleSave(reel.id, user.id);
      setReels((prev) =>
        prev.map((r) => (r.id === reel.id ? { ...r, savedByCurrentUser: result.active } : r)),
      );
    } catch (err) {
      setReels((prev) => prev.map((r) => (r.id === reel.id ? previous : r)));
      setError(getErrorMessage(err));
    }
  }

  async function openComments(reel: Reel) {
    if (!api) return;
    if (activeComments === reel.id) {
      setActiveComments(null);
      return;
    }
    setActiveComments(reel.id);
    setCommentLoading(true);
    try {
      const list = await api.reels.listComments(reel.id);
      setComments(list);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCommentLoading(false);
    }
  }

  async function submitComment(event: FormEvent, reelId: string) {
    event.preventDefault();
    if (!api || !user || !commentBody.trim()) return;
    try {
      const created = await api.reels.createComment({
        reelId,
        authorId: user.id,
        body: commentBody,
      });
      setComments((prev) => [...prev, created]);
      setCommentBody('');
      setReels((prev) =>
        prev.map((r) => (r.id === reelId ? { ...r, commentCount: r.commentCount + 1 } : r)),
      );
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function onPlay(reelId: string) {
    if (!api || viewed.has(reelId)) return;
    viewed.add(reelId);
    try {
      await api.reels.incrementView(reelId);
      setReels((prev) =>
        prev.map((r) => (r.id === reelId ? { ...r, viewCount: r.viewCount + 1 } : r)),
      );
    } catch {
      viewed.delete(reelId);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-primary uppercase">Watch</p>
          <h1 className="text-2xl font-bold text-ink">Reels</h1>
        </div>
        <div className="flex gap-2">
          <Link to="/watch">
            <Button size="sm" variant="secondary">
              Long-form
            </Button>
          </Link>
          <Link to="/reels/create">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New
            </Button>
          </Link>
        </div>
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
          <Link to="/reels/create" className="mt-4 inline-block">
            <Button>Create a reel</Button>
          </Link>
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
              <div className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-3">
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
                      {reel.audioTitle ? (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                          <Music2 className="h-3 w-3" />
                          {reel.audioTitle}
                          {reel.audioArtist ? ` · ${reel.audioArtist}` : ''}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted">{reel.viewCount} views</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={reel.likedByCurrentUser ? 'primary' : 'secondary'}
                    onClick={() => void onLike(reel)}
                  >
                    <Heart className={`h-4 w-4 ${reel.likedByCurrentUser ? 'fill-current' : ''}`} />
                    {reel.likeCount}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void openComments(reel)}>
                    <MessageCircle className="h-4 w-4" />
                    {reel.commentCount}
                  </Button>
                  <Button
                    size="sm"
                    variant={reel.savedByCurrentUser ? 'primary' : 'secondary'}
                    onClick={() => void onSave(reel)}
                  >
                    <Bookmark className={`h-4 w-4 ${reel.savedByCurrentUser ? 'fill-current' : ''}`} />
                  </Button>
                </div>
                {activeComments === reel.id ? (
                  <div className="space-y-2 rounded-[12px] border border-border bg-surface-2/50 p-2">
                    {commentLoading ? (
                      <p className="text-xs text-muted">Loading comments…</p>
                    ) : comments.length === 0 ? (
                      <p className="text-xs text-muted">No comments yet.</p>
                    ) : (
                      <ul className="max-h-40 space-y-1 overflow-y-auto">
                        {comments.map((c) => (
                          <li key={c.id} className="text-xs text-ink">
                            <span className="font-semibold">
                              {c.author?.username || 'user'}
                            </span>{' '}
                            {c.body}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!reel.commentsDisabled ? (
                      <form
                        className="flex gap-2"
                        onSubmit={(e) => void submitComment(e, reel.id)}
                      >
                        <Input
                          value={commentBody}
                          onChange={(e) => setCommentBody(e.target.value)}
                          placeholder="Add a comment…"
                        />
                        <Button type="submit" size="sm">
                          Send
                        </Button>
                      </form>
                    ) : (
                      <p className="text-xs text-muted">Comments are off.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
