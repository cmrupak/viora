<?php

declare(strict_types=1);

final class ReelsController
{
    public function __construct(private readonly ReelsService $reels)
    {
    }

    public function create(array $auth): void
    {
        viora_json_response(['reel' => $this->reels->create((string) $auth['sub'], viora_read_json_body())], 201);
    }

    public function feed(array $authUser): void
    {
        viora_json_response([
            'reels' => $this->reels->listFeed(
                $authUser['sub'] ?? null,
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function get(array $authUser, array $params): void
    {
        $reel = $this->reels->getById($params['reelId'] ?? '', $authUser['sub'] ?? null);
        if (!$reel) {
            viora_json_error('Reel not found.', 404);
            return;
        }
        viora_json_response(['reel' => $reel]);
    }

    public function like(array $auth, array $params): void
    {
        viora_json_response($this->reels->toggleLike($params['reelId'] ?? '', (string) $auth['sub']));
    }

    public function save(array $auth, array $params): void
    {
        viora_json_response($this->reels->toggleSave($params['reelId'] ?? '', (string) $auth['sub']));
    }

    public function view(array $params): void
    {
        $this->reels->incrementView($params['reelId'] ?? '');
        viora_json_response(['ok' => true]);
    }

    public function listComments(array $params): void
    {
        viora_json_response([
            'comments' => $this->reels->listComments(
                $params['reelId'] ?? '',
                viora_query_int('limit', 30),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function createComment(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'comment' => $this->reels->createComment(
                $params['reelId'] ?? '',
                (string) $auth['sub'],
                (string) ($body['body'] ?? ''),
                isset($body['parentId']) ? (string) $body['parentId'] : null
            ),
        ], 201);
    }
}
