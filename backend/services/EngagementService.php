<?php

declare(strict_types=1);

final class EngagementService
{
    public function __construct(
        private readonly PostRepository $posts,
        private readonly EngagementRepository $engagement,
        private readonly ProfileRepository $profiles,
        private readonly AuthorizationService $authz,
        private readonly ?PostService $postService = null,
    ) {
    }

    public function toggleLike(string $postId, string $userId): array
    {
        $post = $this->posts->findById($postId);
        $author = $post ? $this->profiles->findByUserId((string) $post['author_id']) : null;
        if (!$post || !$this->authz->canViewPost($post, $author, $userId)) {
            throw new InvalidArgumentException('Post not found.');
        }
        Database::begin();
        try {
            $active = $this->engagement->togglePostLike($postId, $userId);
            $this->posts->bumpCounter($postId, 'like_count', $active ? 1 : -1);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        return ['active' => $active];
    }

    public function toggleCommentLike(string $commentId, string $userId): array
    {
        $comment = $this->engagement->findComment($commentId);
        if (!$comment || !empty($comment['deleted_at'])) {
            throw new InvalidArgumentException('Comment not found.');
        }
        $post = $this->posts->findById((string) $comment['post_id']);
        $author = $post ? $this->profiles->findByUserId((string) $post['author_id']) : null;
        if (!$post || !$this->authz->canViewPost($post, $author, $userId)) {
            throw new InvalidArgumentException('Comment not found.');
        }
        Database::begin();
        try {
            $active = $this->engagement->toggleCommentLike($commentId, $userId);
            $this->engagement->bumpCommentLikeCount($commentId, $active ? 1 : -1);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        return ['active' => $active];
    }

    public function listComments(string $postId, ?string $viewerId, int $limit, ?string $cursor, string $sort = 'oldest'): array
    {
        $post = $this->posts->findById($postId);
        $author = $post ? $this->profiles->findByUserId((string) $post['author_id']) : null;
        if (!$post || !$this->authz->canViewPost($post, $author, $viewerId)) {
            throw new InvalidArgumentException('Post not found.');
        }
        if (!in_array($sort, ['oldest', 'newest', 'top'], true)) {
            $sort = 'oldest';
        }
        $roots = $this->engagement->listRootComments($postId, $sort, $limit, $cursor);
        if ($viewerId) {
            $roots = array_values(array_filter($roots, function ($c) use ($viewerId) {
                return !$this->authz->isRestricted((string) $c['author_id'], $viewerId);
            }));
        }
        $parentIds = array_map(static fn ($r) => (string) $r['id'], $roots);
        $replies = $this->engagement->listReplies($parentIds);
        if ($viewerId) {
            $replies = array_values(array_filter($replies, function ($c) use ($viewerId) {
                return !$this->authz->isRestricted((string) $c['author_id'], $viewerId);
            }));
        }
        $all = array_merge($roots, $replies);
        $authorIds = array_values(array_unique(array_map(static fn ($c) => (string) $c['author_id'], $all)));
        $authors = $this->profiles->findManyByIds($authorIds);
        $commentIds = array_map(static fn ($c) => (string) $c['id'], $all);
        $liked = $viewerId ? $this->engagement->commentLikedMap($viewerId, $commentIds) : [];

        $repliesByParent = [];
        foreach ($replies as $reply) {
            $pid = (string) $reply['parent_id'];
            $repliesByParent[$pid][] = Mappers::comment($reply, [
                'author' => Mappers::profile($authors[(string) $reply['author_id']] ?? null),
                'likedByCurrentUser' => $liked[(string) $reply['id']] ?? false,
                'replies' => [],
            ]);
        }

        $out = [];
        foreach ($roots as $root) {
            $id = (string) $root['id'];
            $out[] = Mappers::comment($root, [
                'author' => Mappers::profile($authors[(string) $root['author_id']] ?? null),
                'likedByCurrentUser' => $liked[$id] ?? false,
                'replies' => $repliesByParent[$id] ?? [],
            ]);
        }
        return $out;
    }

    public function createComment(string $postId, string $authorId, string $body, ?string $parentId = null): array
    {
        $body = trim($body);
        if ($body === '') {
            throw new InvalidArgumentException('Comment cannot be empty.');
        }
        $post = $this->posts->findById($postId);
        $postAuthor = $post ? $this->profiles->findByUserId((string) $post['author_id']) : null;
        if (!$post || !$this->authz->canViewPost($post, $postAuthor, $authorId)) {
            throw new InvalidArgumentException('Post not found.');
        }
        if ((int) ($post['comments_disabled'] ?? 0) === 1) {
            throw new InvalidArgumentException('Comments are disabled on this post.');
        }
        if ($parentId) {
            $parent = $this->engagement->findComment($parentId);
            if (!$parent || $parent['post_id'] !== $postId || !empty($parent['deleted_at'])) {
                throw new InvalidArgumentException('Parent comment not found.');
            }
            if (!empty($parent['parent_id'])) {
                throw new InvalidArgumentException('Replies are limited to one level.');
            }
        }
        $filters = $this->engagement->keywordFilters((string) $post['author_id']);
        $lower = strtolower($body);
        foreach ($filters as $kw) {
            if ($kw !== '' && str_contains($lower, $kw)) {
                throw new InvalidArgumentException('Comment blocked by keyword filter.');
            }
        }

        $id = viora_uuid_v4();
        Database::begin();
        try {
            $this->engagement->createComment([
                'id' => $id,
                'post_id' => $postId,
                'author_id' => $authorId,
                'parent_id' => $parentId,
                'body' => $body,
            ]);
            $this->posts->bumpCounter($postId, 'comment_count', 1);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        $row = $this->engagement->findComment($id);
        return Mappers::comment($row ?? ['id' => $id, 'post_id' => $postId, 'author_id' => $authorId, 'parent_id' => $parentId, 'body' => $body, 'like_count' => 0], [
            'author' => Mappers::profile($this->profiles->findByUserId($authorId)),
            'likedByCurrentUser' => false,
            'replies' => [],
        ]);
    }

    public function updateComment(string $commentId, string $authorId, string $body): array
    {
        $body = trim($body);
        if ($body === '') {
            throw new InvalidArgumentException('Comment cannot be empty.');
        }
        $row = $this->engagement->findComment($commentId);
        if (!$row || $row['author_id'] !== $authorId || !empty($row['deleted_at'])) {
            throw new InvalidArgumentException('Comment not found.');
        }
        $this->engagement->updateComment($commentId, $body);
        $updated = $this->engagement->findComment($commentId);
        return Mappers::comment($updated ?? $row, [
            'author' => Mappers::profile($this->profiles->findByUserId($authorId)),
            'likedByCurrentUser' => false,
            'replies' => [],
        ]);
    }

    public function softDeleteComment(string $commentId, string $authorId): void
    {
        $row = $this->engagement->findComment($commentId);
        if (!$row || $row['author_id'] !== $authorId) {
            throw new InvalidArgumentException('Comment not found.');
        }
        Database::begin();
        try {
            $this->engagement->softDeleteComment($commentId);
            $this->posts->bumpCounter((string) $row['post_id'], 'comment_count', -1);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
    }

    public function pinComment(string $commentId, string $userId, bool $pinned): array
    {
        $row = $this->engagement->findComment($commentId);
        if (!$row || !empty($row['deleted_at'])) {
            throw new InvalidArgumentException('Comment not found.');
        }
        $post = $this->posts->findById((string) $row['post_id']);
        if (!$post) {
            throw new InvalidArgumentException('Comment not found.');
        }
        if ($row['author_id'] !== $userId && $post['author_id'] !== $userId) {
            throw new InvalidArgumentException('Not allowed.');
        }
        $this->engagement->pinComment($commentId, $pinned ? gmdate('Y-m-d H:i:s') : null);
        $updated = $this->engagement->findComment($commentId);
        return Mappers::comment($updated ?? $row, [
            'author' => Mappers::profile($this->profiles->findByUserId((string) $row['author_id'])),
            'likedByCurrentUser' => false,
            'replies' => [],
        ]);
    }

    public function listKeywordFilters(string $ownerId): array
    {
        return array_values($this->engagement->keywordFilters($ownerId));
    }

    public function addKeywordFilter(string $ownerId, string $keyword): array
    {
        $keyword = trim(strtolower($keyword));
        if ($keyword === '') {
            throw new InvalidArgumentException('Keyword required.');
        }
        $this->engagement->addKeywordFilter(viora_uuid_v4(), $ownerId, $keyword);
        return $this->listKeywordFilters($ownerId);
    }

    public function removeKeywordFilter(string $ownerId, string $keyword): array
    {
        $this->engagement->removeKeywordFilter($ownerId, trim($keyword));
        return $this->listKeywordFilters($ownerId);
    }

    public function toggleSave(string $postId, string $userId, ?string $collectionId = null): array
    {
        $post = $this->posts->findById($postId);
        $author = $post ? $this->profiles->findByUserId((string) $post['author_id']) : null;
        if (!$post || !$this->authz->canViewPost($post, $author, $userId)) {
            throw new InvalidArgumentException('Post not found.');
        }
        $existing = $this->engagement->findSaved($postId, $userId);
        Database::begin();
        try {
            if ($existing) {
                $this->engagement->unsavePost((string) $existing['id']);
                $this->posts->bumpCounter($postId, 'save_count', -1);
                Database::commit();
                return ['active' => false];
            }
            $this->engagement->savePost(viora_uuid_v4(), $postId, $userId, $collectionId);
            $this->posts->bumpCounter($postId, 'save_count', 1);
            Database::commit();
            return ['active' => true];
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
    }

    public function moveToCollection(string $postId, string $userId, ?string $collectionId): void
    {
        if (!$this->engagement->findSaved($postId, $userId)) {
            throw new InvalidArgumentException('Post is not saved.');
        }
        if ($collectionId) {
            $col = $this->engagement->findCollection($collectionId);
            if (!$col || $col['owner_id'] !== $userId) {
                throw new InvalidArgumentException('Collection not found.');
            }
        }
        $this->engagement->moveSavedToCollection($postId, $userId, $collectionId);
    }

    public function listSaved(string $userId, int $limit, ?string $cursor): array
    {
        $rows = $this->engagement->listSaved($userId, $limit, $cursor);
        $out = [];
        foreach ($rows as $row) {
            if ($this->postService) {
                $post = $this->postService->getById((string) $row['post_id'], $userId);
                if ($post) {
                    $out[] = $post;
                }
            }
        }
        return $out;
    }

    public function listCollections(string $userId): array
    {
        return array_map(static fn ($r) => [
            'id' => $r['id'],
            'ownerId' => $r['owner_id'],
            'name' => $r['name'],
            'itemCount' => (int) ($r['item_count'] ?? 0),
            'createdAt' => Mappers::iso($r['created_at'] ?? null),
            'updatedAt' => Mappers::iso($r['updated_at'] ?? null),
        ], $this->engagement->listCollections($userId));
    }

    public function createCollection(string $userId, string $name): array
    {
        $name = trim($name);
        if ($name === '') {
            throw new InvalidArgumentException('Name required.');
        }
        $id = viora_uuid_v4();
        $this->engagement->createCollection($id, $userId, $name);
        $row = $this->engagement->findCollection($id);
        return [
            'id' => $id,
            'ownerId' => $userId,
            'name' => $name,
            'itemCount' => 0,
            'createdAt' => Mappers::iso($row['created_at'] ?? gmdate('Y-m-d H:i:s')),
        ];
    }

    public function renameCollection(string $collectionId, string $userId, string $name): array
    {
        $name = trim($name);
        if ($name === '') {
            throw new InvalidArgumentException('Name required.');
        }
        $this->engagement->renameCollection($collectionId, $userId, $name);
        $row = $this->engagement->findCollection($collectionId);
        if (!$row || $row['owner_id'] !== $userId) {
            throw new InvalidArgumentException('Collection not found.');
        }
        return [
            'id' => $row['id'],
            'ownerId' => $row['owner_id'],
            'name' => $row['name'],
            'createdAt' => Mappers::iso($row['created_at'] ?? null),
            'updatedAt' => Mappers::iso($row['updated_at'] ?? null),
        ];
    }

    public function deleteCollection(string $collectionId, string $userId): void
    {
        $this->engagement->deleteCollection($collectionId, $userId);
    }

    public function setReaction(string $postId, string $userId, ?string $reaction): ?array
    {
        $post = $this->posts->findById($postId);
        $author = $post ? $this->profiles->findByUserId((string) $post['author_id']) : null;
        if (!$post || !$this->authz->canViewPost($post, $author, $userId)) {
            throw new InvalidArgumentException('Post not found.');
        }
        $allowed = ['love', 'haha', 'wow', 'sad', 'angry'];
        if ($reaction === null) {
            $this->engagement->clearReaction($postId, $userId);
            return null;
        }
        if (!in_array($reaction, $allowed, true)) {
            throw new InvalidArgumentException('Invalid reaction type.');
        }
        $this->engagement->setReaction(viora_uuid_v4(), $postId, $userId, $reaction);
        $row = $this->engagement->findReaction($postId, $userId);
        return [
            'id' => $row['id'] ?? null,
            'postId' => $postId,
            'userId' => $userId,
            'reaction' => $reaction,
            'createdAt' => Mappers::iso($row['created_at'] ?? gmdate('Y-m-d H:i:s')),
            'user' => Mappers::profile($this->profiles->findByUserId($userId)),
        ];
    }

    public function getReactions(string $postId, ?string $viewerId): array
    {
        $post = $this->posts->findById($postId);
        $author = $post ? $this->profiles->findByUserId((string) $post['author_id']) : null;
        if (!$post || !$this->authz->canViewPost($post, $author, $viewerId)) {
            throw new InvalidArgumentException('Post not found.');
        }
        $rows = $this->engagement->listReactions($postId);
        $counts = ['love' => 0, 'haha' => 0, 'wow' => 0, 'sad' => 0, 'angry' => 0];
        $reactions = [];
        $current = null;
        foreach ($rows as $row) {
            $type = (string) $row['reaction'];
            if (isset($counts[$type])) {
                $counts[$type]++;
            }
            $reactions[] = [
                'id' => $row['id'],
                'postId' => $row['post_id'],
                'userId' => $row['user_id'],
                'reaction' => $type,
                'createdAt' => Mappers::iso($row['created_at'] ?? null),
                'user' => Mappers::profile($this->profiles->findByUserId((string) $row['user_id'])),
            ];
            if ($viewerId && $row['user_id'] === $viewerId) {
                $current = $type;
            }
        }
        return [
            'reactions' => $reactions,
            'counts' => $counts,
            'currentUserReaction' => $current,
        ];
    }

    public function createShare(string $postId, string $userId, string $target = 'external', ?string $conversationId = null): array
    {
        $post = $this->posts->findById($postId);
        $author = $post ? $this->profiles->findByUserId((string) $post['author_id']) : null;
        if (!$post || !$this->authz->canViewPost($post, $author, $userId)) {
            throw new InvalidArgumentException('Post not found.');
        }
        if (!in_array($target, ['link', 'feed', 'dm', 'external'], true)) {
            $target = 'external';
        }
        $id = viora_uuid_v4();
        Database::begin();
        try {
            $this->engagement->createShare($id, $postId, $userId, $target, $conversationId);
            $this->posts->bumpCounter($postId, 'share_count', 1);
            $repost = null;
            if ($target === 'feed' && $this->postService) {
                $repost = $this->postService->create($userId, [
                    'body' => '',
                    'visibility' => 'public',
                    'repostOfId' => $postId,
                ]);
            }
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        $row = $this->engagement->findShare($id);
        return [
            'share' => [
                'id' => $id,
                'postId' => $postId,
                'userId' => $userId,
                'target' => $target,
                'conversationId' => $conversationId,
                'createdAt' => Mappers::iso($row['created_at'] ?? gmdate('Y-m-d H:i:s')),
            ],
            'repost' => $repost,
        ];
    }
}
