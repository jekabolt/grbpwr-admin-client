import { filterExtensionToContentType } from './filterExtentions';

// The extension of the url's PATH: a signed query (`?X-Amz-…`, private team files) or an anchor
// must not decide the type (same rule as `isVideoUrl` / `isModelUrl`).
const pathExtension = (url: string) => {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url.split('?')[0].split('#')[0];
  }
  const name = path.split('/').pop() ?? '';
  return name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
};

export const isVideo = (mediaUrl: string | undefined | null) => {
  if (mediaUrl && typeof mediaUrl === 'string') {
    const extension = pathExtension(mediaUrl);

    if (extension) {
      const contentType = filterExtensionToContentType[extension];
      return contentType?.startsWith('video/');
    }
  }
  return false;
};

export const isBase64Video = (base64: string) => {
  const mime = base64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
  if (mime && mime.length > 1) {
    return mime[1].startsWith('video/');
  }

  return false;
};
