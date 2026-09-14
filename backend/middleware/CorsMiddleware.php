<?php

declare(strict_types=1);

final class CorsMiddleware
{
    public function __construct(private readonly array $appConfig)
    {
    }

    public function handle(): void
    {
        $origins = $this->appConfig['cors_origins'] ?? ['*'];
        $requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allow = '*';
        if (!in_array('*', $origins, true)) {
            $allow = in_array($requestOrigin, $origins, true) ? $requestOrigin : ($origins[0] ?? '');
        } elseif ($requestOrigin !== '') {
            $allow = $requestOrigin;
        }

        header('Access-Control-Allow-Origin: ' . $allow);
        header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Max-Age: 86400');
        if ($allow !== '*') {
            header('Vary: Origin');
        }

        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
}
