import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getErrorMessage, type Post, type Profile } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { Avatar, Button, Input } from '../components/ui';
import { SkeletonPost } from '../components/ui/Skeleton';

export function ExplorePage() {
  const { api, user } = useAuth();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const [recent, setRecent] = useState<Post[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 350);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!api || !user) return;
    let active = true;
    void (async () => {
      setLoading(true);
      try {
        const feed = await api.posts.listFeed({ currentUserId: user.id, limit: 12 });
        if (active) setRecent(feed);
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

  useEffect(() => {
    if (!api || debounced.length < 2) {
      setFound([]);
      return;
    }
    let active = true;
    void (async () => {
      setSearching(true);
      setError('');
      try {
        const results = await api.profiles.search(debounced, 12);
        if (active) setFound(results);
      } catch (err) {
        if (active) {
          // Fallback to exact username lookup until search lands
          try {
            const one = await api.profiles.getByUsername(debounced);
            if (active) setFound(one ? [one] : []);
          } catch (inner) {
            if (active) setError(getErrorMessage(inner));
          }
        }
      } finally {
        if (active) setSearching(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, debounced]);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setDebounced(query.trim());
  }

  const mediaPosts = useMemo(() => recent.filter((p) => (p.media?.length ?? 0) > 0), [recent]);

  return (
    <section className="mx-auto w-full max-w-3xl space-y-5">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Discover</p>
        <h1 className="text-2xl font-bold text-ink">Explore</h1>
      </header>

      <form onSubmit={(e) => void onSearch(e)} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people"
            aria-label="Search people"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      {debounced.length >= 2 ? (
        <div className="space-y-2 rounded-[16px] border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-ink">People {searching ? '…' : ''}</p>
          {found.length === 0 && !searching ? (
            <p className="text-sm text-muted">No users matched “{debounced}”.</p>
          ) : null}
          {found.map((p) => (
            <Link key={p.id} to={`/u/${p.username}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2">
              <Avatar src={p.avatarUrl} name={p.displayName} size={40} />
              <div>
                <p className="text-sm font-semibold text-ink">{p.displayName}</p>
                <p className="text-xs text-muted">@{p.username}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-lg font-bold text-ink">Trending media</h2>
        {loading ? (
          <div className="space-y-4">
            <SkeletonPost />
          </div>
        ) : null}
        {!loading && mediaPosts.length === 0 ? (
          <p className="text-sm text-muted">No media posts yet — share a photo to kick things off.</p>
        ) : null}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {mediaPosts.map((post) => {
            const media = post.media![0]!;
            return (
              <Link key={post.id} to={`/posts/${post.id}`} className="aspect-square overflow-hidden rounded-xl bg-surface-2">
                {media.mediaType === 'video' ? (
                  <video src={media.url} className="h-full w-full object-cover" muted />
                ) : (
                  <img src={media.url} alt="" className="h-full w-full object-cover" />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-ink">Recent</h2>
        {recent.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onChange={(next) => setRecent((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
            onDelete={(id) => setRecent((prev) => prev.filter((p) => p.id !== id))}
          />
        ))}
      </div>
    </section>
  );
}
