import { Bookmark, Heart, MessageCircle, MoreHorizontal, Share2, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createLatestIntentGate,
  getErrorMessage,
  optimisticMutation,
  type Post,
  type ReactionType,
} from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Avatar } from './ui/Avatar';

export type PostCardProps = {
  post: Post;
  onChange?: (next: Post) => void;
  onDelete?: (postId: string) => void;
};

const REACTION_EMOJI: Record<ReactionType, string> = {
  love: '❤️',
  haha: '😆',
  wow: '😮',
  sad: '😢',
  angry: '😡',
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
}

function postUrl(postId: string): string {
  return `${window.location.origin}/posts/${postId}`;
}

function PostCardInner({ post, onChange, onDelete }: PostCardProps) {
  const { api, user } = useAuth();
  const [view, setView] = useState(post);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [showReactions, setShowReactions] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [reaction, setReaction] = useState<ReactionType | null>(null);
  const [deleting, setDeleting] = useState(false);
  const likeGate = useRef(createLatestIntentGate()).current;
  const saveGate = useRef(createLatestIntentGate()).current;

  useEffect(() => {
    setView(post);
  }, [post]);

  useEffect(() => {
    if (!api || !user || post.id.startsWith('pending-')) return;
    let active = true;
    void (async () => {
      try {
        const result = await api.reactions.getForPost(post.id, user.id);
        if (active) setReaction(result.currentUserReaction);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, [api, user, post.id]);

  function commit(next: Post) {
    setView(next);
    onChange?.(next);
  }

  async function onReact(next: ReactionType) {
    if (!api || !user || view.status === 'pending') return;
    const previous = reaction;
    const cleared = previous === next;
    setReaction(cleared ? null : next);
    setShowReactions(false);
    try {
      await api.reactions.setReaction(view.id, user.id, cleared ? null : next);
    } catch (err) {
      setReaction(previous);
      setError(getErrorMessage(err));
    }
  }

  async function onLike() {
    if (!api || !user || view.status === 'pending') return;
    setError('');
    const token = likeGate.next();
    const previous = view;
    const nextLiked = !previous.likedByCurrentUser;
    const optimistic: Post = {
      ...previous,
      likedByCurrentUser: nextLiked,
      likeCount: Math.max(0, previous.likeCount + (nextLiked ? 1 : -1)),
    };

    try {
      await optimisticMutation({
        apply: () => commit(optimistic),
        mutation: async () => {
          const result = await api.likes.toggleLike(previous.id, user.id);
          if (!likeGate.isCurrent(token)) return;
          const delta =
            result.active === previous.likedByCurrentUser ? 0 : result.active ? 1 : -1;
          commit({
            ...previous,
            likedByCurrentUser: result.active,
            likeCount: Math.max(0, previous.likeCount + delta),
          });
        },
        rollback: () => {
          if (likeGate.isCurrent(token)) commit(previous);
        },
        onError: (err) => setError(getErrorMessage(err)),
      });
    } catch {
      /* rolled back */
    }
  }

  async function onSave() {
    if (!api || !user || view.status === 'pending') return;
    setError('');
    const token = saveGate.next();
    const previous = view;
    const nextSaved = !previous.savedByCurrentUser;
    const optimistic: Post = {
      ...previous,
      savedByCurrentUser: nextSaved,
      saveCount: Math.max(0, previous.saveCount + (nextSaved ? 1 : -1)),
    };

    try {
      await optimisticMutation({
        apply: () => commit(optimistic),
        mutation: async () => {
          const result = await api.saves.toggleSave(previous.id, user.id);
          if (!saveGate.isCurrent(token)) return;
          const delta =
            result.active === previous.savedByCurrentUser ? 0 : result.active ? 1 : -1;
          commit({
            ...previous,
            savedByCurrentUser: result.active,
            saveCount: Math.max(0, previous.saveCount + delta),
          });
        },
        rollback: () => {
          if (saveGate.isCurrent(token)) commit(previous);
        },
        onError: (err) => setError(getErrorMessage(err)),
      });
    } catch {
      /* rolled back */
    }
  }

  async function recordShareThen(action: (url: string) => Promise<void>) {
    if (!api || !user || view.status === 'pending') return;
    setError('');
    setStatus('');
    setShowShareMenu(false);
    const previous = view;
    const optimistic: Post = { ...previous, shareCount: previous.shareCount + 1 };
    const url = postUrl(previous.id);

    try {
      await optimisticMutation({
        apply: () => commit(optimistic),
        mutation: async () => {
          await api.shares.createShare(previous.id, user.id);
          await action(url);
        },
        rollback: () => commit(previous),
        onError: (err) => setError(getErrorMessage(err)),
      });
    } catch {
      /* rolled back */
    }
  }

  async function onShareAnywhere() {
    await recordShareThen(async (url) => {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'Viora',
          text: view.body?.slice(0, 140) || 'Check out this post on Viora',
          url,
        });
        setStatus('Shared.');
        return;
      }
      await navigator.clipboard.writeText(url);
      setStatus('Link copied — paste it anywhere.');
    });
  }

  async function onCopyLink() {
    await recordShareThen(async (url) => {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied.');
    });
  }

  async function onDeletePost() {
    if (!api || !user || view.authorId !== user.id || view.status === 'pending') return;
    const ok = window.confirm('Delete this post? This cannot be undone.');
    if (!ok) return;
    setDeleting(true);
    setError('');
    setShowMore(false);
    try {
      await api.posts.softDelete(view.id, user.id);
      onDelete?.(view.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const author = view.author;
  const username = author?.username ?? 'user';
  const pending = view.status === 'pending';
  const isOwner = Boolean(user && view.authorId === user.id);
  const reactionLabel = reaction ? REACTION_EMOJI[reaction] : '😊';

  return (
    <article
      className={`rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)] ${
        pending ? 'opacity-70' : ''
      } ${view.status === 'failed' ? 'border-danger/40' : ''}`}
    >
      <header className="flex items-center justify-between gap-3">
        <Link to={`/u/${username}`} className="flex min-w-0 items-center gap-3">
          <Avatar src={author?.avatarUrl} name={author?.displayName || username} size={40} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{author?.displayName || username}</p>
            <p className="truncate text-xs text-muted">
              @{username} · {formatTime(view.createdAt)}
            </p>
          </div>
        </Link>
        <div className="relative flex items-center gap-2">
          {pending ? (
            <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">Posting…</span>
          ) : null}
          {view.status === 'failed' ? (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">Failed</span>
          ) : null}
          {isOwner && !pending ? (
            <>
              <button
                type="button"
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2"
                aria-label="Post options"
                onClick={() => {
                  setShowMore((v) => !v);
                  setShowShareMenu(false);
                  setShowReactions(false);
                }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {showMore ? (
                <div className="absolute top-8 right-0 z-20 min-w-[160px] rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-card)]">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-danger/10"
                    disabled={deleting}
                    onClick={() => void onDeletePost()}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deleting ? 'Deleting…' : 'Delete post'}
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </header>

      <Link
        to={pending ? '#' : `/posts/${view.id}`}
        className="mt-3 block"
        onClick={(e) => pending && e.preventDefault()}
      >
        <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{view.body}</p>
      </Link>

      {view.media && view.media.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {view.media.map((m) =>
            m.mediaType === 'video' ? (
              <video key={m.id} src={m.url} controls playsInline className="max-h-[420px] w-full rounded-xl bg-black object-contain" />
            ) : (
              <img key={m.id} src={m.url} alt="" className="max-h-[420px] w-full rounded-xl object-cover" />
            ),
          )}
        </div>
      ) : null}

      <footer className="mt-3 flex flex-wrap items-center gap-1 border-t border-border pt-2">
        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-surface-2 ${
            view.likedByCurrentUser ? 'text-primary' : 'text-muted'
          }`}
          onClick={() => void onLike()}
          disabled={pending}
          aria-label={view.likedByCurrentUser ? 'Unlike' : 'Like'}
        >
          <Heart className={`h-4 w-4 ${view.likedByCurrentUser ? 'fill-current' : ''}`} />
          {view.likeCount}
        </button>

        <div className="relative">
          <button
            type="button"
            className={`inline-flex min-w-10 items-center justify-center gap-1 rounded-lg px-2 py-2 text-lg leading-none transition hover:bg-surface-2 ${
              reaction ? 'bg-primary-soft ring-1 ring-primary/30' : ''
            }`}
            aria-label={reaction ? `Reaction ${reaction}` : 'Add reaction'}
            disabled={pending}
            onClick={() => {
              setShowReactions((v) => !v);
              setShowShareMenu(false);
              setShowMore(false);
            }}
          >
            <span aria-hidden>{reactionLabel}</span>
          </button>
          {showReactions ? (
            <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-full border border-border bg-surface p-1 shadow-[var(--shadow-card)]">
              {(Object.keys(REACTION_EMOJI) as ReactionType[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`rounded-full px-2 py-1 text-lg leading-none transition ${
                    reaction === r ? 'bg-primary-soft ring-1 ring-primary/40 scale-110' : 'hover:bg-surface-2'
                  }`}
                  onClick={() => void onReact(r)}
                  aria-label={r}
                  aria-pressed={reaction === r}
                >
                  {REACTION_EMOJI[r]}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <Link
          to={`/posts/${view.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2"
          aria-disabled={pending}
        >
          <MessageCircle className="h-4 w-4" />
          {view.commentCount}
        </Link>

        <div className="relative">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted transition hover:bg-surface-2"
            onClick={() => {
              setShowShareMenu((v) => !v);
              setShowReactions(false);
              setShowMore(false);
            }}
            disabled={pending}
            aria-label="Share post"
            aria-expanded={showShareMenu}
          >
            <Share2 className="h-4 w-4" />
            {view.shareCount}
          </button>
          {showShareMenu ? (
            <div className="absolute bottom-full left-0 z-20 mb-1 min-w-[180px] rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-card)]">
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-surface-2"
                onClick={() => void onShareAnywhere()}
              >
                Share anywhere…
              </button>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-ink hover:bg-surface-2"
                onClick={() => void onCopyLink()}
              >
                Copy link
              </button>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-surface-2 ${
            view.savedByCurrentUser ? 'text-primary' : 'text-muted'
          }`}
          onClick={() => void onSave()}
          disabled={pending}
          aria-label={view.savedByCurrentUser ? 'Unsave' : 'Save'}
        >
          <Bookmark className={`h-4 w-4 ${view.savedByCurrentUser ? 'fill-current' : ''}`} />
          {view.saveCount}
        </button>
      </footer>
      {status ? <p className="mt-2 text-xs font-semibold text-success">{status}</p> : null}
      {error ? <p className="mt-2 text-xs font-semibold text-danger">{error}</p> : null}
    </article>
  );
}

export const PostCard = memo(PostCardInner);
