<?php

declare(strict_types=1);

final class MediaService
{
    private const BUCKETS = ['avatars', 'covers', 'post-media', 'stories', 'reels', 'messages'];
    private const MAX_BYTES = 52_428_800; // 50MB

    public function __construct(private readonly array $appConfig)
    {
    }

    /**
     * @return array{url: string, path: string, bucket: string, mimeType: string, byteSize: int}
     */
    public function upload(string $userId, string $bucket, array $file): array
    {
        if (!in_array($bucket, self::BUCKETS, true)) {
            throw new InvalidArgumentException('Invalid storage bucket.');
        }
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new InvalidArgumentException('Upload failed.');
        }
        $tmp = (string) ($file['tmp_name'] ?? '');
        $size = (int) ($file['size'] ?? 0);
        $name = (string) ($file['name'] ?? 'file');
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            throw new InvalidArgumentException('Invalid upload.');
        }
        if ($size <= 0 || $size > self::MAX_BYTES) {
            throw new InvalidArgumentException('File too large (max 50MB).');
        }

        $finfo = new finfo(FILEINFO_MIME_TYPE);
        $mime = $finfo->file($tmp) ?: ((string) ($file['type'] ?? 'application/octet-stream'));
        $this->assertMimeAllowed($bucket, $mime);

        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if ($ext === '' || !preg_match('/^[a-z0-9]{1,8}$/', $ext)) {
            $ext = $this->extFromMime($mime);
        }

        $filename = viora_uuid_v4() . '.' . $ext;
        $relDir = $bucket . '/' . $userId;
        $absDir = dirname(__DIR__) . '/public/uploads/' . $relDir;
        if (!is_dir($absDir) && !mkdir($absDir, 0775, true) && !is_dir($absDir)) {
            throw new RuntimeException('Unable to create upload directory.');
        }
        $absPath = $absDir . '/' . $filename;
        if (!move_uploaded_file($tmp, $absPath)) {
            throw new RuntimeException('Unable to store upload.');
        }

        $relPath = $relDir . '/' . $filename;
        $base = rtrim((string) ($this->appConfig['url'] ?? ''), '/');
        return [
            'url' => $base . '/uploads/' . $relPath,
            'path' => $relPath,
            'bucket' => $bucket,
            'mimeType' => $mime,
            'byteSize' => $size,
        ];
    }

    private function assertMimeAllowed(string $bucket, string $mime): void
    {
        $ok = match ($bucket) {
            'avatars', 'covers' => str_starts_with($mime, 'image/'),
            'post-media', 'stories', 'reels' => str_starts_with($mime, 'image/') || str_starts_with($mime, 'video/'),
            'messages' => str_starts_with($mime, 'image/')
                || str_starts_with($mime, 'video/')
                || str_starts_with($mime, 'audio/')
                || in_array($mime, ['application/pdf', 'application/octet-stream', 'text/plain'], true),
            default => false,
        };
        if (!$ok) {
            throw new InvalidArgumentException('Unsupported file type for bucket ' . $bucket);
        }
    }

    private function extFromMime(string $mime): string
    {
        return match ($mime) {
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            'video/mp4' => 'mp4',
            'video/webm' => 'webm',
            'audio/mpeg' => 'mp3',
            'application/pdf' => 'pdf',
            default => 'bin',
        };
    }
}
