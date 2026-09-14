<?php

declare(strict_types=1);

final class NotificationsController
{
    public function __construct(private readonly NotificationsService $notifications)
    {
    }

    public function getPrefs(array $auth): void
    {
        viora_json_response(['prefs' => $this->notifications->getPrefs((string) $auth['sub'])]);
    }

    public function updatePrefs(array $auth): void
    {
        viora_json_response(['prefs' => $this->notifications->updatePrefs((string) $auth['sub'], viora_read_json_body())]);
    }

    public function registerToken(array $auth): void
    {
        $body = viora_read_json_body();
        $this->notifications->registerPushToken(
            (string) $auth['sub'],
            (string) ($body['token'] ?? ''),
            (string) ($body['platform'] ?? 'expo')
        );
        viora_json_response(['ok' => true]);
    }

    public function removeToken(array $auth): void
    {
        $body = viora_read_json_body();
        $this->notifications->removePushToken((string) $auth['sub'], (string) ($body['token'] ?? ''));
        viora_json_response(['ok' => true]);
    }

    public function list(array $auth): void
    {
        $grouped = filter_var(viora_query_string('grouped', 'true'), FILTER_VALIDATE_BOOLEAN);
        viora_json_response([
            'notifications' => $this->notifications->list(
                (string) $auth['sub'],
                viora_query_int('limit', 30, 1, 80),
                viora_query_string('cursor'),
                $grouped
            ),
        ]);
    }

    public function markRead(array $auth, array $params): void
    {
        $this->notifications->markRead($params['notificationId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function markAllRead(array $auth): void
    {
        $this->notifications->markAllRead((string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function unreadCount(array $auth): void
    {
        viora_json_response(['count' => $this->notifications->unreadCount((string) $auth['sub'])]);
    }
}
