import type { Profile } from './types';

export function mapProfileRow(row: Record<string, unknown> | null): Profile | null {
  if (!row) return null;
  return {
    id: String(row.id),
    username: String(row.username ?? ''),
    displayName: String(row.display_name ?? ''),
    bio: row.bio == null ? null : String(row.bio),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
    website: row.website == null ? null : String(row.website),
    location: row.location == null ? null : String(row.location),
    dateOfBirth: row.date_of_birth == null ? null : String(row.date_of_birth),
    gender: row.gender == null ? null : String(row.gender),
    isPrivate: Boolean(row.is_private ?? false),
    tagReviewEnabled: Boolean(row.tag_review_enabled ?? false),
    followerCount: Number(row.follower_count ?? 0),
    followingCount: Number(row.following_count ?? 0),
    isDeactivated: Boolean(row.is_deactivated ?? false),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

export const PROFILE_SELECT =
  'id, username, display_name, bio, avatar_url, cover_url, website, location, date_of_birth, gender, is_private, tag_review_enabled, follower_count, following_count, is_deactivated, created_at, updated_at';

export const PROFILE_EMBED = `profiles!inner(${PROFILE_SELECT})`;
