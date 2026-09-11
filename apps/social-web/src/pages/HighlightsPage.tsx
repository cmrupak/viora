import { FormEvent, useEffect, useState } from 'react';
import { getErrorMessage, type StoryHighlight } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Button, Input, Modal } from '../components/ui';
import { useToast } from '../components/ui/Toast';

export function HighlightsPage() {
  const { api, user } = useAuth();
  const { push } = useToast();
  const [highlights, setHighlights] = useState<StoryHighlight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [active, setActive] = useState<StoryHighlight | null>(null);

  async function load() {
    if (!api || !user) return;
    setLoading(true);
    setError('');
    try {
      const list = await api.stories.listHighlights(user.id);
      setHighlights(list);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, user]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !title.trim()) return;
    try {
      const created = await api.stories.createHighlight({
        ownerId: user.id,
        title: title.trim(),
      });
      setHighlights((prev) => [created, ...prev]);
      setTitle('');
      push('Highlight created.', 'success');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  async function onDelete(id: string) {
    if (!api || !user) return;
    try {
      await api.stories.deleteHighlight(id, user.id);
      setHighlights((prev) => prev.filter((h) => h.id !== id));
      push('Highlight deleted.', 'success');
    } catch (err) {
      push(getErrorMessage(err), 'error');
    }
  }

  return (
    <section className="mx-auto w-full max-w-lg space-y-4">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Stories</p>
        <h1 className="text-2xl font-bold text-ink">Highlights</h1>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      <form
        onSubmit={(e) => void onCreate(e)}
        className="flex gap-2 rounded-[16px] border border-border bg-surface p-3"
      >
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New highlight title"
        />
        <Button type="submit">Create</Button>
      </form>

      {loading ? <p className="text-sm text-muted">Loading…</p> : null}

      {!loading && highlights.length === 0 ? (
        <div className="rounded-[16px] border border-border bg-surface p-8 text-center">
          <p className="font-semibold text-ink">No highlights yet</p>
          <p className="mt-1 text-sm text-muted">
            Create a highlight, then add stories from the story viewer.
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        {highlights.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => setActive(h)}
            className="rounded-[14px] border border-border bg-surface p-2 text-center shadow-[var(--shadow-card)]"
          >
            <div className="mx-auto mb-2 h-16 w-16 overflow-hidden rounded-full bg-surface-2">
              {h.coverUrl ? (
                <img src={h.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full place-items-center text-xs font-bold text-muted">
                  {h.title.charAt(0)}
                </div>
              )}
            </div>
            <p className="truncate text-xs font-semibold text-ink">{h.title}</p>
            <p className="text-[10px] text-muted">{h.itemCount ?? 0} items</p>
          </button>
        ))}
      </div>

      <Modal open={Boolean(active)} title={active?.title || 'Highlight'} onClose={() => setActive(null)}>
        {active ? (
          <div className="space-y-3">
            {(active.items ?? []).length === 0 ? (
              <p className="text-sm text-muted">Empty highlight — add a story from your feed viewer.</p>
            ) : (
              <div className="space-y-3">
                {active.items!.map((item) =>
                  item.mediaType === 'video' ? (
                    <video key={item.id} src={item.url} controls className="w-full rounded-xl" />
                  ) : (
                    <img key={item.id} src={item.url} alt="" className="w-full rounded-xl object-contain" />
                  ),
                )}
              </div>
            )}
            <Button variant="secondary" onClick={() => void onDelete(active.id)}>
              Delete highlight
            </Button>
          </div>
        ) : null}
      </Modal>
    </section>
  );
}
