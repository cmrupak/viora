import { FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ImagePlus, X } from 'lucide-react';
import {
  getErrorMessage,
  type AudienceList,
  type Post,
  type PostMedia,
  type PostPublishStatus,
  type PostVisibility,
  type Profile,
} from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Button, Input, Label, Textarea } from '../components/ui';
import { useToast } from '../components/ui/Toast';

const VISIBILITY_OPTIONS: Array<{ value: PostVisibility; label: string }> = [
  { value: 'public', label: 'Public' },
  { value: 'followers', label: 'Followers' },
  { value: 'friends', label: 'Friends' },
  { value: 'only_me', label: 'Only me' },
  { value: 'custom', label: 'Custom list' },
];

const FEELINGS = ['Happy', 'Blessed', 'Excited', 'Grateful', 'Loved', 'Sad', 'Tired', 'Motivated'];

type LocalFile = {
  file: File;
  preview: string;
  altText: string;
};

export function CreatePostPage() {
  const { api, user, profile } = useAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [visibility, setVisibility] = useState<PostVisibility>(
    profile?.isPrivate ? 'followers' : 'public',
  );
  const [lists, setLists] = useState<AudienceList[]>([]);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [locationName, setLocationName] = useState('');
  const [feeling, setFeeling] = useState('');
  const [publishStatus, setPublishStatus] = useState<PostPublishStatus>('published');
  const [scheduledAt, setScheduledAt] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [tagHits, setTagHits] = useState<Profile[]>([]);
  const [tagged, setTagged] = useState<Profile[]>([]);
  const [isSensitive, setIsSensitive] = useState(false);

  useEffect(() => {
    if (!api || !user) return;
    void (async () => {
      try {
        setLists(await api.audiences.listLists(user.id));
      } catch {
        /* ignore until migration applied */
      }
    })();
  }, [api, user]);

  useEffect(() => {
    if (!api || tagQuery.trim().length < 2) {
      setTagHits([]);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const hits = await api.profiles.search(tagQuery.trim(), 8);
          setTagHits(hits.filter((p) => p.id !== user?.id && !tagged.some((t) => t.id === p.id)));
        } catch {
          setTagHits([]);
        }
      })();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [api, tagQuery, tagged, user?.id]);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next: LocalFile[] = [];
    for (const file of Array.from(list)) {
      if (files.length + next.length >= 10) break;
      next.push({ file, preview: URL.createObjectURL(file), altText: '' });
    }
    setFiles((prev) => [...prev, ...next]);
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return copy;
    });
  }

  async function uploadMedia(
    authorId: string,
    mediaFile: File,
    sortOrder: number,
    altText: string,
  ): Promise<{
    url: string;
    mediaType: 'image' | 'video';
    sortOrder: number;
    altText: string | null;
  }> {
    if (!api) throw new Error('Not configured');
    const ext = mediaFile.name.split('.').pop() || 'jpg';
    const path = `${authorId}/${Date.now()}-${sortOrder}.${ext}`;
    const { error: uploadError } = await api.client.storage.from('post-media').upload(path, mediaFile, {
      contentType: mediaFile.type || 'image/jpeg',
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data } = api.client.storage.from('post-media').getPublicUrl(path);
    const mediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';
    return {
      url: data.publicUrl,
      mediaType,
      sortOrder,
      altText: altText.trim() || null,
    };
  }

  async function onSubmit(event: FormEvent, asDraft = false) {
    event.preventDefault();
    if (!api || !user || !profile) return;
    if (visibility === 'custom' && selectedListIds.length === 0) {
      push('Select at least one audience list.', 'error');
      return;
    }
    const nextStatus: PostPublishStatus = asDraft
      ? 'draft'
      : publishStatus === 'scheduled'
        ? 'scheduled'
        : 'published';
    if (nextStatus === 'scheduled' && !scheduledAt) {
      push('Pick a schedule time.', 'error');
      return;
    }
    setSubmitting(true);

    const tempId = `pending-${Date.now()}`;
    const localMedia: PostMedia[] = files.map((f, i) => ({
      id: `${tempId}-media-${i}`,
      postId: tempId,
      url: f.preview,
      mediaType: f.file.type.startsWith('video/') ? 'video' : 'image',
      sortOrder: i,
      width: null,
      height: null,
      altText: f.altText || null,
      createdAt: new Date().toISOString(),
    }));

    const pendingPost: Post = {
      id: tempId,
      authorId: user.id,
      body: body.trim(),
      visibility,
      publishStatus: nextStatus,
      scheduledAt: nextStatus === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
      locationName: locationName.trim() || null,
      feeling: feeling || null,
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
      tags: tagged.map((p, i) => ({
        id: `${tempId}-tag-${i}`,
        postId: tempId,
        taggedUserId: p.id,
        taggedBy: user.id,
        status: 'approved' as const,
        createdAt: new Date().toISOString(),
        taggedUser: p,
      })),
    };

    if (nextStatus !== 'draft') {
      navigate('/feed', { state: { pendingPost } });
    }

    try {
      const media =
        files.length > 0
          ? await Promise.all(
              files.map((f, i) => uploadMedia(user.id, f.file, i, f.altText)),
            )
          : undefined;
      const created = await api.posts.create({
        authorId: user.id,
        body,
        media,
        visibility,
        audienceListIds: visibility === 'custom' ? selectedListIds : undefined,
        publishStatus: nextStatus,
        scheduledAt: nextStatus === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
        locationName: locationName.trim() || null,
        feeling: feeling || null,
        taggedUserIds: tagged.map((p) => p.id),
        isSensitive,
      });
      push(
        nextStatus === 'draft'
          ? 'Draft saved.'
          : nextStatus === 'scheduled'
            ? 'Post scheduled.'
            : 'Post shared.',
        'success',
      );
      if (nextStatus === 'draft') {
        navigate('/profile');
      } else {
        navigate('/feed', {
          state: {
            pendingPost: { ...created, status: 'ready' as const, author: created.author ?? profile },
          },
          replace: true,
        });
      }
    } catch (err) {
      push(getErrorMessage(err), 'error');
      if (nextStatus !== 'draft') {
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
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Create</p>
        <h1 className="text-2xl font-bold text-ink">New post</h1>
        <p className="mt-1 text-sm text-muted">
          Photos, video, place, feeling, tags — or save a draft / schedule.
        </p>
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
            required={files.length === 0}
            placeholder="Write something…"
          />
        </div>

        <div>
          <Label>Who can see this?</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {VISIBILITY_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                type="button"
                size="sm"
                variant={visibility === opt.value ? 'primary' : 'secondary'}
                onClick={() => setVisibility(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        </div>

        {visibility === 'custom' ? (
          <div className="space-y-2 rounded-[12px] border border-border p-3">
            <p className="text-sm font-semibold text-ink">Audience lists</p>
            {lists.length === 0 ? (
              <p className="text-xs text-muted">Create a list under Settings → Audience lists first.</p>
            ) : (
              lists.map((list) => {
                const checked = selectedListIds.includes(list.id);
                return (
                  <label key={list.id} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedListIds((prev) =>
                          checked ? prev.filter((id) => id !== list.id) : [...prev, list.id],
                        )
                      }
                    />
                    {list.name}
                    <span className="text-xs text-muted">({list.memberCount ?? 0})</span>
                  </label>
                );
              })
            )}
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="location">Place</Label>
            <Input
              id="location"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="Add a place"
            />
          </div>
          <div>
            <Label>Feeling</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {FEELINGS.map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    feeling === f
                      ? 'border-primary bg-primary-soft text-primary'
                      : 'border-border text-muted hover:bg-surface-2'
                  }`}
                  onClick={() => setFeeling((prev) => (prev === f ? '' : f))}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="tags">Tag people</Label>
          <Input
            id="tags"
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            placeholder="Search username…"
          />
          {tagHits.length > 0 ? (
            <div className="mt-1 max-h-40 overflow-auto rounded-xl border border-border bg-surface-2">
              {tagHits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface"
                  onClick={() => {
                    setTagged((prev) => [...prev, p]);
                    setTagQuery('');
                    setTagHits([]);
                  }}
                >
                  <span className="font-semibold text-ink">{p.displayName}</span>
                  <span className="text-xs text-muted">@{p.username}</span>
                </button>
              ))}
            </div>
          ) : null}
          {tagged.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tagged.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary"
                >
                  @{p.username}
                  <button
                    type="button"
                    aria-label={`Remove ${p.username}`}
                    onClick={() => setTagged((prev) => prev.filter((t) => t.id !== p.id))}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div>
          <Label>When to post</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ['published', 'Now'],
                ['scheduled', 'Schedule'],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={publishStatus === value ? 'primary' : 'secondary'}
                onClick={() => setPublishStatus(value)}
              >
                {label}
              </Button>
            ))}
          </div>
          {publishStatus === 'scheduled' ? (
            <Input
              className="mt-2"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              required
            />
          ) : null}
        </div>

        <div>
          <Label htmlFor="media">Media (up to 10)</Label>
          <label
            htmlFor="media"
            className="mt-1 flex cursor-pointer items-center gap-2 rounded-[12px] border border-dashed border-border bg-bg px-4 py-3 text-sm font-semibold text-muted hover:bg-surface-2"
          >
            <ImagePlus className="h-4 w-4 text-primary" />
            Add photos or videos
          </label>
          <input
            id="media"
            type="file"
            className="sr-only"
            multiple
            accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          <label className="mt-3 flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={isSensitive}
              onChange={(e) => setIsSensitive(e.target.checked)}
            />
            Mark as sensitive content
          </label>
        </div>

        {files.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {files.map((f, index) => (
              <div key={f.preview} className="relative overflow-hidden rounded-xl border border-border">
                {f.file.type.startsWith('video/') ? (
                  <video src={f.preview} controls className="max-h-48 w-full object-contain" />
                ) : (
                  <img src={f.preview} alt={f.altText || ''} className="max-h-48 w-full object-cover" />
                )}
                <button
                  type="button"
                  className="absolute top-2 right-2 rounded-full bg-ink/70 p-1.5 text-white"
                  aria-label="Remove media"
                  onClick={() => removeFile(index)}
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="border-t border-border p-2">
                  <Input
                    value={f.altText}
                    onChange={(e) =>
                      setFiles((prev) =>
                        prev.map((item, i) =>
                          i === index ? { ...item, altText: e.target.value } : item,
                        ),
                      )
                    }
                    placeholder="Alt text"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            className="flex-1"
            type="submit"
            disabled={submitting || (!body.trim() && files.length === 0)}
          >
            {submitting
              ? 'Working…'
              : publishStatus === 'scheduled'
                ? 'Schedule'
                : 'Post'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            disabled={submitting || (!body.trim() && files.length === 0)}
            onClick={(e) => void onSubmit(e, true)}
          >
            Save draft
          </Button>
        </div>
      </form>
    </section>
  );
}
