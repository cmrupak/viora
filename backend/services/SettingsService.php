<?php

declare(strict_types=1);

final class SettingsService
{
    public function __construct(
        private readonly SettingsRepository $settings,
        private readonly ProfileRepository $profiles,
        private readonly UserRepository $users,
        private readonly ?NotificationsService $notifications = null,
    ) {
    }

    public function getSettings(string $userId): array
    {
        return $this->mapSettings($this->settings->getSettings($userId));
    }

    public function updateSettings(string $userId, array $patch): array
    {
        $fields = [];
        if (array_key_exists('language', $patch)) {
            $lang = (string) $patch['language'];
            if (!in_array($lang, ['en', 'es', 'fr', 'de', 'hi', 'pt'], true)) {
                throw new InvalidArgumentException('Invalid language.');
            }
            $fields['language'] = $lang;
        }
        if (array_key_exists('themePreference', $patch)) {
            $theme = (string) $patch['themePreference'];
            if (!in_array($theme, ['system', 'light', 'dark'], true)) {
                throw new InvalidArgumentException('Invalid theme.');
            }
            $fields['theme_preference'] = $theme;
        }
        foreach (['hideSensitive' => 'hide_sensitive', 'loginAlerts' => 'login_alerts', 'reduceMotion' => 'reduce_motion'] as $in => $col) {
            if (array_key_exists($in, $patch)) {
                $fields[$col] = $patch[$in] ? 1 : 0;
            }
        }
        $this->settings->updateSettings($userId, $fields);
        $this->logActivity($userId, 'settings.update', $patch);
        return $this->getSettings($userId);
    }

    public function logActivity(string $userId, string $action, array $metadata = []): void
    {
        try {
            $this->settings->logActivity(
                viora_uuid_v4(),
                $userId,
                $action,
                json_encode($metadata, JSON_THROW_ON_ERROR)
            );
        } catch (Throwable) {
            // non-fatal
        }
    }

    public function listActivity(string $userId, int $limit = 40): array
    {
        $limit = max(1, min(100, $limit));
        return array_map(static function ($r) {
            $meta = $r['metadata'] ?? [];
            if (is_string($meta)) {
                $decoded = json_decode($meta, true);
                $meta = is_array($decoded) ? $decoded : [];
            }
            return [
                'id' => $r['id'],
                'userId' => $r['user_id'],
                'action' => $r['action'],
                'metadata' => $meta,
                'createdAt' => Mappers::iso($r['created_at'] ?? null),
            ];
        }, $this->settings->listActivity($userId, $limit));
    }

    public function recordLoginEvent(string $userId, array $input = []): array
    {
        $id = viora_uuid_v4();
        $ip = isset($input['ipHint']) ? (string) $input['ipHint'] : $this->clientIp();
        $ua = isset($input['userAgent']) ? (string) $input['userAgent'] : ($_SERVER['HTTP_USER_AGENT'] ?? null);
        $device = isset($input['deviceLabel']) ? (string) $input['deviceLabel'] : null;
        $this->settings->recordLoginEvent($id, $userId, $ip, $ua, $device);

        $settings = $this->settings->getSettings($userId);
        if ($settings && (int) ($settings['login_alerts'] ?? 1) === 1 && $this->notifications) {
            $this->notifications->createForUser($userId, [
                'type' => 'system',
                'body' => 'New login' . ($device ? " on {$device}" : ''),
                'groupKey' => 'login:' . $id,
            ]);
        }

        return [
            'id' => $id,
            'userId' => $userId,
            'ipHint' => $ip,
            'userAgent' => $ua,
            'deviceLabel' => $device,
            'createdAt' => Mappers::iso(gmdate('Y-m-d H:i:s')),
        ];
    }

    public function listLoginEvents(string $userId, int $limit = 30): array
    {
        $limit = max(1, min(100, $limit));
        return array_map(static fn ($r) => [
            'id' => $r['id'],
            'userId' => $r['user_id'],
            'ipHint' => $r['ip_hint'] ?? null,
            'userAgent' => $r['user_agent'] ?? null,
            'deviceLabel' => $r['device_label'] ?? null,
            'createdAt' => Mappers::iso($r['created_at'] ?? null),
        ], $this->settings->listLoginEvents($userId, $limit));
    }

    public function requestDataExport(string $userId): array
    {
        $id = viora_uuid_v4();
        $this->settings->createExportRequest($id, $userId);
        $this->logActivity($userId, 'export.request', ['requestId' => $id]);
        return $this->mapExport($this->settings->findExportRequest($id) ?? [
            'id' => $id,
            'user_id' => $userId,
            'status' => 'pending',
        ]);
    }

    public function listDataExports(string $userId, int $limit = 10): array
    {
        return array_map(fn ($r) => $this->mapExport($r), $this->settings->listExportRequests($userId, max(1, min(50, $limit))));
    }

