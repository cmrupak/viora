import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImagePlus, X } from 'lucide-react';
import { getErrorMessage, type Post, type PostMedia } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Button, Label, Textarea } from '../components/ui';
import { useToast } from '../components/ui/Toast';

export function CreatePostPage() {
  const { api, user, profile } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function onFile(next: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(next ? URL.createObjectURL(next) : null);
  }

  async function uploadMedia(authorId: string, mediaFile: File): Promise<{ url: string; mediaType: 'image' | 'video' }> {
    if (!api) throw new Error('Not configured');
    const ext = mediaFile.name.split('.').pop() || 'jpg';
    const path = `${authorId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await api.client.storage.from('post-media').upload(path, mediaFile, {
      contentType: mediaFile.type || 'image/jpeg',
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data } = api.client.storage.from('post-media').getPublicUrl(path);
    const mediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';
    return { url: data.publicUrl, mediaType };
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!api || !user || !profile) return;
    setSubmitting(true);

    const tempId = `pending-${Date.now()}`;
    const localMedia: PostMedia[] = preview
      ? [
          {
            id: `${tempId}-media`,
            postId: tempId,
            url: preview,
            mediaType: file?.type.startsWith('video/') ? 'video' : 'image',
            sortOrder: 0,
            width: null,
            height: null,
            createdAt: new Date().toISOString(),
          },
        ]
      : [];

    const pendingPost: Post = {
      id: tempId,
      authorId: user.id,
      body: body.trim(),
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      saveCount: 0,
      likedByCurrentUser: false,
      savedByCurrentUser: false,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
      author: profile,
      media: localMedia,
    };

    navigate('/feed', { state: { pendingPost } });

    try {
      let media: Array<{ url: string; mediaType: 'image' | 'video' }> | undefined;
      if (file) {
        media = [await uploadMedia(user.id, file)];
      }
      const created = await api.posts.create({
        authorId: user.id,
        body,
        media,
      });
      push('Post shared.', 'success');
      navigate('/feed', {
        state: {
          pendingPost: { ...created, status: 'ready' as const, author: created.author ?? profile },
        },
        replace: true,
      });
    } catch (err) {
      push(getErrorMessage(err), 'error');
      navigate('/feed', {
        state: {
          pendingPost: {
            ...pendingPost,
            status: 'failed' as const,
            body: `${pendingPost.body}\n\n(${getErrorMessage(err)})`,
          },
        },
        replace: true,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Create</p>
        <h1 className="text-2xl font-bold text-ink">New post</h1>
        <p className="mt-1 text-sm text-muted">Share a thought with optional image or video.</p>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="space-y-4 rounded-[16px] border border-border bg-surface p-5 shadow-[var(--shadow-card)]"
      >
        <div>
          <Label htmlFor="body">What&apos;s happening?</Label>
          <Textarea
            id="body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={2000}
            required={!file}
            placeholder="Write something…"
          />
        </div>

        <div>
          <Label htmlFor="media">Media (optional)</Label>
          <label
            htmlFor="media"
            className="mt-1 flex cursor-pointer items-center gap-2 rounded-[12px] border border-dashed border-border bg-bg px-4 py-3 text-sm font-semibold text-muted hover:bg-surface-2"
          >
            <ImagePlus className="h-4 w-4 text-primary" />
            Choose image or video
          </label>
          <input
            id="media"
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {preview ? (
          <div className="relative overflow-hidden rounded-xl border border-border">
            {file?.type.startsWith('video/') ? (
              <video src={preview} controls className="max-h-80 w-full object-contain" />
            ) : (
              <img src={preview} alt="" className="max-h-80 w-full object-cover" />
            )}
            <button
              type="button"
              className="absolute top-2 right-2 rounded-full bg-ink/70 p-1.5 text-white"
              aria-label="Remove media"
              onClick={() => onFile(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        <Button className="w-full" type="submit" disabled={submitting || (!body.trim() && !file)}>
          {submitting ? 'Posting…' : 'Post'}
        </Button>
      </form>
    </section>
  );
}
