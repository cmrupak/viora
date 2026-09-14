<?php

declare(strict_types=1);

final class ReelsRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function create(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO reels (id, author_id, caption, audio_title, audio_artist, audio_url, comments_disabled)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $id = $data['id'];
        $authorId = $data['author_id'];
        $caption = $data['caption'];
        $audioTitle = $data['audio_title'];
        $audioArtist = $data['audio_artist'];
        $audioUrl = $data['audio_url'];
        $commentsDisabled = (int) $data['comments_disabled'];
        $stmt->bind_param('ssssssi', $id, $authorId, $caption, $audioTitle, $audioArtist, $audioUrl, $commentsDisabled);
        $stmt->execute();
        $stmt->close();
    }

    public function insertMedia(
        string $id,
        string $reelId,
        string $url,
        string $mediaType,
        ?string $thumbnailUrl,
        ?float $durationSeconds,
        int $sortOrder,
    ): void {
        $stmt = $this->db->prepare(
            'INSERT INTO reel_media (id, reel_id, url, media_type, thumbnail_url, duration_seconds, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('sssssdi', $id, $reelId, $url, $mediaType, $thumbnailUrl, $durationSeconds, $sortOrder);
        $stmt->execute();
        $stmt->close();
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM reels WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function listFeed(int $limit, ?string $cursor): array
    {
        $sql = 'SELECT * FROM reels WHERE deleted_at IS NULL';
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

    /** @return list<array> */
    public function mediaForReel(string $reelId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM reel_media WHERE reel_id = ? ORDER BY sort_order ASC'
        );
        $stmt->bind_param('s', $reelId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @param list<string> $ids @return array<string, list<array>> */
    public function mediaForReels(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $types = str_repeat('s', count($ids));
        $stmt = $this->db->prepare(
            "SELECT * FROM reel_media WHERE reel_id IN ($ph) ORDER BY sort_order ASC"
        );
        $stmt->bind_param($types, ...$ids);
        $stmt->execute();
        $out = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $out[(string) $row['reel_id']][] = $row;
        }
        $stmt->close();
        return $out;
    }

    public function toggleLike(string $reelId, string $userId): bool
    {
        return $this->toggleEdge('reel_likes', 'reel_id', $reelId, $userId);
    }

    public function toggleSave(string $reelId, string $userId): bool
    {
        return $this->toggleEdge('reel_saves', 'reel_id', $reelId, $userId);
    }

    private function toggleEdge(string $table, string $col, string $targetId, string $userId): bool
    {
        $stmt = $this->db->prepare("SELECT id FROM {$table} WHERE {$col} = ? AND user_id = ? LIMIT 1");
        $stmt->bind_param('ss', $targetId, $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            $id = (string) $row['id'];
            $del = $this->db->prepare("DELETE FROM {$table} WHERE id = ?");
            $del->bind_param('s', $id);
            $del->execute();
            $del->close();
            return false;
        }
        $id = viora_uuid_v4();
        $ins = $this->db->prepare("INSERT INTO {$table} (id, {$col}, user_id) VALUES (?, ?, ?)");
        $ins->bind_param('sss', $id, $targetId, $userId);
        $ins->execute();
        $ins->close();
        return true;
    }

    public function bump(string $reelId, string $column, int $delta): void
    {
        $allowed = ['like_count', 'comment_count', 'view_count'];
        if (!in_array($column, $allowed, true)) {
            return;
        }
        $stmt = $this->db->prepare(
            "UPDATE reels SET {$column} = GREATEST(0, {$column} + ?) WHERE id = ?"
        );
        $stmt->bind_param('is', $delta, $reelId);
        $stmt->execute();
        $stmt->close();
    }

    /** @param list<string> $reelIds @return array<string, bool> */
    public function likedMap(string $userId, array $reelIds): array
    {
        return $this->edgeMap('reel_likes', $userId, $reelIds);
    }

    /** @param list<string> $reelIds @return array<string, bool> */
    public function savedMap(string $userId, array $reelIds): array
    {
        return $this->edgeMap('reel_saves', $userId, $reelIds);
    }

    /** @param list<string> $reelIds @return array<string, bool> */
    private function edgeMap(string $table, string $userId, array $reelIds): array
    {
        $out = [];
        foreach ($reelIds as $id) {
            $out[$id] = false;
        }
        if ($reelIds === []) {
            return $out;
        }
        $ph = implode(',', array_fill(0, count($reelIds), '?'));
        $types = 's' . str_repeat('s', count($reelIds));
        $params = array_merge([$userId], $reelIds);
        $stmt = $this->db->prepare(
            "SELECT reel_id FROM {$table} WHERE user_id = ? AND reel_id IN ($ph)"
        );
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $out[(string) $row['reel_id']] = true;
        }
        $stmt->close();
        return $out;
    }

    public function createComment(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO reel_comments (id, reel_id, author_id, parent_id, body) VALUES (?, ?, ?, ?, ?)'
        );
        $id = $data['id'];
        $reelId = $data['reel_id'];
        $authorId = $data['author_id'];
        $parentId = $data['parent_id'];
        $body = $data['body'];
        $stmt->bind_param('sssss', $id, $reelId, $authorId, $parentId, $body);
        $stmt->execute();
        $stmt->close();
    }

    public function findComment(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM reel_comments WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function listComments(string $reelId, int $limit, ?string $cursor): array
    {
        $sql = 'SELECT * FROM reel_comments WHERE reel_id = ? AND deleted_at IS NULL';
        $types = 's';
        $params = [$reelId];
        if ($cursor) {
            $sql .= ' AND created_at > ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY created_at ASC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }
}
