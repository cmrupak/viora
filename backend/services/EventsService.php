<?php

declare(strict_types=1);

final class EventsService
{
    public function __construct(
        private readonly EventsRepository $events,
        private readonly ProfileRepository $profiles,
        private readonly PostService $posts,
    ) {
    }

    public function create(string $hostId, array $input): array
    {
        $title = trim((string) ($input['title'] ?? ''));
        $startsAt = $this->normalizeDateTime((string) ($input['startsAt'] ?? ''));
        if ($title === '' || $startsAt === null) {
            throw new InvalidArgumentException('Title and startsAt are required.');
        }
        $endsAt = isset($input['endsAt']) ? $this->normalizeDateTime((string) $input['endsAt']) : null;
        $id = viora_uuid_v4();
        $post = $this->posts->create($hostId, [
            'body' => 'Event discussion: ' . $title,
            'visibility' => 'public',
        ]);
        $discussionPostId = (string) $post['id'];
        $this->events->create([
            'id' => $id,
            'title' => $title,
            'description' => isset($input['description']) ? (string) $input['description'] : null,
            'cover_url' => isset($input['coverUrl']) ? (string) $input['coverUrl'] : null,
            'location' => isset($input['location']) ? (string) $input['location'] : null,
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'host_id' => $hostId,
            'group_id' => isset($input['groupId']) ? (string) $input['groupId'] : null,
            'is_online' => !empty($input['isOnline']) ? 1 : 0,
            'meeting_url' => isset($input['meetingUrl']) ? (string) $input['meetingUrl'] : null,
            'recurrence_rule' => isset($input['recurrenceRule']) ? (string) $input['recurrenceRule'] : null,
            'discussion_post_id' => $discussionPostId,
        ]);
        $this->events->upsertMember(viora_uuid_v4(), $id, $hostId, 'going');
        return $this->getById($id, $hostId) ?? ['id' => $id];
    }

    public function list(?string $viewerId, int $limit, ?string $cursor, ?string $groupId): array
    {
        $rows = $this->events->list($limit, $cursor, $groupId);
        return array_map(fn ($r) => $this->mapEvent($r, $viewerId), $rows);
    }

    public function getById(string $eventId, ?string $viewerId = null): ?array
    {
        $row = $this->events->findById($eventId);
        if (!$row) {
            return null;
        }
        return $this->mapEvent($row, $viewerId);
    }

    public function join(string $eventId, string $userId, string $status = 'interested'): array
    {
        if (!in_array($status, ['going', 'interested', 'declined'], true)) {
            throw new InvalidArgumentException('Invalid RSVP status.');
        }
        if (!$this->events->findById($eventId)) {
            throw new InvalidArgumentException('Event not found.');
        }
        $row = $this->events->upsertMember(viora_uuid_v4(), $eventId, $userId, $status);
        return $this->mapMember($row);
    }

    public function leave(string $eventId, string $userId): void
    {
        $this->events->removeMember($eventId, $userId);
    }

    public function delete(string $eventId, string $hostId): void
    {
        $row = $this->events->findById($eventId);
        if (!$row || $row['host_id'] !== $hostId) {
            throw new InvalidArgumentException('Event not found.');
        }
        $this->events->delete($eventId);
    }

    public function listMembers(string $eventId, int $limit, ?string $cursor): array
    {
        if (!$this->events->findById($eventId)) {
            throw new InvalidArgumentException('Event not found.');
        }
        return array_map(fn ($r) => $this->mapMember($r, true), $this->events->listMembers($eventId, $limit, $cursor));
    }

    public function invite(string $eventId, string $invitedBy, string $inviteeId): array
    {
        if (!$this->events->findById($eventId)) {
            throw new InvalidArgumentException('Event not found.');
        }
        $row = $this->events->upsertInvite(viora_uuid_v4(), $eventId, $inviteeId, $invitedBy);
        return $this->mapInvite($row);
    }

    public function listMyInvites(string $userId): array
    {
        return array_map(fn ($r) => $this->mapInvite($r), $this->events->listMyInvites($userId));
    }

    public function respondToInvite(string $inviteId, string $userId, string $status): array
    {
        if (!in_array($status, ['accepted', 'declined'], true)) {
            throw new InvalidArgumentException('Invalid invite response.');
        }
        $invite = $this->events->findInvite($inviteId);
        if (!$invite || $invite['invitee_id'] !== $userId) {
            throw new InvalidArgumentException('Invite not found.');
        }
        $this->events->setInviteStatus($inviteId, $status);
        if ($status === 'accepted') {
            $this->events->upsertMember(viora_uuid_v4(), (string) $invite['event_id'], $userId, 'going');
        }
        return $this->mapInvite($this->events->findInvite($inviteId) ?? $invite);
    }

    private function mapEvent(array $row, ?string $viewerId): array
    {
        $myRsvp = null;
        if ($viewerId) {
            $m = $this->events->findMember((string) $row['id'], $viewerId);
            if ($m) {
                $myRsvp = $this->mapMember($m);
            }
        }
        return Mappers::event($row, [
            'host' => Mappers::profile($this->profiles->findByUserId((string) $row['host_id'])),
            'myRsvp' => $myRsvp,
        ]);
    }

    private function mapMember(array $row, bool $withUser = false): array
    {
        $out = [
            'id' => $row['id'],
            'eventId' => $row['event_id'],
            'userId' => $row['user_id'],
            'status' => $row['status'],
            'createdAt' => Mappers::iso($row['created_at'] ?? null),
        ];
        if ($withUser && isset($row['username'])) {
            $out['user'] = Mappers::profile([
                'id' => $row['user_id'],
                'username' => $row['username'],
                'display_name' => $row['display_name'],
                'avatar_url' => $row['avatar_url'],
                'bio' => null,
                'follower_count' => 0,
                'following_count' => 0,
                'is_deactivated' => 0,
                'created_at' => null,
            ]);
        }
        return $out;
    }

    private function mapInvite(array $row): array
    {
        return [
            'id' => $row['id'],
            'eventId' => $row['event_id'],
            'inviteeId' => $row['invitee_id'],
            'invitedBy' => $row['invited_by'],
            'status' => $row['status'],
            'createdAt' => Mappers::iso($row['created_at'] ?? null),
        ];
    }

    /** Accept ISO-8601 or MySQL datetime; store as UTC `Y-m-d H:i:s`. */
    private function normalizeDateTime(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        try {
            $dt = new DateTimeImmutable($value);
            return $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        } catch (Exception) {
            throw new InvalidArgumentException('Invalid datetime: ' . $value);
        }
    }
}
