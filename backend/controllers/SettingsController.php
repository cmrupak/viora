<?php

declare(strict_types=1);

final class SettingsController
{
    public function __construct(private readonly SettingsService $settings)
    {
    }

    public function get(array $auth): void
    {
        viora_json_response(['settings' => $this->settings->getSettings((string) $auth['sub'])]);
    }

    public function update(array $auth): void
    {
        viora_json_response([
            'settings' => $this->settings->updateSettings((string) $auth['sub'], viora_read_json_body()),
        ]);
    }

    public function activity(array $auth): void
    {
        viora_json_response([
            'activity' => $this->settings->listActivity((string) $auth['sub'], viora_query_int('limit', 40, 1, 100)),
        ]);
    }

    public function recordLoginEvent(array $auth): void
    {
        viora_json_response([
            'event' => $this->settings->recordLoginEvent((string) $auth['sub'], viora_read_json_body()),
        ]);
    }

    public function loginEvents(array $auth): void
    {
        viora_json_response([
            'events' => $this->settings->listLoginEvents((string) $auth['sub'], viora_query_int('limit', 30, 1, 100)),
        ]);
    }

    public function requestExport(array $auth): void
    {
        viora_json_response([
            'request' => $this->settings->requestDataExport((string) $auth['sub']),
        ]);
    }

    public function listExports(array $auth): void
    {
        viora_json_response([
            'requests' => $this->settings->listDataExports((string) $auth['sub'], viora_query_int('limit', 10, 1, 50)),
        ]);
    }

    public function downloadExport(array $auth): void
    {
        $requestId = viora_query_string('requestId') ?? '';
        $path = $this->settings->exportDownloadPath((string) $auth['sub'], $requestId);
        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="viora-export-' . basename($requestId) . '.json"');
        readfile($path);
    }

    public function requestDeletion(array $auth): void
    {
        viora_json_response([
            'request' => $this->settings->requestHardDelete((string) $auth['sub']),
        ]);
    }

    public function listDeletions(array $auth): void
    {
        viora_json_response([
            'requests' => $this->settings->listDeletionRequests((string) $auth['sub'], viora_query_int('limit', 5, 1, 20)),
        ]);
    }

    public function deactivate(array $auth): void
    {
        viora_json_response(['profile' => $this->settings->deactivate((string) $auth['sub'])]);
    }

    public function reactivate(array $auth): void
    {
        viora_json_response(['profile' => $this->settings->reactivate((string) $auth['sub'])]);
    }

    public function runExport(array $auth): void
    {
        $body = viora_read_json_body();
        $requestId = (string) ($body['requestId'] ?? '');
        if ($requestId === '') {
            throw new InvalidArgumentException('requestId is required.');
        }
        viora_json_response($this->settings->runExport((string) $auth['sub'], $requestId));
    }

    public function runDelete(array $auth): void
    {
        $body = viora_read_json_body();
        $requestId = (string) ($body['requestId'] ?? '');
        $phrase = (string) ($body['confirmationPhrase'] ?? '');
        if ($requestId === '') {
            throw new InvalidArgumentException('requestId is required.');
        }
        viora_json_response($this->settings->runHardDelete((string) $auth['sub'], $requestId, $phrase));
    }
}
