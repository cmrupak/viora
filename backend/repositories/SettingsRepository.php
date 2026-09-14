<?php

declare(strict_types=1);

final class SettingsRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function ensureSettings(string $userId): void
    {
        $stmt = $this->db->prepare('INSERT IGNORE INTO user_settings (user_id) VALUES (?)');
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function getSettings(string $userId): ?array
    {
        $this->ensureSettings($userId);
        $stmt = $this->db->prepare('SELECT * FROM user_settings WHERE user_id = ? LIMIT 1');
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function updateSettings(string $userId, array $fields): void
    {
        $this->ensureSettings($userId);
        $map = [
            'language' => 's',
            'hide_sensitive' => 'i',
            'login_alerts' => 'i',
            'reduce_motion' => 'i',
            'theme_preference' => 's',
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
        $sql = 'UPDATE user_settings SET ' . implode(', ', $sets) . ' WHERE user_id = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$values);
        $stmt->execute();
        $stmt->close();
    }

    public function logActivity(string $id, string $userId, string $action, string $metadataJson): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO activity_log (id, user_id, action, metadata) VALUES (?, ?, ?, CAST(? AS JSON))'
        );
        $stmt->bind_param('ssss', $id, $userId, $action, $metadataJson);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listActivity(string $userId, int $limit): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM activity_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
        );
        $stmt->bind_param('si', $userId, $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function recordLoginEvent(string $id, string $userId, ?string $ip, ?string $ua, ?string $device): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO login_events (id, user_id, ip_hint, user_agent, device_label) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('sssss', $id, $userId, $ip, $ua, $device);
        $stmt->execute();
        $stmt->close();
    }

    /** @return list<array> */
    public function listLoginEvents(string $userId, int $limit): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM login_events WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
        );
        $stmt->bind_param('si', $userId, $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function createExportRequest(string $id, string $userId): void
    {
        $stmt = $this->db->prepare(
            "INSERT INTO data_export_requests (id, user_id, status) VALUES (?, ?, 'pending')"
        );
        $stmt->bind_param('ss', $id, $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function findExportRequest(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM data_export_requests WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function listExportRequests(string $userId, int $limit): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM data_export_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
        );
        $stmt->bind_param('si', $userId, $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function updateExportRequest(string $id, array $fields): void
    {
        $map = ['status' => 's', 'download_path' => 's', 'error_message' => 's'];
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
        $sql = 'UPDATE data_export_requests SET ' . implode(', ', $sets) . ' WHERE id = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$values);
        $stmt->execute();
        $stmt->close();
    }

    public function createDeletionRequest(string $id, string $userId): void
    {
        $stmt = $this->db->prepare(
            "INSERT INTO account_deletion_requests (id, user_id, status) VALUES (?, ?, 'pending')"
        );
        $stmt->bind_param('ss', $id, $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function findDeletionRequest(string $id): ?array
    {
        $stmt = $this->db->prepare('SELECT * FROM account_deletion_requests WHERE id = ? LIMIT 1');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    /** @return list<array> */
    public function listDeletionRequests(string $userId, int $limit): array
    {
        $stmt = $this->db->prepare(
            'SELECT * FROM account_deletion_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
        );
        $stmt->bind_param('si', $userId, $limit);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        return $rows;
    }

    public function updateDeletionRequest(string $id, array $fields): void
    {
        $map = ['status' => 's', 'error_message' => 's'];
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
        $sql = 'UPDATE account_deletion_requests SET ' . implode(', ', $sets) . ' WHERE id = ?';
        $stmt = $this->db->prepare($sql);
        $stmt->bind_param($types, ...$values);
        $stmt->execute();
        $stmt->close();
    }

    public function setDeactivated(string $userId, bool $deactivated): void
    {
        $flag = $deactivated ? 1 : 0;
        $stmt = $this->db->prepare('UPDATE profiles SET is_deactivated = ? WHERE id = ?');
        $stmt->bind_param('is', $flag, $userId);
        $stmt->execute();
        $stmt->close();
    }
}
