<?php

declare(strict_types=1);

final class AuthorizationService
{
    public function __construct(private readonly mysqli $db)
    {
    }

    /** @return list<string> */
    public function feedHiddenAuthorIds(string $viewerId): array
    {
        $sql = <<<'SQL'
            SELECT DISTINCT x.author_id FROM (
              SELECT CASE WHEN blocker_id = ? THEN blocked_id ELSE blocker_id END AS author_id
              FROM blocked_users
              WHERE blocker_id = ? OR blocked_id = ?
              UNION
              SELECT target_id AS author_id
              FROM user_mutes
              WHERE owner_id = ? AND scope IN ('posts', 'all')
              UNION
              SELECT target_id AS author_id
              FROM user_snoozes
              WHERE owner_id = ? AND expires_at > UTC_TIMESTAMP(6)
            ) x
            WHERE x.author_id IS NOT NULL AND x.author_id <> ?
            SQL;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('ssssss', $viewerId, $viewerId, $viewerId, $viewerId, $viewerId, $viewerId);
        $stmt->execute();
        $ids = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $ids[] = (string) $row['author_id'];
        }
        $stmt->close();
        return $ids;
    }

    public function isBlockedEitherWay(string $a, string $b): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM blocked_users
             WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)
             LIMIT 1'
        );
        $stmt->bind_param('ssss', $a, $b, $b, $a);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }

    public function isFollowing(string $followerId, string $followingId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $followerId, $followingId);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }

    public function areFriends(string $a, string $b): bool
    {
        $userA = $a < $b ? $a : $b;
        $userB = $a < $b ? $b : $a;
        $stmt = $this->db->prepare(
            'SELECT 1 FROM friendships WHERE user_a = ? AND user_b = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $userA, $userB);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }

    public function isLivePost(array $post): bool
    {
        if (!empty($post['deleted_at']) || !empty($post['archived_at'])) {
            return false;
        }
        $status = $post['publish_status'] ?? 'published';
        if ($status === 'published') {
            return true;
        }
        if ($status === 'scheduled') {
            $at = $post['scheduled_at'] ?? null;
            if (!$at) {
                return false;
            }
            $ts = strtotime((string) $at . ' UTC');
            return $ts !== false && $ts <= time();
        }
        return false;
    }

    public function canViewPost(array $post, ?array $author, ?string $viewerId): bool
    {
        if (!empty($post['deleted_at'])) {
            return false;
        }
        if ($viewerId && $viewerId === ($post['author_id'] ?? null)) {
            return true;
        }
        if (!$this->isLivePost($post)) {
            return false;
        }
        if (($post['visibility'] ?? '') === 'only_me') {
            return false;
        }
        if ($viewerId && $this->isBlockedEitherWay($viewerId, (string) $post['author_id'])) {
            return false;
        }
        if ($author && (int) ($author['is_private'] ?? 0) === 1) {
            if (!$viewerId || !$this->isFollowing($viewerId, (string) $post['author_id'])) {
                return false;
            }
        }
        return match ($post['visibility'] ?? 'public') {
            'public' => true,
            'followers' => $viewerId ? $this->isFollowing($viewerId, (string) $post['author_id']) : false,
            'friends' => $viewerId ? $this->areFriends($viewerId, (string) $post['author_id']) : false,
            'custom' => $viewerId ? $this->inPostAudience((string) $post['id'], $viewerId) : false,
            default => false,
        };
    }

    public function inPostAudience(string $postId, string $viewerId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1
             FROM post_audience pa
             JOIN audience_list_members alm ON alm.list_id = pa.list_id
             WHERE pa.post_id = ? AND alm.member_id = ?
             LIMIT 1'
        );
        $stmt->bind_param('ss', $postId, $viewerId);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }

    public function isRestricted(string $ownerId, string $targetId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM user_restricts WHERE owner_id = ? AND target_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $ownerId, $targetId);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }

    /** @return list<string> */
    public function storyHiddenAuthorIds(string $viewerId): array
    {
        $sql = <<<'SQL'
            SELECT DISTINCT x.author_id FROM (
              SELECT CASE WHEN blocker_id = ? THEN blocked_id ELSE blocker_id END AS author_id
              FROM blocked_users
              WHERE blocker_id = ? OR blocked_id = ?
              UNION
              SELECT target_id AS author_id
              FROM user_mutes
              WHERE owner_id = ? AND scope IN ('stories', 'all')
              UNION
              SELECT target_id AS author_id
              FROM user_snoozes
              WHERE owner_id = ? AND expires_at > UTC_TIMESTAMP(6)
            ) x
            WHERE x.author_id IS NOT NULL AND x.author_id <> ?
            SQL;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('ssssss', $viewerId, $viewerId, $viewerId, $viewerId, $viewerId, $viewerId);
        $stmt->execute();
        $ids = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $ids[] = (string) $row['author_id'];
        }
        $stmt->close();
        return $ids;
    }

    public function isCloseFriend(string $ownerId, string $friendId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM close_friends WHERE owner_id = ? AND friend_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $ownerId, $friendId);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }

    public function canViewStory(array $story, ?string $viewerId): bool
    {
        if (!empty($story['deleted_at'])) {
            return false;
        }
        $expires = strtotime((string) ($story['expires_at'] ?? '') . ' UTC');
        if ($expires !== false && $expires <= time()) {
            return false;
        }
        $authorId = (string) ($story['author_id'] ?? '');
        if ($viewerId && $viewerId === $authorId) {
            return true;
        }
        if ($viewerId && $this->isBlockedEitherWay($viewerId, $authorId)) {
            return false;
        }
        if (($story['audience'] ?? 'public') === 'close_friends') {
            return $viewerId ? $this->isCloseFriend($authorId, $viewerId) : false;
        }
        return true;
    }

    public function groupMembership(string $groupId, string $userId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM group_members WHERE group_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $groupId, $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function canManageGroup(string $groupId, string $userId): bool
    {
        $stmt = $this->db->prepare('SELECT owner_id FROM `groups` WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $groupId);
        $stmt->execute();
        $group = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($group && (string) $group['owner_id'] === $userId) {
            return true;
        }
        $m = $this->groupMembership($groupId, $userId);
        return $m && ($m['status'] ?? '') === 'active' && in_array($m['role'] ?? '', ['owner', 'admin'], true);
    }

    public function canViewGroup(array $group, ?string $viewerId): bool
    {
        $visibility = $group['visibility'] ?? (((int) ($group['is_private'] ?? 0) === 1) ? 'private' : 'public');
        if ($visibility === 'public') {
            return true;
        }
        if (!$viewerId) {
            return false;
        }
        if ((string) ($group['owner_id'] ?? '') === $viewerId) {
            return true;
        }
        $m = $this->groupMembership((string) $group['id'], $viewerId);
        return (bool) ($m && ($m['status'] ?? '') === 'active');
    }

    public function isConversationMember(string $conversationId, string $userId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $conversationId, $userId);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }
}
