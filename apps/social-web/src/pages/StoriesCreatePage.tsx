import { FormEvent, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImagePlus, X } from 'lucide-react';
import { getErrorMessage, type StoryAudience, type StorySticker, type StoryStickerType } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Button, Input } from '../components/ui';
import { useToast } from '../components/ui/Toast';

function newSticker(type: StoryStickerType, payload: Record<string, unknown>): StorySticker {
  return {
    id: `stk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    x: 0.5,
    y: 0.35 + Math.random() * 0.3,
    payload,
  };
}

export function StoriesCreatePage() {
  const { api, user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [audience, setAudience] = useState<StoryAudience>('public');
  const [stickers, setStickers] = useState<StorySticker[]>([]);
  const [stickerDraft, setStickerDraft] = useState({ type: 'poll' as StoryStickerType, text: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const stickerHint = useMemo(() => {
    switch (stickerDraft.type) {
      case 'poll':
        return 'Question text (Yes / No poll)';
      case 'quiz':
        return 'Quiz prompt';
      case 'question':
        return 'Ask a question…';
      case 'countdown':
        return 'Event name (ends in 24h)';
      case 'music':
        return 'Song or track title';
      case 'location':
        return 'Place name';
      case 'mention':
        return '@username';
      default:
        return 'Sticker text';
    }
  }, [stickerDraft.type]);

  function onFile(next: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  function addSticker() {
    const text = stickerDraft.text.trim();
    if (!text) return;
    const type = stickerDraft.type;
    let payload: Record<string, unknown> = { text };
    if (type === 'poll') {
      payload = { question: text, options: ['Yes', 'No'] };
    } else if (type === 'quiz') {
      payload = { question: text, options: ['A', 'B', 'C'], correctIndex: 0 };
    } else if (type === 'countdown') {
      payload = {
        label: text,
        endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    } else if (type === 'music') {
      payload = { title: text, artist: '' };
    } else if (type === 'location') {
      payload = { name: text };
    } else if (type === 'mention') {
      payload = { username: text.replace(/^@/, '') };
    } else {
      payload = { prompt: text };
    }
    setStickers((prev) => [...prev, newSticker(type, payload)]);
    setStickerDraft((d) => ({ ...d, text: '' }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !file) return;
    setSubmitting(true);
    setError('');
    try {
      const ext = file.name.split('.').pop() || (file.type.startsWith('video/') ? 'mp4' : 'jpg');
      const url = await api.stories.uploadMedia({
        userId: user.id,
        body: file,
        contentType: file.type || 'image/jpeg',
        extension: ext,
      });
      const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
      await api.stories.createStory({
        authorId: user.id,
        audience,
        media: [{ url, mediaType, stickers }],
      });
      push('Story shared.', 'success');
      navigate('/feed');
    } catch (err) {
      setError(getErrorMessage(err));
      push(getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-lg space-y-4">
      <header>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Stories</p>
        <h1 className="text-2xl font-bold text-ink">Add your story</h1>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
      >
        {!preview ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border bg-surface-2/40 px-4 py-12 text-center transition hover:bg-surface-2">
            <ImagePlus className="h-8 w-8 text-primary" />
            <span className="text-sm font-semibold text-ink">Choose photo or video</span>
            <span className="text-xs text-muted">Visible for 24 hours</span>
            <input
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <div className="relative overflow-hidden rounded-[14px] bg-black">
            {file?.type.startsWith('video/') ? (
              <video src={preview} controls className="max-h-[420px] w-full object-contain" />
            ) : (
              <img src={preview} alt="" className="max-h-[420px] w-full object-contain" />
            )}
            <button
              type="button"
              className="absolute top-2 right-2 rounded-full bg-ink/70 p-1.5 text-white"
              onClick={() => onFile(null)}
              aria-label="Remove media"
            >
              <X className="h-4 w-4" />
            </button>
            {stickers.map((s) => (
              <span
                key={s.id}
                className="absolute max-w-[70%] truncate rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white"
                style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, transform: 'translate(-50%, -50%)' }}
              >
                {s.type}: {String(s.payload.question || s.payload.text || s.payload.title || s.payload.name || s.payload.username || s.payload.prompt || s.payload.label || '')}
              </span>
            ))}
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">Audience</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={audience === 'public' ? 'primary' : 'secondary'}
              onClick={() => setAudience('public')}
            >
              Everyone
            </Button>
            <Button
              type="button"
              size="sm"
              variant={audience === 'close_friends' ? 'primary' : 'secondary'}
              onClick={() => setAudience('close_friends')}
            >
              Close friends
            </Button>
          </div>
        </div>

        <div className="space-y-2 rounded-[12px] border border-border bg-surface-2/40 p-3">
          <p className="text-xs font-bold tracking-wide text-muted uppercase">Stickers</p>
          <div className="flex flex-wrap gap-2">
            {(
              ['poll', 'question', 'quiz', 'countdown', 'music', 'location', 'mention'] as StoryStickerType[]
            ).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setStickerDraft((d) => ({ ...d, type }))}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${
                  stickerDraft.type === type
                    ? 'bg-primary text-white'
                    : 'bg-surface text-ink border border-border'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={stickerDraft.text}
              onChange={(e) => setStickerDraft((d) => ({ ...d, text: e.target.value }))}
              placeholder={stickerHint}
            />
            <Button type="button" variant="secondary" onClick={addSticker}>
              Add
            </Button>
          </div>
          {stickers.length > 0 ? (
            <ul className="space-y-1">
              {stickers.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-xs text-ink">
                  <span className="capitalize">
                    {s.type}:{' '}
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
                  </span>
                  <button
                    type="button"
                    className="text-danger"
                    onClick={() => setStickers((prev) => prev.filter((x) => x.id !== s.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!file || submitting} className="flex-1">
            {submitting ? 'Sharing…' : 'Share story'}
          </Button>
        </div>
      </form>
    </section>
  );
}
