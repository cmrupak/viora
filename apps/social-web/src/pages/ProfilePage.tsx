import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, optimisticMutation, type Profile } from '@viora/core';
import { useAuth } from '../auth/AuthProvider';
import { Avatar, Button, Card, Input, Label, Textarea } from '../components/ui';

export function ProfilePage() {
  const { user, profile, api, setProfile, logout } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [website, setWebsite] = useState(profile?.website ?? '');
  const [location, setLocation] = useState(profile?.location ?? '');
  const [isPrivate, setIsPrivate] = useState(Boolean(profile?.isPrivate));
  const [tagReviewEnabled, setTagReviewEnabled] = useState(Boolean(profile?.tagReviewEnabled));
  const [previewUrl, setPreviewUrl] = useState<string | null>(profile?.avatarUrl ?? null);
  const [coverUrl, setCoverUrl] = useState<string | null>(profile?.coverUrl ?? null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  useEffect(() => {
    setDisplayName(profile?.displayName ?? '');
    setUsername(profile?.username ?? '');
    setBio(profile?.bio ?? '');
    setWebsite(profile?.website ?? '');
    setLocation(profile?.location ?? '');
    setIsPrivate(Boolean(profile?.isPrivate));
    setTagReviewEnabled(Boolean(profile?.tagReviewEnabled));
    setPreviewUrl(profile?.avatarUrl ?? null);
    setCoverUrl(profile?.coverUrl ?? null);
  }, [profile]);

  if (!user || !profile || !api) {
    return (
      <Card>
        <p className="text-sm text-muted">Loading profile…</p>
      </Card>
    );
  }

  const currentUser = user;
  const currentProfile = profile;
  const profiles = api.profiles;

  async function onSave(event: FormEvent) {
    event.preventDefault();
    setError('');
    setStatus('');
    setSaving(true);
    const previous = currentProfile;
    const optimistic: Profile = {
      ...previous,
      displayName: displayName.trim(),
      username: username.trim().toLowerCase(),
      bio: bio.trim() || null,
      website: website.trim() || null,
      location: location.trim() || null,
      isPrivate,
      tagReviewEnabled,
    };
    try {
      await optimisticMutation({
        apply: () => setProfile(optimistic),
        mutation: async () => {
          const saved = await profiles.updateProfile(currentUser.id, {
            displayName,
            username,
            bio,
            website,
            location,
            isPrivate,
            tagReviewEnabled,
          });
          setProfile(saved);
        },
        rollback: () => setProfile(previous),
        onError: (err) => setError(getErrorMessage(err)),
        onSuccess: () => setStatus('Profile saved.'),
      });
    } finally {
      setSaving(false);
    }
  }

  async function onAvatarChange(file: File | null) {
    if (!file) return;
    setError('');
    setStatus('');
    setUploading(true);
    const previous = currentProfile;
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setProfile({ ...previous, avatarUrl: localUrl });
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const avatarUrl = await profiles.uploadAvatar({
        userId: currentUser.id,
        body: file,
        contentType: file.type || 'image/jpeg',
        extension: ext,
      });
      setPreviewUrl(avatarUrl);
      setProfile({ ...previous, avatarUrl });
      setStatus('Photo updated.');
    } catch (err) {
      setPreviewUrl(previous.avatarUrl);
      setProfile(previous);
      setError(getErrorMessage(err));
    } finally {
      setUploading(false);
      URL.revokeObjectURL(localUrl);
    }
  }

  async function onCoverChange(file: File | null) {
    if (!file) return;
    setError('');
    setStatus('');
    setUploadingCover(true);
    const previous = currentProfile;
    const localUrl = URL.createObjectURL(file);
    setCoverUrl(localUrl);
    setProfile({ ...previous, coverUrl: localUrl });
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const nextCover = await profiles.uploadCover({
        userId: currentUser.id,
        body: file,
        contentType: file.type || 'image/jpeg',
        extension: ext,
      });
      setCoverUrl(nextCover);
      const saved = await profiles.updateProfile(currentUser.id, {
        displayName: previous.displayName,
        username: previous.username,
        bio: previous.bio ?? '',
        website: previous.website ?? undefined,
        location: previous.location ?? undefined,
        coverUrl: nextCover,
      });
      setProfile(saved);
      setStatus('Cover updated.');
    } catch (err) {
      setCoverUrl(previous.coverUrl ?? null);
      setProfile(previous);
      setError(getErrorMessage(err));
    } finally {
      setUploadingCover(false);
      URL.revokeObjectURL(localUrl);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs font-bold tracking-wide text-primary uppercase">Profile</p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Your profile</h1>
        <p className="mt-1 text-sm text-muted">{user.email}</p>
        <p className="mt-2 flex gap-4 text-sm text-muted">
          <Link to={`/u/${profile.username}/connections`} className="hover:text-ink">
            <strong className="text-ink">{profile.followerCount}</strong> followers
          </Link>
          <Link
            to={`/u/${profile.username}/connections?tab=following`}
            className="hover:text-ink"
          >
            <strong className="text-ink">{profile.followingCount}</strong> following
          </Link>
        </p>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-border">
        <div
          className="relative h-36 bg-surface-2"
          style={
            coverUrl
              ? { backgroundImage: `url(${coverUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
        >
          {!coverUrl ? (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No cover image
            </div>
          ) : null}
          <label className="absolute right-3 bottom-3 cursor-pointer">
            <span className="inline-flex h-9 items-center rounded-[12px] border border-border bg-surface/90 px-3 text-sm font-semibold text-ink backdrop-blur hover:bg-surface">
              {uploadingCover ? 'Uploading…' : 'Change cover'}
            </span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              disabled={uploadingCover}
              onChange={(e) => void onCoverChange(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Avatar src={previewUrl} name={profile.displayName} size={72} />
        <label className="cursor-pointer">
          <span className="inline-flex h-10 items-center rounded-[12px] border border-border px-4 text-sm font-semibold text-ink hover:bg-surface-2">
            {uploading ? 'Uploading…' : 'Change photo'}
          </span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            disabled={uploading}
            onChange={(e) => void onAvatarChange(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>

      <form className="space-y-4" onSubmit={(e) => void onSave(e)}>
        <div>
          <Label>Display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </div>
        <div>
          <Label>Username</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
        </div>
        <div>
          <Label>Bio</Label>
          <Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={280} />
        </div>
        <div>
          <Label>Website</Label>
          <Input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://"
            type="url"
          />
        </div>
        <div>
          <Label>Location</Label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City, country"
          />
        </div>
        <div className="rounded-[12px] border border-border bg-surface-2/40 p-3 space-y-3">
          <label className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
            Private account
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={isPrivate}
              onChange={(e) => {
                setIsPrivate(e.target.checked);
                if (e.target.checked) setTagReviewEnabled(true);
              }}
            />
          </label>
          <p className="text-xs text-muted">
            When private, new followers must be approved before they see your posts.
          </p>
          <label className="flex items-center justify-between gap-3 text-sm font-semibold text-ink">
            Tag review
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={tagReviewEnabled}
              onChange={(e) => setTagReviewEnabled(e.target.checked)}
            />
          </label>
          <p className="text-xs text-muted">
            Plumbing for Phase E tagging — tags you receive can require approval.
          </p>
        </div>
        {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
        {status ? <p className="text-sm font-semibold text-success">{status}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </Button>
          <Button type="button" variant="ghost" onClick={() => void logout()}>
            Log out
          </Button>
        </div>
      </form>
    </Card>
  );
}
