<?php

declare(strict_types=1);

final class MessagesRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function createConversation(string $id, bool $isGroup, ?string $title, bool $isRequest = false): void
    {
        $g = $isGroup ? 1 : 0;
        $r = $isRequest ? 1 : 0;
        $stmt = $this->db->prepare(
            'INSERT INTO conversations (id, is_group, title, is_request) VALUES (?, ?, ?, ?)'
        );
        $stmt->bind_param('sisi', $id, $g, $title, $r);
        $stmt->execute();
        $stmt->close();
    }

    public function addMember(string $id, string $conversationId, string $userId): void
    {
        $stmt = $this->db->prepare(
            'INSERT IGNORE INTO conversation_members (id, conversation_id, user_id) VALUES (?, ?, ?)'
        );
        $stmt->bind_param('sss', $id, $conversationId, $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function findConversation(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM conversations WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function findDmBetween(string $a, string $b): ?array
    {
        $sql = <<<'SQL'
            SELECT c.* FROM conversations c
            JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
            JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
            WHERE c.is_group = 0
            LIMIT 1
            SQL;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('ss', $a, $b);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function listConversations(string $userId, bool $requestsOnly): array
    {
        $sql = 'SELECT c.*, cm.muted, cm.pinned_at, cm.nickname, cm.last_read_at
                FROM conversations c
                JOIN conversation_members cm ON cm.conversation_id = c.id
                WHERE cm.user_id = ?';
        if ($requestsOnly) {
            $sql .= ' AND c.is_request = 1';
        }
        $sql .= ' ORDER BY (cm.pinned_at IS NULL) ASC, cm.pinned_at DESC, c.last_message_at DESC, c.created_at DESC';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listMembers(string $conversationId): array
    {
        $stmt = $this->db->prepare(
            'SELECT cm.*, p.username, p.display_name, p.avatar_url, p.bio, p.follower_count, p.following_count,
                    p.is_private, p.is_deactivated, p.created_at AS profile_created_at
             FROM conversation_members cm
             JOIN profiles p ON p.id = cm.user_id
             WHERE cm.conversation_id = ?'
        );
        $stmt->bind_param('s', $conversationId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function setRequest(string $conversationId, bool $isRequest): void
    {
        $flag = $isRequest ? 1 : 0;
        $stmt = $this->db->prepare('UPDATE conversations SET is_request = ? WHERE id = ?');
        $stmt->bind_param('is', $flag, $conversationId);
        $stmt->execute();
        $stmt->close();
    }

    public function removeMember(string $conversationId, string $userId): void
    {
        $stmt = $this->db->prepare(
            'DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?'
        );
        $stmt->bind_param('ss', $conversationId, $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function insertMessage(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO messages (id, conversation_id, sender_id, body, reply_to_id, story_id, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $id = $data['id'];
        $cid = $data['conversation_id'];
        $sid = $data['sender_id'];
        $body = $data['body'];
        $reply = $data['reply_to_id'];
        $story = $data['story_id'];
        $expires = $data['expires_at'];
        $stmt->bind_param('sssssss', $id, $cid, $sid, $body, $reply, $story, $expires);
        $stmt->execute();
        $stmt->close();
    }

    public function insertAttachment(string $id, string $messageId, string $url, string $mediaType, ?string $fileName): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO message_attachments (id, message_id, url, media_type, file_name)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('sssss', $id, $messageId, $url, $mediaType, $fileName);
        $stmt->execute();
        $stmt->close();
    }

    public function touchConversation(string $conversationId): void
    {
        $stmt = $this->db->prepare(
            'UPDATE conversations SET last_message_at = UTC_TIMESTAMP(6) WHERE id = ?'
        );
        $stmt->bind_param('s', $conversationId);
        $stmt->execute();
        $stmt->close();
    }

    public function findMessage(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM messages WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function listMessages(string $conversationId, int $limit, ?string $cursor): array
    {
        $this->purgeExpired($conversationId);
        $sql = 'SELECT * FROM messages
                WHERE conversation_id = ?
                  AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP(6))';
        $types = 's';
        $params = [$conversationId];
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
        return array_reverse($rows);
    }

    public function purgeExpired(string $conversationId): void
    {
        $stmt = $this->db->prepare(
            'DELETE FROM messages
             WHERE conversation_id = ? AND expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP(6)'
        );
        $stmt->bind_param('s', $conversationId);
        $stmt->execute();
        $stmt->close();
    }

    public function markRead(string $conversationId, string $userId): void
    {
        $stmt = $this->db->prepare(
            'UPDATE conversation_members SET last_read_at = UTC_TIMESTAMP(6)
             WHERE conversation_id = ? AND user_id = ?'
        );
        $stmt->bind_param('ss', $conversationId, $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function setMemberPrefs(string $conversationId, string $userId, array $fields): void
    {
        $sets = [];
        $types = '';
        $values = [];
        $map = ['muted' => 'i', 'pinned_at' => 's', 'nickname' => 's'];
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
        $types .= 'ss';
        $values[] = $conversationId;
        $values[] = $userId;
        $sql = 'UPDATE conversation_members SET ' . implode(', ', $sets)
            . ' WHERE conversation_id = ? AND user_id = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$values);
        $stmt->execute();
        $stmt->close();
    }

    public function setReaction(string $messageId, string $userId, ?string $reaction): void
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $messageId, $userId);
        $stmt->execute();
        $existing = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($reaction === null) {
            if ($existing) {
                $id = (string) $existing['id'];
                $del = $this->db->prepare('DELETE FROM message_reactions WHERE id = ?');
                $del->bind_param('s', $id);
                $del->execute();
                $del->close();
            }
            return;
        }
        if ($existing) {
            $id = (string) $existing['id'];
            $upd = $this->db->prepare('UPDATE message_reactions SET reaction = ? WHERE id = ?');
            $upd->bind_param('ss', $reaction, $id);
            $upd->execute();
            $upd->close();
            return;
        }
        $id = viora_uuid_v4();
        $ins = $this->db->prepare(
            'INSERT INTO message_reactions (id, message_id, user_id, reaction) VALUES (?, ?, ?, ?)'
        );
        $ins->bind_param('ssss', $id, $messageId, $userId, $reaction);
        $ins->execute();
        $ins->close();
    }

    public function softDeleteMessage(string $messageId): void
    {
        $now = gmdate('Y-m-d H:i:s');
        $stmt = $this->db->prepare('UPDATE messages SET deleted_at = ?, body = \'\' WHERE id = ?');
        $stmt->bind_param('ss', $now, $messageId);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function searchMessages(string $userId, string $query, int $limit): array
    {
        $like = '%' . $query . '%';
        $stmt = $this->db->prepare(
            'SELECT m.* FROM messages m
             JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ?
             WHERE m.deleted_at IS NULL AND m.body LIKE ?
             ORDER BY m.created_at DESC
             LIMIT ?'
        );
        $stmt->bind_param('ssi', $userId, $like, $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @param list<string> $messageIds @return array<string, list<array>> */
    public function attachmentsForMessages(array $messageIds): array
    {
        return $this->childMap('message_attachments', 'message_id', $messageIds);
    }

    /** @param list<string> $messageIds @return array<string, list<array>> */
    public function reactionsForMessages(array $messageIds): array
    {
        return $this->childMap('message_reactions', 'message_id', $messageIds);
    }

    /** @param list<string> $ids @return array<string, list<array>> */
    private function childMap(string $table, string $col, array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($ids), '?'));
        $types = str_repeat('s', count($ids));
        $stmt = $this->db->prepare("SELECT * FROM {$table} WHERE {$col} IN ($ph)");
        $stmt->bind_param($types, ...$ids);
        $stmt->execute();
        $out = [];
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) {
            $out[(string) $row[$col]][] = $row;
        }
        $stmt->close();
        return $out;
    }

    public function heartbeat(string $userId, bool $online): void
    {
        $flag = $online ? 1 : 0;
        $stmt = $this->db->prepare(
            'INSERT INTO user_presence (user_id, last_seen_at, is_online)
             VALUES (?, UTC_TIMESTAMP(6), ?)
             ON DUPLICATE KEY UPDATE last_seen_at = UTC_TIMESTAMP(6), is_online = VALUES(is_online), updated_at = UTC_TIMESTAMP(6)'
        );
        $stmt->bind_param('si', $userId, $flag);
        $stmt->execute();
        $stmt->close();
    }

    /** @param list<string> $userIds @return list<array> */
    public function getPresence(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }
        $ph = implode(',', array_fill(0, count($userIds), '?'));
        $types = str_repeat('s', count($userIds));
        $stmt = $this->db->prepare("SELECT * FROM user_presence WHERE user_id IN ($ph)");
        $stmt->bind_param($types, ...$userIds);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }
}
