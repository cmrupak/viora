<?php

declare(strict_types=1);

final class PostRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM posts WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function create(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO posts (
                id, author_id, body, visibility, publish_status, scheduled_at,
                location_name, feeling, is_sensitive, comments_disabled, repost_of_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $id = $data['id'];
        $authorId = $data['author_id'];
        $body = $data['body'];
        $visibility = $data['visibility'];
        $publishStatus = $data['publish_status'];
        $scheduledAt = $data['scheduled_at'];
        $locationName = $data['location_name'];
        $feeling = $data['feeling'];
        $isSensitive = (int) $data['is_sensitive'];
        $commentsDisabled = (int) ($data['comments_disabled'] ?? 0);
        $repostOfId = $data['repost_of_id'] ?? null;
        $stmt->bind_param(
            'ssssssssiis',
            $id,
            $authorId,
            $body,
            $visibility,
            $publishStatus,
            $scheduledAt,
            $locationName,
            $feeling,
            $isSensitive,
            $commentsDisabled,
            $repostOfId
        );
        $stmt->execute();
        $stmt->close();
    }

    public function update(string $id, array $fields): void
    {
        if ($fields === []) {
            return;
        }
        $allowed = [
            'body' => 's',
            'visibility' => 's',
            'publish_status' => 's',
            'scheduled_at' => 's',
            'location_name' => 's',
            'feeling' => 's',
            'edited_at' => 's',
            'pinned_at' => 's',
            'archived_at' => 's',
            'comments_disabled' => 'i',
            'is_sensitive' => 'i',
            'deleted_at' => 's',
        ];
        $sets = [];
        $types = '';
        $values = [];
        foreach ($fields as $col => $val) {
            if (!isset($allowed[$col])) {
                continue;
            }
            $sets[] = "{$col} = ?";
            $types .= $allowed[$col];
            $values[] = $val;
        }
        if ($sets === []) {
            return;
        }
        $types .= 's';
        $values[] = $id;
        $sql = 'UPDATE posts SET ' . implode(', ', $sets) . ' WHERE id = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$values);
        $stmt->execute();
        $stmt->close();
    }

    public function softDelete(string $id): void
    {
        $now = gmdate('Y-m-d H:i:s');
        $this->update($id, ['deleted_at' => $now]);
    }

    public function insertMedia(array $media): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO post_media (id, post_id, url, media_type, sort_order, width, height, alt_text, duration_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $id = $media['id'];
        $postId = $media['post_id'];
        $url = $media['url'];
        $mediaType = $media['media_type'];
        $sortOrder = (int) $media['sort_order'];
        $width = $media['width'];
        $height = $media['height'];
        $altText = $media['alt_text'];
        $duration = $media['duration_seconds'];
        $stmt->bind_param(
            'ssssiiisd',
            $id,
            $postId,
            $url,
            $mediaType,
            $sortOrder,
            $width,
            $height,
            $altText,
            $duration
        );
        // bind_param with null ints is awkward — use nullable casting via variables
        $stmt->execute();
        $stmt->close();
    }

    /** Safer media insert with null-friendly types */
    public function insertMediaRow(
        string $id,
        string $postId,
        string $url,
        string $mediaType,
        int $sortOrder,
        ?int $width,
        ?int $height,
        ?string $altText,
        ?float $durationSeconds,
    ): void {
        $sql = 'INSERT INTO post_media (id, post_id, url, media_type, sort_order, width, height, alt_text, duration_seconds)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param(
            'ssssiissd',
            $id,
            $postId,
            $url,
            $mediaType,
            $sortOrder,
            $width,
            $height,
            $altText,
            $durationSeconds
        );
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function mediaForPost(string $postId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM post_media WHERE post_id = ? ORDER BY sort_order ASC, created_at ASC'
        );
        $stmt->bind_param('s', $postId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @param list<string> $postIds @return array<string, list<array>> */
    public function mediaForPosts(array $postIds): array
    {
        if ($postIds === []) {
            return [];
        }
        $postIds = array_values(array_unique($postIds));
        $ph = implode(',', array_fill(0, count($postIds), '?'));
        $types = str_repeat('s', count($postIds));
        $stmt = $this->db->prepare(
            "SELECT * FROM post_media WHERE post_id IN ($ph) ORDER BY sort_order ASC, created_at ASC"
        );
        $stmt->bind_param($types, ...$postIds);
        $stmt->execute();
        $out = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $out[(string) $row['post_id']][] = $row;
        }
        $stmt->close();
        return $out;
    }

    public function replaceAudience(string $postId, array $listIds): void
    {
        $del = $this->db->prepare('DELETE FROM post_audience WHERE post_id = ?');
        $del->bind_param('s', $postId);
        $del->execute();
        $del->close();
        foreach ($listIds as $listId) {
            $id = viora_uuid_v4();
            $ins = $this->db->prepare(
                'INSERT INTO post_audience (id, post_id, list_id) VALUES (?, ?, ?)'
            );
            $ins->bind_param('sss', $id, $postId, $listId);
            $ins->execute();
            $ins->close();
        }
    }

    /** @return list<array> */
    public function listFeedCandidates(
        string $viewerId,
        array $authorIds,
        array $hiddenAuthors,
        array $hiddenPostIds,
        int $limit,
        ?string $cursor,
        bool $videoOnly = false,
    ): array {
        $sql = 'SELECT p.* FROM posts p
                WHERE p.deleted_at IS NULL
                  AND p.archived_at IS NULL
                  AND (
                    p.publish_status = \'published\'
                    OR (p.publish_status = \'scheduled\' AND p.scheduled_at IS NOT NULL AND p.scheduled_at <= UTC_TIMESTAMP(6))
                  )
                  AND p.visibility <> \'only_me\'';
        $types = '';
        $params = [];

        if ($authorIds !== []) {
            $ph = implode(',', array_fill(0, count($authorIds), '?'));
            $sql .= " AND p.author_id IN ($ph)";
            $types .= str_repeat('s', count($authorIds));
            array_push($params, ...$authorIds);
        }

        if ($hiddenAuthors !== []) {
            $ph = implode(',', array_fill(0, count($hiddenAuthors), '?'));
            $sql .= " AND p.author_id NOT IN ($ph)";
            $types .= str_repeat('s', count($hiddenAuthors));
            array_push($params, ...$hiddenAuthors);
        }

        if ($hiddenPostIds !== []) {
            $ph = implode(',', array_fill(0, count($hiddenPostIds), '?'));
            $sql .= " AND p.id NOT IN ($ph)";
            $types .= str_repeat('s', count($hiddenPostIds));
            array_push($params, ...$hiddenPostIds);
        }

        if ($cursor) {
            $sql .= ' AND p.created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }

        if ($videoOnly) {
            $sql .= " AND EXISTS (
                SELECT 1 FROM post_media pm WHERE pm.post_id = p.id AND pm.media_type = 'video'
            )";
        }

        // Favorites boost
        $sql .= ' ORDER BY (
                    SELECT COUNT(*) FROM feed_favorites ff
                    WHERE ff.owner_id = ? AND ff.target_id = p.author_id
                  ) DESC, p.created_at DESC
                  LIMIT ?';
        $types .= 'si';
        $params[] = $viewerId;
        $params[] = $limit;

        $stmt = $this->db->prepare($sql);
        if ($types !== '') {
            $stmt->bind_param($types, ...$params);
        }
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listByAuthor(
        string $authorId,
        bool $includeNonLive,
        int $limit,
        ?string $cursor,
    ): array {
        $sql = 'SELECT * FROM posts WHERE author_id = ? AND deleted_at IS NULL';
        $types = 's';
        $params = [$authorId];
        if (!$includeNonLive) {
            $sql .= ' AND archived_at IS NULL
                      AND (
                        publish_status = \'published\'
                        OR (publish_status = \'scheduled\' AND scheduled_at IS NOT NULL AND scheduled_at <= UTC_TIMESTAMP(6))
                      )';
        }
        if ($cursor) {
            $sql .= ' AND created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY pinned_at DESC, created_at DESC LIMIT ?';
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
    public function hiddenPostIds(string $userId): array
    {
        $stmt = $this->db->prepare('SELECT post_id FROM hidden_posts WHERE user_id = ?');
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $ids = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $ids[] = (string) $row['post_id'];
        }
        $stmt->close();
        return $ids;
    }

    public function hidePost(string $userId, string $postId): void
    {
        $id = viora_uuid_v4();
        $stmt = $this->db->prepare(
            'INSERT IGNORE INTO hidden_posts (id, user_id, post_id) VALUES (?, ?, ?)'
        );
        $stmt->bind_param('sss', $id, $userId, $postId);
        $stmt->execute();
        $stmt->close();
    }

    public function unhidePost(string $userId, string $postId): void
    {
        $stmt = $this->db->prepare('DELETE FROM hidden_posts WHERE user_id = ? AND post_id = ?');
        $stmt->bind_param('ss', $userId, $postId);
        $stmt->execute();
        $stmt->close();
    }

    /** @param list<string> $postIds @return array<string, bool> */
    public function likedMap(string $userId, array $postIds): array
    {
        return $this->existsMap('post_likes', 'post_id', $userId, $postIds);
    }

    /** @param list<string> $postIds @return array<string, bool> */
    public function savedMap(string $userId, array $postIds): array
    {
        return $this->existsMap('saved_posts', 'post_id', $userId, $postIds);
    }

    /** @param list<string> $ids @return array<string, bool> */
    private function existsMap(string $table, string $col, string $userId, array $ids): array
    {
        $out = [];
        foreach ($ids as $id) {
            $out[$id] = false;
        }
        if ($ids === []) {
            return $out;
        }
        $ids = array_values(array_unique($ids));
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $types = 's' . str_repeat('s', count($ids));
        $params = array_merge([$userId], $ids);
        $stmt = $this->db->prepare(
            "SELECT {$col} FROM {$table} WHERE user_id = ? AND {$col} IN ($ph)"
        );
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $out[(string) $row[$col]] = true;
        }
        $stmt->close();
        return $out;
    }

    public function bumpCounter(string $postId, string $column, int $delta): void
    {
        $allowed = ['like_count', 'comment_count', 'share_count', 'save_count', 'view_count', 'repost_count'];
        if (!in_array($column, $allowed, true)) {
            return;
        }
        $stmt = $this->db->prepare(
            "UPDATE posts SET {$column} = GREATEST(0, {$column} + ?) WHERE id = ?"
        );
        $stmt->bind_param('is', $delta, $postId);
        $stmt->execute();
        $stmt->close();
    }

    /** @return bool true if a new view row was inserted */
    public function recordView(string $id, string $postId, string $viewerId): bool
    {
        $stmt = $this->db->prepare(
            'INSERT IGNORE INTO post_views (id, post_id, viewer_id) VALUES (?, ?, ?)'
        );
        $stmt->bind_param('sss', $id, $postId, $viewerId);
        $stmt->execute();
        $inserted = $stmt->affected_rows > 0;
        $stmt->close();
        return $inserted;
    }

    /** @return list<array> */
    public function listDrafts(string $authorId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM posts
             WHERE author_id = ? AND publish_status = \'draft\' AND deleted_at IS NULL
             ORDER BY updated_at DESC, created_at DESC'
        );
        $stmt->bind_param('s', $authorId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listPendingTags(string $userId): array
    {
        $stmt = $this->db->prepare(
            'SELECT pt.*, p.body AS post_body, p.author_id AS post_author_id, p.created_at AS post_created_at
             FROM post_tags pt
             JOIN posts p ON p.id = pt.post_id
             WHERE pt.tagged_user_id = ? AND pt.status = \'pending\' AND p.deleted_at IS NULL
             ORDER BY pt.created_at DESC'
        );
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function findTag(string $tagId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM post_tags WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $tagId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function respondToTag(string $tagId, string $status): void
    {
        $stmt = $this->db->prepare(
            'UPDATE post_tags SET status = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?'
        );
        $stmt->bind_param('ss', $status, $tagId);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listRevisions(string $postId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM post_revisions WHERE post_id = ? ORDER BY created_at DESC'
        );
        $stmt->bind_param('s', $postId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function insertTag(array $tag): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO post_tags (id, post_id, tagged_user_id, tagged_by, status)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE status = VALUES(status), tagged_by = VALUES(tagged_by), updated_at = UTC_TIMESTAMP(6)'
        );
        $id = $tag['id'];
        $postId = $tag['post_id'];
        $taggedUserId = $tag['tagged_user_id'];
        $taggedBy = $tag['tagged_by'];
        $status = $tag['status'] ?? 'pending';
        $stmt->bind_param('sssss', $id, $postId, $taggedUserId, $taggedBy, $status);
        $stmt->execute();
        $stmt->close();
    }

    public function insertRevision(array $revision): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO post_revisions (id, post_id, body, edited_by) VALUES (?, ?, ?, ?)'
        );
        $id = $revision['id'];
        $postId = $revision['post_id'];
        $body = $revision['body'];
        $editedBy = $revision['edited_by'];
        $stmt->bind_param('ssss', $id, $postId, $body, $editedBy);
        $stmt->execute();
        $stmt->close();
    }
}
