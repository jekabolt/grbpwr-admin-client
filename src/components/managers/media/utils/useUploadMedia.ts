import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { common_MediaFull } from 'api/proto-http/admin';
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

export type UploadMediaInput = File | string;

export function useUploadMedia() {
  const queryClient = useQueryClient();

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
        const response = await adminService.UploadContentImage({
          rawB64Image: base64,
        });

        if (!response.media) {
          throw new Error('Upload image failed: empty response');
        }

        return response.media;
      }

      const raw = trimBeforeBase64(base64);
      const response = await adminService.UploadContentVideo({
        raw,
        contentType,
      });

      if (!response.media) {
        throw new Error('Upload video failed: empty response');
      }

      return response.media;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mediaKeys.all });
    },
    onError: (error) => {
      console.error('Failed to upload media:', error);
    },
  });
}
