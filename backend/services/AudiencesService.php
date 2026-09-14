<?php

declare(strict_types=1);

final class AudiencesService
{
    public function __construct(
        private readonly AudiencesRepository $audiences,
        private readonly ProfileRepository $profiles,
    ) {
    }

    public function createList(string $ownerId, string $name): array
    {
        $name = trim($name);
        if ($name === '') {
            throw new InvalidArgumentException('Name required.');
        }
        $id = viora_uuid_v4();
        $this->audiences->createList($id, $ownerId, $name);
        $row = $this->audiences->findList($id);
        return $this->mapList($row ?? [
            'id' => $id,
            'owner_id' => $ownerId,
            'name' => $name,
            'member_count' => 0,
            'created_at' => gmdate('Y-m-d H:i:s'),
            'updated_at' => gmdate('Y-m-d H:i:s'),
        ]);
    }

    public function renameList(string $listId, string $ownerId, string $name): array
    {
        $name = trim($name);
        if ($name === '') {
            throw new InvalidArgumentException('Name required.');
        }
        $this->requireOwned($listId, $ownerId);
        $this->audiences->renameList($listId, $ownerId, $name);
        $row = $this->audiences->findList($listId);
        if (!$row) {
            throw new InvalidArgumentException('Audience list not found.');
        }
        $row['member_count'] = count($this->audiences->listMembers($listId));
        return $this->mapList($row);
    }

    public function deleteList(string $listId, string $ownerId): void
    {
        $this->requireOwned($listId, $ownerId);
        $this->audiences->deleteList($listId, $ownerId);
    }

    public function listLists(string $ownerId): array
    {
        return array_map(fn ($r) => $this->mapList($r), $this->audiences->listLists($ownerId));
    }

    public function listMembers(string $listId, string $ownerId): array
    {
        $this->requireOwned($listId, $ownerId);
        return array_values(array_filter(array_map(
            static fn ($r) => Mappers::profile($r),
            $this->audiences->listMembers($listId)
        )));
    }

    public function addMember(string $listId, string $ownerId, string $memberId): array
    {
        $this->requireOwned($listId, $ownerId);
        if ($ownerId === $memberId) {
            throw new InvalidArgumentException('Cannot add yourself to an audience list.');
        }
        $member = $this->profiles->findByUserId($memberId);
        if (!$member || (int) ($member['is_deactivated'] ?? 0) === 1) {
            throw new InvalidArgumentException('User not found.');
        }
        $this->audiences->addMember(viora_uuid_v4(), $listId, $memberId);
        return Mappers::profile($member) ?? [];
    }

    public function removeMember(string $listId, string $ownerId, string $memberId): void
    {
        $this->requireOwned($listId, $ownerId);
        if (!$this->audiences->removeMember($listId, $memberId)) {
            throw new InvalidArgumentException('Member not found.');
        }
    }

    private function requireOwned(string $listId, string $ownerId): array
    {
        $row = $this->audiences->findList($listId);
        if (!$row || $row['owner_id'] !== $ownerId) {
            throw new InvalidArgumentException('Audience list not found.');
        }
        return $row;
    }

    private function mapList(array $row): array
    {
        return [
            'id' => $row['id'],
            'ownerId' => $row['owner_id'],
            'name' => $row['name'],
            'memberCount' => (int) ($row['member_count'] ?? 0),
            'createdAt' => Mappers::iso($row['created_at'] ?? null),
            'updatedAt' => Mappers::iso($row['updated_at'] ?? null),
        ];
    }
}
