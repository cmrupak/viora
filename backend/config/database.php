<?php

declare(strict_types=1);

return [
    'host' => viora_env('DB_HOST', '127.0.0.1'),
    'port' => (int) (viora_env('DB_PORT', '3306') ?? '3306'),
    'name' => viora_env('DB_NAME', 'viora'),
    'user' => viora_env('DB_USER', 'root'),
    'pass' => viora_env('DB_PASS', '') ?? '',
    'charset' => 'utf8mb4',
];
