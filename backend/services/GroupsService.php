<?php

declare(strict_types=1);

final class GroupsService
{
    public function __construct(
        private readonly GroupsRepository $groups,
        private readonly ProfileRepository $profiles,
        private readonly PostService $posts,
        private readonly AuthorizationService $authz,
    ) {
    }

    public function create(string $ownerId, array $input): array
    {
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') {
            throw new InvalidArgumentException('Group name is required.');
        }
        $visibility = (string) ($input['visibility'] ?? (!empty($input['isPrivate']) ? 'private' : 'public'));
        if (!in_array($visibility, ['public', 'private', 'hidden'], true)) {
            throw new InvalidArgumentException('Invalid visibility.');
        }
        $id = viora_uuid_v4();
        Database::begin();
        try {
            $this->groups->create([
                'id' => $id,
                'name' => $name,
                'description' => isset($input['description']) ? (string) $input['description'] : null,
                'cover_url' => isset($input['coverUrl']) ? (string) $input['coverUrl'] : null,
                'owner_id' => $ownerId,
                'is_private' => $visibility !== 'public' ? 1 : 0,
                'visibility' => $visibility,
                'requires_post_approval' => !empty($input['requiresPostApproval']) ? 1 : 0,
            ]);
            $this->groups->addMember(viora_uuid_v4(), $id, $ownerId, 'owner', 'active');
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        return $this->getById($id, $ownerId) ?? ['id' => $id];
    }

    public function update(string $groupId, string $actorId, array $input): array
    {
        if (!$this->authz->canManageGroup($groupId, $actorId)) {
            throw new InvalidArgumentException('Not allowed.');
        }
        $fields = [];
        if (array_key_exists('name', $input)) {
            $name = trim((string) $input['name']);
            if ($name === '') {
                throw new InvalidArgumentException('Group name is required.');
            }
            $fields['name'] = $name;
        }
        foreach (['description' => 'description', 'coverUrl' => 'cover_url'] as $in => $col) {
            if (array_key_exists($in, $input)) {
                $fields[$col] = $input[$in] !== null ? (string) $input[$in] : null;
            }
        }
        if (array_key_exists('visibility', $input)) {
            $visibility = (string) $input['visibility'];
            if (!in_array($visibility, ['public', 'private', 'hidden'], true)) {
                throw new InvalidArgumentException('Invalid visibility.');
            }
            $fields['visibility'] = $visibility;
            $fields['is_private'] = $visibility !== 'public' ? 1 : 0;
        }
        if (array_key_exists('requiresPostApproval', $input)) {
            $fields['requires_post_approval'] = $input['requiresPostApproval'] ? 1 : 0;
        }
        $this->groups->update($groupId, $fields);
        return $this->getById($groupId, $actorId) ?? ['id' => $groupId];
    }

    public function list(?string $viewerId, int $limit, ?string $cursor): array
    {
        $rows = $this->groups->list($limit, $cursor, $viewerId);
        return array_map(fn ($r) => $this->mapGroup($r, $viewerId), $rows);
    }

    public function getById(string $groupId, ?string $viewerId): ?array
    {
        $row = $this->groups->findById($groupId);
        if (!$row || !$this->authz->canViewGroup($row, $viewerId)) {
            return null;
        }
        return $this->mapGroup($row, $viewerId);
    }

    public function join(string $groupId, string $userId, array $answers = []): array
    {
        $group = $this->groups->findById($groupId);
        if (!$group) {
            throw new InvalidArgumentException('Group not found.');
        }
        $visibility = $group['visibility'] ?? 'public';
        if ($visibility === 'hidden') {
            throw new InvalidArgumentException('This group is invite-only.');
        }
        $status = ($visibility === 'private' || (int) ($group['is_private'] ?? 0) === 1) ? 'pending' : 'active';
        foreach ($answers as $ans) {
            if (!is_array($ans) || empty($ans['questionId'])) {
                continue;
            }
            $this->groups->upsertJoinAnswer(
                viora_uuid_v4(),
                (string) $ans['questionId'],
                $userId,
                (string) ($ans['answer'] ?? '')
            );
        }
        $this->groups->addMember(viora_uuid_v4(), $groupId, $userId, 'member', $status);
        $member = $this->groups->findMember($groupId, $userId);
        return Mappers::groupMember($member ?? [
            'id' => '',
            'group_id' => $groupId,
            'user_id' => $userId,
            'role' => 'member',
            'status' => $status,
        ], ['user' => Mappers::profile($this->profiles->findByUserId($userId))]);
    }

