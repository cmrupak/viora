<?php

declare(strict_types=1);

final class AuthController
{
    public function __construct(private readonly AuthService $auth)
    {
    }

    public function register(): void
    {
        $body = viora_read_json_body();
        $result = $this->auth->register($body);
        viora_json_response($result, 201);
    }

    public function login(): void
    {
        $body = viora_read_json_body();
        $result = $this->auth->login($body);
        viora_json_response($result);
    }

    public function refresh(): void
    {
        $body = viora_read_json_body();
        $token = (string) ($body['refresh_token'] ?? '');
        if ($token === '') {
            throw new InvalidArgumentException('refresh_token is required.');
        }
        viora_json_response($this->auth->refresh($token));
    }

    public function logout(?array $authUser): void
    {
        $body = viora_read_json_body();
        $refresh = isset($body['refresh_token']) ? (string) $body['refresh_token'] : null;
        $this->auth->logout($refresh, $authUser['sub'] ?? null);
        viora_json_response(['ok' => true]);
    }

    public function me(array $authUser): void
    {
        viora_json_response($this->auth->me((string) $authUser['sub']));
    }

    public function passwordOtp(): void
    {
        $body = viora_read_json_body();
        $action = (string) ($body['action'] ?? '');
        if ($action === 'send') {
            $this->passwordOtpSend($body);
            return;
        }
        if ($action === 'reset') {
            $this->passwordOtpReset($body);
            return;
        }
        throw new InvalidArgumentException('Unknown action.');
    }

    public function passwordOtpSend(?array $body = null): void
    {
        $body ??= viora_read_json_body();
        viora_json_response($this->auth->sendPasswordOtp((string) ($body['email'] ?? '')));
    }

    public function passwordOtpReset(?array $body = null): void
    {
        $body ??= viora_read_json_body();
        viora_json_response($this->auth->resetPasswordWithOtp(
            (string) ($body['email'] ?? ''),
            (string) ($body['otp'] ?? ''),
            (string) ($body['password'] ?? ''),
        ));
    }
}
