import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getErrorMessage, type Hashtag, type Post } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { SkeletonPost } from '../components/ui/Skeleton';

export function HashtagPage() {
  const { tag } = useParams<{ tag: string }>();
  const { api, user } = useAuth();
  const [hashtag, setHashtag] = useState<Hashtag | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!api || !tag) return;
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const [h, list] = await Promise.all([
          api.discovery.getHashtag(tag),
          api.discovery.listPostsByHashtag(tag, { currentUserId: user?.id, limit: 30 }),
        ]);
        if (!active) return;
        setHashtag(h);
        setPosts(list);
      } catch (err) {
        if (active) setError(getErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, tag, user?.id]);

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <Link to="/explore" className="text-xs font-semibold text-primary">
        ← Explore
      </Link>
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Hashtag</p>
        <h1 className="text-2xl font-bold text-ink">#{tag}</h1>
        {hashtag ? (
          <p className="text-sm text-muted">{hashtag.postCount} posts</p>
        ) : !loading ? (
          <p className="text-sm text-muted">No posts with this tag yet.</p>
        ) : null}
      </header>
      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
      {loading ? (
        <div className="space-y-4">
          <SkeletonPost />
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
