<?php

declare(strict_types=1);

/**
 * @param array<int, array{0:string,1:string,2:callable}> $routes
 */
function viora_dispatch(array $routes, string $method, string $path): void
{
    $path = '/' . trim($path, '/');
    if ($path !== '/') {
        $path = rtrim($path, '/');
    }

    foreach ($routes as [$routeMethod, $routePath, $handler]) {
        $routePathNorm = '/' . trim($routePath, '/');
        if ($routePathNorm !== '/') {
            $routePathNorm = rtrim($routePathNorm, '/');
        }
        if (strcasecmp($routeMethod, $method) !== 0) {
            continue;
        }

        $params = viora_match_route($routePathNorm, $path);
        if ($params === null) {
            continue;
        }
        $handler($params);
        return;
    }

    viora_json_error('Not found.', 404);
}

/**
 * @return array<string, string>|null
 */
function viora_match_route(string $pattern, string $path): ?array
{
    if ($pattern === $path) {
        return [];
    }
    $patternParts = explode('/', trim($pattern, '/'));
    $pathParts = explode('/', trim($path, '/'));
    if (count($patternParts) !== count($pathParts)) {
        return null;
    }
    $params = [];
    foreach ($patternParts as $i => $part) {
        if (preg_match('/^\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/', $part, $m)) {
            $params[$m[1]] = urldecode($pathParts[$i]);
            continue;
        }
        if ($part !== $pathParts[$i]) {
            return null;
        }
    }
    return $params;
}

function viora_query_int(string $key, int $default, int $min = 1, int $max = 50): int
{
    $raw = $_GET[$key] ?? null;
    if ($raw === null || $raw === '') {
        return $default;
    }
    $n = (int) $raw;
    return max($min, min($max, $n));
}

function viora_query_string(string $key, ?string $default = null): ?string
{
    $raw = $_GET[$key] ?? null;
    if ($raw === null || $raw === '') {
        return $default;
    }
    return (string) $raw;
}
