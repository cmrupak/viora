<?php

declare(strict_types=1);

final class AuthMiddleware
{
    public function __construct(private readonly JwtService $jwt)
    {
    }

    /** @return array<string, mixed> */
    public function requireUser(): array
    {
        $token = viora_bearer_token();
        if (!$token) {
            throw new AuthException('Missing bearer token.', 401);
        }
        try {
            $payload = $this->jwt->decode($token);
        } catch (Throwable $e) {
            throw new AuthException($e->getMessage(), 401);
        }
        if (($payload['typ'] ?? '') !== 'access') {
            throw new AuthException('Invalid access token.', 401);
        }
        if (empty($payload['sub'])) {
            throw new AuthException('Invalid access token subject.', 401);
        }
        return $payload;
    }

    /** @return array<string, mixed>|null */
    public function optionalUser(): ?array
    {
        $token = viora_bearer_token();
        if (!$token) {
            return null;
        }
        try {
            return $this->requireUser();
        } catch (AuthException) {
            return null;
        }
    }
}

final class AuthException extends RuntimeException
{
    public function __construct(string $message, private readonly int $status = 401)
    {
        parent::__construct($message, $status);
    }

    public function status(): int
    {
        return $this->status;
    }
}