    public function approveMember(string $groupId, string $actorId, string $userId): array
    {
        if (!$this->authz->canManageGroup($groupId, $actorId)) {
            throw new InvalidArgumentException('Not allowed.');
        }
        $this->groups->setMemberStatus($groupId, $userId, 'active');
        $member = $this->groups->findMember($groupId, $userId);
        return Mappers::groupMember($member ?? ['id' => '', 'group_id' => $groupId, 'user_id' => $userId, 'role' => 'member', 'status' => 'active']);
    }

    public function rejectMember(string $groupId, string $actorId, string $userId): void
    {
        if (!$this->authz->canManageGroup($groupId, $actorId)) {
            throw new InvalidArgumentException('Not allowed.');
        }
        $this->groups->removeMember($groupId, $userId);
    }

    public function setMemberRole(string $groupId, string $actorId, string $userId, string $role): array
    {
        if (!$this->authz->canManageGroup($groupId, $actorId)) {
            throw new InvalidArgumentException('Not allowed.');
        }
        if (!in_array($role, ['admin', 'member'], true)) {
            throw new InvalidArgumentException('Invalid role.');
        }
        $group = $this->groups->findById($groupId);
        if ($group && (string) $group['owner_id'] === $userId) {
            throw new InvalidArgumentException('Cannot change owner role.');
        }
        $this->groups->setMemberRole($groupId, $userId, $role);
        $member = $this->groups->findMember($groupId, $userId);
        return Mappers::groupMember($member ?? ['id' => '', 'group_id' => $groupId, 'user_id' => $userId, 'role' => $role, 'status' => 'active']);
    }

    public function leave(string $groupId, string $userId): void
    {
        $group = $this->groups->findById($groupId);
        if ($group && (string) $group['owner_id'] === $userId) {
            throw new InvalidArgumentException('Owner cannot leave the group.');
        }
        $this->groups->removeMember($groupId, $userId);
    }

    public function listMembers(string $groupId, ?string $viewerId, int $limit, ?string $cursor, ?string $status): array
    {
        $group = $this->groups->findById($groupId);
        if (!$group || !$this->authz->canViewGroup($group, $viewerId)) {
            throw new InvalidArgumentException('Group not found.');
        }
        $rows = $this->groups->listMembers($groupId, $limit, $cursor, $status);
        return array_map(static function ($r) {
            return Mappers::groupMember($r, [
                'user' => Mappers::profile([
                    'id' => $r['user_id'],
                    'username' => $r['username'],
                    'display_name' => $r['display_name'],
                    'avatar_url' => $r['avatar_url'],
                    'bio' => null,
                    'follower_count' => 0,
                    'following_count' => 0,
                    'is_deactivated' => 0,
                    'created_at' => null,
                ]),
            ]);
        }, $rows);
    }

    public function createGroupPost(string $groupId, string $authorId, array $input): array
    {
        $group = $this->groups->findById($groupId);
        if (!$group) {
            throw new InvalidArgumentException('Group not found.');
        }
        $member = $this->groups->findMember($groupId, $authorId);
        if (!$member || ($member['status'] ?? '') !== 'active') {
            throw new InvalidArgumentException('Join the group to post.');
        }
        $post = $this->posts->create($authorId, $input);
        $approval = ((int) ($group['requires_post_approval'] ?? 0) === 1) ? 'pending' : 'approved';
        $this->groups->linkPost(viora_uuid_v4(), $groupId, (string) $post['id'], $approval);
        $post['groupApprovalStatus'] = $approval;
        return $post;
    }

    public function listGroupPosts(string $groupId, ?string $viewerId, int $limit, ?string $cursor, string $approval = 'approved'): array
    {
        $group = $this->groups->findById($groupId);
        if (!$group || !$this->authz->canViewGroup($group, $viewerId)) {
            throw new InvalidArgumentException('Group not found.');
        }
        if ($approval !== 'approved' && (!$viewerId || !$this->authz->canManageGroup($groupId, $viewerId))) {
            $approval = 'approved';
        }
        $rows = $this->groups->listGroupPostIds($groupId, $approval, $limit, $cursor);
        $out = [];
        foreach ($rows as $row) {
            $post = $this->posts->getById((string) $row['id'], $viewerId);
            if ($post) {
                $out[] = $post;
            }
        }
        return $out;
    }

    public function setGroupPostApproval(string $groupId, string $actorId, string $postId, string $status): void
    {
        if (!$this->authz->canManageGroup($groupId, $actorId)) {
            throw new InvalidArgumentException('Not allowed.');
        }
        if (!in_array($status, ['approved', 'pending', 'rejected'], true)) {
            throw new InvalidArgumentException('Invalid status.');
        }
        $this->groups->setPostApproval($groupId, $postId, $status);
    }

