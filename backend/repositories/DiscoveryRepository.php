<?php

declare(strict_types=1);

final class DiscoveryRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    /** @return list<array> */
    public function trendingHashtags(int $limit): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM hashtags ORDER BY post_count DESC, tag ASC LIMIT ?'
        );
        $stmt->bind_param('i', $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function findHashtag(string $tag): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM hashtags WHERE tag = ? LIMIT 1');
        $stmt->bind_param('s', $tag);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<string> */
    public function postIdsByHashtag(string $tag, int $limit, ?string $cursor): array
    {
        $sql = 'SELECT p.id, p.created_at FROM hashtags h
                JOIN post_hashtags ph ON ph.hashtag_id = h.id
                JOIN posts p ON p.id = ph.post_id
                WHERE h.tag = ? AND p.deleted_at IS NULL AND p.publish_status = \'published\'';
        $types = 's';
        $params = [$tag];
        if ($cursor) {
            $sql .= ' AND p.created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY p.created_at DESC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $ids = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $ids[] = (string) $row['id'];
        }
        $stmt->close();
        return $ids;
    }

    /** @return list<array> */
    public function exploreCandidates(int $limit, ?string $cursor): array
    {
        $sql = 'SELECT * FROM posts
                WHERE deleted_at IS NULL
                  AND archived_at IS NULL
                  AND publish_status = \'published\'
                  AND visibility = \'public\'';
        $types = '';
        $params = [];
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

    public function hasMedia(string $postId): bool
    {
        $stmt = $this->db->prepare('SELECT 1 FROM post_media WHERE post_id = ? LIMIT 1');
        $stmt->bind_param('s', $postId);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }

    /** @return list<array> */
    public function searchPlaces(string $query, int $limit): array
    {
        $like = '%' . $query . '%';
        $stmt = $this->db->prepare(
            'SELECT location_name, COUNT(*) AS post_count
             FROM posts
             WHERE deleted_at IS NULL
               AND location_name IS NOT NULL
               AND location_name LIKE ?
             GROUP BY location_name
             ORDER BY post_count DESC
             LIMIT ?'
        );
        $stmt->bind_param('si', $like, $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<string> */
    public function postIdsByPlace(string $locationName, int $limit, ?string $cursor): array
    {
        $sql = 'SELECT id FROM posts
                WHERE deleted_at IS NULL AND location_name = ?';
        $types = 's';
        $params = [$locationName];
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
        $ids = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $ids[] = (string) $row['id'];
        }
        $stmt->close();
        return $ids;
    }

    /** @return list<array> */
    public function birthdaysToday(int $limit): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM profiles
             WHERE is_deactivated = 0
               AND date_of_birth IS NOT NULL
               AND MONTH(date_of_birth) = MONTH(UTC_TIMESTAMP())
               AND DAY(date_of_birth) = DAY(UTC_TIMESTAMP())
             ORDER BY follower_count DESC
             LIMIT ?'
        );
        $stmt->bind_param('i', $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function memories(string $userId, int $limit): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM posts
             WHERE author_id = ?
               AND deleted_at IS NULL
               AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
               AND DAY(created_at) = DAY(UTC_TIMESTAMP())
               AND YEAR(created_at) < YEAR(UTC_TIMESTAMP())
             ORDER BY created_at DESC
             LIMIT ?'
        );
        $stmt->bind_param('si', $userId, $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }
}
