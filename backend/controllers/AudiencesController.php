<?php

declare(strict_types=1);

final class AudiencesController
{
    public function __construct(private readonly AudiencesService $audiences)
    {
    }

    public function create(array $auth): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'list' => $this->audiences->createList((string) $auth['sub'], (string) ($body['name'] ?? '')),
        ], 201);
    }

    public function list(array $auth): void
    {
        viora_json_response(['lists' => $this->audiences->listLists((string) $auth['sub'])]);
    }

    public function rename(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'list' => $this->audiences->renameList(
                $params['listId'] ?? '',
                (string) $auth['sub'],
                (string) ($body['name'] ?? '')
            ),
        ]);
    }

    public function delete(array $auth, array $params): void
    {
        $this->audiences->deleteList($params['listId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function listMembers(array $auth, array $params): void
    {
        viora_json_response([
            'profiles' => $this->audiences->listMembers($params['listId'] ?? '', (string) $auth['sub']),
        ]);
    }

    public function addMember(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $memberId = (string) ($body['memberId'] ?? $body['userId'] ?? '');
        viora_json_response([
            'profile' => $this->audiences->addMember($params['listId'] ?? '', (string) $auth['sub'], $memberId),
        ], 201);
    }

    public function removeMember(array $auth, array $params): void
    {
        $this->audiences->removeMember(
            $params['listId'] ?? '',
            (string) $auth['sub'],
            $params['memberId'] ?? ''
        );
        viora_json_response(['ok' => true]);
    }
}
