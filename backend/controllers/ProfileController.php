<?php

declare(strict_types=1);

final class ProfileController
{
    public function __construct(private readonly ProfileService $profiles)
    {
    }

    public function me(array $auth): void
    {
        $profile = $this->profiles->getById((string) $auth['sub']);
        if (!$profile) {
            throw new InvalidArgumentException('Profile not found.');
        }
        viora_json_response(['profile' => $profile]);
    }

    public function updateMe(array $auth): void
    {
        $body = viora_read_json_body();
        viora_json_response(['profile' => $this->profiles->update((string) $auth['sub'], $body)]);
    }

    public function getByUsername(array $params): void
    {
        $profile = $this->profiles->getByUsername($params['username'] ?? '');
        if (!$profile) {
            viora_json_error('Profile not found.', 404);
            return;
        }
        viora_json_response(['profile' => $profile]);
    }

    public function getById(array $params): void
    {
        $profile = $this->profiles->getById($params['userId'] ?? '');
        if (!$profile) {
            viora_json_error('Profile not found.', 404);
            return;
        }
        viora_json_response(['profile' => $profile]);
    }

    public function search(): void
    {
        $q = viora_query_string('q', '') ?? '';
        $limit = viora_query_int('limit', 20);
        viora_json_response(['profiles' => $this->profiles->search($q, $limit)]);
    }
}
