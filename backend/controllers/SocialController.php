<?php

declare(strict_types=1);

final class SocialController
{
    public function __construct(private readonly SocialService $social)
    {
    }

    public function toggleFollow(array $auth, array $params): void
    {
        viora_json_response($this->social->toggleFollow((string) $auth['sub'], $params['userId'] ?? ''));
    }

    public function listFollowers(array $params): void
    {
        viora_json_response([
            'profiles' => $this->social->listFollowers(
                $params['userId'] ?? '',
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function listFollowing(array $params): void
    {
        viora_json_response([
            'profiles' => $this->social->listFollowing(
                $params['userId'] ?? '',
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function listFollowRequests(array $auth): void
    {
        $direction = viora_query_string('direction', 'incoming') ?? 'incoming';
        viora_json_response([
            'requests' => $this->social->listFollowRequests(
                (string) $auth['sub'],
                $direction,
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function acceptFollowRequest(array $auth, array $params): void
    {
        viora_json_response(['request' => $this->social->acceptFollowRequest($params['requestId'] ?? '', (string) $auth['sub'])]);
    }

    public function rejectFollowRequest(array $auth, array $params): void
    {
        viora_json_response(['request' => $this->social->rejectFollowRequest($params['requestId'] ?? '', (string) $auth['sub'])]);
    }

    public function cancelFollowRequest(array $auth, array $params): void
    {
        $this->social->cancelFollowRequest($params['requestId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function sendFriendRequest(array $auth, array $params): void
    {
        viora_json_response(['request' => $this->social->sendFriendRequest((string) $auth['sub'], $params['userId'] ?? '')]);
    }

    public function acceptFriendRequest(array $auth, array $params): void
    {
        viora_json_response(['request' => $this->social->acceptFriendRequest($params['requestId'] ?? '', (string) $auth['sub'])]);
    }

    public function rejectFriendRequest(array $auth, array $params): void
    {
        viora_json_response(['request' => $this->social->rejectFriendRequest($params['requestId'] ?? '', (string) $auth['sub'])]);
    }

    public function cancelFriendRequest(array $auth, array $params): void
    {
        $this->social->cancelFriendRequest($params['requestId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function removeFriend(array $auth, array $params): void
    {
        $this->social->removeFriend((string) $auth['sub'], $params['userId'] ?? '');
        viora_json_response(['ok' => true]);
    }

    public function listFriends(array $params): void
    {
        viora_json_response([
            'profiles' => $this->social->listFriends(
                $params['userId'] ?? '',
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function listFriendRequests(array $auth): void
    {
        $direction = viora_query_string('direction', 'incoming') ?? 'incoming';
        viora_json_response([
            'requests' => $this->social->listFriendRequests(
                (string) $auth['sub'],
                $direction,
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function relationship(array $auth, array $params): void
    {
        viora_json_response([
            'relationship' => $this->social->getRelationshipStatus((string) $auth['sub'], $params['userId'] ?? ''),
        ]);
    }

    public function setMute(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $scope = array_key_exists('scope', $body) ? ($body['scope'] !== null ? (string) $body['scope'] : null) : 'all';
        viora_json_response($this->social->setMute((string) $auth['sub'], $params['userId'] ?? '', $scope));
    }

    public function unmute(array $auth, array $params): void
    {
        viora_json_response($this->social->setMute((string) $auth['sub'], $params['userId'] ?? '', null));
    }

    public function toggleRestrict(array $auth, array $params): void
    {
        viora_json_response($this->social->toggleRestrict((string) $auth['sub'], $params['userId'] ?? ''));
    }

    public function snooze(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $days = (int) ($body['days'] ?? 30);
        viora_json_response(['snooze' => $this->social->snooze((string) $auth['sub'], $params['userId'] ?? '', $days)]);
    }

    public function unsnooze(array $auth, array $params): void
    {
        $this->social->unsnooze((string) $auth['sub'], $params['userId'] ?? '');
        viora_json_response(['ok' => true]);
    }

    public function toggleCloseFriend(array $auth, array $params): void
    {
        viora_json_response($this->social->toggleCloseFriend((string) $auth['sub'], $params['userId'] ?? ''));
    }

    public function toggleFavorite(array $auth, array $params): void
    {
        viora_json_response($this->social->toggleFavorite((string) $auth['sub'], $params['userId'] ?? ''));
    }

    public function block(array $auth, array $params): void
    {
        $this->social->block((string) $auth['sub'], $params['userId'] ?? '');
        viora_json_response(['ok' => true]);
    }

    public function unblock(array $auth, array $params): void
    {
        $this->social->unblock((string) $auth['sub'], $params['userId'] ?? '');
        viora_json_response(['ok' => true]);
    }

    public function listBlocked(array $auth): void
    {
        viora_json_response([
            'profiles' => $this->social->listBlocked((string) $auth['sub'], viora_query_int('limit', 50)),
        ]);
    }

    public function listMutes(array $auth): void
    {
        viora_json_response(['mutes' => $this->social->listMutes((string) $auth['sub'])]);
    }

    public function listRestricts(array $auth): void
    {
        viora_json_response([
            'profiles' => $this->social->listRestricts((string) $auth['sub']),
        ]);
    }

    public function listSnoozes(array $auth): void
    {
        viora_json_response(['snoozes' => $this->social->listSnoozes((string) $auth['sub'])]);
    }

    public function listCloseFriends(array $auth): void
    {
        viora_json_response([
            'profiles' => $this->social->listCloseFriends((string) $auth['sub']),
        ]);
    }

    public function listFavorites(array $auth): void
    {
        viora_json_response([
            'profiles' => $this->social->listFavorites((string) $auth['sub']),
        ]);
    }

    public function removeFollower(array $auth, array $params): void
    {
        $userId = (string) $auth['sub'];
        if (($params['userId'] ?? '') !== '' && ($params['userId'] ?? '') !== $userId) {
            viora_json_error('Not allowed.', 403);
            return;
        }
        $this->social->removeFollower($userId, $params['followerId'] ?? '');
        viora_json_response(['ok' => true]);
    }

    public function listSuggestions(array $auth): void
    {
        viora_json_response([
            'profiles' => $this->social->listSuggestions((string) $auth['sub'], viora_query_int('limit', 20)),
        ]);
    }

    public function listMutualFriends(array $auth, array $params): void
    {
        viora_json_response([
            'profiles' => $this->social->listMutualFriends(
                (string) $auth['sub'],
                $params['userId'] ?? '',
                viora_query_int('limit', 20)
            ),
        ]);
    }
}
