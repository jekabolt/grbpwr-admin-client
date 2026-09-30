import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_MediaFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { mediaKeys } from './useMediaQuery';

function trimBeforeBase64(input: string): string {
  const parts = input.split('base64,');
  return parts.length > 1 ? parts[1] : input;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      if (!event.target?.result) {
        reject(new Error('Failed to read file'));
        return;
      }
      resolve(event.target.result.toString());
    };
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    reader.readAsDataURL(file);
  });
}

function getDataUrlSize(dataUrl: string): number {
  const base64Data = dataUrl.split('base64,')[1] || '';
  return Math.floor((base64Data.length * 3) / 4);
}

function getContentTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match ? match[1] : 'image/jpeg';
}

// Client-side pre-upload size gates, mirroring the backend's real limits (see the error mapper
// below): images up to 40 megapixels (≈28 MB), video up to 50 MB. Keeping these as one constant
// each avoids the two pre-check call sites (File / data-URL) silently drifting apart.
//
// ЭКСПОРТИРУЮТСЯ, потому что проверять их в момент отправки — поздно. Очередь загрузки
// (`usePendingFiles`) меряет файл при постановке в очередь и говорит про предел ДО того, как
// человек нажал «отправить»; гейты ниже остаются последней линией для остальных путей.
export const MAX_IMAGE_BYTES = 28 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
/** Второй предел бакета на картинку, который до сих пор не проверялся нигде на клиенте. */
export const MAX_IMAGE_MEGAPIXELS = 40;
/** svgcheck.MaxSVGBytes — the vector door's own ceiling. */
export const MAX_VECTOR_BYTES = 8 * 1024 * 1024;

export const SVG_CONTENT_TYPE = 'image/svg+xml';

/**
 * AN SVG IS NOT AN IMAGE TO THE BUCKET. The image door sniffs for a raster and refuses an SVG; the
 * vector door (`UploadContentVector`) inspects the markup (no scripts, no entities, ≤ 8 MiB) and
 * answers with the same `MediaFull`. So the door is picked by what the file IS: the MIME type, or —
 * because some systems hand an SVG over with an empty type — the `.svg` name.
 */
export function isSvgInput(input: File | string): boolean {
  if (typeof input === 'string') return /^data:image\/svg\+xml[;,]/i.test(input);
  return input.type === SVG_CONTENT_TYPE || (!input.type && /\.svg$/i.test(input.name));
}

// Maps an upload failure to a clear, media-specific message. The grpc-gateway surfaces the
// gRPC code as an HTTP status on the thrown error: INVALID_ARGUMENT → 400 (bad file — the
// backend rejects images over 40 megapixels / 28 MB and videos that aren't a real MP4/WebM),
// UNAUTHENTICATED/PERMISSION_DENIED → 401/403, INTERNAL → 5xx (retry). Auth error texts are
// intentionally generic on the backend, so we branch on the status code, not the message.
function mediaUploadErrorMessage(error: unknown, isVideo: boolean, isSvg = false): string {
  const status = (error as { status?: number })?.status;
  const raw = error instanceof Error ? error.message : '';
  if (status === 400 && isSvg) {
    // The inspector's own words are the useful part («<script> is not allowed»), so they ride along.
    return `SVG rejected — it must be a plain vector file (no scripts, no embedded entities) no larger than 8 MB.${raw ? ` ${raw}` : ''}`;
  }
  if (status === 400) {
    return isVideo
      ? 'Video rejected — it must be a valid MP4 or WebM file no larger than 50 MB.'
      : 'Image rejected — it must be a valid image no larger than 40 megapixels (≈28 MB).';
  }
  if (status === 401) return 'Session expired — please sign in again.';
  if (status === 403) return 'You do not have permission to upload media.';
  if (status && status >= 500) return 'Upload failed on the server — please try again.';
  return raw || 'Failed to upload media.';
}

export type UploadMediaInput = File | string;

/** Отказ с сохранённым кодом ответа: вызывающий может перевести его сам, не разбирая текст. */
function uploadError(error: unknown, isVideo: boolean, isSvg = false): Error {
  return Object.assign(new Error(mediaUploadErrorMessage(error, isVideo, isSvg)), {
    status: (error as { status?: number })?.status,
  });
}

/**
 * Is this library item a vector? The media row carries no content type; the object's extension is
 * where the bucket records it (bucket/nonraster.go), so the URL is the honest place to ask.
 */
