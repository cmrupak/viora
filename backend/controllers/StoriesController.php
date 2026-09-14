<?php

declare(strict_types=1);

final class StoriesController
{
    public function __construct(private readonly StoriesService $stories)
    {
    }

    public function create(array $auth): void
    {
        viora_json_response(['story' => $this->stories->create((string) $auth['sub'], viora_read_json_body())], 201);
    }

    public function list(array $authUser): void
    {
        viora_json_response([
            'stories' => $this->stories->listActive(
                $authUser['sub'] ?? null,
                viora_query_int('limit', 50, 1, 100),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function get(array $authUser, array $params): void
    {
        $story = $this->stories->getById($params['storyId'] ?? '', $authUser['sub'] ?? null);
        if (!$story) {
            viora_json_error('Story not found.', 404);
            return;
        }
        viora_json_response(['story' => $story]);
    }

    public function delete(array $auth, array $params): void
    {
        $this->stories->delete($params['storyId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function view(array $auth, array $params): void
    {
        $this->stories->markViewed($params['storyId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function viewers(array $auth, array $params): void
    {
        viora_json_response(['viewers' => $this->stories->listViewers($params['storyId'] ?? '', (string) $auth['sub'])]);
    }

    public function stickerRespond(array $auth): void
    {
        viora_json_response(['response' => $this->stories->respondToSticker((string) $auth['sub'], viora_read_json_body())]);
    }

    public function createHighlight(array $auth): void
    {
        viora_json_response(['highlight' => $this->stories->createHighlight((string) $auth['sub'], viora_read_json_body())], 201);
    }

    public function listHighlights(array $params): void
    {
        viora_json_response(['highlights' => $this->stories->listHighlights($params['userId'] ?? '')]);
    }

    public function deleteHighlight(array $auth, array $params): void
    {
        $this->stories->deleteHighlight($params['highlightId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function addStoryToHighlight(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'item' => $this->stories->addStoryToHighlight(
                $params['highlightId'] ?? '',
                (string) ($body['storyId'] ?? ''),
                (string) $auth['sub']
            ),
        ], 201);
    }
}
