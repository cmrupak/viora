/** Read a local file URI (e.g. from expo-image-picker) into bytes for Supabase storage. */
export async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  return response.arrayBuffer();
}

export function extensionFromUri(uri: string, fallback = 'jpg'): string {
  const clean = uri.split('?')[0] ?? uri;
  const parts = clean.split('.');
  const ext = parts[parts.length - 1];
  if (!ext || ext.length > 5) return fallback;
  return ext.toLowerCase();
}

export function contentTypeForExtension(ext: string): string {
  switch (ext.toLowerCase()) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'heic':
    case 'heif':
      return 'image/heic';
    default:
      return 'image/jpeg';
  }
}
