<?php

declare(strict_types=1);

final class MessagesController
{
    public function __construct(private readonly MessagesService $messages)
    {
    }

    public function listConversations(array $auth): void
    {
        $requestsOnly = filter_var(viora_query_string('requestsOnly', 'false'), FILTER_VALIDATE_BOOLEAN);
        viora_json_response(['conversations' => $this->messages->listConversations((string) $auth['sub'], $requestsOnly)]);
    }

    public function listRequests(array $auth): void
    {
        viora_json_response(['conversations' => $this->messages->listConversations((string) $auth['sub'], true)]);
    }

    public function createDm(array $auth): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'conversation' => $this->messages->getOrCreateDm((string) $auth['sub'], (string) ($body['userId'] ?? '')),
        ], 201);
    }

    public function createGroup(array $auth): void
    {
        $body = viora_read_json_body();
        $memberIds = is_array($body['memberIds'] ?? null) ? $body['memberIds'] : [];
        viora_json_response([
            'conversation' => $this->messages->createGroup((string) $auth['sub'], (string) ($body['title'] ?? ''), $memberIds),
        ], 201);
    }

    public function accept(array $auth, array $params): void
    {
        viora_json_response([
            'conversation' => $this->messages->acceptRequest($params['conversationId'] ?? '', (string) $auth['sub']),
        ]);
    }

    public function decline(array $auth, array $params): void
    {
        $this->messages->declineRequest($params['conversationId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function listMessages(array $auth, array $params): void
    {
        viora_json_response([
            'messages' => $this->messages->listMessages(
                $params['conversationId'] ?? '',
                (string) $auth['sub'],
                viora_query_int('limit', 40, 1, 100),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function send(array $auth, array $params): void
    {
        viora_json_response([
            'message' => $this->messages->send($params['conversationId'] ?? '', (string) $auth['sub'], viora_read_json_body()),
        ], 201);
    }

    public function markRead(array $auth, array $params): void
    {
        $this->messages->markRead($params['conversationId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function prefs(array $auth, array $params): void
    {
        $this->messages->setMemberPrefs($params['conversationId'] ?? '', (string) $auth['sub'], viora_read_json_body());
        viora_json_response(['ok' => true]);
    }

    public function react(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $reaction = array_key_exists('reaction', $body) ? ($body['reaction'] !== null ? (string) $body['reaction'] : null) : null;
        $this->messages->setReaction($params['messageId'] ?? '', (string) $auth['sub'], $reaction);
        viora_json_response(['ok' => true]);
    }

    public function deleteMessage(array $auth, array $params): void
    {
        $this->messages->softDelete($params['messageId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function search(array $auth): void
    {
        $q = viora_query_string('q', '') ?? '';
        viora_json_response([
            'results' => $this->messages->search((string) $auth['sub'], $q, viora_query_int('limit', 30)),
        ]);
    }

    public function heartbeat(array $auth): void
    {
        $body = viora_read_json_body();
        $online = array_key_exists('online', $body) ? (bool) $body['online'] : true;
        $this->messages->heartbeat((string) $auth['sub'], $online);
        viora_json_response(['ok' => true]);
    }

    public function presence(array $auth): void
    {
        $body = viora_read_json_body();
        $ids = is_array($body['userIds'] ?? null) ? $body['userIds'] : [];
        // also support GET ?ids=a,b
        if ($ids === [] && viora_query_string('ids')) {
            $ids = array_filter(explode(',', (string) viora_query_string('ids')));
        }
        viora_json_response(['presence' => $this->messages->getPresence($ids)]);
    }
}
