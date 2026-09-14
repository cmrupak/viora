<?php

declare(strict_types=1);

final class SocialService
{
    public function __construct(
        private readonly ProfileRepository $profiles,
        private readonly SocialGraphRepository $graph,
        private readonly AuthorizationService $authz,
    ) {
    }

    public function toggleFollow(string $followerId, string $followingId): array
    {
        if ($followerId === $followingId) {
            throw new InvalidArgumentException('You cannot follow yourself.');
        }
        if ($this->authz->isBlockedEitherWay($followerId, $followingId)) {
            throw new InvalidArgumentException('Unable to follow this user.');
        }
        $target = $this->profiles->findByUserId($followingId);
        if (!$target || (int) ($target['is_deactivated'] ?? 0) === 1) {
            throw new InvalidArgumentException('User not found.');
        }

        if ($this->graph->followExists($followerId, $followingId)) {
            Database::begin();
            try {
                $this->graph->deleteFollow($followerId, $followingId);
                $this->profiles->bumpFollowCounts($followerId, $followingId, -1);
                Database::commit();
            } catch (Throwable $e) {
                Database::rollback();
                throw $e;
            }
            return ['active' => false];
        }

        if ((int) ($target['is_private'] ?? 0) === 1) {
            $this->graph->createFollowRequest(viora_uuid_v4(), $followerId, $followingId);
            return ['active' => false, 'pendingRequest' => true];
        }

        Database::begin();
        try {
            $this->graph->createFollow(viora_uuid_v4(), $followerId, $followingId);
            $this->profiles->bumpFollowCounts($followerId, $followingId, 1);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        return ['active' => true];
    }

    public function acceptFollowRequest(string $requestId, string $userId): array
    {
        $row = $this->graph->findFollowRequest($requestId);
        if (!$row || $row['to_user_id'] !== $userId || $row['status'] !== 'pending') {
            throw new InvalidArgumentException('Follow request not found.');
        }
        $from = (string) $row['from_user_id'];
        $to = (string) $row['to_user_id'];
        Database::begin();
        try {
            if (!$this->graph->followExists($from, $to)) {
                $this->graph->createFollow(viora_uuid_v4(), $from, $to);
                $this->profiles->bumpFollowCounts($from, $to, 1);
            }
            $this->graph->setFollowRequestStatus($requestId, 'accepted');
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        return $this->mapRequest($this->graph->findFollowRequest($requestId));
    }

    public function rejectFollowRequest(string $requestId, string $userId): array
    {
        $row = $this->graph->findFollowRequest($requestId);
        if (!$row || $row['to_user_id'] !== $userId || $row['status'] !== 'pending') {
            throw new InvalidArgumentException('Follow request not found.');
        }
        $this->graph->setFollowRequestStatus($requestId, 'rejected');
        return $this->mapRequest($this->graph->findFollowRequest($requestId));
    }

    public function cancelFollowRequest(string $requestId, string $userId): void
    {
        $row = $this->graph->findFollowRequest($requestId);
        if (!$row || $row['from_user_id'] !== $userId) {
            throw new InvalidArgumentException('Follow request not found.');
        }
        $this->graph->deleteFollowRequest($requestId);
    }

    public function listFollowRequests(string $userId, string $direction, int $limit, ?string $cursor): array
    {
        $rows = $this->graph->listFollowRequests($userId, $direction === 'outgoing' ? 'outgoing' : 'incoming', $limit, $cursor);
        return array_map(fn ($r) => $this->mapRequest($r), $rows);
    }

    public function listFollowers(string $userId, int $limit, ?string $cursor): array
    {
        return array_values(array_filter(array_map(
            static fn ($r) => Mappers::profile($r),
            $this->graph->listFollowerProfiles($userId, $limit, $cursor)
        )));
    }

    public function listFollowing(string $userId, int $limit, ?string $cursor): array
    {
        return array_values(array_filter(array_map(
            static fn ($r) => Mappers::profile($r),
            $this->graph->listFollowingProfiles($userId, $limit, $cursor)
        )));
    }

    public function sendFriendRequest(string $from, string $to): array
    {
        if ($from === $to) {
            throw new InvalidArgumentException('You cannot friend yourself.');
        }
        if ($this->authz->isBlockedEitherWay($from, $to)) {
            throw new InvalidArgumentException('Unable to send friend request.');
        }
        if ($this->authz->areFriends($from, $to)) {
            throw new InvalidArgumentException('You are already friends.');
        }
        $row = $this->graph->createFriendRequest(viora_uuid_v4(), $from, $to);
        return $this->mapRequest($row);
    }

    public function acceptFriendRequest(string $requestId, string $userId): array
    {
        $row = $this->graph->findFriendRequest($requestId);
        if (!$row || $row['to_user_id'] !== $userId || $row['status'] !== 'pending') {
            throw new InvalidArgumentException('Friend request not found.');
        }
        $from = (string) $row['from_user_id'];
        $to = (string) $row['to_user_id'];
        Database::begin();
        try {
            $this->graph->ensureFriendship($from, $to);
            // Mutual follows like Supabase trigger
            if (!$this->graph->followExists($from, $to)) {
                $this->graph->createFollow(viora_uuid_v4(), $from, $to);
                $this->profiles->bumpFollowCounts($from, $to, 1);
            }
            if (!$this->graph->followExists($to, $from)) {
                $this->graph->createFollow(viora_uuid_v4(), $to, $from);
                $this->profiles->bumpFollowCounts($to, $from, 1);
            }
            $this->graph->setFriendRequestStatus($requestId, 'accepted');
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
        return $this->mapRequest($this->graph->findFriendRequest($requestId));
    }

    public function rejectFriendRequest(string $requestId, string $userId): array
    {
        $row = $this->graph->findFriendRequest($requestId);
        if (!$row || $row['to_user_id'] !== $userId || $row['status'] !== 'pending') {
            throw new InvalidArgumentException('Friend request not found.');
        }
        $this->graph->setFriendRequestStatus($requestId, 'rejected');
        return $this->mapRequest($this->graph->findFriendRequest($requestId));
    }

    public function cancelFriendRequest(string $requestId, string $userId): void
    {
        $row = $this->graph->findFriendRequest($requestId);
        if (!$row || $row['from_user_id'] !== $userId) {
            throw new InvalidArgumentException('Friend request not found.');
        }
        $this->graph->deleteFriendRequest($requestId);
    }

    public function removeFriend(string $userId, string $friendId): void
    {
        $this->graph->deleteFriendship($userId, $friendId);
    }

    public function listFriends(string $userId, int $limit, ?string $cursor): array
    {
        return array_values(array_filter(array_map(
            static fn ($r) => Mappers::profile($r),
            $this->graph->listFriendProfiles($userId, $limit, $cursor)
        )));
    }

    public function listFriendRequests(string $userId, string $direction, int $limit, ?string $cursor): array
    {
        $rows = $this->graph->listFriendRequests($userId, $direction, $limit, $cursor);
        return array_map(fn ($r) => $this->mapRequest($r), $rows);
    }

    public function getRelationshipStatus(string $viewerId, string $otherId): array
    {
        if ($viewerId === $otherId) {
            return [
                'following' => false,
                'followedBy' => false,
                'friends' => false,
                'blocked' => false,
                'blockedBy' => false,
                'mutualFriendsCount' => 0,
            ];
        }
        $outgoingFriend = $this->graph->findFriendRequestPair($viewerId, $otherId);
        $incomingFriend = $this->graph->findFriendRequestPair($otherId, $viewerId);
        $outgoingFollow = $this->graph->findFollowRequestPair($viewerId, $otherId);
        $incomingFollow = $this->graph->findFollowRequestPair($otherId, $viewerId);
        $mute = $this->graph->findMute($viewerId, $otherId);
        $snooze = $this->graph->findActiveSnooze($viewerId, $otherId);

        return [
            'following' => $this->authz->isFollowing($viewerId, $otherId),
            'followedBy' => $this->authz->isFollowing($otherId, $viewerId),
            'friends' => $this->authz->areFriends($viewerId, $otherId),
            'outgoingFriendRequest' => $outgoingFriend && $outgoingFriend['status'] === 'pending',
            'incomingFriendRequest' => $incomingFriend && $incomingFriend['status'] === 'pending',
            'outgoingFriendRequestId' => ($outgoingFriend && $outgoingFriend['status'] === 'pending') ? $outgoingFriend['id'] : null,
            'incomingFriendRequestId' => ($incomingFriend && $incomingFriend['status'] === 'pending') ? $incomingFriend['id'] : null,
            'blocked' => $this->graph->isBlocked($viewerId, $otherId),
            'blockedBy' => $this->graph->isBlocked($otherId, $viewerId),
            'mutualFriendsCount' => $this->graph->countMutualFriends($viewerId, $otherId),
            'muteScope' => $mute['scope'] ?? null,
            'restricted' => $this->graph->findRestrict($viewerId, $otherId),
            'snoozed' => (bool) $snooze,
            'snoozeExpiresAt' => $snooze ? Mappers::iso($snooze['expires_at'] ?? null) : null,
            'closeFriend' => $this->graph->findCloseFriend($viewerId, $otherId),
            'favorited' => $this->graph->findFavorite($viewerId, $otherId),
            'outgoingFollowRequest' => $outgoingFollow && $outgoingFollow['status'] === 'pending',
            'incomingFollowRequest' => $incomingFollow && $incomingFollow['status'] === 'pending',
            'outgoingFollowRequestId' => ($outgoingFollow && $outgoingFollow['status'] === 'pending') ? $outgoingFollow['id'] : null,
            'incomingFollowRequestId' => ($incomingFollow && $incomingFollow['status'] === 'pending') ? $incomingFollow['id'] : null,
        ];
    }

    public function setMute(string $ownerId, string $targetId, ?string $scope): array
    {
        $this->assertNotSelf($ownerId, $targetId);
        if ($scope !== null && !in_array($scope, ['posts', 'stories', 'all'], true)) {
            throw new InvalidArgumentException('Invalid mute scope.');
        }
        return $this->graph->setMute($ownerId, $targetId, $scope);
    }

    public function toggleRestrict(string $ownerId, string $targetId): array
    {
        $this->assertNotSelf($ownerId, $targetId);
        return $this->graph->toggleRestrict($ownerId, $targetId);
    }

    public function snooze(string $ownerId, string $targetId, int $days = 30): array
    {
        $this->assertNotSelf($ownerId, $targetId);
        return $this->graph->snooze($ownerId, $targetId, max(1, min(365, $days)));
    }

    public function unsnooze(string $ownerId, string $targetId): void
    {
        $this->graph->unsnooze($ownerId, $targetId);
    }

    public function toggleCloseFriend(string $ownerId, string $friendId): array
    {
        $this->assertNotSelf($ownerId, $friendId);
        return $this->graph->toggleCloseFriend($ownerId, $friendId);
    }

    public function toggleFavorite(string $ownerId, string $targetId): array
    {
        $this->assertNotSelf($ownerId, $targetId);
        return $this->graph->toggleFavorite($ownerId, $targetId);
    }

    public function block(string $blockerId, string $blockedId): void
    {
        $this->assertNotSelf($blockerId, $blockedId);
        Database::begin();
        try {
            $this->graph->createBlock(viora_uuid_v4(), $blockerId, $blockedId);
            $this->graph->deleteFollow($blockerId, $blockedId);
            $this->graph->deleteFollow($blockedId, $blockerId);
            $this->graph->deleteFriendship($blockerId, $blockedId);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
    }

    public function unblock(string $blockerId, string $blockedId): void
    {
        $this->graph->deleteBlock($blockerId, $blockedId);
    }

    public function listBlocked(string $ownerId, int $limit): array
    {
        return array_values(array_filter(array_map(
            static fn ($r) => Mappers::profile($r),
            $this->graph->listBlocked($ownerId, $limit)
        )));
    }

    public function listMutes(string $ownerId): array
    {
        $out = [];
        foreach ($this->graph->listMutes($ownerId) as $row) {
            $profile = Mappers::profile($row);
            if (!$profile) {
                continue;
            }
            $out[] = [
                'profile' => $profile,
                'scope' => $row['scope'] ?? 'all',
                'createdAt' => Mappers::iso($row['muted_at'] ?? null),
                'updatedAt' => Mappers::iso($row['mute_updated_at'] ?? null),
            ];
        }
        return $out;
    }

    public function listRestricts(string $ownerId): array
    {
        return array_values(array_filter(array_map(
            static fn ($r) => Mappers::profile($r),
            $this->graph->listRestricts($ownerId)
        )));
    }

    /** @return list<string> */
    public function listRestrictedTargetIds(string $ownerId): array
    {
        return $this->graph->listRestrictedTargetIds($ownerId);
    }

    public function listSnoozes(string $ownerId): array
    {
        $out = [];
        foreach ($this->graph->listSnoozes($ownerId) as $row) {
            $profile = Mappers::profile($row);
            if (!$profile) {
                continue;
            }
            $out[] = [
                'profile' => $profile,
                'expiresAt' => Mappers::iso($row['expires_at'] ?? null),
                'createdAt' => Mappers::iso($row['snoozed_at'] ?? null),
                'updatedAt' => Mappers::iso($row['snooze_updated_at'] ?? null),
            ];
        }
        return $out;
    }

    public function listCloseFriends(string $ownerId): array
    {
        return array_values(array_filter(array_map(
            static fn ($r) => Mappers::profile($r),
            $this->graph->listCloseFriends($ownerId)
        )));
    }

    public function listFavorites(string $ownerId): array
    {
        return array_values(array_filter(array_map(
            static fn ($r) => Mappers::profile($r),
            $this->graph->listFavorites($ownerId)
        )));
    }

    /** @return list<string> */
    public function listFavoriteIds(string $ownerId): array
    {
        return $this->graph->listFavoriteIds($ownerId);
    }

    /** @return list<string> */
    public function listFeedHiddenAuthorIds(string $viewerId): array
    {
        return $this->graph->listFeedHiddenAuthorIds($viewerId);
    }

    /** @return list<string> */
    public function listStoryHiddenAuthorIds(string $viewerId): array
    {
        return $this->graph->listStoryHiddenAuthorIds($viewerId);
    }

    public function removeFollower(string $userId, string $followerId): void
    {
        if ($userId === $followerId) {
            throw new InvalidArgumentException('Invalid follower.');
        }
        if (!$this->graph->followExists($followerId, $userId)) {
            throw new InvalidArgumentException('Follower not found.');
        }
        Database::begin();
        try {
            $this->graph->removeFollower($userId, $followerId);
            $this->profiles->bumpFollowCounts($followerId, $userId, -1);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }
    }

    public function listSuggestions(string $userId, int $limit): array
    {
        return array_values(array_filter(array_map(
            static fn ($r) => Mappers::profile($r),
            $this->graph->listSuggestions($userId, $limit)
        )));
    }

    public function listMutualFriends(string $userId, string $otherId, int $limit): array
    {
        return array_values(array_filter(array_map(
            static fn ($r) => Mappers::profile($r),
            $this->graph->listMutualFriends($userId, $otherId, $limit)
        )));
    }

    private function assertNotSelf(string $a, string $b): void
    {
        if ($a === $b) {
            throw new InvalidArgumentException('Invalid target user.');
        }
    }

    private function mapRequest(?array $row): array
    {
        if (!$row) {
            return [];
        }
        $from = Mappers::profile($this->profiles->findByUserId((string) $row['from_user_id']));
        $to = Mappers::profile($this->profiles->findByUserId((string) $row['to_user_id']));
        return [
            'id' => $row['id'],
            'fromUserId' => $row['from_user_id'],
            'toUserId' => $row['to_user_id'],
            'status' => $row['status'],
            'createdAt' => Mappers::iso($row['created_at'] ?? null),
            'updatedAt' => Mappers::iso($row['updated_at'] ?? null),
            'fromUser' => $from,
            'toUser' => $to,
        ];
    }
}
