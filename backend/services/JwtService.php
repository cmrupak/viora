<?php

declare(strict_types=1);

final class JwtService
{
    public function __construct(private readonly array $config)
    {
    }

    public function issueAccessToken(string $userId, string $email): string
    {
        $now = time();
        $payload = [
            'iss' => $this->config['issuer'],
            'sub' => $userId,
            'email' => $email,
            'iat' => $now,
            'exp' => $now + (int) $this->config['access_ttl'],
            'typ' => 'access',
        ];
        return $this->encode($payload);
    }

    public function decode(string $token): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new RuntimeException('Invalid token.');
        }
        [$h64, $p64, $s64] = $parts;
        $header = json_decode($this->b64urlDecode($h64), true);
        $payload = json_decode($this->b64urlDecode($p64), true);
        if (!is_array($header) || !is_array($payload)) {
            throw new RuntimeException('Invalid token payload.');
        }
        if (($header['alg'] ?? '') !== 'HS256') {
            throw new RuntimeException('Unsupported token algorithm.');
        }
        $expected = $this->sign("{$h64}.{$p64}");
        if (!hash_equals($expected, $s64)) {
            throw new RuntimeException('Invalid token signature.');
        }
        if (($payload['exp'] ?? 0) < time()) {
            throw new RuntimeException('Token expired.');
        }
        if (($payload['iss'] ?? '') !== $this->config['issuer']) {
            throw new RuntimeException('Invalid token issuer.');
        }
        return $payload;
    }

    public function accessTtl(): int
    {
        return (int) $this->config['access_ttl'];
    }

    public function refreshTtl(): int
    {
        return (int) $this->config['refresh_ttl'];
    }

    private function encode(array $payload): string
    {
        $header = ['typ' => 'JWT', 'alg' => 'HS256'];
        $h64 = $this->b64urlEncode(json_encode($header, JSON_THROW_ON_ERROR));
        $p64 = $this->b64urlEncode(json_encode($payload, JSON_THROW_ON_ERROR));
        $sig = $this->sign("{$h64}.{$p64}");
        return "{$h64}.{$p64}.{$sig}";
    }

    private function sign(string $data): string
    {
        return $this->b64urlEncode(hash_hmac('sha256', $data, (string) $this->config['secret'], true));
    }

    private function b64urlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private function b64urlDecode(string $data): string
    {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $data .= str_repeat('=', 4 - $remainder);
        }
        $decoded = base64_decode(strtr($data, '-_', '+/'), true);
        if ($decoded === false) {
            throw new RuntimeException('Invalid token encoding.');
        }
        return $decoded;
    }
}
