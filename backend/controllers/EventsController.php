<?php

declare(strict_types=1);

final class EventsController
{
    public function __construct(private readonly EventsService $events)
    {
    }

    public function create(array $auth): void
    {
        viora_json_response(['event' => $this->events->create((string) $auth['sub'], viora_read_json_body())], 201);
    }

    public function list(array $authUser): void
    {
        viora_json_response([
            'events' => $this->events->list(
                $authUser['sub'] ?? null,
                viora_query_int('limit', 20),
                viora_query_string('cursor'),
                viora_query_string('groupId')
            ),
        ]);
    }

    public function get(array $authUser, array $params): void
    {
        $event = $this->events->getById($params['eventId'] ?? '', $authUser['sub'] ?? null);
        if (!$event) {
            viora_json_error('Event not found.', 404);
            return;
        }
        viora_json_response(['event' => $event]);
    }

    public function delete(array $auth, array $params): void
    {
        $this->events->delete($params['eventId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function rsvp(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'member' => $this->events->join(
                $params['eventId'] ?? '',
                (string) $auth['sub'],
                (string) ($body['status'] ?? 'interested')
            ),
        ]);
    }

    public function leave(array $auth, array $params): void
    {
        $this->events->leave($params['eventId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function listMembers(array $params): void
    {
        viora_json_response([
            'members' => $this->events->listMembers(
                $params['eventId'] ?? '',
                viora_query_int('limit', 30),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function invite(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'invite' => $this->events->invite(
                $params['eventId'] ?? '',
                (string) $auth['sub'],
                (string) ($body['inviteeId'] ?? '')
            ),
        ], 201);
    }

    public function myInvites(array $auth): void
    {
        viora_json_response(['invites' => $this->events->listMyInvites((string) $auth['sub'])]);
    }

    public function respondInvite(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'invite' => $this->events->respondToInvite(
                $params['inviteId'] ?? '',
                (string) $auth['sub'],
                (string) ($body['status'] ?? '')
            ),
        ]);
    }
}
