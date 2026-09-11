import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { getErrorMessage, type Post, type Profile } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { Avatar, Button, Input } from '../components/ui';
import { Skeleton, SkeletonPost } from '../components/ui/Skeleton';

export function SearchPage() {
  const { api, user } = useAuth();
  const [params] = useSearchParams();
  const initial = params.get('q') ?? '';
  const [query, setQuery] = useState(initial);
  const [debounced, setDebounced] = useState(initial.trim());
  const [found, setFound] = useState<Profile[]>([]);
  const [recent, setRecent] = useState<Post[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = params.get('q') ?? '';
    setQuery(q);
    setDebounced(q.trim());
  }, [params]);

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
        const feed = await api.posts.listFeed({ currentUserId: user.id, limit: 30 });
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
        const results = await api.profiles.search(debounced, 16);
        if (active) setFound(results);
      } catch (err) {
        if (active) {
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

  const filteredPosts = useMemo(() => {
    if (!debounced) return recent;
    const q = debounced.toLowerCase();
    return recent.filter((p) => p.body.toLowerCase().includes(q));
  }, [recent, debounced]);

  function onSearch(event: FormEvent) {
    event.preventDefault();
    setDebounced(query.trim());
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Find</p>
        <h1 className="text-2xl font-bold text-ink">Search</h1>
      </header>

      <form onSubmit={onSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people or posts"
            aria-label="Search"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      {debounced.length >= 2 ? (
        <div className="space-y-2 rounded-[16px] border border-border bg-surface p-4">
          <p className="text-sm font-semibold text-ink">People {searching ? '…' : ''}</p>
          {searching ? <Skeleton className="h-12 w-full" /> : null}
          {!searching && found.length === 0 ? (
            <p className="text-sm text-muted">No users matched “{debounced}”.</p>
          ) : null}
          {found.map((p) => (
            <Link
              key={p.id}
              to={`/u/${p.username}`}
              className="flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2"
            >
              <Avatar src={p.avatarUrl} name={p.displayName} size={40} />
              <div>
                <p className="text-sm font-semibold text-ink">{p.displayName}</p>
                <p className="text-xs text-muted">@{p.username}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-ink">
          {debounced ? 'Matching posts' : 'Recent posts'}
        </h2>
        {loading ? <SkeletonPost /> : null}
        {!loading && filteredPosts.length === 0 ? (
          <p className="rounded-[16px] border border-border bg-surface p-6 text-center text-sm text-muted">
            {debounced ? `No posts matched “${debounced}”.` : 'No posts yet.'}
          </p>
        ) : null}
        {filteredPosts.map((post) => (
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
