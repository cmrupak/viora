<?php

declare(strict_types=1);

final class ReportsController
{
    public function __construct(private readonly ReportsService $reports)
    {
    }

    public function create(array $auth): void
    {
        viora_json_response([
            'report' => $this->reports->create((string) $auth['sub'], viora_read_json_body()),
        ], 201);
    }
}
