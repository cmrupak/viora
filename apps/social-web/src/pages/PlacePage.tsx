import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getErrorMessage, type Post } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { SkeletonPost } from '../components/ui/Skeleton';

export function PlacePage() {
  const { name } = useParams<{ name: string }>();
  const locationName = name ? decodeURIComponent(name) : '';
  const { api } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api || !locationName) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const list = await api.discovery.listPostsByPlace(locationName, { limit: 30 });
        if (active) setPosts(list);
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, locationName]);

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <Link to="/explore" className="text-xs font-semibold text-primary">
        ← Explore
      </Link>
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Place</p>
        <h1 className="text-2xl font-bold text-ink">{locationName}</h1>
      </header>
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {loading ? (
        <div className="space-y-4">
          <SkeletonPost />
        </div>
      ) : null}
      {!loading && posts.length === 0 ? (
        <p className="text-sm text-muted">No posts at this place yet.</p>
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
