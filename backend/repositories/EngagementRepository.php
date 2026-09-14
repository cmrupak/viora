<?php

declare(strict_types=1);

final class EngagementRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function togglePostLike(string $postId, string $userId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM post_likes WHERE post_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $postId, $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            $id = (string) $row['id'];
            $del = $this->db->prepare('DELETE FROM post_likes WHERE id = ?');
            $del->bind_param('s', $id);
            $del->execute();
            $del->close();
            return false;
        }
        $id = viora_uuid_v4();
        $ins = $this->db->prepare(
            'INSERT INTO post_likes (id, post_id, user_id) VALUES (?, ?, ?)'
        );
        $ins->bind_param('sss', $id, $postId, $userId);
        $ins->execute();
        $ins->close();
        return true;
    }

    public function toggleCommentLike(string $commentId, string $userId): bool
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $commentId, $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) {
            $id = (string) $row['id'];
            $del = $this->db->prepare('DELETE FROM comment_likes WHERE id = ?');
            $del->bind_param('s', $id);
            $del->execute();
            $del->close();
            return false;
        }
        $id = viora_uuid_v4();
        $ins = $this->db->prepare(
            'INSERT INTO comment_likes (id, comment_id, user_id) VALUES (?, ?, ?)'
        );
        $ins->bind_param('sss', $id, $commentId, $userId);
        $ins->execute();
        $ins->close();
        return true;
    }

    public function findComment(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM comments WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function createComment(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO comments (id, post_id, author_id, parent_id, body) VALUES (?, ?, ?, ?, ?)'
        );
        $id = $data['id'];
        $postId = $data['post_id'];
        $authorId = $data['author_id'];
        $parentId = $data['parent_id'];
        $body = $data['body'];
        $stmt->bind_param('sssss', $id, $postId, $authorId, $parentId, $body);
        $stmt->execute();
        $stmt->close();
    }

    public function updateComment(string $id, string $body): void
    {
        $stmt = $this->db->prepare('UPDATE comments SET body = ? WHERE id = ?');
        $stmt->bind_param('ss', $body, $id);
        $stmt->execute();
        $stmt->close();
    }

    public function softDeleteComment(string $id): void
    {
        $now = gmdate('Y-m-d H:i:s');
        $stmt = $this->db->prepare('UPDATE comments SET deleted_at = ? WHERE id = ?');
        $stmt->bind_param('ss', $now, $id);
        $stmt->execute();
        $stmt->close();
    }

    public function bumpCommentLikeCount(string $commentId, int $delta): void
    {
        $stmt = $this->db->prepare(
            'UPDATE comments SET like_count = GREATEST(0, like_count + ?) WHERE id = ?'
        );
        $stmt->bind_param('is', $delta, $commentId);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listRootComments(string $postId, string $sort, int $limit, ?string $cursor): array
    {
        $order = match ($sort) {
            'newest' => 'created_at DESC',
            'top' => 'like_count DESC, created_at DESC',
            default => 'created_at ASC',
        };
        $sql = "SELECT * FROM comments
                WHERE post_id = ? AND parent_id IS NULL AND deleted_at IS NULL";
        $types = 's';
        $params = [$postId];
        if ($cursor) {
            if ($sort === 'newest') {
                $sql .= ' AND created_at < ?';
            } elseif ($sort === 'oldest') {
                $sql .= ' AND created_at > ?';
            } else {
                $sql .= ' AND created_at < ?';
            }
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= " ORDER BY {$order} LIMIT ?";
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @param list<string> $parentIds @return list<array> */
    public function listReplies(array $parentIds): array
    {
        if ($parentIds === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($parentIds), '?'));
        $types = str_repeat('s', count($parentIds));
        $stmt = $this->db->prepare(
            "SELECT * FROM comments
             WHERE parent_id IN ($ph) AND deleted_at IS NULL
             ORDER BY created_at ASC"
        );
        $stmt->bind_param($types, ...$parentIds);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @param list<string> $commentIds @return array<string, bool> */
    public function commentLikedMap(string $userId, array $commentIds): array
    {
        $out = [];
        foreach ($commentIds as $id) {
            $out[$id] = false;
        }
        if ($commentIds === []) {
            return $out;
        }
        $commentIds = array_values(array_unique($commentIds));
        $ph = implode(',', array_fill(0, count($commentIds), '?'));
        $types = 's' . str_repeat('s', count($commentIds));
        $params = array_merge([$userId], $commentIds);
        $stmt = $this->db->prepare(
            "SELECT comment_id FROM comment_likes WHERE user_id = ? AND comment_id IN ($ph)"
        );
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $out[(string) $row['comment_id']] = true;
        }
        $stmt->close();
        return $out;
    }

    /** @return list<string> */
    public function keywordFilters(string $ownerId): array
    {
        $stmt = $this->db->prepare('SELECT keyword FROM comment_keyword_filters WHERE owner_id = ?');
        $stmt->bind_param('s', $ownerId);
        $stmt->execute();
        $out = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $out[] = strtolower((string) $row['keyword']);
        }
        $stmt->close();
        return $out;
    }

    public function addKeywordFilter(string $id, string $ownerId, string $keyword): void
    {
        $stmt = $this->db->prepare(
            'INSERT IGNORE INTO comment_keyword_filters (id, owner_id, keyword) VALUES (?, ?, ?)'
        );
        $stmt->bind_param('sss', $id, $ownerId, $keyword);
        $stmt->execute();
        $stmt->close();
    }

    public function removeKeywordFilter(string $ownerId, string $keyword): void
    {
        $stmt = $this->db->prepare(
            'DELETE FROM comment_keyword_filters WHERE owner_id = ? AND LOWER(keyword) = LOWER(?)'
        );
        $stmt->bind_param('ss', $ownerId, $keyword);
        $stmt->execute();
        $stmt->close();
    }

    public function findSaved(string $postId, string $userId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM saved_posts WHERE post_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $postId, $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function savePost(string $id, string $postId, string $userId, ?string $collectionId): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO saved_posts (id, user_id, post_id, collection_id) VALUES (?, ?, ?, ?)'
        );
        $stmt->bind_param('ssss', $id, $userId, $postId, $collectionId);
        $stmt->execute();
        $stmt->close();
    }

    public function unsavePost(string $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM saved_posts WHERE id = ?');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $stmt->close();
    }

    public function moveSavedToCollection(string $postId, string $userId, ?string $collectionId): void
    {
        $stmt = $this->db->prepare(
            'UPDATE saved_posts SET collection_id = ? WHERE post_id = ? AND user_id = ?'
        );
        $stmt->bind_param('sss', $collectionId, $postId, $userId);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array{post_id: string, created_at: string, collection_id: ?string}> */
    public function listSaved(string $userId, int $limit, ?string $cursor): array
    {
        $sql = 'SELECT post_id, collection_id, created_at FROM saved_posts WHERE user_id = ?';
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

    public function createCollection(string $id, string $ownerId, string $name): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO saved_collections (id, owner_id, name) VALUES (?, ?, ?)'
        );
        $stmt->bind_param('sss', $id, $ownerId, $name);
        $stmt->execute();
        $stmt->close();
    }

    public function renameCollection(string $id, string $ownerId, string $name): void
    {
        $stmt = $this->db->prepare(
            'UPDATE saved_collections SET name = ? WHERE id = ? AND owner_id = ?'
        );
        $stmt->bind_param('sss', $name, $id, $ownerId);
        $stmt->execute();
        $stmt->close();
    }

    public function deleteCollection(string $id, string $ownerId): void
    {
        $stmt = $this->db->prepare('DELETE FROM saved_collections WHERE id = ? AND owner_id = ?');
        $stmt->bind_param('ss', $id, $ownerId);
        $stmt->execute();
        $stmt->close();
    }

    public function findCollection(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM saved_collections WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function listCollections(string $ownerId): array
    {
        $stmt = $this->db->prepare(
            'SELECT c.*,
                    (SELECT COUNT(*) FROM saved_posts sp WHERE sp.collection_id = c.id) AS item_count
             FROM saved_collections c
             WHERE c.owner_id = ?
             ORDER BY c.created_at DESC'
        );
        $stmt->bind_param('s', $ownerId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function setReaction(string $id, string $postId, string $userId, string $reaction): void
    {
        $existing = $this->findReaction($postId, $userId);
        if ($existing) {
            $upd = $this->db->prepare(
                'UPDATE post_reactions SET reaction = ? WHERE post_id = ? AND user_id = ?'
            );
            $upd->bind_param('sss', $reaction, $postId, $userId);
            $upd->execute();
            $upd->close();
            return;
        }
        $ins = $this->db->prepare(
            'INSERT INTO post_reactions (id, post_id, user_id, reaction) VALUES (?, ?, ?, ?)'
        );
        $ins->bind_param('ssss', $id, $postId, $userId, $reaction);
        $ins->execute();
        $ins->close();
    }

    public function clearReaction(string $postId, string $userId): void
    {
        $stmt = $this->db->prepare(
            'DELETE FROM post_reactions WHERE post_id = ? AND user_id = ?'
        );
        $stmt->bind_param('ss', $postId, $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function findReaction(string $postId, string $userId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM post_reactions WHERE post_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $postId, $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function listReactions(string $postId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM post_reactions WHERE post_id = ? ORDER BY created_at DESC LIMIT 200'
        );
        $stmt->bind_param('s', $postId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function createShare(string $id, string $postId, string $userId, string $target, ?string $conversationId): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO post_shares (id, post_id, user_id, target, conversation_id) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('sssss', $id, $postId, $userId, $target, $conversationId);
        $stmt->execute();
        $stmt->close();
    }

    public function findShare(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM post_shares WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function pinComment(string $commentId, ?string $pinnedAt): void
    {
        $stmt = $this->db->prepare('UPDATE comments SET pinned_at = ? WHERE id = ?');
        $stmt->bind_param('ss', $pinnedAt, $commentId);
        $stmt->execute();
        $stmt->close();
    }
}
