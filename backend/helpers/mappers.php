<?php

declare(strict_types=1);

final class Mappers
{
    public static function profile(?array $row): ?array
    {
        if (!$row) {
            return null;
        }
        return [
            'id' => $row['id'],
            'username' => $row['username'],
            'displayName' => $row['display_name'] ?? '',
            'bio' => $row['bio'],
            'avatarUrl' => $row['avatar_url'],
            'coverUrl' => $row['cover_url'] ?? null,
            'website' => $row['website'] ?? null,
            'location' => $row['location'] ?? null,
            'dateOfBirth' => $row['date_of_birth'] ?? null,
            'gender' => $row['gender'] ?? null,
            'isPrivate' => (bool) ($row['is_private'] ?? false),
            'tagReviewEnabled' => (bool) ($row['tag_review_enabled'] ?? false),
            'followerCount' => (int) ($row['follower_count'] ?? 0),
            'followingCount' => (int) ($row['following_count'] ?? 0),
            'isDeactivated' => (bool) ($row['is_deactivated'] ?? false),
            'createdAt' => self::iso($row['created_at'] ?? null),
            'updatedAt' => self::iso($row['updated_at'] ?? null),
        ];
    }

    public static function post(array $row, array $extras = []): array
    {
        return array_merge([
            'id' => $row['id'],
            'authorId' => $row['author_id'],
            'body' => $row['body'] ?? '',
            'visibility' => $row['visibility'] ?? 'public',
            'publishStatus' => $row['publish_status'] ?? 'published',
            'scheduledAt' => self::iso($row['scheduled_at'] ?? null),
            'locationName' => $row['location_name'] ?? null,
            'feeling' => $row['feeling'] ?? null,
            'pinnedAt' => self::iso($row['pinned_at'] ?? null),
            'archivedAt' => self::iso($row['archived_at'] ?? null),
            'editedAt' => self::iso($row['edited_at'] ?? null),
            'viewCount' => (int) ($row['view_count'] ?? 0),
            'commentsDisabled' => (bool) ($row['comments_disabled'] ?? false),
            'isSensitive' => (bool) ($row['is_sensitive'] ?? false),
            'repostOfId' => $row['repost_of_id'] ?? null,
            'repostCount' => (int) ($row['repost_count'] ?? 0),
            'likeCount' => (int) ($row['like_count'] ?? 0),
            'commentCount' => (int) ($row['comment_count'] ?? 0),
            'shareCount' => (int) ($row['share_count'] ?? 0),
            'saveCount' => (int) ($row['save_count'] ?? 0),
            'likedByCurrentUser' => (bool) ($extras['likedByCurrentUser'] ?? false),
            'savedByCurrentUser' => (bool) ($extras['savedByCurrentUser'] ?? false),
            'deletedAt' => self::iso($row['deleted_at'] ?? null),
            'createdAt' => self::iso($row['created_at'] ?? null),
            'updatedAt' => self::iso($row['updated_at'] ?? null),
            'author' => $extras['author'] ?? null,
            'media' => $extras['media'] ?? [],
            'tags' => $extras['tags'] ?? [],
            'repostOf' => $extras['repostOf'] ?? null,
        ], array_diff_key($extras, array_flip(['likedByCurrentUser', 'savedByCurrentUser', 'author', 'media', 'tags', 'repostOf'])));
    }

    public static function media(array $row): array
    {
        return [
            'id' => $row['id'],
            'postId' => $row['post_id'],
            'url' => $row['url'],
            'mediaType' => $row['media_type'],
            'sortOrder' => (int) ($row['sort_order'] ?? 0),
            'width' => isset($row['width']) ? (int) $row['width'] : null,
            'height' => isset($row['height']) ? (int) $row['height'] : null,
            'altText' => $row['alt_text'] ?? null,
            'durationSeconds' => isset($row['duration_seconds']) ? (float) $row['duration_seconds'] : null,
            'createdAt' => self::iso($row['created_at'] ?? null),
        ];
    }

    public static function comment(array $row, array $extras = []): array
    {
        return [
            'id' => $row['id'],
            'postId' => $row['post_id'],
            'authorId' => $row['author_id'],
            'parentId' => $row['parent_id'] ?? null,
            'body' => $row['body'],
            'likeCount' => (int) ($row['like_count'] ?? 0),
            'likedByCurrentUser' => (bool) ($extras['likedByCurrentUser'] ?? false),
            'pinnedAt' => self::iso($row['pinned_at'] ?? null),
            'deletedAt' => self::iso($row['deleted_at'] ?? null),
            'createdAt' => self::iso($row['created_at'] ?? null),
            'updatedAt' => self::iso($row['updated_at'] ?? null),
            'author' => $extras['author'] ?? null,
            'replies' => $extras['replies'] ?? [],
        ];
    }

