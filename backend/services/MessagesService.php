<?php

declare(strict_types=1);

final class MessagesService
{
    public function __construct(
        private readonly MessagesRepository $messages,
        private readonly ProfileRepository $profiles,
        private readonly AuthorizationService $authz,
        private readonly ?NotificationsService $notifications = null,
    ) {
    }

    public function listConversations(string $userId, bool $requestsOnly = false): array
    {
        $rows = $this->messages->listConversations($userId, $requestsOnly);
        return array_map(fn ($r) => $this->mapConversation($r, $userId), $rows);
    }

    public function getOrCreateDm(string $currentUserId, string $otherUserId): array
    {
        if ($currentUserId === $otherUserId) {
            throw new InvalidArgumentException('Cannot message yourself.');
        }
        if ($this->authz->isBlockedEitherWay($currentUserId, $otherUserId)) {
            throw new InvalidArgumentException('Unable to message this user.');
        }
        $existing = $this->messages->findDmBetween($currentUserId, $otherUserId);
        if ($existing) {
            return $this->mapConversation($existing, $currentUserId);
        }

        $isRequest = !($this->authz->isFollowing($otherUserId, $currentUserId) || $this->authz->areFriends($currentUserId, $otherUserId));
        $id = viora_uuid_v4();
        Database::begin();
        try {
            $this->messages->createConversation($id, false, null, $isRequest);
            $this->messages->addMember(viora_uuid_v4(), $id, $currentUserId);
            $this->messages->addMember(viora_uuid_v4(), $id, $otherUserId);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        $row = $this->messages->findConversation($id);
        return $this->mapConversation($row ?? ['id' => $id, 'is_group' => 0, 'is_request' => $isRequest ? 1 : 0], $currentUserId);
    }

    public function createGroup(string $creatorId, string $title, array $memberIds): array
    {
        $title = trim($title);
        if ($title === '') {
            throw new InvalidArgumentException('Group title is required.');
        }
        $members = array_values(array_unique(array_merge([$creatorId], array_map('strval', $memberIds))));
        $id = viora_uuid_v4();
        Database::begin();
        try {
            $this->messages->createConversation($id, true, $title, false);
            foreach ($members as $uid) {
                $this->messages->addMember(viora_uuid_v4(), $id, $uid);
            }
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        return $this->mapConversation($this->messages->findConversation($id) ?? ['id' => $id, 'is_group' => 1, 'title' => $title], $creatorId);
    }

    public function acceptRequest(string $conversationId, string $userId): array
    {
        $this->requireMember($conversationId, $userId);
        $this->messages->setRequest($conversationId, false);
        return $this->mapConversation($this->messages->findConversation($conversationId) ?? ['id' => $conversationId], $userId);
    }

    public function declineRequest(string $conversationId, string $userId): void
    {
        $this->requireMember($conversationId, $userId);
        $this->messages->removeMember($conversationId, $userId);
    }

    public function listMessages(string $conversationId, string $userId, int $limit, ?string $cursor): array
    {
        $this->requireMember($conversationId, $userId);
        $rows = $this->messages->listMessages($conversationId, $limit, $cursor);
        return $this->hydrateMessages($rows, $userId);
    }

    public function send(string $conversationId, string $senderId, array $input): array
    {
        $this->requireMember($conversationId, $senderId);
        $body = trim((string) ($input['body'] ?? ''));
        $attachments = is_array($input['attachments'] ?? null) ? $input['attachments'] : [];
        if ($body === '' && $attachments === []) {
            throw new InvalidArgumentException('Message body or attachment is required.');
        }
        $expiresAt = null;
        if (!empty($input['expiresInMinutes'])) {
            $expiresAt = gmdate('Y-m-d H:i:s', time() + ((int) $input['expiresInMinutes'] * 60));
        }
        $id = viora_uuid_v4();
        Database::begin();
        try {
            $this->messages->insertMessage([
                'id' => $id,
                'conversation_id' => $conversationId,
                'sender_id' => $senderId,
                'body' => $body,
                'reply_to_id' => isset($input['replyToId']) ? (string) $input['replyToId'] : null,
                'story_id' => isset($input['storyId']) ? (string) $input['storyId'] : null,
                'expires_at' => $expiresAt,
            ]);
            foreach ($attachments as $att) {
                if (!is_array($att) || empty($att['url'])) {
                    continue;
                }
                $mediaType = (string) ($att['mediaType'] ?? 'image');
                if (!in_array($mediaType, ['image', 'video', 'audio', 'file'], true)) {
                    $mediaType = 'file';
                }
                $this->messages->insertAttachment(
                    viora_uuid_v4(),
                    $id,
                    (string) $att['url'],
                    $mediaType,
                    isset($att['fileName']) ? (string) $att['fileName'] : null
                );
            }
            $this->messages->touchConversation($conversationId);
            $this->messages->setRequest($conversationId, false);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }

        if ($this->notifications) {
            foreach ($this->messages->listMembers($conversationId) as $member) {
                $uid = (string) $member['user_id'];
                if ($uid === $senderId) {
                    continue;
                }
                $this->notifications->createForUser($uid, [
                    'actorId' => $senderId,
                    'type' => 'message',
                    'conversationId' => $conversationId,
                    'body' => $body !== '' ? mb_substr($body, 0, 120) : 'Sent an attachment',
                    'groupKey' => 'message:' . $conversationId,
                ]);
            }
        }

        $row = $this->messages->findMessage($id);
        return $this->hydrateMessages([$row ?? ['id' => $id, 'conversation_id' => $conversationId, 'sender_id' => $senderId, 'body' => $body]], $senderId)[0];
    }

    public function markRead(string $conversationId, string $userId): void
    {
        $this->requireMember($conversationId, $userId);
        $this->messages->markRead($conversationId, $userId);
    }

    public function setMemberPrefs(string $conversationId, string $userId, array $input): void
    {
        $this->requireMember($conversationId, $userId);
        $fields = [];
        if (array_key_exists('muted', $input)) {
            $fields['muted'] = $input['muted'] ? 1 : 0;
        }
        if (array_key_exists('pinned', $input)) {
            $fields['pinned_at'] = $input['pinned'] ? gmdate('Y-m-d H:i:s') : null;
        }
        if (array_key_exists('nickname', $input)) {
            $fields['nickname'] = $input['nickname'] !== null ? (string) $input['nickname'] : null;
        }
        $this->messages->setMemberPrefs($conversationId, $userId, $fields);
    }

    public function setReaction(string $messageId, string $userId, ?string $reaction): void
    {
        $msg = $this->messages->findMessage($messageId);
        if (!$msg) {
            throw new InvalidArgumentException('Message not found.');
        }
        $this->requireMember((string) $msg['conversation_id'], $userId);
        if ($reaction !== null && !in_array($reaction, ['love', 'haha', 'wow', 'sad', 'angry', 'like'], true)) {
            throw new InvalidArgumentException('Invalid reaction.');
        }
        $this->messages->setReaction($messageId, $userId, $reaction);
    }

    public function softDelete(string $messageId, string $senderId): void
    {
        $msg = $this->messages->findMessage($messageId);
        if (!$msg || $msg['sender_id'] !== $senderId) {
            throw new InvalidArgumentException('Message not found.');
        }
        $this->messages->softDeleteMessage($messageId);
    }

    public function search(string $userId, string $query, int $limit = 30): array
    {
        $query = trim($query);
        if (mb_strlen($query) < 2) {
            throw new InvalidArgumentException('Search query must be at least 2 characters.');
        }
        $limit = max(1, min(50, $limit));
        $rows = $this->messages->searchMessages($userId, $query, $limit);
        $hydrated = $this->hydrateMessages($rows, $userId);
        $out = [];
        foreach ($hydrated as $i => $msg) {
            $out[] = [
                'message' => $msg,
                'conversationId' => $rows[$i]['conversation_id'] ?? $msg['conversationId'],
            ];
        }
        return $out;
    }

    public function heartbeat(string $userId, bool $online = true): void
    {
        $this->messages->heartbeat($userId, $online);
    }

    public function getPresence(array $userIds): array
    {
        $rows = $this->messages->getPresence(array_values(array_unique(array_map('strval', $userIds))));
        return array_map(static fn ($r) => [
            'userId' => $r['user_id'],
            'lastSeenAt' => Mappers::iso($r['last_seen_at'] ?? null),
            'isOnline' => (bool) ($r['is_online'] ?? false),
        ], $rows);
    }

    private function requireMember(string $conversationId, string $userId): void
    {
        if (!$this->authz->isConversationMember($conversationId, $userId)) {
            throw new InvalidArgumentException('Conversation not found.');
        }
    }

    private function mapConversation(array $row, string $viewerId): array
    {
        $members = $this->messages->listMembers((string) $row['id']);
        $mappedMembers = [];
        foreach ($members as $m) {
            $mappedMembers[] = [
                'id' => $m['id'],
                'conversationId' => $m['conversation_id'],
                'userId' => $m['user_id'],
                'lastReadAt' => Mappers::iso($m['last_read_at'] ?? null),
                'muted' => (bool) ($m['muted'] ?? false),
                'pinnedAt' => Mappers::iso($m['pinned_at'] ?? null),
                'nickname' => $m['nickname'] ?? null,
                'user' => Mappers::profile([
                    'id' => $m['user_id'],
                    'username' => $m['username'],
                    'display_name' => $m['display_name'],
                    'avatar_url' => $m['avatar_url'],
                    'bio' => $m['bio'] ?? null,
                    'follower_count' => $m['follower_count'] ?? 0,
                    'following_count' => $m['following_count'] ?? 0,
                    'is_private' => $m['is_private'] ?? 0,
                    'is_deactivated' => $m['is_deactivated'] ?? 0,
                    'created_at' => $m['profile_created_at'] ?? null,
                ]),
            ];
        }
        return [
            'id' => $row['id'],
            'isGroup' => (bool) ($row['is_group'] ?? false),
            'title' => $row['title'] ?? null,
            'isRequest' => (bool) ($row['is_request'] ?? false),
            'lastMessageAt' => Mappers::iso($row['last_message_at'] ?? null),
            'createdAt' => Mappers::iso($row['created_at'] ?? null),
            'updatedAt' => Mappers::iso($row['updated_at'] ?? null),
            'members' => $mappedMembers,
            'muted' => (bool) ($row['muted'] ?? false),
            'pinnedAt' => Mappers::iso($row['pinned_at'] ?? null),
            'nickname' => $row['nickname'] ?? null,
        ];
    }

    /** @param list<array> $rows */
    private function hydrateMessages(array $rows, string $viewerId): array
    {
        if ($rows === []) {
            return [];
        }
        $ids = array_map(static fn ($r) => (string) $r['id'], $rows);
        $authors = $this->profiles->findManyByIds(array_column($rows, 'sender_id'));
        $atts = $this->messages->attachmentsForMessages($ids);
        $reactions = $this->messages->reactionsForMessages($ids);
        $out = [];
        foreach ($rows as $row) {
            $id = (string) $row['id'];
            $deleted = !empty($row['deleted_at']);
            $myReaction = null;
            $reactionList = [];
            foreach ($reactions[$id] ?? [] as $re) {
                $reactionList[] = [
                    'id' => $re['id'],
                    'messageId' => $re['message_id'],
                    'userId' => $re['user_id'],
                    'reaction' => $re['reaction'],
                ];
                if ((string) $re['user_id'] === $viewerId) {
                    $myReaction = $re['reaction'];
                }
            }
            $out[] = [
                'id' => $id,
                'conversationId' => $row['conversation_id'],
                'senderId' => $row['sender_id'],
                'body' => $deleted ? '' : ($row['body'] ?? ''),
                'replyToId' => $row['reply_to_id'] ?? null,
                'storyId' => $row['story_id'] ?? null,
                'expiresAt' => Mappers::iso($row['expires_at'] ?? null),
                'deletedAt' => Mappers::iso($row['deleted_at'] ?? null),
                'createdAt' => Mappers::iso($row['created_at'] ?? null),
                'sender' => Mappers::profile($authors[(string) $row['sender_id']] ?? null),
                'attachments' => array_map(static fn ($a) => [
                    'id' => $a['id'],
                    'messageId' => $a['message_id'],
                    'url' => $a['url'],
                    'mediaType' => $a['media_type'],
                    'fileName' => $a['file_name'] ?? null,
                ], $atts[$id] ?? []),
                'reactions' => $reactionList,
                'myReaction' => $myReaction,
            ];
        }
        return $out;
    }
}