    public function listJoinQuestions(string $groupId): array
    {
        return array_map(static fn ($r) => [
            'id' => $r['id'],
            'groupId' => $r['group_id'],
            'prompt' => $r['prompt'],
            'sortOrder' => (int) ($r['sort_order'] ?? 0),
            'required' => (bool) ($r['required'] ?? true),
        ], $this->groups->listJoinQuestions($groupId));
    }

    public function addJoinQuestion(string $groupId, string $actorId, array $input): array
    {
        if (!$this->authz->canManageGroup($groupId, $actorId)) {
            throw new InvalidArgumentException('Not allowed.');
        }
        $prompt = trim((string) ($input['prompt'] ?? ''));
        if ($prompt === '') {
            throw new InvalidArgumentException('Prompt is required.');
        }
        $id = viora_uuid_v4();
        $this->groups->addJoinQuestion($id, $groupId, $prompt, (int) ($input['sortOrder'] ?? 0), ($input['required'] ?? true) !== false);
        return ['id' => $id, 'groupId' => $groupId, 'prompt' => $prompt];
    }

    public function deleteJoinQuestion(string $groupId, string $actorId, string $questionId): void
    {
        if (!$this->authz->canManageGroup($groupId, $actorId)) {
            throw new InvalidArgumentException('Not allowed.');
        }
        $this->groups->deleteJoinQuestion($questionId);
    }

    public function createBroadcastChannel(string $groupId, string $actorId, array $input): array
    {
        if (!$this->authz->canManageGroup($groupId, $actorId)) {
            throw new InvalidArgumentException('Not allowed.');
        }
        $name = trim((string) ($input['name'] ?? ''));
        if ($name === '') {
            throw new InvalidArgumentException('Channel name is required.');
        }
        $id = viora_uuid_v4();
        $this->groups->createBroadcastChannel(
            $id,
            $groupId,
            $name,
            isset($input['description']) ? (string) $input['description'] : null,
            $actorId
        );
        return ['id' => $id, 'groupId' => $groupId, 'name' => $name];
    }

    public function listBroadcastChannels(string $groupId, ?string $viewerId): array
    {
        $group = $this->groups->findById($groupId);
        if (!$group || !$this->authz->canViewGroup($group, $viewerId)) {
            throw new InvalidArgumentException('Group not found.');
        }
        return array_map(static fn ($r) => [
            'id' => $r['id'],
            'groupId' => $r['group_id'],
            'name' => $r['name'],
            'description' => $r['description'] ?? null,
            'createdBy' => $r['created_by'],
            'createdAt' => Mappers::iso($r['created_at'] ?? null),
        ], $this->groups->listBroadcastChannels($groupId));
    }

    public function postBroadcast(string $channelId, string $authorId, string $body): array
    {
        $body = trim($body);
        if ($body === '') {
            throw new InvalidArgumentException('Message body is required.');
        }
        $channel = $this->groups->findBroadcastChannel($channelId);
        if (!$channel) {
            throw new InvalidArgumentException('Channel not found.');
        }
        if (!$this->authz->canManageGroup((string) $channel['group_id'], $authorId)) {
            throw new InvalidArgumentException('Not allowed.');
        }
        $id = viora_uuid_v4();
        $this->groups->postBroadcast($id, $channelId, $authorId, $body);
        return ['id' => $id, 'channelId' => $channelId, 'authorId' => $authorId, 'body' => $body];
    }

    public function listBroadcastMessages(string $channelId, ?string $viewerId, int $limit, ?string $cursor): array
    {
        $channel = $this->groups->findBroadcastChannel($channelId);
        if (!$channel) {
            throw new InvalidArgumentException('Channel not found.');
        }
        $group = $this->groups->findById((string) $channel['group_id']);
        if (!$group || !$this->authz->canViewGroup($group, $viewerId)) {
            throw new InvalidArgumentException('Channel not found.');
        }
        return array_map(static fn ($r) => [
            'id' => $r['id'],
            'channelId' => $r['channel_id'],
            'authorId' => $r['author_id'],
            'body' => $r['body'],
            'createdAt' => Mappers::iso($r['created_at'] ?? null),
        ], $this->groups->listBroadcastMessages($channelId, $limit, $cursor));
    }

    private function mapGroup(array $row, ?string $viewerId): array
    {
        $membership = null;
        if ($viewerId) {
            $m = $this->groups->findMember((string) $row['id'], $viewerId);
            if ($m) {
                $membership = Mappers::groupMember($m);
            }
        }
        return Mappers::group($row, [
            'memberCount' => $this->groups->memberCount((string) $row['id']),
            'myMembership' => $membership,
        ]);
    }
}
