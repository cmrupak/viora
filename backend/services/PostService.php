<?php

declare(strict_types=1);

final class PostService
{
    public function __construct(
        private readonly PostRepository $posts,
        private readonly ProfileRepository $profiles,
        private readonly SocialGraphRepository $graph,
        private readonly AuthorizationService $authz,
    ) {
    }

    public function getById(string $postId, ?string $viewerId): ?array
    {
        $row = $this->posts->findById($postId);
        if (!$row || !empty($row['deleted_at'])) {
            return null;
        }
        $author = $this->profiles->findByUserId((string) $row['author_id']);
        if ($viewerId && in_array((string) $row['author_id'], $this->authz->feedHiddenAuthorIds($viewerId), true)) {
            return null;
        }
        if (!$this->authz->canViewPost($row, $author, $viewerId)) {
            return null;
        }
        return $this->hydrateOne($row, $viewerId, $author);
    }

    public function create(string $authorId, array $input): array
    {
        $author = $this->profiles->findByUserId($authorId);
        if (!$author) {
            throw new InvalidArgumentException('Profile not found.');
        }
        $body = (string) ($input['body'] ?? '');
        $visibility = (string) ($input['visibility'] ?? ((int) ($author['is_private'] ?? 0) === 1 ? 'followers' : 'public'));
        if (!in_array($visibility, ['public', 'followers', 'friends', 'only_me', 'custom'], true)) {
            throw new InvalidArgumentException('Invalid visibility.');
        }
        $publishStatus = (string) ($input['publishStatus'] ?? 'published');
        if (!in_array($publishStatus, ['draft', 'published', 'scheduled'], true)) {
            throw new InvalidArgumentException('Invalid publish status.');
        }
        $scheduledAt = isset($input['scheduledAt']) ? (string) $input['scheduledAt'] : null;
        if ($publishStatus === 'scheduled' && !$scheduledAt) {
            throw new InvalidArgumentException('scheduledAt is required for scheduled posts.');
        }
        $audienceListIds = $input['audienceListIds'] ?? [];
        if ($visibility === 'custom' && (!is_array($audienceListIds) || $audienceListIds === [])) {
            throw new InvalidArgumentException('Custom visibility requires audienceListIds.');
        }

        $id = viora_uuid_v4();
        Database::begin();
        try {
            $this->posts->create([
                'id' => $id,
                'author_id' => $authorId,
                'body' => $body,
                'visibility' => $visibility,
                'publish_status' => $publishStatus,
                'scheduled_at' => $scheduledAt,
                'location_name' => isset($input['locationName']) ? (string) $input['locationName'] : null,
                'feeling' => isset($input['feeling']) ? (string) $input['feeling'] : null,
                'is_sensitive' => !empty($input['isSensitive']) ? 1 : 0,
                'comments_disabled' => 0,
                'repost_of_id' => isset($input['repostOfId']) ? (string) $input['repostOfId'] : null,
            ]);
            if ($visibility === 'custom') {
                $this->posts->replaceAudience($id, array_map('strval', $audienceListIds));
            }
            $media = is_array($input['media'] ?? null) ? $input['media'] : [];
            foreach ($media as $i => $item) {
                if (!is_array($item) || empty($item['url'])) {
                    continue;
                }
                $mediaType = (string) ($item['mediaType'] ?? 'image');
                if (!in_array($mediaType, ['image', 'video'], true)) {
                    $mediaType = 'image';
                }
                $this->insertMediaSafe($id, $item, $i, $mediaType);
            }
            $this->insertTagsSafe($id, $authorId, $input['taggedUserIds'] ?? null);
            $repostOfId = isset($input['repostOfId']) ? (string) $input['repostOfId'] : null;
            if ($repostOfId !== null && $repostOfId !== '') {
                $this->posts->bumpCounter($repostOfId, 'repost_count', 1);
            }
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }

        $created = $this->getById($id, $authorId);
        if (!$created) {
            throw new RuntimeException('Failed to load created post.');
        }
        return $created;
    }

