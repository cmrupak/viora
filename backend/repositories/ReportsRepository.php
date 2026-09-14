<?php

declare(strict_types=1);

final class ReportsRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function create(string $id, string $reporterId, string $targetType, string $targetId, string $reason, ?string $details): void
    {
        $stmt = $this->db->prepare(
            "INSERT INTO reports (id, reporter_id, target_type, target_id, reason, details, status)
             VALUES (?, ?, ?, ?, ?, ?, 'open')"
        );
        $stmt->bind_param('ssssss', $id, $reporterId, $targetType, $targetId, $reason, $details);
        $stmt->execute();
        $stmt->close();
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM reports WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }
}
