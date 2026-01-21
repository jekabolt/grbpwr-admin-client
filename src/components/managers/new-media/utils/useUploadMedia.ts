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

export function useUploadMedia() {
  const queryClient = useQueryClient();

  return useMutation<common_MediaFull, Error, File>({
    mutationFn: async (file: File) => {
      const isVideoFile = file.type.startsWith('video/');
      const maxSize = isVideoFile ? 50 * 1024 * 1024 : 10 * 1024 * 1024;

      if (file.size > maxSize) {
        const maxSizeMB = Math.round((maxSize / (1024 * 1024)) * 10) / 10;
        throw new Error(`File too large. Maximum size: ${maxSizeMB}MB`);
      }

      const base64 = await fileToDataUrl(file);

      if (!isVideoFile) {
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
        contentType: file.type,
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