    public function update(string $postId, string $authorId, array $input): array
    {
        $row = $this->posts->findById($postId);
        if (!$row || $row['author_id'] !== $authorId || !empty($row['deleted_at'])) {
            throw new InvalidArgumentException('Post not found.');
        }
        $fields = ['edited_at' => gmdate('Y-m-d H:i:s')];
        $bodyChanging = array_key_exists('body', $input);
        if ($bodyChanging) {
            $fields['body'] = (string) $input['body'];
        }
        if (array_key_exists('visibility', $input)) {
            $visibility = (string) $input['visibility'];
            if (!in_array($visibility, ['public', 'followers', 'friends', 'only_me', 'custom'], true)) {
                throw new InvalidArgumentException('Invalid visibility.');
            }
            $fields['visibility'] = $visibility;
            if ($visibility === 'custom') {
                $listIds = $input['audienceListIds'] ?? [];
                if (!is_array($listIds) || $listIds === []) {
                    throw new InvalidArgumentException('Custom visibility requires audienceListIds.');
                }
                $this->posts->replaceAudience($postId, array_map('strval', $listIds));
            }
        }
        foreach (['locationName' => 'location_name', 'feeling' => 'feeling', 'publishStatus' => 'publish_status', 'scheduledAt' => 'scheduled_at'] as $in => $col) {
            if (array_key_exists($in, $input)) {
                $fields[$col] = $input[$in] !== null ? (string) $input[$in] : null;
            }
        }
        Database::begin();
        try {
            if ($bodyChanging && (string) ($row['body'] ?? '') !== (string) $input['body']) {
                $this->posts->insertRevision([
                    'id' => viora_uuid_v4(),
                    'post_id' => $postId,
                    'body' => (string) ($row['body'] ?? ''),
                    'edited_by' => $authorId,
                ]);
            }
            $this->posts->update($postId, $fields);
            if (array_key_exists('taggedUserIds', $input)) {
                $this->insertTagsSafe($postId, $authorId, $input['taggedUserIds']);
            }
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        $updated = $this->getById($postId, $authorId);
        if (!$updated) {
            throw new RuntimeException('Failed to load updated post.');
        }
        return $updated;
    }

    public function softDelete(string $postId, string $authorId): void
    {
        $row = $this->posts->findById($postId);
        if (!$row || $row['author_id'] !== $authorId) {
            throw new InvalidArgumentException('Post not found.');
        }
        $this->posts->softDelete($postId);
    }

    public function listFeed(string $viewerId, int $limit, ?string $cursor, bool $watch = false): array
    {
        $following = $this->graph->followingIds($viewerId);
        $authorIds = $following === [] ? [] : array_values(array_unique(array_merge($following, [$viewerId])));
        $hiddenAuthors = $this->authz->feedHiddenAuthorIds($viewerId);
        $hiddenPosts = $this->posts->hiddenPostIds($viewerId);
        // Fetch extra then filter by can_view_post
        $rows = $this->posts->listFeedCandidates(
            $viewerId,
            $authorIds,
            $hiddenAuthors,
            $hiddenPosts,
            $limit * 3,
            $cursor,
            $watch,
        );
        $authors = $this->profiles->findManyByIds(array_column($rows, 'author_id'));
        $out = [];
        foreach ($rows as $row) {
            $author = $authors[(string) $row['author_id']] ?? null;
            if (!$this->authz->canViewPost($row, $author, $viewerId)) {
                continue;
            }
            $out[] = $row;
            if (count($out) >= $limit) {
                break;
            }
        }
        return $this->hydrateMany($out, $viewerId, $authors);
    }

    public function listByUser(string $authorId, ?string $viewerId, bool $includeNonLive, int $limit, ?string $cursor): array
    {
        if ($viewerId && in_array($authorId, $this->authz->feedHiddenAuthorIds($viewerId), true)) {
            return [];
        }
        $include = $includeNonLive && $viewerId === $authorId;
        $rows = $this->posts->listByAuthor($authorId, $include, $limit * 2, $cursor);
        $author = $this->profiles->findByUserId($authorId);
        $filtered = [];
        foreach ($rows as $row) {
            if (!$this->authz->canViewPost($row, $author, $viewerId)) {
                continue;
            }
            $filtered[] = $row;
            if (count($filtered) >= $limit) {
                break;
            }
        }
        $authors = $author ? [$authorId => $author] : [];
        return $this->hydrateMany($filtered, $viewerId, $authors);
    }

    public function hide(string $postId, string $userId): void
    {
        $this->posts->hidePost($userId, $postId);
    }

    public function unhide(string $postId, string $userId): void
    {
        $this->posts->unhidePost($userId, $postId);
    }

    public function pin(string $postId, string $authorId, bool $pinned): array
    {
        $row = $this->requireOwn($postId, $authorId);
        $this->posts->update($postId, ['pinned_at' => $pinned ? gmdate('Y-m-d H:i:s') : null]);
        return $this->getById($postId, $authorId) ?? Mappers::post($row);
    }

    public function archive(string $postId, string $authorId, bool $archived): array
    {
        $row = $this->requireOwn($postId, $authorId);
        $this->posts->update($postId, ['archived_at' => $archived ? gmdate('Y-m-d H:i:s') : null]);
        return $this->getById($postId, $authorId) ?? Mappers::post($row);
    }

    public function recordView(string $postId, string $viewerId): void
    {
        if ($postId === '' || $viewerId === '') {
            return;
        }
        $row = $this->posts->findById($postId);
        if (!$row || !empty($row['deleted_at'])) {
            return;
        }
        if ((string) ($row['author_id'] ?? '') === $viewerId) {
            return;
        }
        $inserted = $this->posts->recordView(viora_uuid_v4(), $postId, $viewerId);
        if ($inserted) {
            $this->posts->bumpCounter($postId, 'view_count', 1);
        }
    }

    public function setCommentsDisabled(string $postId, string $authorId, bool $disabled): array
    {
        $this->requireOwn($postId, $authorId);
        $this->posts->update($postId, ['comments_disabled' => $disabled ? 1 : 0]);
        $post = $this->getById($postId, $authorId);
        if (!$post) {
            throw new RuntimeException('Post not found.');
        }
        return $post;
    }

    public function listDrafts(string $authorId): array
    {
        $rows = $this->posts->listDrafts($authorId);
        $author = $this->profiles->findByUserId($authorId);
        $authors = $author ? [$authorId => $author] : [];
        return $this->hydrateMany($rows, $authorId, $authors);
    }

    public function listPendingTags(string $userId): array
    {
        $rows = $this->posts->listPendingTags($userId);
        $out = [];
        foreach ($rows as $row) {
            $taggedBy = Mappers::profile($this->profiles->findByUserId((string) $row['tagged_by']));
            $postAuthor = Mappers::profile($this->profiles->findByUserId((string) $row['post_author_id']));
            $out[] = [
                'id' => $row['id'],
                'postId' => $row['post_id'],
                'taggedUserId' => $row['tagged_user_id'],
                'taggedBy' => $row['tagged_by'],
                'status' => $row['status'],
                'createdAt' => Mappers::iso($row['created_at'] ?? null),
                'updatedAt' => Mappers::iso($row['updated_at'] ?? null),
                'taggedByUser' => $taggedBy,
                'post' => [
                    'id' => $row['post_id'],
                    'body' => $row['post_body'] ?? '',
                    'authorId' => $row['post_author_id'],
                    'createdAt' => Mappers::iso($row['post_created_at'] ?? null),
                    'author' => $postAuthor,
                ],
            ];
        }
        return $out;
    }

    public function respondToTag(string $tagId, string $userId, string $status): array
    {
        if (!in_array($status, ['approved', 'rejected'], true)) {
            throw new InvalidArgumentException('Status must be approved or rejected.');
        }
        $row = $this->posts->findTag($tagId);
        if (!$row || $row['tagged_user_id'] !== $userId) {
            throw new InvalidArgumentException('Tag not found.');
        }
        if ($row['status'] !== 'pending') {
            throw new InvalidArgumentException('Tag already responded.');
        }
        $this->posts->respondToTag($tagId, $status);
        $updated = $this->posts->findTag($tagId) ?? $row;
        return [
            'id' => $updated['id'],
            'postId' => $updated['post_id'],
            'taggedUserId' => $updated['tagged_user_id'],
            'taggedBy' => $updated['tagged_by'],
            'status' => $updated['status'],
            'createdAt' => Mappers::iso($updated['created_at'] ?? null),
            'updatedAt' => Mappers::iso($updated['updated_at'] ?? null),
        ];
    }

    public function listRevisions(string $postId, string $authorId): array
    {
        $this->requireOwn($postId, $authorId);
        $rows = $this->posts->listRevisions($postId);
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'id' => $row['id'],
                'postId' => $row['post_id'],
                'body' => $row['body'] ?? '',
                'editedBy' => $row['edited_by'],
                'createdAt' => Mappers::iso($row['created_at'] ?? null),
                'editedByUser' => Mappers::profile($this->profiles->findByUserId((string) $row['edited_by'])),
            ];
        }
        return $out;
    }

    private function requireOwn(string $postId, string $authorId): array
    {
        $row = $this->posts->findById($postId);
        if (!$row || $row['author_id'] !== $authorId || !empty($row['deleted_at'])) {
            throw new InvalidArgumentException('Post not found.');
        }
        return $row;
    }

    private function insertMediaSafe(string $postId, array $item, int $index, string $mediaType): void
    {
        $id = viora_uuid_v4();
        $url = (string) $item['url'];
        $sort = (int) ($item['sortOrder'] ?? $index);
        $width = isset($item['width']) ? (int) $item['width'] : null;
        $height = isset($item['height']) ? (int) $item['height'] : null;
        $alt = isset($item['altText']) ? (string) $item['altText'] : null;
        $duration = isset($item['durationSeconds']) ? (float) $item['durationSeconds'] : null;

        $stmt = Database::connection()->prepare(
            'INSERT INTO post_media (id, post_id, url, media_type, sort_order, width, height, alt_text, duration_seconds)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->bind_param(
            'ssssiiisd',
            $id,
            $postId,
            $url,
            $mediaType,
            $sort,
            $width,
            $height,
            $alt,
            $duration
        );
        $stmt->execute();
        $stmt->close();
    }

    /** @param mixed $taggedUserIds */
    private function insertTagsSafe(string $postId, string $authorId, $taggedUserIds): void
    {
        if (!is_array($taggedUserIds) || $taggedUserIds === []) {
            return;
        }
        $seen = [];
        foreach ($taggedUserIds as $rawId) {
            $taggedUserId = (string) $rawId;
            if ($taggedUserId === '' || $taggedUserId === $authorId || isset($seen[$taggedUserId])) {
                continue;
            }
            if (!$this->profiles->findByUserId($taggedUserId)) {
                continue;
            }
            $seen[$taggedUserId] = true;
            $this->posts->insertTag([
                'id' => viora_uuid_v4(),
                'post_id' => $postId,
                'tagged_user_id' => $taggedUserId,
                'tagged_by' => $authorId,
                'status' => 'pending',
            ]);
        }
    }

    private function hydrateOne(array $row, ?string $viewerId, ?array $authorRow = null): array
    {
        $authorRow ??= $this->profiles->findByUserId((string) $row['author_id']);
        $liked = false;
        $saved = false;
        if ($viewerId) {
            $likedMap = $this->posts->likedMap($viewerId, [(string) $row['id']]);
            $savedMap = $this->posts->savedMap($viewerId, [(string) $row['id']]);
            $liked = $likedMap[(string) $row['id']] ?? false;
            $saved = $savedMap[(string) $row['id']] ?? false;
        }
        $media = array_map(static fn ($m) => Mappers::media($m), $this->posts->mediaForPost((string) $row['id']));
        return Mappers::post($row, [
            'author' => Mappers::profile($authorRow),
            'media' => $media,
            'likedByCurrentUser' => $liked,
            'savedByCurrentUser' => $saved,
        ]);
    }

    /** @param list<array> $rows @param array<string, array> $authors */
    private function hydrateMany(array $rows, ?string $viewerId, array $authors): array
    {
        if ($rows === []) {
            return [];
        }
        $ids = array_map(static fn ($r) => (string) $r['id'], $rows);
        $liked = $viewerId ? $this->posts->likedMap($viewerId, $ids) : [];
        $saved = $viewerId ? $this->posts->savedMap($viewerId, $ids) : [];
        $mediaMap = $this->posts->mediaForPosts($ids);
        $out = [];
        foreach ($rows as $row) {
            $id = (string) $row['id'];
            $authorId = (string) $row['author_id'];
            $out[] = Mappers::post($row, [
                'author' => Mappers::profile($authors[$authorId] ?? null),
                'media' => array_map(static fn ($m) => Mappers::media($m), $mediaMap[$id] ?? []),
                'likedByCurrentUser' => $liked[$id] ?? false,
                'savedByCurrentUser' => $saved[$id] ?? false,
            ]);
        }
        return $out;
    }
}
