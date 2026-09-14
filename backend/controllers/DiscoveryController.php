<?php

declare(strict_types=1);

final class DiscoveryController
{
    public function __construct(private readonly DiscoveryService $discovery)
    {
    }

    public function trendingHashtags(): void
    {
        viora_json_response(['hashtags' => $this->discovery->listTrendingHashtags(viora_query_int('limit', 20))]);
    }

    public function getHashtag(array $params): void
    {
        $tag = $this->discovery->getHashtag($params['tag'] ?? '');
        if (!$tag) {
            viora_json_error('Hashtag not found.', 404);
            return;
        }
        viora_json_response(['hashtag' => $tag]);
    }

    public function hashtagPosts(array $authUser, array $params): void
    {
        viora_json_response([
            'posts' => $this->discovery->listPostsByHashtag(
                $params['tag'] ?? '',
                $authUser['sub'] ?? null,
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function explore(array $authUser): void
    {
        viora_json_response([
            'posts' => $this->discovery->listExplore(
                $authUser['sub'] ?? null,
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function searchPlaces(): void
    {
        viora_json_response([
            'places' => $this->discovery->searchPlaces(viora_query_string('q', '') ?? '', viora_query_int('limit', 20)),
        ]);
    }

    public function placePosts(array $authUser, array $params): void
    {
        viora_json_response([
            'posts' => $this->discovery->listPostsByPlace(
                urldecode($params['locationName'] ?? ''),
                $authUser['sub'] ?? null,
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function birthdays(): void
    {
        viora_json_response(['profiles' => $this->discovery->listBirthdaysToday(viora_query_int('limit', 30))]);
    }

    public function memories(array $auth): void
    {
        viora_json_response([
            'posts' => $this->discovery->listMemories((string) $auth['sub'], viora_query_int('limit', 20)),
        ]);
    }
}