    public function runExport(string $userId, string $requestId): array
    {
        $req = $this->settings->findExportRequest($requestId);
        if (!$req || $req['user_id'] !== $userId) {
            throw new InvalidArgumentException('Export request not found.');
        }
        $this->settings->updateExportRequest($requestId, ['status' => 'processing', 'error_message' => null]);
        try {
            $user = $this->users->findById($userId);
            $profile = $this->profiles->findByUserId($userId);
            $settings = $this->settings->getSettings($userId);
            $payload = [
                'exportedAt' => gmdate('c'),
                'user' => $user ? ['id' => $user['id'], 'email' => $user['email']] : null,
                'profile' => Mappers::profile($profile),
                'settings' => $this->mapSettings($settings),
                'loginEvents' => $this->listLoginEvents($userId, 100),
                'activity' => $this->listActivity($userId, 100),
            ];
            $dir = dirname(__DIR__) . '/storage/uploads/account-exports/' . $userId;
            if (!is_dir($dir)) {
                mkdir($dir, 0775, true);
            }
            $relPath = "account-exports/{$userId}/{$requestId}.json";
            $abs = dirname(__DIR__) . '/storage/uploads/' . $relPath;
            file_put_contents($abs, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
            $this->settings->updateExportRequest($requestId, [
                'status' => 'ready',
                'download_path' => $relPath,
                'error_message' => null,
            ]);
            $base = rtrim((string) (viora_env('APP_URL', 'http://viora.test/backend/public') ?? ''), '/');
            return [
                'ok' => true,
                'message' => 'Export ready.',
                'downloadPath' => $relPath,
                'downloadUrl' => $base . '/api/v1/settings/exports/download?requestId=' . urlencode($requestId),
            ];
        } catch (Throwable $e) {
            $this->settings->updateExportRequest($requestId, [
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    public function exportDownloadPath(string $userId, string $requestId): string
    {
        $req = $this->settings->findExportRequest($requestId);
        if (!$req || $req['user_id'] !== $userId || ($req['status'] ?? '') !== 'ready' || empty($req['download_path'])) {
            throw new InvalidArgumentException('Export not ready.');
        }
        $abs = dirname(__DIR__) . '/storage/uploads/' . ltrim((string) $req['download_path'], '/');
        if (!is_file($abs)) {
            throw new InvalidArgumentException('Export file missing.');
        }
        return $abs;
    }

    public function requestHardDelete(string $userId): array
    {
        $id = viora_uuid_v4();
        $this->settings->createDeletionRequest($id, $userId);
        $this->logActivity($userId, 'account.delete_request', ['requestId' => $id]);
        return $this->mapDeletion($this->settings->findDeletionRequest($id) ?? [
            'id' => $id,
            'user_id' => $userId,
            'status' => 'pending',
        ]);
    }

    public function listDeletionRequests(string $userId, int $limit = 5): array
    {
        return array_map(fn ($r) => $this->mapDeletion($r), $this->settings->listDeletionRequests($userId, max(1, min(20, $limit))));
    }

    public function runHardDelete(string $userId, string $requestId, string $confirmationPhrase): array
    {
        if ($confirmationPhrase !== 'DELETE') {
            throw new InvalidArgumentException('confirmationPhrase must be DELETE.');
        }
        $req = $this->settings->findDeletionRequest($requestId);
        if (!$req || $req['user_id'] !== $userId) {
            throw new InvalidArgumentException('Deletion request not found.');
        }
        $this->settings->updateDeletionRequest($requestId, ['status' => 'processing', 'error_message' => null]);
        try {
            // Cascade deletes via FK from users → profiles → social graph
            $this->users->deleteById($userId);
            return ['ok' => true, 'message' => 'Account deleted.'];
        } catch (Throwable $e) {
            $this->settings->updateDeletionRequest($requestId, [
                'status' => 'failed',
                'error_message' => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    public function deactivate(string $userId): array
    {
        $this->settings->setDeactivated($userId, true);
        $this->logActivity($userId, 'account.deactivate');
        $profile = Mappers::profile($this->profiles->findByUserId($userId));
        if (!$profile) {
            throw new RuntimeException('Profile not found.');
        }
        return $profile;
    }

    public function reactivate(string $userId): array
    {
        $this->settings->setDeactivated($userId, false);
        $this->logActivity($userId, 'account.reactivate');
        $profile = Mappers::profile($this->profiles->findByUserId($userId));
        if (!$profile) {
            throw new RuntimeException('Profile not found.');
        }
        return $profile;
    }

    private function mapSettings(?array $row): array
    {
        return [
            'userId' => $row['user_id'] ?? null,
            'language' => $row['language'] ?? 'en',
            'hideSensitive' => (bool) ($row['hide_sensitive'] ?? false),
            'loginAlerts' => (bool) ($row['login_alerts'] ?? true),
            'reduceMotion' => (bool) ($row['reduce_motion'] ?? false),
            'themePreference' => $row['theme_preference'] ?? 'system',
            'updatedAt' => Mappers::iso($row['updated_at'] ?? null),
        ];
    }

    private function mapExport(array $row): array
    {
        return [
            'id' => $row['id'],
            'userId' => $row['user_id'],
            'status' => $row['status'],
            'downloadPath' => $row['download_path'] ?? null,
            'errorMessage' => $row['error_message'] ?? null,
            'createdAt' => Mappers::iso($row['created_at'] ?? null),
            'updatedAt' => Mappers::iso($row['updated_at'] ?? null),
        ];
    }

    private function mapDeletion(array $row): array
    {
        return [
            'id' => $row['id'],
            'userId' => $row['user_id'],
            'status' => $row['status'],
            'errorMessage' => $row['error_message'] ?? null,
            'createdAt' => Mappers::iso($row['created_at'] ?? null),
            'updatedAt' => Mappers::iso($row['updated_at'] ?? null),
        ];
    }

    private function clientIp(): ?string
    {
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;
        if (!$ip) {
            return null;
        }
        if (str_contains($ip, ',')) {
            $ip = trim(explode(',', $ip)[0]);
        }
        return substr($ip, 0, 64);
    }
}
