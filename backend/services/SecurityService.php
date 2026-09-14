<?php

declare(strict_types=1);

final class SecurityService
{
    public function __construct(private readonly UserRepository $users)
    {
    }

    public function listFactors(string $userId): array
    {
        $user = $this->users->findById($userId);
        if (!$user || empty($user['mfa_secret']) || !(int) ($user['mfa_enabled'] ?? 0)) {
            return [];
        }
        return [[
            'id' => 'totp-primary',
            'friendlyName' => 'Viora Authenticator',
            'status' => 'verified',
            'factorType' => 'totp',
        ]];
    }

    public function enrollTotp(string $userId, string $friendlyName = 'Viora Authenticator'): array
    {
        $user = $this->users->findById($userId);
        if (!$user) {
            throw new InvalidArgumentException('User not found.');
        }
        $secret = Totp::generateSecret();
        // Store pending secret but leave disabled until verify
        $this->users->setMfaSecret($userId, $secret, false);
        $uri = Totp::provisioningUri($secret, (string) $user['email']);
        return [
            'id' => 'totp-primary',
            'type' => 'totp',
            'friendlyName' => $friendlyName,
            'totp' => [
                'secret' => $secret,
                'uri' => $uri,
                'qr_code' => 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' . rawurlencode($uri),
            ],
        ];
    }

    public function challengeAndVerify(string $userId, string $code): array
    {
        $user = $this->users->findById($userId);
        if (!$user || empty($user['mfa_secret'])) {
            throw new InvalidArgumentException('No MFA enrollment in progress.');
        }
        if (!Totp::verify((string) $user['mfa_secret'], $code)) {
            throw new InvalidArgumentException('Invalid authenticator code.');
        }
        $this->users->setMfaSecret($userId, (string) $user['mfa_secret'], true);
        return [
            'currentLevel' => 'aal2',
            'nextLevel' => null,
        ];
    }

    public function unenroll(string $userId): void
    {
        $this->users->setMfaSecret($userId, null, false);
    }

    public function getAal(string $userId): array
    {
        $user = $this->users->findById($userId);
        $enabled = $user && (int) ($user['mfa_enabled'] ?? 0) === 1;
        return [
            'currentLevel' => 'aal1',
            'nextLevel' => $enabled ? 'aal2' : null,
            'mfaEnabled' => $enabled,
        ];
    }

    public function verifyLoginCode(string $userId, string $code): bool
    {
        $user = $this->users->findById($userId);
        if (!$user || !(int) ($user['mfa_enabled'] ?? 0) || empty($user['mfa_secret'])) {
            return true;
        }
        return Totp::verify((string) $user['mfa_secret'], $code);
    }
}
