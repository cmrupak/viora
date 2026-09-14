<?php

declare(strict_types=1);

final class MailService
{
    public function __construct(
        private readonly array $mailConfig,
        private readonly array $appConfig,
    ) {
    }

    public function sendPasswordOtp(string $to, string $otp): void
    {
        $user = (string) ($this->mailConfig['user'] ?? '');
        $pass = (string) ($this->mailConfig['pass'] ?? '');
        $from = (string) ($this->mailConfig['from'] ?? '');

        $subject = 'Your Viora password reset code';
        $text = "Your Viora password reset code is {$otp}. It expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.";
        $html = '<p>Your Viora password reset code is:</p>'
            . '<p style="font-size:28px;font-weight:700;letter-spacing:4px">' . htmlspecialchars($otp, ENT_QUOTES, 'UTF-8') . '</p>'
            . '<p>It expires in 10 minutes.</p>'
            . '<p>If you did not request this, you can ignore this email.</p>';

        if ($user === '' || $pass === '' || $from === '') {
            if (($this->appConfig['env'] ?? '') === 'local' || ($this->appConfig['debug'] ?? false)) {
                $this->logLocal($to, $otp, $text);
                return;
            }
            throw new RuntimeException('Server is missing SMTP_USER / SMTP_PASS / SMTP_FROM.');
        }

        $this->sendSmtp(
            host: (string) $this->mailConfig['host'],
            port: (int) $this->mailConfig['port'],
            user: $user,
            pass: $pass,
            from: $from,
            to: $to,
            subject: $subject,
            text: $text,
            html: $html,
        );
    }

    private function logLocal(string $to, string $otp, string $text): void
    {
        $dir = dirname(__DIR__) . '/storage/logs';
        if (!is_dir($dir)) {
            mkdir($dir, 0775, true);
        }
        $line = sprintf(
            "[%s] OTP for %s: %s | %s\n",
            gmdate('c'),
            $to,
            $otp,
            str_replace("\n", ' ', $text)
        );
        file_put_contents($dir . '/otp.log', $line, FILE_APPEND);
    }

    private function sendSmtp(
        string $host,
        int $port,
        string $user,
        string $pass,
        string $from,
        string $to,
        string $subject,
        string $text,
        string $html,
    ): void {
        $errno = 0;
        $errstr = '';
        $secure = $port === 465;
        $remote = ($secure ? 'ssl://' : '') . $host . ':' . $port;
        $fp = @stream_socket_client($remote, $errno, $errstr, 20, STREAM_CLIENT_CONNECT);
        if (!$fp) {
            throw new RuntimeException("SMTP connect failed: {$errstr}");
        }
        stream_set_timeout($fp, 20);

        $this->expect($fp, 220);
        $this->cmd($fp, 'EHLO viora.local', 250);
        if (!$secure && $port === 587) {
            $this->cmd($fp, 'STARTTLS', 220);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                throw new RuntimeException('SMTP STARTTLS failed.');
            }
            $this->cmd($fp, 'EHLO viora.local', 250);
        }

        $this->cmd($fp, 'AUTH LOGIN', 334);
        $this->cmd($fp, base64_encode($user), 334);
        $this->cmd($fp, base64_encode($pass), 235);
        $this->cmd($fp, 'MAIL FROM:<' . $from . '>', 250);
        $this->cmd($fp, 'RCPT TO:<' . $to . '>', 250);
        $this->cmd($fp, 'DATA', 354);

        $boundary = 'b_' . bin2hex(random_bytes(8));
        $headers = [
            'From: ' . $from,
            'To: ' . $to,
            'Subject: ' . $subject,
            'MIME-Version: 1.0',
            'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        ];
        $body = implode("\r\n", $headers) . "\r\n\r\n"
            . "--{$boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n{$text}\r\n"
            . "--{$boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n{$html}\r\n"
            . "--{$boundary}--\r\n.";
        fwrite($fp, $body . "\r\n");
        $this->expect($fp, 250);
        $this->cmd($fp, 'QUIT', 221);
        fclose($fp);
    }

    private function cmd($fp, string $command, int $expectCode): void
    {
        fwrite($fp, $command . "\r\n");
        $this->expect($fp, $expectCode);
    }

    private function expect($fp, int $code): void
    {
        $response = '';
        while (($line = fgets($fp, 515)) !== false) {
            $response .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }
        if (!str_starts_with(trim($response), (string) $code)) {
            throw new RuntimeException('SMTP unexpected response: ' . trim($response));
        }
    }
}
