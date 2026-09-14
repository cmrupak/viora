<?php

declare(strict_types=1);

final class GroupsRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function create(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO `groups` (id, name, description, cover_url, owner_id, is_private, visibility, requires_post_approval)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $id = $data['id'];
        $name = $data['name'];
        $description = $data['description'];
        $coverUrl = $data['cover_url'];
        $ownerId = $data['owner_id'];
        $isPrivate = (int) $data['is_private'];
        $visibility = $data['visibility'];
        $requires = (int) $data['requires_post_approval'];
        $stmt->bind_param('sssssisi', $id, $name, $description, $coverUrl, $ownerId, $isPrivate, $visibility, $requires);
        $stmt->execute();
        $stmt->close();
    }

    public function addMember(string $id, string $groupId, string $userId, string $role, string $status): void
    {
        $existing = $this->findMember($groupId, $userId);
        if ($existing) {
            $stmt = $this->db->prepare(
                'UPDATE group_members SET role = ?, status = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?'
            );
            $eid = (string) $existing['id'];
            $stmt->bind_param('sss', $role, $status, $eid);
            $stmt->execute();
            $stmt->close();
            return;
        }
        $stmt = $this->db->prepare(
            'INSERT INTO group_members (id, group_id, user_id, role, status) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('sssss', $id, $groupId, $userId, $role, $status);
        $stmt->execute();
        $stmt->close();
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM `groups` WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function findMember(string $groupId, string $userId): ?array
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

    public function update(string $id, array $fields): void
    {
        if ($fields === []) {
            return;
        }
        $map = [
            'name' => 's',
            'description' => 's',
            'cover_url' => 's',
            'visibility' => 's',
            'is_private' => 'i',
            'requires_post_approval' => 'i',
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
        $values[] = $id;
        $sql = 'UPDATE `groups` SET ' . implode(', ', $sets) . ' WHERE id = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$values);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function list(int $limit, ?string $cursor, ?string $viewerId): array
    {
        $sql = 'SELECT g.* FROM `groups` g WHERE 1=1';
        $types = '';
        $params = [];
        if ($cursor) {
            $sql .= ' AND g.created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }
        // Hide hidden groups unless member
        if ($viewerId) {
            $sql .= " AND (
                g.visibility <> 'hidden'
                OR g.owner_id = ?
                OR EXISTS (
                  SELECT 1 FROM group_members gm
                  WHERE gm.group_id = g.id AND gm.user_id = ? AND gm.status = 'active'
                )
            )";
            $types .= 'ss';
            $params[] = $viewerId;
            $params[] = $viewerId;
        } else {
            $sql .= " AND g.visibility = 'public'";
        }
        $sql .= ' ORDER BY g.created_at DESC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function memberCount(string $groupId): int
    {
        $stmt = $this->db->prepare(
            "SELECT COUNT(*) AS c FROM group_members WHERE group_id = ? AND status = 'active'"
        );
        $stmt->bind_param('s', $groupId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return (int) ($row['c'] ?? 0);
    }

    public function setMemberStatus(string $groupId, string $userId, string $status): void
    {
        $stmt = $this->db->prepare(
            'UPDATE group_members SET status = ?, updated_at = UTC_TIMESTAMP(6)
             WHERE group_id = ? AND user_id = ?'
        );
        $stmt->bind_param('sss', $status, $groupId, $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function setMemberRole(string $groupId, string $userId, string $role): void
    {
        $stmt = $this->db->prepare(
            'UPDATE group_members SET role = ?, updated_at = UTC_TIMESTAMP(6)
             WHERE group_id = ? AND user_id = ?'
        );
        $stmt->bind_param('sss', $role, $groupId, $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function removeMember(string $groupId, string $userId): void
    {
        $stmt = $this->db->prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?');
        $stmt->bind_param('ss', $groupId, $userId);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listMembers(string $groupId, int $limit, ?string $cursor, ?string $status): array
    {
        $sql = 'SELECT gm.*, p.username, p.display_name, p.avatar_url
                FROM group_members gm
                JOIN profiles p ON p.id = gm.user_id
                WHERE gm.group_id = ?';
        $types = 's';
        $params = [$groupId];
        if ($status) {
            $sql .= ' AND gm.status = ?';
            $types .= 's';
            $params[] = $status;
        }
        if ($cursor) {
            $sql .= ' AND gm.created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY gm.created_at DESC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function linkPost(string $id, string $groupId, string $postId, string $approval): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO group_posts (id, group_id, post_id, approval_status) VALUES (?, ?, ?, ?)'
        );
        $stmt->bind_param('ssss', $id, $groupId, $postId, $approval);
        $stmt->execute();
        $stmt->close();
    }

    public function setPostApproval(string $groupId, string $postId, string $status): void
    {
        $stmt = $this->db->prepare(
            'UPDATE group_posts SET approval_status = ?, updated_at = UTC_TIMESTAMP(6)
             WHERE group_id = ? AND post_id = ?'
        );
        $stmt->bind_param('sss', $status, $groupId, $postId);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listGroupPostIds(string $groupId, string $approval, int $limit, ?string $cursor): array
    {
        $sql = 'SELECT gp.post_id, gp.created_at, p.*
                FROM group_posts gp
                JOIN posts p ON p.id = gp.post_id
                WHERE gp.group_id = ? AND gp.approval_status = ? AND p.deleted_at IS NULL';
        $types = 'ss';
        $params = [$groupId, $approval];
        if ($cursor) {
            $sql .= ' AND gp.created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY gp.created_at DESC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function addJoinQuestion(string $id, string $groupId, string $prompt, int $sortOrder, bool $required): void
    {
        $req = $required ? 1 : 0;
        $stmt = $this->db->prepare(
            'INSERT INTO group_join_questions (id, group_id, prompt, sort_order, required)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('sssii', $id, $groupId, $prompt, $sortOrder, $req);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listJoinQuestions(string $groupId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM group_join_questions WHERE group_id = ? ORDER BY sort_order ASC'
        );
        $stmt->bind_param('s', $groupId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function deleteJoinQuestion(string $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM group_join_questions WHERE id = ?');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $stmt->close();
    }

    public function upsertJoinAnswer(string $id, string $questionId, string $userId, string $answer): void
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM group_join_answers WHERE question_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $questionId, $userId);
        $stmt->execute();
        $existing = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($existing) {
            $eid = (string) $existing['id'];
            $upd = $this->db->prepare('UPDATE group_join_answers SET answer = ? WHERE id = ?');
            $upd->bind_param('ss', $answer, $eid);
            $upd->execute();
            $upd->close();
            return;
        }
        $ins = $this->db->prepare(
            'INSERT INTO group_join_answers (id, question_id, user_id, answer) VALUES (?, ?, ?, ?)'
        );
        $ins->bind_param('ssss', $id, $questionId, $userId, $answer);
        $ins->execute();
        $ins->close();
    }

    public function createBroadcastChannel(string $id, string $groupId, string $name, ?string $description, string $createdBy): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO broadcast_channels (id, group_id, name, description, created_by)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('sssss', $id, $groupId, $name, $description, $createdBy);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listBroadcastChannels(string $groupId): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM broadcast_channels WHERE group_id = ? ORDER BY created_at DESC'
        );
        $stmt->bind_param('s', $groupId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function postBroadcast(string $id, string $channelId, string $authorId, string $body): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO broadcast_messages (id, channel_id, author_id, body) VALUES (?, ?, ?, ?)'
        );
        $stmt->bind_param('ssss', $id, $channelId, $authorId, $body);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listBroadcastMessages(string $channelId, int $limit, ?string $cursor): array
    {
        $sql = 'SELECT * FROM broadcast_messages WHERE channel_id = ?';
        $types = 's';
        $params = [$channelId];
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

    public function findBroadcastChannel(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM broadcast_channels WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }
}
