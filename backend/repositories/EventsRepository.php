<?php

declare(strict_types=1);

final class EventsRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function create(array $data): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO events (
                id, title, description, cover_url, location, starts_at, ends_at, host_id,
                group_id, is_online, meeting_url, recurrence_rule, discussion_post_id
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $id = $data['id'];
        $title = $data['title'];
        $description = $data['description'];
        $coverUrl = $data['cover_url'];
        $location = $data['location'];
        $startsAt = $data['starts_at'];
        $endsAt = $data['ends_at'];
        $hostId = $data['host_id'];
        $groupId = $data['group_id'];
        $isOnline = (int) $data['is_online'];
        $meetingUrl = $data['meeting_url'];
        $recurrence = $data['recurrence_rule'];
        $discussionPostId = $data['discussion_post_id'];
        $stmt->bind_param(
            'sssssssssisss',
            $id,
            $title,
            $description,
            $coverUrl,
            $location,
            $startsAt,
            $endsAt,
            $hostId,
            $groupId,
            $isOnline,
            $meetingUrl,
            $recurrence,
            $discussionPostId
        );
        $stmt->execute();
        $stmt->close();
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM events WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function list(int $limit, ?string $cursor, ?string $groupId): array
    {
        $sql = 'SELECT * FROM events WHERE 1=1';
        $types = '';
        $params = [];
        if ($groupId) {
            $sql .= ' AND group_id = ?';
            $types .= 's';
            $params[] = $groupId;
        }
        if ($cursor) {
            $sql .= ' AND starts_at > ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY starts_at ASC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function delete(string $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM events WHERE id = ?');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $stmt->close();
    }

    public function upsertMember(string $id, string $eventId, string $userId, string $status): array
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM event_members WHERE event_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $eventId, $userId);
        $stmt->execute();
        $existing = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($existing) {
            $eid = (string) $existing['id'];
            $upd = $this->db->prepare(
                'UPDATE event_members SET status = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?'
            );
            $upd->bind_param('ss', $status, $eid);
            $upd->execute();
            $upd->close();
            return $this->findMemberById($eid) ?? ['id' => $eid, 'event_id' => $eventId, 'user_id' => $userId, 'status' => $status];
        }
        $ins = $this->db->prepare(
            'INSERT INTO event_members (id, event_id, user_id, status) VALUES (?, ?, ?, ?)'
        );
        $ins->bind_param('ssss', $id, $eventId, $userId, $status);
        $ins->execute();
        $ins->close();
        return $this->findMemberById($id) ?? ['id' => $id, 'event_id' => $eventId, 'user_id' => $userId, 'status' => $status];
    }

    public function findMember(string $eventId, string $userId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM event_members WHERE event_id = ? AND user_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $eventId, $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function findMemberById(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM event_members WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function removeMember(string $eventId, string $userId): void
    {
        $stmt = $this->db->prepare('DELETE FROM event_members WHERE event_id = ? AND user_id = ?');
        $stmt->bind_param('ss', $eventId, $userId);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listMembers(string $eventId, int $limit, ?string $cursor): array
    {
        $sql = 'SELECT em.*, p.username, p.display_name, p.avatar_url
                FROM event_members em
                JOIN profiles p ON p.id = em.user_id
                WHERE em.event_id = ?';
        $types = 's';
        $params = [$eventId];
        if ($cursor) {
            $sql .= ' AND em.created_at < ?';
            $types .= 's';
            $params[] = $cursor;
        }
        $sql .= ' ORDER BY em.created_at DESC LIMIT ?';
        $types .= 'i';
        $params[] = $limit;
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function upsertInvite(string $id, string $eventId, string $inviteeId, string $invitedBy): array
    {
        $stmt = $this->db->prepare(
            'SELECT id FROM event_invites WHERE event_id = ? AND invitee_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $eventId, $inviteeId);
        $stmt->execute();
        $existing = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($existing) {
            $eid = (string) $existing['id'];
            $upd = $this->db->prepare(
                "UPDATE event_invites SET status = 'pending', invited_by = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?"
            );
            $upd->bind_param('ss', $invitedBy, $eid);
            $upd->execute();
            $upd->close();
            return $this->findInvite($eid) ?? ['id' => $eid];
        }
        $ins = $this->db->prepare(
            "INSERT INTO event_invites (id, event_id, invitee_id, invited_by, status)
             VALUES (?, ?, ?, ?, 'pending')"
        );
        $ins->bind_param('ssss', $id, $eventId, $inviteeId, $invitedBy);
        $ins->execute();
        $ins->close();
        return $this->findInvite($id) ?? ['id' => $id];
    }

    public function findInvite(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM event_invites WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function listMyInvites(string $userId): array
    {
        $stmt = $this->db->prepare(
            "SELECT * FROM event_invites WHERE invitee_id = ? AND status = 'pending' ORDER BY created_at DESC"
        );
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function setInviteStatus(string $id, string $status): void
    {
        $stmt = $this->db->prepare(
            'UPDATE event_invites SET status = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?'
        );
        $stmt->bind_param('ss', $status, $id);
        $stmt->execute();
        $stmt->close();
    }

    public function setDiscussionPost(string $eventId, string $postId): void
    {
        $stmt = $this->db->prepare('UPDATE events SET discussion_post_id = ? WHERE id = ?');
        $stmt->bind_param('ss', $postId, $eventId);
        $stmt->execute();
        $stmt->close();
    }
}
