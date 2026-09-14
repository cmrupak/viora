<?php

declare(strict_types=1);

final class SecurityController
{
    public function __construct(private readonly SecurityService $security)
    {
    }

    public function listFactors(array $auth): void
    {
        viora_json_response(['factors' => $this->security->listFactors((string) $auth['sub'])]);
    }

    public function enrollTotp(array $auth): void
    {
        $body = viora_read_json_body();
        $name = (string) ($body['friendlyName'] ?? 'Viora Authenticator');
        viora_json_response([
            'factor' => $this->security->enrollTotp((string) $auth['sub'], $name),
        ]);
    }

    public function challengeAndVerify(array $auth): void
    {
        $body = viora_read_json_body();
        $code = (string) ($body['code'] ?? '');
        if ($code === '') {
            throw new InvalidArgumentException('code is required.');
        }
        viora_json_response($this->security->challengeAndVerify((string) $auth['sub'], $code));
    }

    public function unenroll(array $auth): void
    {
        $this->security->unenroll((string) $auth['sub']);
        viora_json_response(['ok' => true]);
    }

    public function aal(array $auth): void
    {
        viora_json_response($this->security->getAal((string) $auth['sub']));
    }
}
