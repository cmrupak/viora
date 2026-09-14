<?php

declare(strict_types=1);

final class ReportsService
{
    public function __construct(
        private readonly ReportsRepository $reports,
        private readonly SettingsRepository $settings,
    ) {
    }

    public function create(string $reporterId, array $input): array
    {
        $targetType = (string) ($input['targetType'] ?? '');
        $targetId = (string) ($input['targetId'] ?? '');
        $reason = trim((string) ($input['reason'] ?? ''));
        $details = isset($input['details']) ? (string) $input['details'] : null;
        if (!in_array($targetType, ['user', 'post', 'comment', 'message'], true)) {
            throw new InvalidArgumentException('Invalid targetType.');
        }
        if ($targetId === '' || $reason === '') {
            throw new InvalidArgumentException('targetId and reason are required.');
        }
        $id = viora_uuid_v4();
        $this->reports->create($id, $reporterId, $targetType, $targetId, $reason, $details);
        try {
            $this->settings->logActivity(
                viora_uuid_v4(),
                $reporterId,
                'report.create',
                json_encode(['reportId' => $id, 'targetType' => $targetType, 'targetId' => $targetId], JSON_THROW_ON_ERROR)
            );
        } catch (Throwable) {
        }
        $row = $this->reports->findById($id);
        return [
            'id' => $id,
            'reporterId' => $reporterId,
            'targetType' => $targetType,
            'targetId' => $targetId,
            'reason' => $reason,
            'details' => $details,
            'status' => $row['status'] ?? 'open',
            'createdAt' => Mappers::iso($row['created_at'] ?? gmdate('Y-m-d H:i:s')),
        ];
    }
}
