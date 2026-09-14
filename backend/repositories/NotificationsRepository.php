<?php

declare(strict_types=1);

final class NotificationsRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function ensurePrefs(string $userId): void
    {
        $stmt = $this->db->prepare('INSERT IGNORE INTO notification_prefs (user_id) VALUES (?)');
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function getPrefs(string $userId): ?array
    {
        $this->ensurePrefs($userId);
        $stmt = $this->db->prepare('SELECT * FROM notification_prefs WHERE user_id = ? LIMIT 1');
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function updatePrefs(string $userId, array $fields): void
    {
        $this->ensurePrefs($userId);
        $map = [
            'likes' => 'i',
            'comments' => 'i',
            'follows' => 'i',
            'messages' => 'i',
            'mentions' => 'i',
            'shares' => 'i',
            'birthdays' => 'i',
            'memories' => 'i',
            'push_enabled' => 'i',
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
        $sql = 'UPDATE notification_prefs SET ' . implode(', ', $sets) . ' WHERE user_id = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$values);
        $stmt->execute();
        $stmt->close();
    }

    public function create(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO notifications
             (id, user_id, actor_id, type, post_id, comment_id, conversation_id, body, group_key, is_read)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $id = $data['id'];
        $userId = $data['user_id'];
        $actorId = $data['actor_id'];
        $type = $data['type'];
        $postId = $data['post_id'];
        $commentId = $data['comment_id'];
        $conversationId = $data['conversation_id'];
        $body = $data['body'];
        $groupKey = $data['group_key'];
        $isRead = (int) ($data['is_read'] ?? 0);
        $stmt->bind_param(
            'sssssssssi',
            $id,
            $userId,
            $actorId,
            $type,
            $postId,
            $commentId,
            $conversationId,
            $body,
            $groupKey,
            $isRead
        );
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function list(string $userId, int $limit, ?string $cursor): array
    {
        $sql = 'SELECT * FROM notifications WHERE user_id = ?';
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

    public function markRead(string $notificationId, string $userId): void
    {
        $stmt = $this->db->prepare(
            'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
        );
        $stmt->bind_param('ss', $notificationId, $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function markAllRead(string $userId): void
    {
        $stmt = $this->db->prepare(
            'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'
        );
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function unreadCount(string $userId): int
    {
        $stmt = $this->db->prepare(
            'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0'
        );
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return (int) ($row['c'] ?? 0);
    }

    public function registerPushToken(string $userId, string $token, string $platform): void
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM push_tokens WHERE user_id = ? AND token = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $userId, $token);
        $stmt->execute();
        $existing = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($existing) {
            $id = (string) $existing['id'];
            $upd = $this->db->prepare('UPDATE push_tokens SET platform = ? WHERE id = ?');
            $upd->bind_param('ss', $platform, $id);
            $upd->execute();
            $upd->close();
            return;
        }
        $id = viora_uuid_v4();
        $ins = $this->db->prepare(
            'INSERT INTO push_tokens (id, user_id, token, platform) VALUES (?, ?, ?, ?)'
        );
        $ins->bind_param('ssss', $id, $userId, $token, $platform);
        $ins->execute();
        $ins->close();
    }

    public function removePushToken(string $userId, string $token): void
    {
        $stmt = $this->db->prepare('DELETE FROM push_tokens WHERE user_id = ? AND token = ?');
        $stmt->bind_param('ss', $userId, $token);
        $stmt->execute();
        $stmt->close();
    }

    public function findByGroupKey(string $userId, string $groupKey): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM notifications WHERE user_id = ? AND group_key = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $userId, $groupKey);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }
}
