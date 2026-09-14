<?php

declare(strict_types=1);

final class UserRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function findById(string $id): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, email, password_hash, email_verified_at, mfa_enabled, mfa_secret, created_at
             FROM users WHERE id = ? LIMIT 1'
        );
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function findByEmail(string $email): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, email, password_hash, email_verified_at, mfa_enabled, mfa_secret, created_at
             FROM users WHERE email = ? LIMIT 1'
        );
        $stmt->bind_param('s', $email);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function create(string $id, string $email, string $passwordHash): void
    {
        $stmt = $this->db->prepare('INSERT INTO users (id, email, password_hash, email_verified_at) VALUES (?, ?, ?, NULL)');
        $stmt->bind_param('sss', $id, $email, $passwordHash);
        $stmt->execute();
        $stmt->close();
    }

    public function updatePassword(string $id, string $passwordHash): void
    {
        $stmt = $this->db->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
        $stmt->bind_param('ss', $passwordHash, $id);
        $stmt->execute();
        $stmt->close();
    }

    public function setMfaSecret(string $id, ?string $secret, bool $enabled): void
    {
        $flag = $enabled ? 1 : 0;
        if ($secret === null) {
            $stmt = $this->db->prepare('UPDATE users SET mfa_secret = NULL, mfa_enabled = ? WHERE id = ?');
            $stmt->bind_param('is', $flag, $id);
        } else {
            $stmt = $this->db->prepare('UPDATE users SET mfa_secret = ?, mfa_enabled = ? WHERE id = ?');
            $stmt->bind_param('sis', $secret, $flag, $id);
        }
        $stmt->execute();
        $stmt->close();
    }

    public function deleteById(string $id): void
    {
        $stmt = $this->db->prepare('DELETE FROM users WHERE id = ?');
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $stmt->close();
    }
}
