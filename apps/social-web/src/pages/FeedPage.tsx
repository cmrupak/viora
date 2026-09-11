import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  getErrorMessage,
  type Post,
  type Story,
  type StoryHighlight,
  type StoryView,
} from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { Avatar, Button, Input, Modal } from '../components/ui';
import { SkeletonPost } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';

type FeedLocationState = {
  pendingPost?: Post;
};

export function FeedPage() {
  const { api, user, profile } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [viewers, setViewers] = useState<StoryView[] | null>(null);
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const mergePending = useCallback((feed: Post[], pending?: Post | null) => {
    if (pending && !feed.some((p) => p.id === pending.id)) return [pending, ...feed];
    if (pending) return feed.map((p) => (p.id === pending.id ? pending : p));
    return feed;
  }, []);

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    const pending = (location.state as FeedLocationState | null)?.pendingPost;

    void (async () => {
      setLoading(true);
      setError('');
      try {
        const [feed, storyList, settings] = await Promise.all([
          api.posts.listFeed({ currentUserId: user.id, limit: 20 }),
          api.stories.listActiveStories({ currentUserId: user.id, limit: 40 }),
          api.settings.getSettings(user.id).catch(() => null),
        ]);
        if (!active) return;
        const filtered =
          settings?.hideSensitive ? feed.filter((p) => !p.isSensitive || p.authorId === user.id) : feed;
        setPosts(mergePending(filtered, pending));
        setStories(storyList);
        setCursor(feed.length ? feed[feed.length - 1]!.createdAt : null);
        setHasMore(feed.length >= 20);
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [api, user, location.key, mergePending, location.state]);

  async function loadMore() {
    if (!api || !user || !cursor || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const feed = await api.posts.listFeed({ currentUserId: user.id, limit: 20, cursor });
      setPosts((prev) => [...prev, ...feed.filter((p) => !prev.some((x) => x.id === p.id))]);
      setCursor(feed.length ? feed[feed.length - 1]!.createdAt : cursor);
      setHasMore(feed.length >= 20);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  async function refresh() {
    if (!api || !user) return;
    setLoading(true);
    setError('');
    try {
      const [feed, storyList] = await Promise.all([
        api.posts.listFeed({ currentUserId: user.id, limit: 20 }),
        api.stories.listActiveStories({ currentUserId: user.id, limit: 40 }),
      ]);
      setPosts(feed);
      setStories(storyList);
      setCursor(feed.length ? feed[feed.length - 1]!.createdAt : null);
      setHasMore(feed.length >= 20);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function patchPost(next: Post) {
    setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }

  async function openStory(story: Story) {
    setActiveStory(story);
    setReplyBody('');
    setViewers(null);
    if (api && user && !story.viewedByCurrentUser) {
      try {
        await api.stories.markViewed(story.id, user.id);
        setStories((prev) =>
          prev.map((s) => (s.id === story.id ? { ...s, viewedByCurrentUser: true } : s)),
        );
      } catch {
        /* non-blocking */
      }
    }
    if (api && user && story.authorId === user.id) {
      try {
        const [viewerList, myHighlights] = await Promise.all([
          api.stories.listViewers(story.id, user.id),
          api.stories.listHighlights(user.id),
        ]);
        setViewers(viewerList);
        setHighlights(myHighlights);
      } catch {
        setViewers([]);
      }
    }
  }

  async function sendReply() {
    if (!api || !user || !activeStory || !replyBody.trim()) return;
    try {
      const { conversationId } = await api.stories.replyViaDm(
        activeStory.id,
        user.id,
        replyBody.trim(),
      );
      push('Reply sent.', 'success');
      setActiveStory(null);
      navigate(`/messages/${conversationId}`);
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  async function addToHighlight(highlightId: string) {
    if (!api || !user || !activeStory) return;
    try {
      await api.stories.addStoryToHighlight(highlightId, activeStory.id, user.id);
      push('Added to highlight.', 'success');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  async function votePoll(storyMediaId: string, stickerId: string, option: string) {
    if (!api || !user) return;
    try {
      await api.stories.respondToSticker({
        storyMediaId,
        stickerId,
        userId: user.id,
        response: { option },
      });
      push(`Voted: ${option}`, 'success');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  const name = profile?.displayName?.split(' ')[0] || 'there';
  const media = activeStory?.media?.[0];
  const isOwn = Boolean(user && activeStory && activeStory.authorId === user.id);

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-primary uppercase">Home</p>
          <h1 className="text-2xl font-bold text-ink">Feed</h1>
        </div>
        <Link to="/create">
          <Button size="sm">
            <Plus className="h-4 w-4" />
            New post
          </Button>
        </Link>
      </header>

      <div className="overflow-x-auto rounded-[16px] border border-border bg-surface p-3 shadow-[var(--shadow-card)]">
        <div className="flex gap-3">
          <Link to="/stories/create" className="flex w-16 shrink-0 flex-col items-center gap-1">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-primary bg-primary-soft text-lg font-bold text-primary">
              +
            </div>
            <span className="w-full truncate text-center text-[10px] font-semibold text-ink">
              Your story
            </span>
          </Link>
          <Link to="/highlights" className="flex w-16 shrink-0 flex-col items-center gap-1">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-bold text-muted">
              ★
            </div>
            <span className="w-full truncate text-center text-[10px] font-semibold text-ink">
              Highlights
            </span>
          </Link>
          {stories.map((story) => {
            const author = story.author;
            const label = author?.displayName?.split(' ')[0] || author?.username || 'Story';
            return (
              <button
                key={story.id}
                type="button"
                onClick={() => void openStory(story)}
                className="flex w-16 shrink-0 flex-col items-center gap-1"
              >
                <div
                  className={`rounded-full p-0.5 ${
                    story.viewedByCurrentUser
                      ? 'bg-border'
                      : story.audience === 'close_friends'
                        ? 'bg-gradient-to-tr from-emerald-400 to-emerald-600'
                        : 'bg-gradient-to-tr from-primary to-primary-dark'
                  }`}
                >
                  <Avatar
                    src={author?.avatarUrl}
                    name={author?.displayName || label}
                    size={52}
                    className="border-2 border-surface"
                  />
                </div>
                <span className="w-full truncate text-center text-[10px] font-semibold text-ink">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Link
        to="/create"
        className="flex items-center gap-3 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition hover:bg-surface-2"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary">
          {name.charAt(0).toUpperCase()}
        </div>
        <p className="text-sm text-muted">What&apos;s on your mind, {name}?</p>
      </Link>

      {error ? (
        <div className="rounded-[12px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-4">
          <SkeletonPost />
          <SkeletonPost />
        </div>
      ) : null}

      {!loading && posts.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-surface p-8 text-center">
          <p className="font-semibold text-ink">No posts yet</p>
          <p className="mt-1 text-sm text-muted">Be the first to share something with Viora.</p>
          <Link to="/create" className="mt-4 inline-block">
            <Button>Create a post</Button>
          </Link>
        </div>
      ) : null}

      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onChange={patchPost}
            onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        ))}
      </div>

      {hasMore && posts.length > 0 ? (
        <div className="pb-6 text-center">
          <Button variant="secondary" disabled={loadingMore} onClick={() => void loadMore()}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}

      <Modal
        open={Boolean(activeStory)}
        title={
          activeStory?.author?.displayName ||
          activeStory?.author?.username ||
          'Story'
        }
        onClose={() => setActiveStory(null)}
      >
        <div className="space-y-3">
          {activeStory?.audience === 'close_friends' ? (
            <p className="text-xs font-semibold text-emerald-600">Close friends</p>
          ) : null}
          {media ? (
            <div className="relative overflow-hidden rounded-xl bg-black">
              {media.mediaType === 'video' ? (
                <video src={media.url} controls autoPlay className="max-h-[60vh] w-full" />
              ) : (
                <img src={media.url} alt="" className="max-h-[60vh] w-full object-contain" />
              )}
              {(media.stickers ?? []).map((s) => (
                <div
                  key={s.id}
                  className="absolute max-w-[75%] rounded-xl bg-black/65 px-2 py-1 text-[11px] text-white"
                  style={{
                    left: `${s.x * 100}%`,
                    top: `${s.y * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                >
                  <p className="font-semibold capitalize">{s.type}</p>
                  <p>
                    {String(
                      s.payload.question ||
                        s.payload.text ||
                        s.payload.title ||
                        s.payload.name ||
                        s.payload.username ||
                        s.payload.prompt ||
                        s.payload.label ||
                        '',
                    )}
                  </p>
                  {s.type === 'poll' && Array.isArray(s.payload.options) ? (
                    <div className="mt-1 flex gap-1">
                      {(s.payload.options as string[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className="rounded-full bg-white/20 px-2 py-0.5"
                          onClick={() => void votePoll(media.id, s.id, opt)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">No media on this story.</p>
          )}

          {!isOwn ? (
            <div className="flex gap-2">
              <Input
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Reply via DM…"
              />
              <Button type="button" onClick={() => void sendReply()}>
                Send
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase text-muted">
                Seen by {viewers?.length ?? 0}
              </p>
              <ul className="max-h-28 space-y-1 overflow-y-auto">
                {(viewers ?? []).map((v) => (
                  <li key={v.id} className="flex items-center gap-2 text-xs text-ink">
                    <Avatar
                      src={v.viewer?.avatarUrl}
                      name={v.viewer?.displayName || v.viewer?.username || 'User'}
                      size={24}
                    />
                    {v.viewer?.displayName || v.viewer?.username || 'Viewer'}
                  </li>
                ))}
              </ul>
              {highlights.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {highlights.map((h) => (
                    <Button
                      key={h.id}
                      size="sm"
                      variant="secondary"
                      onClick={() => void addToHighlight(h.id)}
                    >
                      Add to {h.title}
                    </Button>
                  ))}
                </div>
              ) : (
                <Link to="/highlights" className="text-xs font-semibold text-primary">
                  Create a highlight to save this story
                </Link>
              )}
            </div>
          )}
        </div>
      </Modal>
    </section>
  );
}
