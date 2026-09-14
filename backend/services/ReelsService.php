<?php

declare(strict_types=1);

final class ReelsService
{
    public function __construct(
        private readonly ReelsRepository $reels,
        private readonly ProfileRepository $profiles,
        private readonly AuthorizationService $authz,
    ) {
    }

    public function create(string $authorId, array $input): array
    {
        $media = $input['media'] ?? [];
        if (!is_array($media) || $media === []) {
            throw new InvalidArgumentException('Reel media is required.');
        }
        $id = viora_uuid_v4();
        Database::begin();
        try {
            $this->reels->create([
                'id' => $id,
                'author_id' => $authorId,
                'caption' => (string) ($input['caption'] ?? ''),
                'audio_title' => isset($input['audioTitle']) ? (string) $input['audioTitle'] : null,
                'audio_artist' => isset($input['audioArtist']) ? (string) $input['audioArtist'] : null,
                'audio_url' => isset($input['audioUrl']) ? (string) $input['audioUrl'] : null,
                'comments_disabled' => !empty($input['commentsDisabled']) ? 1 : 0,
            ]);
            foreach ($media as $i => $item) {
                if (!is_array($item) || empty($item['url'])) {
                    continue;
                }
                $mediaType = (string) ($item['mediaType'] ?? 'video');
                if (!in_array($mediaType, ['image', 'video'], true)) {
                    $mediaType = 'video';
                }
                $this->reels->insertMedia(
                    viora_uuid_v4(),
                    $id,
                    (string) $item['url'],
                    $mediaType,
                    isset($item['thumbnailUrl']) ? (string) $item['thumbnailUrl'] : null,
                    isset($item['durationSeconds']) ? (float) $item['durationSeconds'] : null,
                    (int) ($item['sortOrder'] ?? $i)
                );
            }
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        return $this->getById($id, $authorId) ?? ['id' => $id];
    }

    public function listFeed(?string $viewerId, int $limit, ?string $cursor): array
    {
        $rows = $this->reels->listFeed($limit, $cursor);
        if ($viewerId) {
            $hidden = $this->authz->feedHiddenAuthorIds($viewerId);
            $rows = array_values(array_filter($rows, static fn ($r) => !in_array((string) $r['author_id'], $hidden, true)));
        }
        return $this->hydrateMany($rows, $viewerId);
    }

    public function getById(string $reelId, ?string $viewerId): ?array
    {
        $row = $this->reels->findById($reelId);
        if (!$row || !empty($row['deleted_at'])) {
            return null;
        }
        if ($viewerId && in_array((string) $row['author_id'], $this->authz->feedHiddenAuthorIds($viewerId), true)) {
            return null;
        }
        return $this->hydrateOne($row, $viewerId);
    }

    public function toggleLike(string $reelId, string $userId): array
    {
        if (!$this->getById($reelId, $userId)) {
            throw new InvalidArgumentException('Reel not found.');
        }
        Database::begin();
        try {
            $active = $this->reels->toggleLike($reelId, $userId);
            $this->reels->bump($reelId, 'like_count', $active ? 1 : -1);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        return ['active' => $active];
    }

    public function toggleSave(string $reelId, string $userId): array
    {
        if (!$this->getById($reelId, $userId)) {
            throw new InvalidArgumentException('Reel not found.');
        }
        return ['active' => $this->reels->toggleSave($reelId, $userId)];
    }

    public function incrementView(string $reelId): void
    {
        if (!$this->reels->findById($reelId)) {
            throw new InvalidArgumentException('Reel not found.');
        }
        $this->reels->bump($reelId, 'view_count', 1);
    }

    public function listComments(string $reelId, int $limit, ?string $cursor): array
    {
        if (!$this->reels->findById($reelId)) {
            throw new InvalidArgumentException('Reel not found.');
        }
        $rows = $this->reels->listComments($reelId, $limit, $cursor);
        $authors = $this->profiles->findManyByIds(array_column($rows, 'author_id'));
        return array_map(static function ($r) use ($authors) {
            return [
                'id' => $r['id'],
                'reelId' => $r['reel_id'],
                'authorId' => $r['author_id'],
                'parentId' => $r['parent_id'] ?? null,
                'body' => $r['body'],
                'likeCount' => (int) ($r['like_count'] ?? 0),
                'createdAt' => Mappers::iso($r['created_at'] ?? null),
                'author' => Mappers::profile($authors[(string) $r['author_id']] ?? null),
            ];
        }, $rows);
    }

    public function createComment(string $reelId, string $authorId, string $body, ?string $parentId = null): array
    {
        $body = trim($body);
        if ($body === '') {
            throw new InvalidArgumentException('Comment cannot be empty.');
        }
        $reel = $this->reels->findById($reelId);
        if (!$reel || !empty($reel['deleted_at'])) {
            throw new InvalidArgumentException('Reel not found.');
        }
        if ((int) ($reel['comments_disabled'] ?? 0) === 1) {
            throw new InvalidArgumentException('Comments are disabled.');
        }
        if ($parentId) {
            $parent = $this->reels->findComment($parentId);
            if (!$parent || $parent['reel_id'] !== $reelId) {
                throw new InvalidArgumentException('Parent comment not found.');
            }
        }
        $id = viora_uuid_v4();
        Database::begin();
        try {
            $this->reels->createComment([
                'id' => $id,
                'reel_id' => $reelId,
                'author_id' => $authorId,
                'parent_id' => $parentId,
                'body' => $body,
            ]);
            $this->reels->bump($reelId, 'comment_count', 1);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        return [
            'id' => $id,
            'reelId' => $reelId,
            'authorId' => $authorId,
            'parentId' => $parentId,
            'body' => $body,
            'likeCount' => 0,
            'author' => Mappers::profile($this->profiles->findByUserId($authorId)),
        ];
    }

    private function hydrateOne(array $row, ?string $viewerId): array
    {
        $id = (string) $row['id'];
        $liked = false;
        $saved = false;
        if ($viewerId) {
            $liked = $this->reels->likedMap($viewerId, [$id])[$id] ?? false;
            $saved = $this->reels->savedMap($viewerId, [$id])[$id] ?? false;
        }
        $mediaRows = $this->reels->mediaForReel($id);
        return Mappers::reel($row, [
            'author' => Mappers::profile($this->profiles->findByUserId((string) $row['author_id'])),
            'media' => array_map([$this, 'mapMedia'], $mediaRows),
            'likedByCurrentUser' => $liked,
            'savedByCurrentUser' => $saved,
        ]);
    }

    /** @param list<array> $rows */
    private function hydrateMany(array $rows, ?string $viewerId): array
    {
        if ($rows === []) {
            return [];
        }
        $ids = array_map(static fn ($r) => (string) $r['id'], $rows);
        $authors = $this->profiles->findManyByIds(array_column($rows, 'author_id'));
        $mediaMap = $this->reels->mediaForReels($ids);
        $liked = $viewerId ? $this->reels->likedMap($viewerId, $ids) : [];
        $saved = $viewerId ? $this->reels->savedMap($viewerId, $ids) : [];
        $out = [];
        foreach ($rows as $row) {
            $id = (string) $row['id'];
            $out[] = Mappers::reel($row, [
                'author' => Mappers::profile($authors[(string) $row['author_id']] ?? null),
                'media' => array_map([$this, 'mapMedia'], $mediaMap[$id] ?? []),
                'likedByCurrentUser' => $liked[$id] ?? false,
                'savedByCurrentUser' => $saved[$id] ?? false,
            ]);
        }
        return $out;
    }

    private function mapMedia(array $row): array
    {
        return [
            'id' => $row['id'],
            'reelId' => $row['reel_id'],
            'url' => $row['url'],
            'mediaType' => $row['media_type'],
            'thumbnailUrl' => $row['thumbnail_url'] ?? null,
            'durationSeconds' => isset($row['duration_seconds']) ? (float) $row['duration_seconds'] : null,
            'sortOrder' => (int) ($row['sort_order'] ?? 0),
        ];
    }
}
