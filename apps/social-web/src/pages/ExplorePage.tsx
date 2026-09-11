import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Search } from 'lucide-react';
import {
  getErrorMessage,
  type Hashtag,
  type PlaceHit,
  type Post,
  type Profile,
} from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { Avatar, Button, Input } from '../components/ui';
import { SkeletonPost } from '../components/ui/Skeleton';

export function ExplorePage() {
  const { api, user } = useAuth();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const [places, setPlaces] = useState<PlaceHit[]>([]);
  const [trendingTags, setTrendingTags] = useState<Hashtag[]>([]);
  const [birthdays, setBirthdays] = useState<Profile[]>([]);
  const [explore, setExplore] = useState<Post[]>([]);
  const [memories, setMemories] = useState<Post[]>([]);
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
        const [feed, tags, bdays, mems] = await Promise.all([
          api.discovery.listExplore({ currentUserId: user.id, limit: 18 }),
          api.discovery.listTrendingHashtags(12),
          api.discovery.listBirthdaysToday(12),
          api.discovery.listMemories(user.id, 6),
        ]);
        if (!active) return;
        setExplore(feed);
        setTrendingTags(tags);
        setBirthdays(bdays);
        setMemories(mems);
        if (bdays.length > 0) {
          void api.notifications.notifyBirthdays(user.id, bdays);
        }
        if (mems.length > 0) {
          void api.notifications.notifyMemories(
            user.id,
            mems.map((m) => m.id),
          );
        }
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
      setPlaces([]);
      return;
    }
    let active = true;
    void (async () => {
      setSearching(true);
      setError('');
      try {
        const [people, placeHits] = await Promise.all([
          api.profiles.search(debounced, 12),
          api.discovery.searchPlaces(debounced, 8),
        ]);
        if (active) {
          setFound(people);
          setPlaces(placeHits);
        }
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

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    setDebounced(query.trim());
  }

  const mediaPosts = useMemo(
    () => explore.filter((p) => (p.media?.length ?? 0) > 0),
    [explore],
  );

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
            placeholder="Search people, places, #tags"
            aria-label="Search"
          />
        </div>
        <Button type="submit">Search</Button>
      </form>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      {trendingTags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {trendingTags.map((t) => (
            <Link
              key={t.id}
              to={`/hashtags/${encodeURIComponent(t.tag)}`}
              className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-ink hover:bg-surface-2"
            >
              #{t.tag} · {t.postCount}
            </Link>
          ))}
        </div>
      ) : null}

      {birthdays.length > 0 ? (
        <div className="rounded-[16px] border border-border bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold text-ink">Birthdays today</h2>
          <div className="flex flex-wrap gap-3">
            {birthdays.map((p) => (
              <Link key={p.id} to={`/u/${p.username}`} className="flex items-center gap-2">
                <Avatar src={p.avatarUrl} name={p.displayName} size={32} />
                <span className="text-xs font-semibold text-ink">{p.displayName}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {debounced.length >= 2 ? (
        <div className="space-y-3">
          <div className="space-y-2 rounded-[16px] border border-border bg-surface p-4">
            <p className="text-sm font-semibold text-ink">People {searching ? '…' : ''}</p>
            {found.length === 0 && !searching ? (
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
          {places.length > 0 ? (
            <div className="space-y-2 rounded-[16px] border border-border bg-surface p-4">
              <p className="text-sm font-semibold text-ink">Places</p>
              {places.map((place) => (
                <Link
                  key={place.locationName}
                  to={`/places/${encodeURIComponent(place.locationName)}`}
                  className="flex items-center gap-2 rounded-xl p-2 text-sm hover:bg-surface-2"
                >
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-ink">{place.locationName}</span>
                  <span className="text-xs text-muted">{place.postCount} posts</span>
                </Link>
              ))}
            </div>
          ) : null}
          {debounced.startsWith('#') || /^[A-Za-z0-9_]+$/.test(debounced) ? (
            <Link
              to={`/hashtags/${encodeURIComponent(debounced.replace(/^#/, ''))}`}
              className="inline-block text-sm font-semibold text-primary"
            >
              View #{debounced.replace(/^#/, '')}
            </Link>
          ) : null}
        </div>
      ) : null}

      {memories.length > 0 ? (
        <div>
          <h2 className="mb-3 text-lg font-bold text-ink">On this day</h2>
          <div className="space-y-4">
            {memories.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onChange={(next) =>
                  setMemories((prev) => prev.map((p) => (p.id === next.id ? next : p)))
                }
                onDelete={(id) => setMemories((prev) => prev.filter((p) => p.id !== id))}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="mb-3 text-lg font-bold text-ink">For you</h2>
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
              <Link
                key={post.id}
                to={`/posts/${post.id}`}
                className="aspect-square overflow-hidden rounded-xl bg-surface-2"
              >
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
        <h2 className="text-lg font-bold text-ink">Trending</h2>
        {explore.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onChange={(next) => setExplore((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
            onDelete={(id) => setExplore((prev) => prev.filter((p) => p.id !== id))}
          />
        ))}
      </div>
    </section>
  );
}
