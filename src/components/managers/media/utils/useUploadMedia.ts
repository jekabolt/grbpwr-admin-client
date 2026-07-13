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

// Maps an upload failure to a clear, media-specific message. The grpc-gateway surfaces the
// gRPC code as an HTTP status on the thrown error: INVALID_ARGUMENT → 400 (bad file — the
// backend rejects images over 40 megapixels / 28 MB and videos that aren't a real MP4/WebM),
// UNAUTHENTICATED/PERMISSION_DENIED → 401/403, INTERNAL → 5xx (retry). Auth error texts are
// intentionally generic on the backend, so we branch on the status code, not the message.
function mediaUploadErrorMessage(error: unknown, isVideo: boolean): string {
  const status = (error as { status?: number })?.status;
  const raw = error instanceof Error ? error.message : '';
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

export function useUploadMedia() {
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();

  return useMutation<common_MediaFull, Error, UploadMediaInput>({
    mutationFn: async (input: UploadMediaInput) => {
      let base64: string;
      let contentType: string;
      let isVideo: boolean;

      if (input instanceof File) {
        isVideo = input.type.startsWith('video/');
        contentType = input.type;
        const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;

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
        const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;

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
          });
        } catch (e) {
          throw new Error(mediaUploadErrorMessage(e, false));
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
        throw new Error(mediaUploadErrorMessage(e, true));
      }

      if (!response.media) {
        throw new Error('Upload video failed: empty response');
      }

      return response.media;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
    onError: (error) => {
      const msg = error instanceof Error ? error.message : 'Failed to upload media';
      showMessage(msg, 'error');
    },
  });
}
