<?php

declare(strict_types=1);

final class NotificationsService
{
    public function __construct(
        private readonly NotificationsRepository $notifications,
        private readonly ProfileRepository $profiles,
        private readonly AuthorizationService $authz,
    ) {
    }

    public function getPrefs(string $userId): array
    {
        return $this->mapPrefs($this->notifications->getPrefs($userId));
    }

    public function updatePrefs(string $userId, array $patch): array
    {
        $fields = [];
        $map = [
            'likes' => 'likes',
            'comments' => 'comments',
            'follows' => 'follows',
            'messages' => 'messages',
            'mentions' => 'mentions',
            'shares' => 'shares',
            'birthdays' => 'birthdays',
            'memories' => 'memories',
            'pushEnabled' => 'push_enabled',
        ];
        foreach ($map as $in => $col) {
            if (array_key_exists($in, $patch)) {
                $fields[$col] = $patch[$in] ? 1 : 0;
            }
        }
        $this->notifications->updatePrefs($userId, $fields);
        return $this->getPrefs($userId);
    }

    public function registerPushToken(string $userId, string $token, string $platform = 'expo'): void
    {
        $token = trim($token);
        if ($token === '') {
            throw new InvalidArgumentException('Token is required.');
        }
        if (!in_array($platform, ['expo', 'web', 'android', 'ios'], true)) {
            throw new InvalidArgumentException('Invalid platform.');
        }
        $this->notifications->registerPushToken($userId, $token, $platform);
    }

    public function removePushToken(string $userId, string $token): void
    {
        $this->notifications->removePushToken($userId, trim($token));
    }

    public function list(string $userId, int $limit, ?string $cursor, bool $grouped = true): array
    {
        $prefs = $this->notifications->getPrefs($userId) ?? [];
        $rows = $this->notifications->list($userId, $grouped ? $limit * 3 : $limit, $cursor);
        $enabled = [
            'like' => (int) ($prefs['likes'] ?? 1) === 1,
            'comment' => (int) ($prefs['comments'] ?? 1) === 1,
            'reply' => (int) ($prefs['comments'] ?? 1) === 1,
            'follow' => (int) ($prefs['follows'] ?? 1) === 1,
            'mention' => (int) ($prefs['mentions'] ?? 1) === 1,
            'share' => (int) ($prefs['shares'] ?? 1) === 1,
            'message' => (int) ($prefs['messages'] ?? 1) === 1,
            'birthday' => (int) ($prefs['birthdays'] ?? 1) === 1,
            'memory' => (int) ($prefs['memories'] ?? 1) === 1,
            'system' => true,
        ];
        $filtered = [];
        foreach ($rows as $row) {
            $type = (string) ($row['type'] ?? '');
            if (!($enabled[$type] ?? true)) {
                continue;
            }
            $actorId = $row['actor_id'] ?? null;
            if ($actorId && $this->authz->isRestricted((string) $actorId, $userId)) {
                continue;
            }
            $filtered[] = $row;
        }

        $actors = $this->profiles->findManyByIds(array_filter(array_column($filtered, 'actor_id')));
        if (!$grouped) {
            return array_slice(array_map(fn ($r) => $this->mapNotification($r, $actors), $filtered), 0, $limit);
        }

        $groups = [];
        foreach ($filtered as $row) {
            $key = $row['group_key'] ?: (($row['type'] ?? '') . ':' . ($row['post_id'] ?? $row['actor_id'] ?? $row['id']));
            if (!isset($groups[$key])) {
                $groups[$key] = $row;
                $groups[$key]['_count'] = 1;
                $groups[$key]['_actors'] = array_filter([$row['actor_id'] ?? null]);
            } else {
                $groups[$key]['_count']++;
                if (!empty($row['actor_id'])) {
                    $groups[$key]['_actors'][] = $row['actor_id'];
                }
            }
            if (count($groups) >= $limit) {
                break;
            }
        }
        $out = [];
        foreach ($groups as $row) {
            $mapped = $this->mapNotification($row, $actors);
            $mapped['groupCount'] = (int) ($row['_count'] ?? 1);
            $actorIds = array_values(array_unique($row['_actors'] ?? []));
            $mapped['groupActors'] = array_values(array_filter(array_map(
                static fn ($id) => Mappers::profile($actors[(string) $id] ?? null),
                $actorIds
            )));
            $out[] = $mapped;
        }
        return $out;
    }

    public function markRead(string $notificationId, string $userId): void
    {
        $this->notifications->markRead($notificationId, $userId);
    }

