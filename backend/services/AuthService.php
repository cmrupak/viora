<?php

declare(strict_types=1);

final class AuthService
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly ProfileRepository $profiles,
        private readonly SessionRepository $sessions,
        private readonly OtpRepository $otps,
        private readonly JwtService $jwt,
        private readonly MailService $mail,
        private readonly array $mailConfig,
    ) {
    }

    public function register(array $input): array
    {
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        $firstName = trim((string) ($input['firstName'] ?? ''));
        $lastName = trim((string) ($input['lastName'] ?? ''));
        $displayName = trim(
            implode(' ', array_filter([$firstName, $lastName], static fn ($v) => $v !== ''))
            ?: (string) ($input['displayName'] ?? '')
        );
        $dateOfBirth = trim((string) ($input['dateOfBirth'] ?? ''));
        $gender = trim((string) ($input['gender'] ?? ''));

        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Enter a valid email, name, and password.');
        }
        if ($displayName === '' || $password === '') {
            throw new InvalidArgumentException('Enter a valid email, name, and password.');
        }
        if (strlen($password) < 8) {
            throw new InvalidArgumentException('Password must be at least 8 characters.');
        }
        if ($dateOfBirth !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dateOfBirth)) {
            throw new InvalidArgumentException('Enter a valid date of birth.');
        }
        if ($this->users->findByEmail($email)) {
            throw new InvalidArgumentException('An account with that email already exists.');
        }

        $username = $this->allocateUniqueUsername([
            'username' => (string) ($input['username'] ?? ''),
            'firstName' => $firstName,
            'lastName' => $lastName,
            'email' => $email,
        ]);

        $userId = viora_uuid_v4();
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $dob = $dateOfBirth !== '' ? $dateOfBirth : null;
        $genderValue = $gender !== '' ? $gender : null;

        Database::begin();
        try {
            $this->users->create($userId, $email, $hash);
            $this->profiles->create($userId, $username, $displayName, $dob, $genderValue);
            $this->profiles->ensureDefaults($userId);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }

        return $this->issueSessionBundle($userId, $email);
    }

    public function login(array $input): array
    {
        $email = strtolower(trim((string) ($input['email'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        if ($email === '' || $password === '') {
            throw new InvalidArgumentException('Enter your email and password.');
        }

        $user = $this->users->findByEmail($email);
        if (!$user || !password_verify($password, (string) $user['password_hash'])) {
            throw new InvalidArgumentException('Invalid login credentials.');
        }

        $profile = $this->profiles->findByUserId((string) $user['id']);
        if ($profile && (int) ($profile['is_deactivated'] ?? 0) === 1) {
            throw new InvalidArgumentException('This account is deactivated.');
        }

        return $this->issueSessionBundle((string) $user['id'], (string) $user['email']);
    }

    public function refresh(string $refreshToken): array
    {
        $hash = hash('sha256', $refreshToken);
        $row = $this->sessions->findValidByRefreshHash($hash);
        if (!$row) {
            throw new InvalidArgumentException('Invalid or expired refresh token.');
        }

        $user = $this->users->findById((string) $row['user_id']);
        if (!$user) {
            throw new InvalidArgumentException('Invalid or expired refresh token.');
        }

        $newRefresh = bin2hex(random_bytes(32));
        $newHash = hash('sha256', $newRefresh);
        $sessionId = viora_uuid_v4();
        $expiresAt = gmdate('Y-m-d H:i:s.u', time() + $this->jwt->refreshTtl());

        Database::begin();
        try {
            $this->sessions->rotate(
                (string) $row['id'],
                $sessionId,
                (string) $user['id'],
                $newHash,
                $_SERVER['HTTP_USER_AGENT'] ?? null,
                $this->clientIp(),
                $expiresAt,
            );
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }

        return $this->sessionPayload(
            (string) $user['id'],
            (string) $user['email'],
            $this->jwt->issueAccessToken((string) $user['id'], (string) $user['email']),
            $newRefresh,
        );
    }

    public function logout(?string $refreshToken, ?string $accessUserId): void
    {
        if ($refreshToken) {
            $hash = hash('sha256', $refreshToken);
            $row = $this->sessions->findValidByRefreshHash($hash);
            if ($row) {
                $this->sessions->revoke((string) $row['id']);
                return;
            }
        }
        if ($accessUserId) {
            $this->sessions->revokeAllForUser($accessUserId);
        }
    }

    public function me(string $userId): array
    {
        $user = $this->users->findById($userId);
        if (!$user) {
            throw new RuntimeException('User not found.');
        }
        $profile = $this->profiles->findByUserId($userId);
        return [
            'user' => ['id' => $user['id'], 'email' => $user['email']],
            'profile' => $profile ? $this->mapProfile($profile) : null,
        ];
    }

    public function sendPasswordOtp(string $email): array
    {
        $email = strtolower(trim($email));
        $generic = [
            'ok' => true,
            'message' => 'If an account exists for that email, a one-time code is on the way.',
        ];
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Enter a valid email address.');
        }

        $user = $this->users->findByEmail($email);
        if (!$user) {
            return $generic;
        }

        $otp = (string) random_int(100000, 999999);
        $otpHash = hash('sha256', $email . ':' . $otp);
        $ttl = (int) ($this->mailConfig['otp_ttl_seconds'] ?? 600);
        $expiresAt = gmdate('Y-m-d H:i:s.u', time() + $ttl);

        $this->otps->deleteActiveForEmail($email);
        $this->otps->create(viora_uuid_v4(), $email, $otpHash, $expiresAt);
        $this->mail->sendPasswordOtp($email, $otp);

        return $generic;
    }

    public function resetPasswordWithOtp(string $email, string $otp, string $password): array
    {
        $email = strtolower(trim($email));
        $otp = trim($otp);
        if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new InvalidArgumentException('Enter a valid email address.');
        }
        if (!preg_match('/^\d{6}$/', $otp)) {
            throw new InvalidArgumentException('Enter the 6-digit code from your email.');
        }
        if (strlen($password) < 8) {
            throw new InvalidArgumentException('Password must be at least 8 characters.');
        }

        $row = $this->otps->latestActive($email);
        if (!$row) {
            throw new InvalidArgumentException('Invalid or expired code. Request a new one.');
        }
        if (strtotime((string) $row['expires_at'] . ' UTC') < time()) {
            throw new InvalidArgumentException('This code has expired. Request a new one.');
        }
        $maxAttempts = (int) ($this->mailConfig['otp_max_attempts'] ?? 5);
        if ((int) $row['attempts'] >= $maxAttempts) {
            throw new InvalidArgumentException('Too many attempts. Request a new code.');
        }

        $expected = hash('sha256', $email . ':' . $otp);
        if (!hash_equals((string) $row['otp_hash'], $expected)) {
            $this->otps->bumpAttempts((string) $row['id'], (int) $row['attempts'] + 1);
            throw new InvalidArgumentException('Invalid or expired code. Request a new one.');
        }

        $user = $this->users->findByEmail($email);
        if (!$user) {
            throw new InvalidArgumentException('Unable to reset password for that account.');
        }

        Database::begin();
        try {
            $this->users->updatePassword((string) $user['id'], password_hash($password, PASSWORD_DEFAULT));
            $this->otps->consume((string) $row['id']);
            $this->sessions->revokeAllForUser((string) $user['id']);
            Database::commit();
        } catch (Throwable $e) {
            Database::rollback();
            throw $e;
        }

        return [
            'ok' => true,
            'message' => 'Password updated. You can sign in with your new password.',
        ];
    }

    private function issueSessionBundle(string $userId, string $email): array
    {
        $access = $this->jwt->issueAccessToken($userId, $email);
        $refresh = bin2hex(random_bytes(32));
        $sessionId = viora_uuid_v4();
        $expiresAt = gmdate('Y-m-d H:i:s.u', time() + $this->jwt->refreshTtl());

        $this->sessions->create(
            $sessionId,
            $userId,
            hash('sha256', $refresh),
            $_SERVER['HTTP_USER_AGENT'] ?? null,
            $this->clientIp(),
            $expiresAt,
        );

        return $this->sessionPayload($userId, $email, $access, $refresh);
    }

    private function sessionPayload(string $userId, string $email, string $access, string $refresh): array
    {
        $profile = $this->profiles->findByUserId($userId);
        $user = ['id' => $userId, 'email' => $email];
        return [
            'user' => $user,
            'session' => [
                'access_token' => $access,
                'refresh_token' => $refresh,
                'expires_in' => $this->jwt->accessTtl(),
                'token_type' => 'bearer',
                'user' => $user,
            ],
            'profile' => $profile ? $this->mapProfile($profile) : null,
            'needsEmailVerification' => false,
        ];
    }

    private function mapProfile(array $row): array
    {
        return [
            'id' => $row['id'],
            'username' => $row['username'],
            'displayName' => $row['display_name'] ?? '',
            'bio' => $row['bio'],
            'avatarUrl' => $row['avatar_url'],
            'coverUrl' => $row['cover_url'],
            'website' => $row['website'],
            'location' => $row['location'],
            'dateOfBirth' => $row['date_of_birth'],
            'gender' => $row['gender'],
            'isPrivate' => (bool) ($row['is_private'] ?? false),
            'isDeactivated' => (bool) ($row['is_deactivated'] ?? false),
            'followerCount' => (int) ($row['follower_count'] ?? 0),
            'followingCount' => (int) ($row['following_count'] ?? 0),
            'createdAt' => $row['created_at'] ?? null,
            'updatedAt' => $row['updated_at'] ?? null,
        ];
    }

    private function allocateUniqueUsername(array $input): string
    {
        $base = $this->buildUsernameBase($input);
        for ($attempt = 0; $attempt < 12; $attempt++) {
            $candidate = $attempt === 0
                ? $base
                : substr($base, 0, 18) . (string) random_int(1000, 9999);
            if (!$this->profiles->usernameExists($candidate)) {
                return $candidate;
            }
        }
        return substr($base, 0, 12) . base_convert((string) time(), 10, 36);
    }

    private function buildUsernameBase(array $input): string
    {
        $provided = $this->sanitizeUsernamePart((string) ($input['username'] ?? ''));
        if (strlen($provided) >= 3) {
            return substr($provided, 0, 24);
        }
        $first = $this->sanitizeUsernamePart((string) ($input['firstName'] ?? ''));
        $last = $this->sanitizeUsernamePart((string) ($input['lastName'] ?? ''));
        $fromName = $this->sanitizeUsernamePart($first . $last !== '' ? $first . $last : ($first . '_' . $last));
        if (strlen($fromName) >= 3) {
            return substr($fromName, 0, 24);
        }
        $emailLocal = explode('@', (string) ($input['email'] ?? ''))[0] ?? '';
        $fromEmail = $this->sanitizeUsernamePart($emailLocal);
        if (strlen($fromEmail) >= 3) {
            return substr($fromEmail, 0, 24);
        }
        return 'user' . substr(base_convert((string) time(), 10, 36), -6);
    }

    private function sanitizeUsernamePart(string $value): string
    {
        $value = strtolower(trim($value));
        if (class_exists('Normalizer')) {
            $normalized = Normalizer::normalize($value, Normalizer::FORM_KD);
            if (is_string($normalized)) {
                $value = $normalized;
            }
        }
        $value = preg_replace('/[\x{0300}-\x{036f}]/u', '', $value) ?? $value;
        $value = preg_replace('/[^a-z0-9_]+/', '', $value) ?? '';
        return trim($value, '_');
    }

    private function clientIp(): ?string
    {
        $ip = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? null;
        if (!$ip) {
            return null;
        }
        if (str_contains($ip, ',')) {
            $ip = trim(explode(',', $ip)[0]);
        }
        return substr($ip, 0, 64);
    }
}
