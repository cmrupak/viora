<?php

declare(strict_types=1);

final class ProfileRepository
{
    private const SELECT = 'id, username, display_name, bio, avatar_url, cover_url, website, location,
        date_of_birth, gender, is_private, tag_review_enabled, is_deactivated, follower_count, following_count,
        created_at, updated_at';

    public function __construct(private readonly mysqli $db)
    {
    }

    public function usernameExists(string $username, ?string $exceptUserId = null): bool
    {
        if ($exceptUserId) {
            $stmt = $this->db->prepare('SELECT id FROM profiles WHERE username = ? AND id <> ? LIMIT 1');
            $stmt->bind_param('ss', $username, $exceptUserId);
        } else {
            $stmt = $this->db->prepare('SELECT id FROM profiles WHERE username = ? LIMIT 1');
            $stmt->bind_param('s', $username);
        }
        $stmt->execute();
        $exists = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $exists;
    }

    public function create(
        string $id,
        string $username,
        string $displayName,
        ?string $dateOfBirth,
        ?string $gender,
    ): void {
        $stmt = $this->db->prepare(
            'INSERT INTO profiles (id, username, display_name, date_of_birth, gender)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('sssss', $id, $username, $displayName, $dateOfBirth, $gender);
        $stmt->execute();
        $stmt->close();
    }

    public function findByUserId(string $userId): ?array
    {
        $sql = 'SELECT ' . self::SELECT . ' FROM profiles WHERE id = ? LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function findByUsername(string $username): ?array
    {
        $sql = 'SELECT ' . self::SELECT . ' FROM profiles WHERE username = ? LIMIT 1';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('s', $username);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function search(string $query, int $limit = 20): array
    {
        $like = '%' . $query . '%';
        $stmt = $this->db->prepare(
            'SELECT ' . self::SELECT . ' FROM profiles
             WHERE is_deactivated = 0
               AND (username LIKE ? OR display_name LIKE ?)
             ORDER BY follower_count DESC, username ASC
             LIMIT ?'
        );
        $stmt->bind_param('ssi', $like, $like, $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function update(string $userId, array $fields): void
    {
        if ($fields === []) {
            return;
        }
        $map = [
            'display_name' => 's',
            'username' => 's',
            'bio' => 's',
            'website' => 's',
            'location' => 's',
            'cover_url' => 's',
            'avatar_url' => 's',
            'is_private' => 'i',
            'tag_review_enabled' => 'i',
        ];
        $sets = [];
        $types = '';
        $values = [];
        foreach ($fields as $col => $val) {
            if (!isset($map[$col])) {
                continue;
            }
            $sets[] = "{$col} = ?";
            $types .= $map[$col];
            $values[] = $val;
        }
        if ($sets === []) {
            return;
        }
        $types .= 's';
        $values[] = $userId;
        $sql = 'UPDATE profiles SET ' . implode(', ', $sets) . ' WHERE id = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$values);
        $stmt->execute();
        $stmt->close();
    }

    public function bumpFollowCounts(string $followerId, string $followingId, int $delta): void
    {
        $stmt = $this->db->prepare(
            'UPDATE profiles SET following_count = GREATEST(0, following_count + ?) WHERE id = ?'
        );
        $stmt->bind_param('is', $delta, $followerId);
        $stmt->execute();
        $stmt->close();

        $stmt = $this->db->prepare(
            'UPDATE profiles SET follower_count = GREATEST(0, follower_count + ?) WHERE id = ?'
        );
        $stmt->bind_param('is', $delta, $followingId);
        $stmt->execute();
        $stmt->close();
    }

    public function ensureDefaults(string $userId): void
    {
        $stmt = $this->db->prepare('INSERT IGNORE INTO user_settings (user_id) VALUES (?)');
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $stmt->close();

        $stmt = $this->db->prepare('INSERT IGNORE INTO notification_prefs (user_id) VALUES (?)');
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $stmt->close();

        $stmt = $this->db->prepare(
            'INSERT INTO user_presence (user_id, last_seen_at, is_online)
             VALUES (?, UTC_TIMESTAMP(6), 0)
             ON DUPLICATE KEY UPDATE user_id = user_id'
        );
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $stmt->close();
    }

    /** @param list<string> $ids @return array<string, array> */
    public function findManyByIds(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $ids = array_values(array_unique($ids));
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $types = str_repeat('s', count($ids));
        $sql = 'SELECT ' . self::SELECT . " FROM profiles WHERE id IN ($placeholders)";
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$ids);
        $stmt->execute();
        $out = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $out[(string) $row['id']] = $row;
        }
        $stmt->close();
        return $out;
    }
}
