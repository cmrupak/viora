<?php

declare(strict_types=1);

final class StoriesRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function create(string $id, string $authorId, string $audience, string $expiresAt): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO stories (id, author_id, audience, expires_at) VALUES (?, ?, ?, ?)'
        );
        $stmt->bind_param('ssss', $id, $authorId, $audience, $expiresAt);
        $stmt->execute();
        $stmt->close();
    }

    public function insertMedia(string $id, string $storyId, string $url, string $mediaType, int $sortOrder, string $stickersJson): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO story_media (id, story_id, url, media_type, sort_order, stickers)
             VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))'
        );
        $stmt->bind_param('ssssis', $id, $storyId, $url, $mediaType, $sortOrder, $stickersJson);
        $stmt->execute();
        $stmt->close();
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM stories WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function listActive(int $limit, ?string $cursor, array $hiddenAuthors): array
    {
        $sql = 'SELECT * FROM stories
                WHERE deleted_at IS NULL AND expires_at > UTC_TIMESTAMP(6)';
        $types = '';
        $params = [];
        if ($hiddenAuthors !== []) {
            $ph = implode(',', array_fill(0, count($hiddenAuthors), '?'));
            $sql .= " AND author_id NOT IN ($ph)";
            $types .= str_repeat('s', count($hiddenAuthors));
            array_push($params, ...$hiddenAuthors);
        }
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
    public function mediaForStory(string $storyId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM story_media WHERE story_id = ? ORDER BY sort_order ASC'
        );
        $stmt->bind_param('s', $storyId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @param list<string> $storyIds @return array<string, list<array>> */
    public function mediaForStories(array $storyIds): array
    {
        if ($storyIds === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($storyIds), '?'));
        $types = str_repeat('s', count($storyIds));
        $stmt = $this->db->prepare(
            "SELECT * FROM story_media WHERE story_id IN ($ph) ORDER BY sort_order ASC"
        );
        $stmt->bind_param($types, ...$storyIds);
        $stmt->execute();
        $out = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $out[(string) $row['story_id']][] = $row;
        }
        $stmt->close();
        return $out;
    }

    public function softDelete(string $id): void
    {
        $now = gmdate('Y-m-d H:i:s');
        $stmt = $this->db->prepare('UPDATE stories SET deleted_at = ? WHERE id = ?');
        $stmt->bind_param('ss', $now, $id);
        $stmt->execute();
        $stmt->close();
    }

    public function markViewed(string $storyId, string $viewerId): void
    {
        $id = viora_uuid_v4();
        $stmt = $this->db->prepare(
            'INSERT IGNORE INTO story_views (id, story_id, viewer_id) VALUES (?, ?, ?)'
        );
        $stmt->bind_param('sss', $id, $storyId, $viewerId);
        $stmt->execute();
        $stmt->close();
    }

    public function hasViewed(string $storyId, string $viewerId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT 1 FROM story_views WHERE story_id = ? AND viewer_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $storyId, $viewerId);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $ok;
    }

    public function viewCount(string $storyId): int
    {
        $stmt = $this->db->prepare('SELECT COUNT(*) AS c FROM story_views WHERE story_id = ?');
        $stmt->bind_param('s', $storyId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return (int) ($row['c'] ?? 0);
    }

    /** @return list<array> */
    public function listViewers(string $storyId): array
    {
        $stmt = $this->db->prepare(
            'SELECT sv.*, p.username, p.display_name, p.avatar_url
             FROM story_views sv
             JOIN profiles p ON p.id = sv.viewer_id
             WHERE sv.story_id = ?
             ORDER BY sv.created_at DESC'
        );
        $stmt->bind_param('s', $storyId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function findMedia(string $mediaId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM story_media WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $mediaId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function upsertStickerResponse(string $id, string $mediaId, string $stickerId, string $userId, string $responseJson): void
    {
        $existing = null;
        $stmt = $this->db->prepare(
            'SELECT id FROM story_sticker_responses
             WHERE story_media_id = ? AND sticker_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->bind_param('sss', $mediaId, $stickerId, $userId);
        $stmt->execute();
        $existing = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($existing) {
            $eid = (string) $existing['id'];
            $upd = $this->db->prepare(
                'UPDATE story_sticker_responses SET response = CAST(? AS JSON), updated_at = UTC_TIMESTAMP(6) WHERE id = ?'
            );
            $upd->bind_param('ss', $responseJson, $eid);
            $upd->execute();
            $upd->close();
            return;
        }
        $ins = $this->db->prepare(
            'INSERT INTO story_sticker_responses (id, story_media_id, sticker_id, user_id, response)
             VALUES (?, ?, ?, ?, CAST(? AS JSON))'
        );
        $ins->bind_param('sssss', $id, $mediaId, $stickerId, $userId, $responseJson);
        $ins->execute();
        $ins->close();
    }

    public function createHighlight(string $id, string $ownerId, string $title, ?string $coverUrl, int $sortOrder): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO story_highlights (id, owner_id, title, cover_url, sort_order) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('ssssi', $id, $ownerId, $title, $coverUrl, $sortOrder);
        $stmt->execute();
        $stmt->close();
    }

    public function findHighlight(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM story_highlights WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function listHighlights(string $ownerId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM story_highlights WHERE owner_id = ? ORDER BY sort_order ASC, created_at DESC'
        );
        $stmt->bind_param('s', $ownerId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function deleteHighlight(string $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM story_highlights WHERE id = ?');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $stmt->close();
    }

    public function addHighlightItem(
        string $id,
        string $highlightId,
        ?string $sourceStoryId,
        string $url,
        string $mediaType,
        string $stickersJson,
        int $sortOrder,
    ): void {
        $stmt = $this->db->prepare(
            'INSERT INTO story_highlight_items
             (id, highlight_id, source_story_id, url, media_type, stickers, sort_order)
             VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), ?)'
        );
        $stmt->bind_param('ssssssi', $id, $highlightId, $sourceStoryId, $url, $mediaType, $stickersJson, $sortOrder);
        $stmt->execute();
        $stmt->close();
    }

    public function setHighlightCover(string $highlightId, string $coverUrl): void
    {
        $stmt = $this->db->prepare('UPDATE story_highlights SET cover_url = ? WHERE id = ?');
        $stmt->bind_param('ss', $coverUrl, $highlightId);
        $stmt->execute();
        $stmt->close();
    }
}
