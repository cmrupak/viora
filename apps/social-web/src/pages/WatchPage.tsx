import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, type Post } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { Button } from '../components/ui';
import { SkeletonPost } from '../components/ui/Skeleton';

export function WatchPage() {
  const { api, user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const feed = await api.posts.listWatchFeed({ currentUserId: user.id, limit: 20 });
        if (active) setPosts(feed);
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

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-primary uppercase">Watch</p>
          <h1 className="text-2xl font-bold text-ink">Long-form video</h1>
        </div>
        <Link to="/reels">
          <Button size="sm" variant="secondary">
            Reels
          </Button>
        </Link>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {loading ? (
        <div className="space-y-4">
          <SkeletonPost />
          <SkeletonPost />
        </div>
      ) : null}

      {!loading && posts.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-surface p-8 text-center">
          <p className="font-semibold text-ink">No videos yet</p>
          <p className="mt-1 text-sm text-muted">
            Video posts appear here. Create a post with a video to get started.
          </p>
          <Link to="/create" className="mt-4 inline-block">
            <Button>Create post</Button>
          </Link>
        </div>
      ) : null}

      <div className="space-y-4">
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onChange={(next) => setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
            onDelete={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          />
        ))}
      </div>
    </section>
  );
}
