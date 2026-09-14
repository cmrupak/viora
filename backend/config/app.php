<?php

declare(strict_types=1);

return [
    'name' => 'Viora API',
    'env' => viora_env('APP_ENV', 'local'),
    'debug' => filter_var(viora_env('APP_DEBUG', 'true'), FILTER_VALIDATE_BOOLEAN),
    'url' => rtrim(viora_env('APP_URL', 'http://viora.test/backend/public'), '/'),
    'cors_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', viora_env('CORS_ORIGINS', '*') ?? '*')
    ))),
];
