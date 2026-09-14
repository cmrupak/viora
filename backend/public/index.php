<?php

declare(strict_types=1);

header('X-Content-Type-Options: nosniff');

try {
    /** @var array{app: array, authController: AuthController, authMiddleware: AuthMiddleware} $container */
    $container = require dirname(__DIR__) . '/bootstrap.php';
    (new CorsMiddleware($container['app']))->handle();

    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $scriptName = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? ''));
    if ($scriptName !== '/' && str_starts_with($uri, $scriptName)) {
        $uri = substr($uri, strlen($scriptName)) ?: '/';
    }
    if (str_contains($uri, '/index.php')) {
        $uri = substr($uri, strpos($uri, '/index.php') + strlen('/index.php')) ?: '/';
    }

    /** @var array<int, array{0:string,1:string,2:callable}> $routes */
    $routes = require dirname(__DIR__) . '/routes/api.php';
    viora_dispatch($routes, $method, $uri);
} catch (AuthException $e) {
    viora_json_error($e->getMessage(), $e->status());
} catch (InvalidArgumentException $e) {
    viora_json_error($e->getMessage(), 400);
} catch (Throwable $e) {
    $debug = filter_var(viora_env('APP_DEBUG', 'false'), FILTER_VALIDATE_BOOLEAN);
    viora_json_error(
        $debug ? $e->getMessage() : 'Server error.',
        500,
        $debug ? ['exception' => $e::class, 'file' => $e->getFile(), 'line' => $e->getLine()] : []
    );
}
