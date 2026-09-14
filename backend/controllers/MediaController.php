<?php

declare(strict_types=1);

final class MediaController
{
    public function __construct(
        private readonly MediaService $media,
        private readonly ProfileRepository $profiles,
    ) {
    }

    public function upload(array $auth): void
    {
        $bucket = (string) ($_POST['bucket'] ?? $_GET['bucket'] ?? '');
        if ($bucket === '' || !isset($_FILES['file'])) {
            throw new InvalidArgumentException('bucket and file are required.');
        }
        $result = $this->media->upload((string) $auth['sub'], $bucket, $_FILES['file']);

        if ($bucket === 'avatars') {
            $this->profiles->update((string) $auth['sub'], ['avatar_url' => $result['url']]);
        } elseif ($bucket === 'covers') {
            $this->profiles->update((string) $auth['sub'], ['cover_url' => $result['url']]);
        }

        viora_json_response(['media' => $result], 201);
    }
}
