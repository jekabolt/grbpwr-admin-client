import { filterExtensionToContentType } from './filterExtentions';

export const isVideo = (mediaUrl: string | undefined | null) => {
  if (mediaUrl && typeof mediaUrl === 'string') {
    const extension = mediaUrl.split('.').pop()?.toLowerCase();

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
