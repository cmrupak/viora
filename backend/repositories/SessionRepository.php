<?php

declare(strict_types=1);

final class SessionRepository
{
    public function __construct(private readonly mysqli $db)
    {
    }

    public function create(
        string $id,
        string $userId,
        string $refreshTokenHash,
        ?string $userAgent,
        ?string $ipHint,
        string $expiresAt,
    ): void {
        $stmt = $this->db->prepare(
            'INSERT INTO auth_sessions (id, user_id, refresh_token_hash, user_agent, ip_hint, expires_at)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->bind_param('ssssss', $id, $userId, $refreshTokenHash, $userAgent, $ipHint, $expiresAt);
        $stmt->execute();
        $stmt->close();
    }

    public function findValidByRefreshHash(string $hash): ?array
    {
        $stmt = $this->db->prepare(
            'SELECT id, user_id, refresh_token_hash, expires_at, revoked_at
             FROM auth_sessions
             WHERE refresh_token_hash = ?
               AND revoked_at IS NULL
               AND expires_at > UTC_TIMESTAMP(6)
             LIMIT 1'
        );
        $stmt->bind_param('s', $hash);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        return $row ?: null;
    }

    public function revoke(string $id): void
    {
        $stmt = $this->db->prepare(
            'UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP(6) WHERE id = ? AND revoked_at IS NULL'
        );
        $stmt->bind_param('s', $id);
        $stmt->execute();
        $stmt->close();
    }

    public function revokeAllForUser(string $userId): void
    {
        $stmt = $this->db->prepare(
            'UPDATE auth_sessions SET revoked_at = UTC_TIMESTAMP(6)
             WHERE user_id = ? AND revoked_at IS NULL'
        );
        $stmt->bind_param('s', $userId);
        $stmt->execute();
        $stmt->close();
    }

    public function rotate(
        string $oldId,
        string $newId,
        string $userId,
        string $newHash,
        ?string $userAgent,
        ?string $ipHint,
        string $expiresAt,
    ): void {
        $this->revoke($oldId);
        $this->create($newId, $userId, $newHash, $userAgent, $ipHint, $expiresAt);
    }
}
