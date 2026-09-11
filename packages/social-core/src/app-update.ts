export type AppUpdateManifest = {
  appName: string;
  platform: string;
  packageName: string;
  latestVersion: string;
  /** Minimum version that may keep running without update prompt */
  minVersion?: string;
  /** Relative path on the web host, e.g. /downloads/viora-android.apk */
  apkPath?: string;
  /** Absolute APK URL (preferred when hosting on CDN / Netlify) */
  apkUrl?: string;
  notes?: string;
  publishedAt?: string;
};

export function parseVersionParts(version: string): number[] {
  return version
    .trim()
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((part) => {
      const n = Number.parseInt(part, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

/** Returns negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function isVersionOlder(current: string, latest: string): boolean {
  return compareVersions(current, latest) < 0;
}

export function resolveApkDownloadUrl(
  manifest: AppUpdateManifest,
  webOrigin: string,
): string | null {
  if (manifest.apkUrl?.trim()) return manifest.apkUrl.trim();
  if (!manifest.apkPath?.trim()) return null;
  const origin = webOrigin.replace(/\/$/, '');
  const path = manifest.apkPath.startsWith('/') ? manifest.apkPath : `/${manifest.apkPath}`;
  return `${origin}${path}`;
}

export async function fetchAppUpdateManifest(manifestUrl: string): Promise<AppUpdateManifest> {
  const response = await fetch(manifestUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Update check failed (${response.status}).`);
  }
  const data = (await response.json()) as AppUpdateManifest;
  if (!data?.latestVersion) {
    throw new Error('Invalid update manifest.');
  }
  return data;
}
