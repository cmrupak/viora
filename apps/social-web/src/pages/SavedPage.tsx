import { useEffect, useState } from 'react';
import { getErrorMessage, type Post } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { SkeletonPost } from '../components/ui/Skeleton';

export function SavedPage() {
  const { api, user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const saved = await api.saves.listSaved(user.id);
        if (active) setPosts(saved.map((s) => s.post).filter(Boolean) as Post[]);
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
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Collections</p>
        <h1 className="text-2xl font-bold text-ink">Saved</h1>
      </header>
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {loading ? <SkeletonPost /> : null}
      {!loading && posts.length === 0 ? (
        <p className="rounded-[16px] border border-border bg-surface p-8 text-center text-sm text-muted">
          Saved posts will show up here.
        </p>
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
