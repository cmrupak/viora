<?php

declare(strict_types=1);

return [
    'host' => viora_env('SMTP_HOST', 'smtp.gmail.com'),
    'port' => (int) (viora_env('SMTP_PORT', '587') ?? '587'),
    'user' => viora_env('SMTP_USER', ''),
    'pass' => viora_env('SMTP_PASS', ''),
    'from' => viora_env('SMTP_FROM', '') ?: viora_env('SMTP_USER', ''),
    'otp_ttl_seconds' => 600,
    'otp_max_attempts' => 5,
];
