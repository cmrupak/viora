<?php

declare(strict_types=1);

final class AudiencesRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function createList(string $id, string $ownerId, string $name): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO audience_lists (id, owner_id, name) VALUES (?, ?, ?)'
        );
        $stmt->bind_param('sss', $id, $ownerId, $name);
        $stmt->execute();
        $stmt->close();
    }

    public function findList(string $listId): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM audience_lists WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $listId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function renameList(string $listId, string $ownerId, string $name): bool
    {
        $stmt = $this->db->prepare(
            'UPDATE audience_lists SET name = ?, updated_at = UTC_TIMESTAMP(6)
             WHERE id = ? AND owner_id = ?'
        );
        $stmt->bind_param('sss', $name, $listId, $ownerId);
        $stmt->execute();
        $ok = $stmt->affected_rows > 0;
        $stmt->close();
        return $ok;
    }

    public function deleteList(string $listId, string $ownerId): bool
    {
        $stmt = $this->db->prepare(
            'DELETE FROM audience_lists WHERE id = ? AND owner_id = ?'
        );
        $stmt->bind_param('ss', $listId, $ownerId);
        $stmt->execute();
        $ok = $stmt->affected_rows > 0;
        $stmt->close();
        return $ok;
    }

    /** @return list<array> */
    public function listLists(string $ownerId): array
    {
        $stmt = $this->db->prepare(
            'SELECT al.*,
                    (SELECT COUNT(*) FROM audience_list_members alm WHERE alm.list_id = al.id) AS member_count
             FROM audience_lists al
             WHERE al.owner_id = ?
             ORDER BY al.created_at DESC'
        );
        $stmt->bind_param('s', $ownerId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    /** @return list<array> */
    public function listMembers(string $listId): array
    {
        $stmt = $this->db->prepare(
            'SELECT p.*, alm.created_at AS member_since
             FROM audience_list_members alm
             JOIN profiles p ON p.id = alm.member_id
             WHERE alm.list_id = ? AND p.is_deactivated = 0
             ORDER BY alm.created_at DESC'
        );
        $stmt->bind_param('s', $listId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function findMember(string $listId, string $memberId): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM audience_list_members WHERE list_id = ? AND member_id = ? LIMIT 1'
        );
        $stmt->bind_param('ss', $listId, $memberId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function addMember(string $id, string $listId, string $memberId): void
    {
        $stmt = $this->db->prepare(
            'INSERT IGNORE INTO audience_list_members (id, list_id, member_id) VALUES (?, ?, ?)'
        );
        $stmt->bind_param('sss', $id, $listId, $memberId);
        $stmt->execute();
        $stmt->close();
    }

    public function removeMember(string $listId, string $memberId): bool
    {
        $stmt = $this->db->prepare(
            'DELETE FROM audience_list_members WHERE list_id = ? AND member_id = ?'
        );
        $stmt->bind_param('ss', $listId, $memberId);
        $stmt->execute();
        $ok = $stmt->affected_rows > 0;
        $stmt->close();
        return $ok;
    }
}
