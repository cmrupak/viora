<?php

declare(strict_types=1);

final class ProfileService
{
    public function __construct(
        private readonly ProfileRepository $profiles,
        private readonly AuthorizationService $authz,
    ) {
    }

    public function getById(string $userId): ?array
    {
        return Mappers::profile($this->profiles->findByUserId($userId));
    }

    public function getByUsername(string $username): ?array
    {
        return Mappers::profile($this->profiles->findByUsername(strtolower(trim($username))));
    }

    public function search(string $query, int $limit = 20): array
    {
        $q = trim($query);
        if ($q === '') {
            return [];
        }
        $limit = max(1, min(50, $limit));
        return array_values(array_filter(array_map(
            static fn ($row) => Mappers::profile($row),
            $this->profiles->search($q, $limit)
        )));
    }

    public function update(string $userId, array $input): array
    {
        $existing = $this->profiles->findByUserId($userId);
        if (!$existing) {
            throw new InvalidArgumentException('Profile not found.');
        }

        $fields = [];
        if (array_key_exists('displayName', $input)) {
            $displayName = trim((string) $input['displayName']);
            if ($displayName === '') {
                throw new InvalidArgumentException('Display name is required.');
            }
            $fields['display_name'] = $displayName;
        }

        if (array_key_exists('username', $input)) {
            $username = strtolower(trim((string) $input['username']));
            if (!preg_match('/^[a-z0-9_]{3,24}$/', $username)) {
                throw new InvalidArgumentException('Username must be 3–24 characters (a-z, 0-9, _).');
            }
            if ($this->profiles->usernameExists($username, $userId)) {
                throw new InvalidArgumentException('That username is taken.');
            }
            $fields['username'] = $username;
        }
        if (array_key_exists('bio', $input)) {
            $bio = (string) $input['bio'];
            if (mb_strlen($bio) > 280) {
                throw new InvalidArgumentException('Bio must be 280 characters or less.');
            }
            $fields['bio'] = $bio;
        }
        foreach (['website', 'location', 'coverUrl', 'avatarUrl'] as $key) {
            if (array_key_exists($key, $input)) {
                $col = match ($key) {
                    'coverUrl' => 'cover_url',
                    'avatarUrl' => 'avatar_url',
                    default => $key,
                };
                $fields[$col] = $input[$key] !== null ? (string) $input[$key] : null;
            }
        }
        if (array_key_exists('isPrivate', $input)) {
            $fields['is_private'] = $input['isPrivate'] ? 1 : 0;
            if ($input['isPrivate'] && !array_key_exists('tagReviewEnabled', $input)) {
                $fields['tag_review_enabled'] = 1;
            }
        }
        if (array_key_exists('tagReviewEnabled', $input)) {
            $fields['tag_review_enabled'] = $input['tagReviewEnabled'] ? 1 : 0;
        }

        if ($fields === []) {
            throw new InvalidArgumentException('No profile fields to update.');
        }

        $this->profiles->update($userId, $fields);
        $profile = $this->getById($userId);
        if (!$profile) {
            throw new RuntimeException('Profile not found.');
        }
        return $profile;
    }
}
