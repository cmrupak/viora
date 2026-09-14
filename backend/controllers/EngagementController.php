<?php

declare(strict_types=1);

final class EngagementController
{
    public function __construct(private readonly EngagementService $engagement)
    {
    }

    public function toggleSave(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $collectionId = isset($body['collectionId']) ? (string) $body['collectionId'] : null;
        viora_json_response(
            $this->engagement->toggleSave($params['postId'] ?? '', (string) $auth['sub'], $collectionId)
        );
    }

    public function listSaved(array $auth): void
    {
        viora_json_response([
            'posts' => $this->engagement->listSaved(
                (string) $auth['sub'],
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function moveSaved(array $auth): void
    {
        $body = viora_read_json_body();
        $collectionId = array_key_exists('collectionId', $body)
            ? ($body['collectionId'] !== null ? (string) $body['collectionId'] : null)
            : null;
        $this->engagement->moveToCollection(
            (string) ($body['postId'] ?? ''),
            (string) $auth['sub'],
            $collectionId
        );
        viora_json_response(['ok' => true]);
    }

    public function listCollections(array $auth): void
    {
        viora_json_response([
            'collections' => $this->engagement->listCollections((string) $auth['sub']),
        ]);
    }

    public function createCollection(array $auth): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'collection' => $this->engagement->createCollection((string) $auth['sub'], (string) ($body['name'] ?? '')),
        ], 201);
    }

    public function renameCollection(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'collection' => $this->engagement->renameCollection(
                $params['collectionId'] ?? '',
                (string) $auth['sub'],
                (string) ($body['name'] ?? '')
            ),
        ]);
    }

    public function deleteCollection(array $auth, array $params): void
    {
        $this->engagement->deleteCollection($params['collectionId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function getReactions(array $authUser, array $params): void
    {
        viora_json_response(
            $this->engagement->getReactions($params['postId'] ?? '', $authUser['sub'] ?? null)
        );
    }

    public function setReaction(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $reaction = array_key_exists('reaction', $body)
            ? ($body['reaction'] !== null ? (string) $body['reaction'] : null)
            : null;
        $result = $this->engagement->setReaction($params['postId'] ?? '', (string) $auth['sub'], $reaction);
        viora_json_response(['reaction' => $result]);
    }

    public function createShare(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response(
            $this->engagement->createShare(
                $params['postId'] ?? '',
                (string) $auth['sub'],
                (string) ($body['target'] ?? 'external'),
                isset($body['conversationId']) ? (string) $body['conversationId'] : null
            ),
            201
        );
    }

    public function listKeywordFilters(array $auth): void
    {
        viora_json_response([
            'keywords' => $this->engagement->listKeywordFilters((string) $auth['sub']),
        ]);
    }

    public function addKeywordFilter(array $auth): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'keywords' => $this->engagement->addKeywordFilter(
                (string) $auth['sub'],
                (string) ($body['keyword'] ?? '')
            ),
        ], 201);
    }

    public function removeKeywordFilter(array $auth): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'keywords' => $this->engagement->removeKeywordFilter(
                (string) $auth['sub'],
                (string) ($body['keyword'] ?? '')
            ),
        ]);
    }

    public function pinComment(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $pinned = array_key_exists('pinned', $body) ? (bool) $body['pinned'] : true;
        viora_json_response([
            'comment' => $this->engagement->pinComment($params['commentId'] ?? '', (string) $auth['sub'], $pinned),
        ]);
    }
}
