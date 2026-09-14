<?php

declare(strict_types=1);

final class StoriesService
{
    public function __construct(
        private readonly StoriesRepository $stories,
        private readonly ProfileRepository $profiles,
        private readonly AuthorizationService $authz,
    ) {
    }

    public function create(string $authorId, array $input): array
    {
        $media = $input['media'] ?? [];
        if (!is_array($media) || $media === []) {
            throw new InvalidArgumentException('Story media is required.');
        }
        $audience = (string) ($input['audience'] ?? 'public');
        if (!in_array($audience, ['public', 'close_friends'], true)) {
            throw new InvalidArgumentException('Invalid audience.');
        }
        $expiresAt = isset($input['expiresAt'])
            ? (string) $input['expiresAt']
            : gmdate('Y-m-d H:i:s', time() + 86400);
        $id = viora_uuid_v4();
        Database::begin();
        try {
            $this->stories->create($id, $authorId, $audience, $expiresAt);
            foreach ($media as $i => $item) {
                if (!is_array($item) || empty($item['url'])) {
                    continue;
                }
                $mediaType = (string) ($item['mediaType'] ?? 'image');
                if (!in_array($mediaType, ['image', 'video'], true)) {
                    $mediaType = 'image';
                }
                $stickers = $item['stickers'] ?? [];
                $this->stories->insertMedia(
                    viora_uuid_v4(),
                    $id,
                    (string) $item['url'],
                    $mediaType,
                    (int) ($item['sortOrder'] ?? $i),
                    json_encode(is_array($stickers) ? $stickers : [], JSON_THROW_ON_ERROR)
                );
            }
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        $story = $this->getById($id, $authorId);
        if (!$story) {
            throw new RuntimeException('Failed to load story.');
        }
        return $story;
    }

    public function listActive(?string $viewerId, int $limit, ?string $cursor): array
    {
        $hidden = $viewerId ? $this->authz->storyHiddenAuthorIds($viewerId) : [];
        $rows = $this->stories->listActive($limit * 2, $cursor, $hidden);
        $filtered = [];
        foreach ($rows as $row) {
            if (!$this->authz->canViewStory($row, $viewerId)) {
                continue;
            }
            $filtered[] = $row;
            if (count($filtered) >= $limit) {
                break;
            }
        }
        return $this->hydrateMany($filtered, $viewerId);
    }

    public function getById(string $storyId, ?string $viewerId): ?array
    {
        $row = $this->stories->findById($storyId);
        if (!$row || !$this->authz->canViewStory($row, $viewerId)) {
            return null;
        }
        if ($viewerId && in_array((string) $row['author_id'], $this->authz->storyHiddenAuthorIds($viewerId), true)) {
            return null;
        }
        return $this->hydrateOne($row, $viewerId);
    }

    public function markViewed(string $storyId, string $viewerId): void
    {
        $story = $this->getById($storyId, $viewerId);
        if (!$story) {
            throw new InvalidArgumentException('Story not found.');
        }
        $this->stories->markViewed($storyId, $viewerId);
    }

    public function listViewers(string $storyId, string $authorId): array
    {
        $row = $this->stories->findById($storyId);
        if (!$row || $row['author_id'] !== $authorId) {
            throw new InvalidArgumentException('Story not found.');
        }
        $rows = $this->stories->listViewers($storyId);
        return array_map(static function ($r) {
            return [
                'id' => $r['id'],
                'storyId' => $r['story_id'],
                'viewerId' => $r['viewer_id'],
                'createdAt' => Mappers::iso($r['created_at'] ?? null),
                'viewer' => Mappers::profile([
                    'id' => $r['viewer_id'],
                    'username' => $r['username'],
                    'display_name' => $r['display_name'],
                    'avatar_url' => $r['avatar_url'],
                    'bio' => null,
                    'follower_count' => 0,
                    'following_count' => 0,
                    'is_deactivated' => 0,
                    'created_at' => null,
                ]),
            ];
        }, $rows);
    }

    public function delete(string $storyId, string $authorId): void
    {
        $row = $this->stories->findById($storyId);
        if (!$row || $row['author_id'] !== $authorId) {
            throw new InvalidArgumentException('Story not found.');
        }
        $this->stories->softDelete($storyId);
    }

    public function respondToSticker(string $userId, array $input): array
    {
        $mediaId = (string) ($input['storyMediaId'] ?? '');
        $stickerId = (string) ($input['stickerId'] ?? '');
        $response = $input['response'] ?? [];
        $media = $this->stories->findMedia($mediaId);
        if (!$media) {
            throw new InvalidArgumentException('Story media not found.');
        }
        $story = $this->getById((string) $media['story_id'], $userId);
        if (!$story) {
            throw new InvalidArgumentException('Story not found.');
        }
        $id = viora_uuid_v4();
        $this->stories->upsertStickerResponse(
            $id,
            $mediaId,
            $stickerId,
            $userId,
            json_encode(is_array($response) ? $response : ['value' => $response], JSON_THROW_ON_ERROR)
        );
        return [
            'id' => $id,
            'storyMediaId' => $mediaId,
            'stickerId' => $stickerId,
            'userId' => $userId,
            'response' => is_array($response) ? $response : ['value' => $response],
        ];
    }

    public function createHighlight(string $ownerId, array $input): array
    {
        $title = trim((string) ($input['title'] ?? ''));
        if ($title === '') {
            throw new InvalidArgumentException('Title is required.');
        }
        $id = viora_uuid_v4();
        $this->stories->createHighlight(
            $id,
            $ownerId,
            $title,
            isset($input['coverUrl']) ? (string) $input['coverUrl'] : null,
            (int) ($input['sortOrder'] ?? 0)
        );
        $row = $this->stories->findHighlight($id);
        return $this->mapHighlight($row ?? ['id' => $id, 'owner_id' => $ownerId, 'title' => $title]);
    }

    public function listHighlights(string $ownerId): array
    {
        return array_map(fn ($r) => $this->mapHighlight($r), $this->stories->listHighlights($ownerId));
    }

    public function deleteHighlight(string $highlightId, string $ownerId): void
    {
        $row = $this->stories->findHighlight($highlightId);
        if (!$row || $row['owner_id'] !== $ownerId) {
            throw new InvalidArgumentException('Highlight not found.');
        }
        $this->stories->deleteHighlight($highlightId);
    }

    public function addStoryToHighlight(string $highlightId, string $storyId, string $ownerId): array
    {
        $hl = $this->stories->findHighlight($highlightId);
        if (!$hl || $hl['owner_id'] !== $ownerId) {
            throw new InvalidArgumentException('Highlight not found.');
        }
        $story = $this->stories->findById($storyId);
        if (!$story || $story['author_id'] !== $ownerId) {
            throw new InvalidArgumentException('Story not found.');
        }
        $media = $this->stories->mediaForStory($storyId);
        if ($media === []) {
            throw new InvalidArgumentException('Story has no media.');
        }
        $first = $media[0];
        $itemId = viora_uuid_v4();
        $stickers = is_string($first['stickers'] ?? null) ? $first['stickers'] : json_encode($first['stickers'] ?? []);
        $this->stories->addHighlightItem(
            $itemId,
            $highlightId,
            $storyId,
            (string) $first['url'],
            (string) $first['media_type'],
            (string) $stickers,
            0
        );
        if (empty($hl['cover_url'])) {
            $this->stories->setHighlightCover($highlightId, (string) $first['url']);
        }
        return [
            'id' => $itemId,
            'highlightId' => $highlightId,
            'sourceStoryId' => $storyId,
            'url' => $first['url'],
            'mediaType' => $first['media_type'],
        ];
    }

    private function mapHighlight(array $row): array
    {
        return [
            'id' => $row['id'],
            'ownerId' => $row['owner_id'],
            'title' => $row['title'],
            'coverUrl' => $row['cover_url'] ?? null,
            'sortOrder' => (int) ($row['sort_order'] ?? 0),
            'createdAt' => Mappers::iso($row['created_at'] ?? null),
            'updatedAt' => Mappers::iso($row['updated_at'] ?? null),
        ];
    }

    private function hydrateOne(array $row, ?string $viewerId): array
    {
        $author = $this->profiles->findByUserId((string) $row['author_id']);
        $media = array_map(static fn ($m) => Mappers::storyMedia($m), $this->stories->mediaForStory((string) $row['id']));
        return Mappers::story($row, [
            'author' => Mappers::profile($author),
            'media' => $media,
            'viewedByCurrentUser' => $viewerId ? $this->stories->hasViewed((string) $row['id'], $viewerId) : false,
            'viewCount' => $this->stories->viewCount((string) $row['id']),
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
        $mediaMap = $this->stories->mediaForStories($ids);
        $out = [];
        foreach ($rows as $row) {
            $id = (string) $row['id'];
            $out[] = Mappers::story($row, [
                'author' => Mappers::profile($authors[(string) $row['author_id']] ?? null),
                'media' => array_map(static fn ($m) => Mappers::storyMedia($m), $mediaMap[$id] ?? []),
                'viewedByCurrentUser' => $viewerId ? $this->stories->hasViewed($id, $viewerId) : false,
                'viewCount' => $this->stories->viewCount($id),
            ]);
        }
        return $out;
    }
}
