import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { Profile } from './types';

export type ProfileUpdateInput = {
  displayName: string;
  username: string;
  bio: string;
  website?: string;
  location?: string;
  coverUrl?: string;
  isPrivate?: boolean;
  tagReviewEnabled?: boolean;
};

export type AvatarUploadInput = {
  userId: string;
  /** File body for web File/Blob or RN ArrayBuffer/Uint8Array */
  body: Blob | ArrayBuffer | ArrayBufferView | FormData;
  contentType: string;
  extension?: string;
};

export type CoverUploadInput = AvatarUploadInput;

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

function validateProfileInput(input: ProfileUpdateInput): ProfileUpdateInput {
  const displayName = input.displayName.trim();
  const username = normalizeUsername(input.username);
  const bio = input.bio.trim();

  if (!displayName) throw new Error('Display name is required.');
  if (username.length < 3) throw new Error('Username must be at least 3 characters.');
  if (bio.length > 280) throw new Error('Bio must be 280 characters or less.');

  const next: ProfileUpdateInput = { displayName, username, bio };
  if (input.website !== undefined) next.website = input.website.trim();
  if (input.location !== undefined) next.location = input.location.trim();
  if (input.coverUrl !== undefined) next.coverUrl = input.coverUrl;
  if (input.isPrivate !== undefined) next.isPrivate = Boolean(input.isPrivate);
  if (input.tagReviewEnabled !== undefined) next.tagReviewEnabled = Boolean(input.tagReviewEnabled);
  return next;
}

export function createProfileService(supabase: SupabaseClient) {
  return {
    async getById(userId: string): Promise<Profile | null> {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(toUserError(error));
      return mapProfileRow(data as Record<string, unknown> | null);
    },

    async getByUsername(username: string): Promise<Profile | null> {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('username', normalizeUsername(username))
        .maybeSingle();
      if (error) throw new Error(toUserError(error));
      return mapProfileRow(data as Record<string, unknown> | null);
    },

    async search(query: string, limit = 20): Promise<Profile[]> {
      const q = query.trim().replace(/[%_,]/g, '');
      if (!q) return [];

      const safeLimit = Math.min(Math.max(limit, 1), 50);
      const pattern = `%${q}%`;

      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .or(`username.ilike."${pattern}",display_name.ilike."${pattern}"`)
        .eq('is_deactivated', false)
        .order('username', { ascending: true })
        .limit(safeLimit);

      if (error) throw new Error(toUserError(error));
      return (data ?? [])
        .map((row) => mapProfileRow(row as Record<string, unknown>))
        .filter((p): p is Profile => p != null);
    },

    async updateProfile(userId: string, input: ProfileUpdateInput): Promise<Profile> {
      const next = validateProfileInput(input);
      const patch: Record<string, unknown> = {
        display_name: next.displayName,
        username: next.username,
        bio: next.bio || null,
      };
      if (next.website !== undefined) patch.website = next.website || null;
      if (next.location !== undefined) patch.location = next.location || null;
      if (next.coverUrl !== undefined) patch.cover_url = next.coverUrl || null;
      if (next.isPrivate !== undefined) {
        patch.is_private = next.isPrivate;
        // Decision #12: default tag review on when going private (unless explicitly set)
        if (next.tagReviewEnabled === undefined && next.isPrivate) {
          patch.tag_review_enabled = true;
        }
      }
      if (next.tagReviewEnabled !== undefined) {
        patch.tag_review_enabled = next.tagReviewEnabled;
      }

      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', userId)
        .select(PROFILE_SELECT)
        .single();

      if (error) {
        if (/duplicate|unique/i.test(error.message)) {
          throw new Error('That username is already taken.');
        }
        throw new Error(toUserError(error));
      }

      const profile = mapProfileRow(data as Record<string, unknown>);
      if (!profile) throw new Error('Unable to update profile.');
      return profile;
    },

    async uploadAvatar(input: AvatarUploadInput): Promise<string> {
      const ext = (input.extension || 'jpg').replace(/^\./, '');
      const path = `${input.userId}/avatar-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, input.body as Blob, {
        contentType: input.contentType,
        upsert: true,
      });
      if (uploadError) throw new Error(toUserError(uploadError));

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = data.publicUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', input.userId);
      if (updateError) throw new Error(toUserError(updateError));

      return avatarUrl;
    },

    async uploadCover(input: CoverUploadInput): Promise<string> {
      const ext = (input.extension || 'jpg').replace(/^\./, '');
      const path = `${input.userId}/cover-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('covers').upload(path, input.body as Blob, {
        contentType: input.contentType,
        upsert: true,
      });
      if (uploadError) throw new Error(toUserError(uploadError));

      const { data } = supabase.storage.from('covers').getPublicUrl(path);
      const coverUrl = data.publicUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ cover_url: coverUrl })
        .eq('id', input.userId);
      if (updateError) throw new Error(toUserError(updateError));

      return coverUrl;
    },
  };
}

export type ProfileService = ReturnType<typeof createProfileService>;