    public function markAllRead(string $userId): void
    {
        $this->notifications->markAllRead($userId);
    }

    public function unreadCount(string $userId): int
    {
        return $this->notifications->unreadCount($userId);
    }

    /** Used by other services (messages, etc.) */
    public function createForUser(string $userId, array $input): void
    {
        $prefs = $this->notifications->getPrefs($userId);
        $type = (string) ($input['type'] ?? 'system');
        $prefMap = [
            'like' => 'likes',
            'comment' => 'comments',
            'reply' => 'comments',
            'follow' => 'follows',
            'mention' => 'mentions',
            'share' => 'shares',
            'message' => 'messages',
            'birthday' => 'birthdays',
            'memory' => 'memories',
        ];
        if (isset($prefMap[$type]) && $prefs && (int) ($prefs[$prefMap[$type]] ?? 1) !== 1) {
            return;
        }
        $groupKey = isset($input['groupKey']) ? (string) $input['groupKey'] : null;
        if ($groupKey && $this->notifications->findByGroupKey($userId, $groupKey)) {
            // still insert for timeline; skip only for birthday/memory style one-shot
            if (str_starts_with($groupKey, 'birthday:') || str_starts_with($groupKey, 'memory:')) {
                return;
            }
        }
        $this->notifications->create([
            'id' => viora_uuid_v4(),
            'user_id' => $userId,
            'actor_id' => $input['actorId'] ?? null,
            'type' => $type,
            'post_id' => $input['postId'] ?? null,
            'comment_id' => $input['commentId'] ?? null,
            'conversation_id' => $input['conversationId'] ?? null,
            'body' => $input['body'] ?? null,
            'group_key' => $groupKey,
            'is_read' => 0,
        ]);
    }

    public function notifyBirthdays(string $viewerId, array $profiles): int
    {
        $count = 0;
        $day = gmdate('Y-m-d');
        foreach ($profiles as $p) {
            $id = is_array($p) ? (string) ($p['id'] ?? '') : '';
            if ($id === '' || $id === $viewerId) {
                continue;
            }
            $before = $this->notifications->findByGroupKey($viewerId, 'birthday:' . $id . ':' . $day);
            $this->createForUser($viewerId, [
                'actorId' => $id,
                'type' => 'birthday',
                'body' => 'Birthday today',
                'groupKey' => 'birthday:' . $id . ':' . $day,
            ]);
            if (!$before) {
                $count++;
            }
        }
        return $count;
    }

    public function notifyMemories(string $userId, array $memoryPostIds): int
    {
        if ($memoryPostIds === []) {
            return 0;
        }
        $key = 'memory:' . gmdate('Y-m-d');
        if ($this->notifications->findByGroupKey($userId, $key)) {
            return 0;
        }
        $this->createForUser($userId, [
            'type' => 'memory',
            'postId' => (string) $memoryPostIds[0],
            'body' => 'On this day',
            'groupKey' => $key,
        ]);
        return 1;
    }

    private function mapPrefs(?array $row): array
    {
        return [
            'userId' => $row['user_id'] ?? null,
            'likes' => (bool) ($row['likes'] ?? true),
            'comments' => (bool) ($row['comments'] ?? true),
            'follows' => (bool) ($row['follows'] ?? true),
            'messages' => (bool) ($row['messages'] ?? true),
            'mentions' => (bool) ($row['mentions'] ?? true),
            'shares' => (bool) ($row['shares'] ?? true),
            'birthdays' => (bool) ($row['birthdays'] ?? true),
            'memories' => (bool) ($row['memories'] ?? true),
            'pushEnabled' => (bool) ($row['push_enabled'] ?? true),
            'updatedAt' => Mappers::iso($row['updated_at'] ?? null),
        ];
    }

    /** @param array<string, array> $actors */
    private function mapNotification(array $row, array $actors): array
    {
        return [
            'id' => $row['id'],
            'userId' => $row['user_id'],
            'actorId' => $row['actor_id'] ?? null,
            'type' => $row['type'],
            'postId' => $row['post_id'] ?? null,
            'commentId' => $row['comment_id'] ?? null,
            'conversationId' => $row['conversation_id'] ?? null,
            'body' => $row['body'] ?? null,
            'isRead' => (bool) ($row['is_read'] ?? false),
            'groupKey' => $row['group_key'] ?? null,
            'createdAt' => Mappers::iso($row['created_at'] ?? null),
            'actor' => isset($row['actor_id']) ? Mappers::profile($actors[(string) $row['actor_id']] ?? null) : null,
        ];
    }
}