    public static function story(array $row, array $extras = []): array
    {
        return [
            'id' => $row['id'],
            'authorId' => $row['author_id'],
            'audience' => $row['audience'] ?? 'public',
            'expiresAt' => self::iso($row['expires_at'] ?? null),
            'deletedAt' => self::iso($row['deleted_at'] ?? null),
            'createdAt' => self::iso($row['created_at'] ?? null),
            'updatedAt' => self::iso($row['updated_at'] ?? null),
            'author' => $extras['author'] ?? null,
            'media' => $extras['media'] ?? [],
            'viewedByCurrentUser' => (bool) ($extras['viewedByCurrentUser'] ?? false),
            'viewCount' => (int) ($extras['viewCount'] ?? 0),
        ];
    }

    public static function storyMedia(array $row): array
    {
        $stickers = $row['stickers'] ?? [];
        if (is_string($stickers)) {
            $decoded = json_decode($stickers, true);
            $stickers = is_array($decoded) ? $decoded : [];
        }
        return [
            'id' => $row['id'],
            'storyId' => $row['story_id'],
            'url' => $row['url'],
            'mediaType' => $row['media_type'],
            'sortOrder' => (int) ($row['sort_order'] ?? 0),
            'stickers' => $stickers,
            'createdAt' => self::iso($row['created_at'] ?? null),
        ];
    }

    public static function reel(array $row, array $extras = []): array
    {
        return [
            'id' => $row['id'],
            'authorId' => $row['author_id'],
            'caption' => $row['caption'] ?? '',
            'audioTitle' => $row['audio_title'] ?? null,
            'audioArtist' => $row['audio_artist'] ?? null,
            'audioUrl' => $row['audio_url'] ?? null,
            'commentsDisabled' => (bool) ($row['comments_disabled'] ?? false),
            'likeCount' => (int) ($row['like_count'] ?? 0),
            'commentCount' => (int) ($row['comment_count'] ?? 0),
            'viewCount' => (int) ($row['view_count'] ?? 0),
            'likedByCurrentUser' => (bool) ($extras['likedByCurrentUser'] ?? false),
            'savedByCurrentUser' => (bool) ($extras['savedByCurrentUser'] ?? false),
            'deletedAt' => self::iso($row['deleted_at'] ?? null),
            'createdAt' => self::iso($row['created_at'] ?? null),
            'updatedAt' => self::iso($row['updated_at'] ?? null),
            'author' => $extras['author'] ?? null,
            'media' => $extras['media'] ?? [],
        ];
    }

    public static function group(array $row, array $extras = []): array
    {
        return [
            'id' => $row['id'],
            'name' => $row['name'],
            'description' => $row['description'] ?? null,
            'coverUrl' => $row['cover_url'] ?? null,
            'ownerId' => $row['owner_id'],
            'isPrivate' => (bool) ($row['is_private'] ?? false),
            'visibility' => $row['visibility'] ?? 'public',
            'requiresPostApproval' => (bool) ($row['requires_post_approval'] ?? false),
            'createdAt' => self::iso($row['created_at'] ?? null),
            'updatedAt' => self::iso($row['updated_at'] ?? null),
            'memberCount' => (int) ($extras['memberCount'] ?? 0),
            'myMembership' => $extras['myMembership'] ?? null,
        ];
    }

    public static function groupMember(array $row, array $extras = []): array
    {
        return [
            'id' => $row['id'],
            'groupId' => $row['group_id'],
            'userId' => $row['user_id'],
            'role' => $row['role'],
            'status' => $row['status'] ?? 'active',
            'createdAt' => self::iso($row['created_at'] ?? null),
            'updatedAt' => self::iso($row['updated_at'] ?? null),
            'user' => $extras['user'] ?? null,
        ];
    }

    public static function event(array $row, array $extras = []): array
    {
        return [
            'id' => $row['id'],
            'title' => $row['title'],
            'description' => $row['description'] ?? null,
            'coverUrl' => $row['cover_url'] ?? null,
            'location' => $row['location'] ?? null,
            'startsAt' => self::iso($row['starts_at'] ?? null),
            'endsAt' => self::iso($row['ends_at'] ?? null),
            'hostId' => $row['host_id'],
            'groupId' => $row['group_id'] ?? null,
            'isOnline' => (bool) ($row['is_online'] ?? false),
            'meetingUrl' => $row['meeting_url'] ?? null,
            'recurrenceRule' => $row['recurrence_rule'] ?? null,
            'discussionPostId' => $row['discussion_post_id'] ?? null,
            'createdAt' => self::iso($row['created_at'] ?? null),
            'updatedAt' => self::iso($row['updated_at'] ?? null),
            'host' => $extras['host'] ?? null,
            'myRsvp' => $extras['myRsvp'] ?? null,
        ];
    }

    public static function iso(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $ts = strtotime((string) $value . (str_contains((string) $value, '+') || str_ends_with((string) $value, 'Z') ? '' : ' UTC'));
        if ($ts === false) {
            return (string) $value;
        }
        return gmdate('Y-m-d\TH:i:s\Z', $ts);
    }
}
