import { FormEvent, useEffect, useState } from 'react';
import { getErrorMessage, type Post, type SavedCollection } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { PostCard } from '../components/PostCard';
import { Button, Input } from '../components/ui';
import { SkeletonPost } from '../components/ui/Skeleton';

export function SavedPage() {
  const { api, user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [collections, setCollections] = useState<SavedCollection[]>([]);
  const [activeCollectionId, setActiveCollectionId] = useState<string | 'all' | 'uncategorized'>(
    'all',
  );
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(collection: typeof activeCollectionId = activeCollectionId) {
    if (!api || !user) return;
    setLoading(true);
    setError('');
    try {
      const [saved, cols] = await Promise.all([
        api.saves.listSaved(user.id, {
          collectionId:
            collection === 'all' ? undefined : collection === 'uncategorized' ? null : collection,
        }),
        api.saves.listCollections(user.id),
      ]);
      setPosts(saved.map((s) => s.post).filter(Boolean) as Post[]);
      setCollections(cols);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user]);

  async function onCreateCollection(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !newName.trim()) return;
    try {
      const created = await api.saves.createCollection(user.id, newName.trim());
      setCollections((prev) => [...prev, created]);
      setNewName('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function selectCollection(id: typeof activeCollectionId) {
    setActiveCollectionId(id);
    await load(id);
  }

  return (
    <section className="mx-auto w-full max-w-2xl space-y-4">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Collections</p>
        <h1 className="text-2xl font-bold text-ink">Saved</h1>
      </header>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={activeCollectionId === 'all' ? 'primary' : 'secondary'}
          onClick={() => void selectCollection('all')}
        >
          All
        </Button>
        <Button
          size="sm"
          variant={activeCollectionId === 'uncategorized' ? 'primary' : 'secondary'}
          onClick={() => void selectCollection('uncategorized')}
        >
          Uncategorized
        </Button>
        {collections.map((c) => (
          <Button
            key={c.id}
            size="sm"
            variant={activeCollectionId === c.id ? 'primary' : 'secondary'}
            onClick={() => void selectCollection(c.id)}
          >
            {c.name}
            {typeof c.itemCount === 'number' ? ` (${c.itemCount})` : ''}
          </Button>
        ))}
      </div>

      <form onSubmit={(e) => void onCreateCollection(e)} className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New collection name"
        />
        <Button type="submit" disabled={!newName.trim()}>
          Create
        </Button>
      </form>

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