export const isSvgUrl = (url?: string): boolean => /\.svg(?:[?#]|$)/i.test(url ?? '');
export const isSvgMedia = (m: common_MediaFull): boolean =>
  isSvgUrl(m.media?.fullSize?.mediaUrl || m.media?.thumbnail?.mediaUrl);

/**
 * ONE UPLOAD, THE DOOR CHOSEN BY THE FILE. Raster → `UploadContentImage`, video →
 * `UploadContentVideo`, SVG → `UploadContentVector`. Every door answers with a `MediaFull`, so a
 * caller never learns which one ran. Exported for the probe (scripts/labels-foundation-probe.mjs):
 * the hook below is this function plus the cache and the toast.
 */
export async function uploadMediaInput(input: UploadMediaInput): Promise<common_MediaFull> {
  if (isSvgInput(input)) return uploadVector(input);
  let base64: string;
  let contentType: string;
  let isVideo: boolean;

  if (input instanceof File) {
    isVideo = input.type.startsWith('video/');
    contentType = input.type;
    const maxSize = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (input.size > maxSize) {
      const maxSizeMB = Math.round((maxSize / (1024 * 1024)) * 10) / 10;
      throw new Error(`File too large. Maximum size: ${maxSizeMB}MB`);
    }

    base64 = await fileToDataUrl(input);
  } else {
    if (!input.startsWith('data:')) {
      throw new Error('Invalid data URL format');
    }

    contentType = getContentTypeFromDataUrl(input);
    isVideo = contentType.startsWith('video/');
    base64 = input;

    const size = getDataUrlSize(input);
    const maxSize = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;

    if (size > maxSize) {
      const maxSizeMB = Math.round((maxSize / (1024 * 1024)) * 10) / 10;
      throw new Error(`File too large. Maximum size: ${maxSizeMB}MB`);
    }
  }

  if (!isVideo) {
    let response;
    try {
      response = await adminService.UploadContentImage({
        rawB64Image: base64,
        // Приехало с контрактом полосы DESIGN. `false` — это ПРЕЖНЕЕ поведение медиатеки:
        // сервер жмёт и приводит формат. Verbatim-путь (побайтовое сохранение оригинала) нужен
        // плитам полосы, а не общей загрузке, и включать его здесь означало бы молча поменять
        // вес и формат всего, что грузят через медиа-менеджер.
        preserveOriginal: false,
      });
    } catch (e) {
      throw uploadError(e, false);
    }

    if (!response.media) {
      throw new Error('Upload image failed: empty response');
    }

    return response.media;
  }

  const raw = trimBeforeBase64(base64);
  let response;
  try {
    response = await adminService.UploadContentVideo({
      raw,
      contentType,
    });
  } catch (e) {
    throw uploadError(e, true);
  }

  if (!response.media) {
    throw new Error('Upload video failed: empty response');
  }

  return response.media;
}

async function uploadVector(input: UploadMediaInput): Promise<common_MediaFull> {
  let dataUrl: string;
  if (input instanceof File) {
    if (input.size > MAX_VECTOR_BYTES) throw new Error('File too large. Maximum size: 8MB');
    dataUrl = await fileToDataUrl(input);
  } else {
    if (getDataUrlSize(input) > MAX_VECTOR_BYTES)
      throw new Error('File too large. Maximum size: 8MB');
    dataUrl = input;
  }
  let response;
  try {
    // `raw` is proto `bytes`: base64 on the JSON wire, the bytes themselves on the server.
    response = await adminService.UploadContentVector({ raw: trimBeforeBase64(dataUrl) });
  } catch (e) {
    throw uploadError(e, false, true);
  }
  if (!response.media) throw new Error('Upload vector failed: empty response');
  return response.media;
}

export function useUploadMedia(options?: {
  /**
   * Не показывать тост на отказе. Для очереди загрузки: там причина стоит В СТРОКЕ файла и не
   * гаснет, а тост на каждый файл пачки — десять всплывающих сообщений подряд поверх той самой
   * строки, где всё уже написано.
   */
  silent?: boolean;
}) {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const silent = options?.silent ?? false;

  return useMutation<common_MediaFull, Error, UploadMediaInput>({
    mutationFn: uploadMediaInput,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
    onError: (error) => {
      if (silent) return;
      const msg = error instanceof Error ? error.message : 'Failed to upload media';
      showMessage(msg, 'error');
    },
  });
}
