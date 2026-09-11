import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Film, X } from 'lucide-react';
import { getErrorMessage } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Button, Input } from '../components/ui';
import { useToast } from '../components/ui/Toast';

export function ReelsCreatePage() {
  const { api, user } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [audioTitle, setAudioTitle] = useState('');
  const [audioArtist, setAudioArtist] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function onFile(next: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !file) return;
    setSubmitting(true);
    setError('');
    try {
      const ext = file.name.split('.').pop() || 'mp4';
      const url = await api.reels.uploadMedia({
        userId: user.id,
        body: file,
        contentType: file.type || 'video/mp4',
        extension: ext,
      });
      await api.reels.create({
        authorId: user.id,
        caption,
        audioTitle: audioTitle.trim() || null,
        audioArtist: audioArtist.trim() || null,
        media: [{ url, mediaType: 'video' }],
      });
      push('Reel published.', 'success');
      navigate('/reels');
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
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Reels</p>
        <h1 className="text-2xl font-bold text-ink">Create a reel</h1>
      </header>

      {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-[16px] border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
      >
        {!preview ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-border bg-surface-2/40 px-4 py-12 text-center">
            <Film className="h-8 w-8 text-primary" />
            <span className="text-sm font-semibold text-ink">Choose a video</span>
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        ) : (
          <div className="relative overflow-hidden rounded-[14px] bg-black">
            <video src={preview} controls className="max-h-[420px] w-full object-contain" />
            <button
              type="button"
              className="absolute top-2 right-2 rounded-full bg-ink/70 p-1.5 text-white"
              onClick={() => onFile(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <Input
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Caption"
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={audioTitle}
            onChange={(e) => setAudioTitle(e.target.value)}
            placeholder="Audio title (optional)"
          />
          <Input
            value={audioArtist}
            onChange={(e) => setAudioArtist(e.target.value)}
            placeholder="Artist (optional)"
          />
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={!file || submitting} className="flex-1">
            {submitting ? 'Publishing…' : 'Publish reel'}
          </Button>
        </div>
      </form>
    </section>
  );
}
