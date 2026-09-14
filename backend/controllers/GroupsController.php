<?php

declare(strict_types=1);

final class GroupsController
{
    public function __construct(private readonly GroupsService $groups)
    {
    }

    public function create(array $auth): void
    {
        viora_json_response(['group' => $this->groups->create((string) $auth['sub'], viora_read_json_body())], 201);
    }

    public function list(array $authUser): void
    {
        viora_json_response([
            'groups' => $this->groups->list(
                $authUser['sub'] ?? null,
                viora_query_int('limit', 20),
                viora_query_string('cursor')
            ),
        ]);
    }

    public function get(array $authUser, array $params): void
    {
        $group = $this->groups->getById($params['groupId'] ?? '', $authUser['sub'] ?? null);
        if (!$group) {
            viora_json_error('Group not found.', 404);
            return;
        }
        viora_json_response(['group' => $group]);
    }

    public function update(array $auth, array $params): void
    {
        viora_json_response(['group' => $this->groups->update($params['groupId'] ?? '', (string) $auth['sub'], viora_read_json_body())]);
    }

    public function join(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'member' => $this->groups->join($params['groupId'] ?? '', (string) $auth['sub'], is_array($body['answers'] ?? null) ? $body['answers'] : []),
        ]);
    }

    public function leave(array $auth, array $params): void
    {
        $this->groups->leave($params['groupId'] ?? '', (string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function approveMember(array $auth, array $params): void
    {
        viora_json_response([
            'member' => $this->groups->approveMember($params['groupId'] ?? '', (string) $auth['sub'], $params['userId'] ?? ''),
        ]);
    }

    public function rejectMember(array $auth, array $params): void
    {
        $this->groups->rejectMember($params['groupId'] ?? '', (string) $auth['sub'], $params['userId'] ?? '');
        viora_json_response(['ok' => true]);
    }

    public function setRole(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'member' => $this->groups->setMemberRole(
                $params['groupId'] ?? '',
                (string) $auth['sub'],
                $params['userId'] ?? '',
                (string) ($body['role'] ?? 'member')
            ),
        ]);
    }

    public function listMembers(array $authUser, array $params): void
    {
        viora_json_response([
            'members' => $this->groups->listMembers(
                $params['groupId'] ?? '',
                $authUser['sub'] ?? null,
                viora_query_int('limit', 30),
                viora_query_string('cursor'),
                viora_query_string('status')
            ),
        ]);
    }

    public function createPost(array $auth, array $params): void
    {
        viora_json_response([
            'post' => $this->groups->createGroupPost($params['groupId'] ?? '', (string) $auth['sub'], viora_read_json_body()),
        ], 201);
    }

    public function listPosts(array $authUser, array $params): void
    {
        viora_json_response([
            'posts' => $this->groups->listGroupPosts(
                $params['groupId'] ?? '',
                $authUser['sub'] ?? null,
                viora_query_int('limit', 20),
                viora_query_string('cursor'),
                viora_query_string('approvalStatus', 'approved') ?? 'approved'
            ),
        ]);
    }

    public function setPostApproval(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        $this->groups->setGroupPostApproval(
            $params['groupId'] ?? '',
            (string) $auth['sub'],
            $params['postId'] ?? '',
            (string) ($body['status'] ?? 'approved')
        );
        viora_json_response(['ok' => true]);
    }

    public function listQuestions(array $params): void
    {
        viora_json_response(['questions' => $this->groups->listJoinQuestions($params['groupId'] ?? '')]);
    }

    public function addQuestion(array $auth, array $params): void
    {
        viora_json_response([
            'question' => $this->groups->addJoinQuestion($params['groupId'] ?? '', (string) $auth['sub'], viora_read_json_body()),
        ], 201);
    }

    public function deleteQuestion(array $auth, array $params): void
    {
        $this->groups->deleteJoinQuestion($params['groupId'] ?? '', (string) $auth['sub'], $params['questionId'] ?? '');
        viora_json_response(['ok' => true]);
    }

    public function createChannel(array $auth, array $params): void
    {
        viora_json_response([
            'channel' => $this->groups->createBroadcastChannel($params['groupId'] ?? '', (string) $auth['sub'], viora_read_json_body()),
        ], 201);
    }

    public function listChannels(array $authUser, array $params): void
    {
        viora_json_response([
            'channels' => $this->groups->listBroadcastChannels($params['groupId'] ?? '', $authUser['sub'] ?? null),
        ]);
    }

    public function postBroadcast(array $auth, array $params): void
    {
        $body = viora_read_json_body();
        viora_json_response([
            'message' => $this->groups->postBroadcast($params['channelId'] ?? '', (string) $auth['sub'], (string) ($body['body'] ?? '')),
        ], 201);
    }

    public function listBroadcast(array $authUser, array $params): void
    {
        viora_json_response([
            'messages' => $this->groups->listBroadcastMessages(
                $params['channelId'] ?? '',
                $authUser['sub'] ?? null,
                viora_query_int('limit', 30),
                viora_query_string('cursor')
            ),
        ]);
    }
}
