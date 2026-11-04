import { accessService } from 'components/managers/files/api/accessService';
import { browserUploadTransport } from 'components/managers/files/upload/transport';

/**
 * A file for a label's QR: into the library through the ordinary upload, then open by a secret link
 * with no expiry. An upload the link step failed on stays in the library, like any other upload.
 */
export async function uploadPublicFile(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<{ libraryFileId: number; publicUrl: string }> {
  let preview: Blob | undefined;
  try {
    preview = (await browserUploadTransport.buildPreview(file)) ?? undefined;
  } catch {
    // A file with no picture of itself is still a file.
    preview = undefined;
  }
  const { fileId } = await browserUploadTransport.upload({
    source: file,
    name: file.name,
    preview: preview ?? null,
    topicIds: [],
    newTopics: [],
    onProgress: (fraction) => onProgress?.(fraction),
    signal: new AbortController().signal,
  });
  const res = await accessService.set({ fileId, level: 'link', adminIds: [], linkTtl: 0 });
  return { libraryFileId: fileId, publicUrl: res.access?.link?.url ?? '' };
}
