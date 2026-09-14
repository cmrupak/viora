<?php

declare(strict_types=1);

final class PostController
{
    public function __construct(
        private readonly PostService $posts,
        private readonly EngagementService $engagement,
    ) {
    }

    public function feed(array $auth): void
    {
        viora_json_response([
            'posts' => $this->posts->listFeed(
                (string) $auth['sub'],
                viora_query_int('limit', 20),
                viora_query_string('cursor'),
                false
            ),
        ]);
    }

    public function watchFeed(array $auth): void
    {
        viora_json_response([
            'posts' => $this->posts->listFeed(
                (string) $auth['sub'],
                viora_query_int('limit', 20),
                viora_query_string('cursor'),
                true
            ),
        ]);
    }

    public function create(array $auth): void
    {
        $body = viora_read_json_body();
        viora_json_response(['post' => $this->posts->create((string) $auth['sub'], $body)], 201);
    }

    public function get(array $authUser, array $params): void
    {
        $viewerId = $authUser['sub'] ?? null;
        $post = $this->posts->getById($params['postId'] ?? '', $viewerId);
        if (!$post) {
            viora_json_error('Post not found.', 404);
            return;
        }
        viora_json_response(['post' => $post]);
    }

    public function update(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response(['post' => $this->posts->update($params['postId'] ?? '', (string) $auth['sub'], $body)]);
    }

    public function delete(array $auth, array $params): void
    {
        $this->posts->softDelete($params['postId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function listByUser(array $authUser, array $params): void
    {
        $viewerId = $authUser['sub'] ?? null;
        $includeNonLive = filter_var(viora_query_string('includeNonLive', 'false'), FILTER_VALIDATE_BOOLEAN);
        viora_json_response([
            'posts' => $this->posts->listByUser(
                $params['userId'] ?? '',
                $viewerId,
                $includeNonLive,
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function hide(array $auth, array $params): void
    {
        $this->posts->hide($params['postId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function unhide(array $auth, array $params): void
    {
        $this->posts->unhide($params['postId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function pin(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $pinned = array_key_exists('pinned', $body) ? (bool) $body['pinned'] : true;
        viora_json_response(['post' => $this->posts->pin($params['postId'] ?? '', (string) $auth['sub'], $pinned)]);
    }

    public function archive(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $archived = array_key_exists('archived', $body) ? (bool) $body['archived'] : true;
        viora_json_response(['post' => $this->posts->archive($params['postId'] ?? '', (string) $auth['sub'], $archived)]);
    }

    public function recordView(array $auth, array $params): void
    {
        $this->posts->recordView($params['postId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function commentsDisabled(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $disabled = (bool) ($body['disabled'] ?? true);
        viora_json_response(['post' => $this->posts->setCommentsDisabled($params['postId'] ?? '', (string) $auth['sub'], $disabled)]);
    }

    public function toggleLike(array $auth, array $params): void
    {
        viora_json_response($this->engagement->toggleLike($params['postId'] ?? '', (string) $auth['sub']));
    }

    public function listComments(array $authUser, array $params): void
    {
        $viewerId = $authUser['sub'] ?? null;
        viora_json_response([
            'comments' => $this->engagement->listComments(
                $params['postId'] ?? '',
                $viewerId,
                viora_query_int('limit', 30),
                viora_query_string('cursor'),
                viora_query_string('sort', 'oldest') ?? 'oldest'
            ),
        ]);
    }

    public function createComment(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'comment' => $this->engagement->createComment(
                $params['postId'] ?? '',
                (string) $auth['sub'],
                (string) ($body['body'] ?? ''),
                isset($body['parentId']) ? (string) $body['parentId'] : null
            ),
        ], 201);
    }

    public function updateComment(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'comment' => $this->engagement->updateComment(
                $params['commentId'] ?? '',
                (string) $auth['sub'],
                (string) ($body['body'] ?? '')
            ),
        ]);
    }

    public function deleteComment(array $auth, array $params): void
    {
        $this->engagement->softDeleteComment($params['commentId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function toggleCommentLike(array $auth, array $params): void
    {
        viora_json_response($this->engagement->toggleCommentLike($params['commentId'] ?? '', (string) $auth['sub']));
    }

    public function listDrafts(array $auth): void
    {
        viora_json_response(['posts' => $this->posts->listDrafts((string) $auth['sub'])]);
    }

    public function listPendingTags(array $auth): void
    {
        viora_json_response(['tags' => $this->posts->listPendingTags((string) $auth['sub'])]);
    }

    public function respondToTag(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $status = (string) ($body['status'] ?? '');
        viora_json_response([
            'tag' => $this->posts->respondToTag($params['tagId'] ?? '', (string) $auth['sub'], $status),
        ]);
    }

    public function listRevisions(array $auth, array $params): void
    {
        viora_json_response([
            'revisions' => $this->posts->listRevisions($params['postId'] ?? '', (string) $auth['sub']),
        ]);
    }
}
