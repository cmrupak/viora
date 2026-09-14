<?php

declare(strict_types=1);

final class DiscoveryService
{
    public function __construct(
        private readonly DiscoveryRepository $discovery,
        private readonly PostService $posts,
        private readonly ProfileRepository $profiles,
    ) {
    }

    public function listTrendingHashtags(int $limit = 20): array
    {
        $limit = max(1, min(50, $limit));
        return array_map([$this, 'mapHashtag'], $this->discovery->trendingHashtags($limit));
    }

    public function getHashtag(string $tag): ?array
    {
        $tag = ltrim(strtolower(trim($tag)), '#');
        $row = $this->discovery->findHashtag($tag);
        return $row ? $this->mapHashtag($row) : null;
    }

    public function listPostsByHashtag(string $tag, ?string $viewerId, int $limit, ?string $cursor): array
    {
        $tag = ltrim(strtolower(trim($tag)), '#');
        $ids = $this->discovery->postIdsByHashtag($tag, $limit, $cursor);
        return $this->loadPosts($ids, $viewerId);
    }

    public function listExplore(?string $viewerId, int $limit, ?string $cursor): array
    {
        $candidates = $this->discovery->exploreCandidates($limit * 2, $cursor);
        usort($candidates, function ($a, $b) {
            $scoreA = ((int) $a['like_count'] * 3) + ((int) $a['comment_count'] * 2) + (int) $a['share_count'];
            $scoreB = ((int) $b['like_count'] * 3) + ((int) $b['comment_count'] * 2) + (int) $b['share_count'];
            if ($this->discovery->hasMedia((string) $a['id'])) {
                $scoreA += 5;
            }
            if ($this->discovery->hasMedia((string) $b['id'])) {
                $scoreB += 5;
            }
            return $scoreB <=> $scoreA;
        });
        $ids = array_map(static fn ($r) => (string) $r['id'], array_slice($candidates, 0, $limit));
        return $this->loadPosts($ids, $viewerId);
    }

    public function searchPlaces(string $query, int $limit = 20): array
    {
        $query = trim($query);
        if (mb_strlen($query) < 2) {
            return [];
        }
        $limit = max(1, min(50, $limit));
        return array_map(static fn ($r) => [
            'locationName' => $r['location_name'],
            'postCount' => (int) ($r['post_count'] ?? 0),
        ], $this->discovery->searchPlaces($query, $limit));
    }

    public function listPostsByPlace(string $locationName, ?string $viewerId, int $limit, ?string $cursor): array
    {
        $ids = $this->discovery->postIdsByPlace($locationName, $limit, $cursor);
        return $this->loadPosts($ids, $viewerId);
    }

    public function listBirthdaysToday(int $limit = 30): array
    {
        return array_values(array_filter(array_map(
            static fn ($r) => Mappers::profile($r),
            $this->discovery->birthdaysToday(max(1, min(50, $limit)))
        )));
    }

    public function listMemories(string $userId, int $limit = 20): array
    {
        $rows = $this->discovery->memories($userId, max(1, min(50, $limit)));
        $ids = array_map(static fn ($r) => (string) $r['id'], $rows);
        return $this->loadPosts($ids, $userId);
    }

    /** @param list<string> $ids */
    private function loadPosts(array $ids, ?string $viewerId): array
    {
        $out = [];
        foreach ($ids as $id) {
            $post = $this->posts->getById($id, $viewerId);
            if ($post) {
                $out[] = $post;
            }
        }
        return $out;
    }

    private function mapHashtag(array $row): array
    {
        return [
            'id' => $row['id'],
            'tag' => $row['tag'],
            'postCount' => (int) ($row['post_count'] ?? 0),
            'createdAt' => Mappers::iso($row['created_at'] ?? null),
        ];
    }
}
