<?php

declare(strict_types=1);

return [
    'secret' => viora_env('JWT_SECRET', 'change-me-local-only-viora-jwt-secret'),
    'issuer' => viora_env('JWT_ISSUER', 'viora-api'),
    'access_ttl' => (int) (viora_env('JWT_ACCESS_TTL', '3600') ?? '3600'),
    'refresh_ttl' => (int) (viora_env('JWT_REFRESH_TTL', '2592000') ?? '2592000'), // 30 days
];
