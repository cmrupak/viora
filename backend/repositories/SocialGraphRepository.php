<?php

declare(strict_types=1);

final class SocialGraphRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function followExists(string $followerId, string $followingId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM follows WHERE follower_id = ? AND following_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $followerId, $followingId);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }

    public function createFollow(string $id, string $followerId, string $followingId): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO follows (id, follower_id, following_id) VALUES (?, ?, ?)'
        );
        $stmt->bind_param('sss', $id, $followerId, $followingId);
        $stmt->execute();
        $stmt->close();
    }

    public function deleteFollow(string $followerId, string $followingId): bool
    {
        $stmt = $this->db->prepare(
            'DELETE FROM follows WHERE follower_id = ? AND following_id = ?'
        );
        $stmt->bind_param('ss', $followerId, $followingId);
        $stmt->execute();
        $affected = $stmt->affected_rows > 0;
        $stmt->close();
        return $affected;
    }

    public function createFollowRequest(string $id, string $from, string $to): void
    {
        $existing = $this->findFollowRequestPair($from, $to);
        if ($existing) {
            $stmt = $this->db->prepare(
                'UPDATE follow_requests SET status = \'pending\', updated_at = UTC_TIMESTAMP(6) WHERE id = ?'
            );
            $rid = (string) $existing['id'];
            $stmt->bind_param('s', $rid);
            $stmt->execute();
            $stmt->close();
            return;
        }
        $stmt = $this->db->prepare(
            'INSERT INTO follow_requests (id, from_user_id, to_user_id, status) VALUES (?, ?, ?, \'pending\')'
        );
        $stmt->bind_param('sss', $id, $from, $to);
        $stmt->execute();
        $stmt->close();
    }

    public function findFollowRequestPair(string $from, string $to): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, from_user_id, to_user_id, status, created_at, updated_at
             FROM follow_requests WHERE from_user_id = ? AND to_user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $from, $to);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function findFollowRequest(string $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, from_user_id, to_user_id, status, created_at, updated_at
             FROM follow_requests WHERE id = ? LIMIT 1'
        );
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function setFollowRequestStatus(string $id, string $status): void
    {
        $stmt = $this->db->prepare(
            'UPDATE follow_requests SET status = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?'
        );
        $stmt->bind_param('ss', $status, $id);
        $stmt->execute();
        $stmt->close();
    }

    public function deleteFollowRequest(string $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM follow_requests WHERE id = ?');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listFollowRequests(string $userId, string $direction, int $limit, ?string $cursor): array
    {
        $col = $direction === 'outgoing' ? 'from_user_id' : 'to_user_id';
        $sql = "SELECT id, from_user_id, to_user_id, status, created_at, updated_at
                FROM follow_requests
                WHERE {$col} = ? AND status = 'pending'";
        $types = 's';
        $params = [$userId];
        if ($cursor) {
            $sql .= ' AND created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY created_at DESC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listFollowerProfiles(string $userId, int $limit, ?string $cursor): array
    {
        $sql = 'SELECT p.* FROM follows f
                JOIN profiles p ON p.id = f.follower_id
                WHERE f.following_id = ? AND p.is_deactivated = 0';
        $types = 's';
        $params = [$userId];
        if ($cursor) {
            $sql .= ' AND f.created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY f.created_at DESC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listFollowingProfiles(string $userId, int $limit, ?string $cursor): array
    {
        $sql = 'SELECT p.* FROM follows f
                JOIN profiles p ON p.id = f.following_id
                WHERE f.follower_id = ? AND p.is_deactivated = 0';
        $types = 's';
        $params = [$userId];
        if ($cursor) {
            $sql .= ' AND f.created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY f.created_at DESC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<string> */
    public function followingIds(string $userId): array
    {
        $stmt = $this->db->prepare('SELECT following_id FROM follows WHERE follower_id = ?');
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $ids = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $ids[] = (string) $row['following_id'];
        }
        $stmt->close();
        return $ids;
    }

    // ---- friends ----

    public function createFriendRequest(string $id, string $from, string $to): array
    {
        $existing = $this->findFriendRequestPair($from, $to);
        if ($existing) {
            if ($existing['status'] === 'pending') {
                return $existing;
            }
            $stmt = $this->db->prepare(
                'UPDATE friend_requests SET status = \'pending\', updated_at = UTC_TIMESTAMP(6) WHERE id = ?'
            );
            $rid = (string) $existing['id'];
            $stmt->bind_param('s', $rid);
            $stmt->execute();
            $stmt->close();
            return $this->findFriendRequest($rid) ?? $existing;
        }
        $stmt = $this->db->prepare(
            'INSERT INTO friend_requests (id, from_user_id, to_user_id, status) VALUES (?, ?, ?, \'pending\')'
        );
        $stmt->bind_param('sss', $id, $from, $to);
        $stmt->execute();
        $stmt->close();
        return $this->findFriendRequest($id) ?? [
            'id' => $id,
            'from_user_id' => $from,
            'to_user_id' => $to,
            'status' => 'pending',
        ];
    }

    public function findFriendRequestPair(string $from, string $to): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, from_user_id, to_user_id, status, created_at, updated_at
             FROM friend_requests WHERE from_user_id = ? AND to_user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $from, $to);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function findFriendRequest(string $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, from_user_id, to_user_id, status, created_at, updated_at
             FROM friend_requests WHERE id = ? LIMIT 1'
        );
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function setFriendRequestStatus(string $id, string $status): void
    {
        $stmt = $this->db->prepare(
            'UPDATE friend_requests SET status = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?'
        );
        $stmt->bind_param('ss', $status, $id);
        $stmt->execute();
        $stmt->close();
    }

    public function deleteFriendRequest(string $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM friend_requests WHERE id = ?');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $stmt->close();
    }

    public function ensureFriendship(string $a, string $b): void
    {
        $userA = $a < $b ? $a : $b;
        $userB = $a < $b ? $b : $a;
        $stmt = $this->db->prepare(
            'SELECT id FROM friendships WHERE user_a = ? AND user_b = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $userA, $userB);
        $stmt->execute();
        $exists = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($exists) {
            return;
        }
        $id = viora_uuid_v4();
        $stmt = $this->db->prepare(
            'INSERT INTO friendships (id, user_a, user_b) VALUES (?, ?, ?)'
        );
        $stmt->bind_param('sss', $id, $userA, $userB);
        $stmt->execute();
        $stmt->close();
    }

    public function deleteFriendship(string $a, string $b): void
    {
        $userA = $a < $b ? $a : $b;
        $userB = $a < $b ? $b : $a;
        $stmt = $this->db->prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?');
        $stmt->bind_param('ss', $userA, $userB);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listFriendRequests(string $userId, string $direction, int $limit, ?string $cursor): array
    {
        if ($direction === 'outgoing') {
            $sql = "SELECT * FROM friend_requests WHERE from_user_id = ? AND status = 'pending'";
        } elseif ($direction === 'incoming') {
            $sql = "SELECT * FROM friend_requests WHERE to_user_id = ? AND status = 'pending'";
        } else {
            $sql = "SELECT * FROM friend_requests
                    WHERE status = 'pending' AND (from_user_id = ? OR to_user_id = ?)";
        }
        $types = $direction === 'all' ? 'ss' : 's';
        $params = $direction === 'all' ? [$userId, $userId] : [$userId];
        if ($cursor) {
            $sql .= ' AND created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY created_at DESC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listFriendProfiles(string $userId, int $limit, ?string $cursor): array
    {
        $sql = 'SELECT p.*, fr.created_at AS friendship_created_at
                FROM friendships fr
                JOIN profiles p ON p.id = IF(fr.user_a = ?, fr.user_b, fr.user_a)
                WHERE (fr.user_a = ? OR fr.user_b = ?) AND p.is_deactivated = 0';
        $types = 'sss';
        $params = [$userId, $userId, $userId];
        if ($cursor) {
            $sql .= ' AND fr.created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY fr.created_at DESC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function countMutualFriends(string $a, string $b): int
    {
        $sql = <<<'SQL'
            SELECT COUNT(*) AS c FROM (
              SELECT IF(user_a = ?, user_b, user_a) AS friend_id FROM friendships WHERE user_a = ? OR user_b = ?
            ) fa
            INNER JOIN (
              SELECT IF(user_a = ?, user_b, user_a) AS friend_id FROM friendships WHERE user_a = ? OR user_b = ?
            ) fb ON fa.friend_id = fb.friend_id
            SQL;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('ssssss', $a, $a, $a, $b, $b, $b);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return (int) ($row['c'] ?? 0);
    }

    // ---- blocks / mute / etc ----

    public function createBlock(string $id, string $blockerId, string $blockedId): void
    {
        $stmt = $this->db->prepare(
            'INSERT IGNORE INTO blocked_users (id, blocker_id, blocked_id) VALUES (?, ?, ?)'
        );
        $stmt->bind_param('sss', $id, $blockerId, $blockedId);
        $stmt->execute();
        $stmt->close();
    }

    public function deleteBlock(string $blockerId, string $blockedId): void
    {
        $stmt = $this->db->prepare(
            'DELETE FROM blocked_users WHERE blocker_id = ? AND blocked_id = ?'
        );
        $stmt->bind_param('ss', $blockerId, $blockedId);
        $stmt->execute();
        $stmt->close();
    }

    public function isBlocked(string $blockerId, string $blockedId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM blocked_users WHERE blocker_id = ? AND blocked_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $blockerId, $blockedId);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }

    public function setMute(string $ownerId, string $targetId, ?string $scope): array
    {
        if ($scope === null) {
            $stmt = $this->db->prepare('DELETE FROM user_mutes WHERE owner_id = ? AND target_id = ?');
            $stmt->bind_param('ss', $ownerId, $targetId);
            $stmt->execute();
            $stmt->close();
            return ['active' => false];
        }
        $existing = $this->findMute($ownerId, $targetId);
        if ($existing) {
            $stmt = $this->db->prepare(
                'UPDATE user_mutes SET scope = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?'
            );
            $id = (string) $existing['id'];
            $stmt->bind_param('ss', $scope, $id);
            $stmt->execute();
            $stmt->close();
        } else {
            $id = viora_uuid_v4();
            $stmt = $this->db->prepare(
                'INSERT INTO user_mutes (id, owner_id, target_id, scope) VALUES (?, ?, ?, ?)'
            );
            $stmt->bind_param('ssss', $id, $ownerId, $targetId, $scope);
            $stmt->execute();
            $stmt->close();
        }
        return ['active' => true, 'scope' => $scope];
    }

    public function findMute(string $ownerId, string $targetId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM user_mutes WHERE owner_id = ? AND target_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $ownerId, $targetId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function toggleRestrict(string $ownerId, string $targetId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM user_restricts WHERE owner_id = ? AND target_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $ownerId, $targetId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            $id = (string) $row['id'];
            $del = $this->db->prepare('DELETE FROM user_restricts WHERE id = ?');
            $del->bind_param('s', $id);
            $del->execute();
            $del->close();
            return ['active' => false];
        }
        $id = viora_uuid_v4();
        $ins = $this->db->prepare(
            'INSERT INTO user_restricts (id, owner_id, target_id) VALUES (?, ?, ?)'
        );
        $ins->bind_param('sss', $id, $ownerId, $targetId);
        $ins->execute();
        $ins->close();
        return ['active' => true];
    }

    public function snooze(string $ownerId, string $targetId, int $days = 30): array
    {
        $expires = gmdate('Y-m-d H:i:s', time() + ($days * 86400));
        $existing = null;
        $stmt = $this->db->prepare(
            'SELECT id FROM user_snoozes WHERE owner_id = ? AND target_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $ownerId, $targetId);
        $stmt->execute();
        $existing = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($existing) {
            $id = (string) $existing['id'];
            $upd = $this->db->prepare(
                'UPDATE user_snoozes SET expires_at = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?'
            );
            $upd->bind_param('ss', $expires, $id);
            $upd->execute();
            $upd->close();
        } else {
            $id = viora_uuid_v4();
            $ins = $this->db->prepare(
                'INSERT INTO user_snoozes (id, owner_id, target_id, expires_at) VALUES (?, ?, ?, ?)'
            );
            $ins->bind_param('ssss', $id, $ownerId, $targetId, $expires);
            $ins->execute();
            $ins->close();
        }
        return [
            'id' => $id,
            'ownerId' => $ownerId,
            'targetId' => $targetId,
            'expiresAt' => Mappers::iso($expires),
        ];
    }

    public function unsnooze(string $ownerId, string $targetId): void
    {
        $stmt = $this->db->prepare('DELETE FROM user_snoozes WHERE owner_id = ? AND target_id = ?');
        $stmt->bind_param('ss', $ownerId, $targetId);
        $stmt->execute();
        $stmt->close();
    }

    public function toggleCloseFriend(string $ownerId, string $friendId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM close_friends WHERE owner_id = ? AND friend_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $ownerId, $friendId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            $id = (string) $row['id'];
            $del = $this->db->prepare('DELETE FROM close_friends WHERE id = ?');
            $del->bind_param('s', $id);
            $del->execute();
            $del->close();
            return ['active' => false];
        }
        $id = viora_uuid_v4();
        $ins = $this->db->prepare(
            'INSERT INTO close_friends (id, owner_id, friend_id) VALUES (?, ?, ?)'
        );
        $ins->bind_param('sss', $id, $ownerId, $friendId);
        $ins->execute();
        $ins->close();
        return ['active' => true];
    }

    public function toggleFavorite(string $ownerId, string $targetId): array
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM feed_favorites WHERE owner_id = ? AND target_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $ownerId, $targetId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            $id = (string) $row['id'];
            $del = $this->db->prepare('DELETE FROM feed_favorites WHERE id = ?');
            $del->bind_param('s', $id);
            $del->execute();
            $del->close();
            return ['active' => false];
        }
        $id = viora_uuid_v4();
        $ins = $this->db->prepare(
            'INSERT INTO feed_favorites (id, owner_id, target_id) VALUES (?, ?, ?)'
        );
        $ins->bind_param('sss', $id, $ownerId, $targetId);
        $ins->execute();
        $ins->close();
        return ['active' => true];
    }

    /** @return list<string> */
    public function favoriteIds(string $ownerId): array
    {
        $stmt = $this->db->prepare('SELECT target_id FROM feed_favorites WHERE owner_id = ?');
        $stmt->bind_param('s', $ownerId);
        $stmt->execute();
        $ids = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $ids[] = (string) $row['target_id'];
        }
        $stmt->close();
        return $ids;
    }

    public function findCloseFriend(string $ownerId, string $friendId): bool
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

    public function findFavorite(string $ownerId, string $targetId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM feed_favorites WHERE owner_id = ? AND target_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $ownerId, $targetId);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }

    public function findActiveSnooze(string $ownerId, string $targetId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM user_snoozes
             WHERE owner_id = ? AND target_id = ? AND expires_at > UTC_TIMESTAMP(6)
             LIMIT 1'
        );
        $stmt->bind_param('ss', $ownerId, $targetId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function findRestrict(string $ownerId, string $targetId): bool
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

    /** @return list<array> */
    public function listBlocked(string $ownerId, int $limit): array
    {
        $stmt = $this->db->prepare(
            'SELECT p.*, b.created_at AS blocked_at
             FROM blocked_users b
             JOIN profiles p ON p.id = b.blocked_id
             WHERE b.blocker_id = ? AND p.is_deactivated = 0
             ORDER BY b.created_at DESC
             LIMIT ?'
        );
        $stmt->bind_param('si', $ownerId, $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listMutes(string $ownerId): array
    {
        $stmt = $this->db->prepare(
            'SELECT p.*, m.scope, m.created_at AS muted_at, m.updated_at AS mute_updated_at
             FROM user_mutes m
             JOIN profiles p ON p.id = m.target_id
             WHERE m.owner_id = ? AND p.is_deactivated = 0
             ORDER BY m.updated_at DESC'
        );
        $stmt->bind_param('s', $ownerId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listRestricts(string $ownerId): array
    {
        $stmt = $this->db->prepare(
            'SELECT p.*, r.created_at AS restricted_at
             FROM user_restricts r
             JOIN profiles p ON p.id = r.target_id
             WHERE r.owner_id = ? AND p.is_deactivated = 0
             ORDER BY r.created_at DESC'
        );
        $stmt->bind_param('s', $ownerId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<string> */
    public function listRestrictedTargetIds(string $ownerId): array
    {
        $stmt = $this->db->prepare('SELECT target_id FROM user_restricts WHERE owner_id = ?');
        $stmt->bind_param('s', $ownerId);
        $stmt->execute();
        $ids = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $ids[] = (string) $row['target_id'];
        }
        $stmt->close();
        return $ids;
    }

    /** @return list<array> */
    public function listSnoozes(string $ownerId): array
    {
        $stmt = $this->db->prepare(
            'SELECT p.*, s.expires_at, s.created_at AS snoozed_at, s.updated_at AS snooze_updated_at
             FROM user_snoozes s
             JOIN profiles p ON p.id = s.target_id
             WHERE s.owner_id = ?
               AND (s.expires_at IS NULL OR s.expires_at > UTC_TIMESTAMP(6))
               AND p.is_deactivated = 0
             ORDER BY s.expires_at ASC'
        );
        $stmt->bind_param('s', $ownerId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listCloseFriends(string $ownerId): array
    {
        $stmt = $this->db->prepare(
            'SELECT p.*, cf.created_at AS close_friend_at
             FROM close_friends cf
             JOIN profiles p ON p.id = cf.friend_id
             WHERE cf.owner_id = ? AND p.is_deactivated = 0
             ORDER BY cf.created_at DESC'
        );
        $stmt->bind_param('s', $ownerId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listFavorites(string $ownerId): array
    {
        $stmt = $this->db->prepare(
            'SELECT p.*, ff.created_at AS favorited_at
             FROM feed_favorites ff
             JOIN profiles p ON p.id = ff.target_id
             WHERE ff.owner_id = ? AND p.is_deactivated = 0
             ORDER BY ff.created_at DESC'
        );
        $stmt->bind_param('s', $ownerId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<string> */
    public function listFavoriteIds(string $ownerId): array
    {
        return $this->favoriteIds($ownerId);
    }

    /** @return list<string> */
    public function listFeedHiddenAuthorIds(string $viewerId): array
    {
        $sql = <<<'SQL'
            SELECT DISTINCT x.author_id FROM (
              SELECT target_id AS author_id
              FROM user_mutes
              WHERE owner_id = ? AND scope IN ('posts', 'all')
              UNION
              SELECT target_id AS author_id
              FROM user_snoozes
              WHERE owner_id = ? AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP(6))
              UNION
              SELECT target_id AS author_id
              FROM user_restricts
              WHERE owner_id = ?
            ) x
            WHERE x.author_id IS NOT NULL AND x.author_id <> ?
            SQL;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('ssss', $viewerId, $viewerId, $viewerId, $viewerId);
        $stmt->execute();
        $ids = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $ids[] = (string) $row['author_id'];
        }
        $stmt->close();
        return $ids;
    }

    /** @return list<string> */
    public function listStoryHiddenAuthorIds(string $viewerId): array
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
              WHERE owner_id = ? AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP(6))
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

    public function removeFollower(string $userId, string $followerId): bool
    {
        return $this->deleteFollow($followerId, $userId);
    }

    /** @return list<array> */
    public function listSuggestions(string $userId, int $limit): array
    {
        $sql = <<<'SQL'
            SELECT p.*
            FROM profiles p
            WHERE p.id <> ?
              AND p.is_deactivated = 0
              AND NOT EXISTS (
                SELECT 1 FROM follows f
                WHERE f.follower_id = ? AND f.following_id = p.id
              )
              AND NOT EXISTS (
                SELECT 1 FROM blocked_users b
                WHERE (b.blocker_id = ? AND b.blocked_id = p.id)
                   OR (b.blocker_id = p.id AND b.blocked_id = ?)
              )
            ORDER BY p.created_at DESC
            LIMIT ?
            SQL;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('ssssi', $userId, $userId, $userId, $userId, $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listMutualFriends(string $userId, string $otherId, int $limit): array
    {
        $sql = <<<'SQL'
            SELECT p.*
            FROM (
              SELECT IF(user_a = ?, user_b, user_a) AS friend_id
              FROM friendships
              WHERE user_a = ? OR user_b = ?
            ) fa
            INNER JOIN (
              SELECT IF(user_a = ?, user_b, user_a) AS friend_id
              FROM friendships
              WHERE user_a = ? OR user_b = ?
            ) fb ON fa.friend_id = fb.friend_id
            JOIN profiles p ON p.id = fa.friend_id
            WHERE p.is_deactivated = 0
            ORDER BY p.display_name ASC, p.username ASC
            LIMIT ?
            SQL;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('ssssssi', $userId, $userId, $userId, $otherId, $otherId, $otherId, $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }
}
