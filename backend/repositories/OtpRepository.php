<?php

declare(strict_types=1);

final class OtpRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function deleteActiveForEmail(string $email): void
    {
        $stmt = $this->db->prepare(
            'DELETE FROM password_reset_otps WHERE email = ? AND consumed_at IS NULL'
        );
        $stmt->bind_param('s', $email);
        $stmt->execute();
        $stmt->close();
    }

    public function create(string $id, string $email, string $otpHash, string $expiresAt): void
    {
        $stmt = $this->db->prepare(
            'INSERT INTO password_reset_otps (id, email, otp_hash, expires_at) VALUES (?, ?, ?, ?)'
        );
        $stmt->bind_param('ssss', $id, $email, $otpHash, $expiresAt);
        $stmt->execute();
        $stmt->close();
    }

    public function latestActive(string $email): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, email, otp_hash, attempts, expires_at, consumed_at, created_at
             FROM password_reset_otps
             WHERE email = ? AND consumed_at IS NULL
             ORDER BY created_at DESC
             LIMIT 1'
        );
        $stmt->bind_param('s', $email);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function bumpAttempts(string $id, int $attempts): void
    {
        $stmt = $this->db->prepare('UPDATE password_reset_otps SET attempts = ? WHERE id = ?');
        $stmt->bind_param('is', $attempts, $id);
        $stmt->execute();
        $stmt->close();
    }

    public function consume(string $id): void
    {
        $stmt = $this->db->prepare(
            'UPDATE password_reset_otps SET consumed_at = UTC_TIMESTAMP(6) WHERE id = ?'
        );
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $stmt->close();
    }
}
