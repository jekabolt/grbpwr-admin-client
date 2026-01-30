import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { PreviewItem } from '../components/preview-media';
import { useUploadMedia } from './useUploadMedia';

export function usePreviewMedia() {
  const [viewingMedia, setViewingMedia] = useState<PreviewItem | null>(null);
  const [viewingMediaData, setViewingMediaData] = useState<common_MediaFull | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingBlob, setIsLoadingBlob] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const uploadMedia = useUploadMedia();
  const { showMessage } = useSnackBarStore();

  const handleViewMedia = async (media: common_MediaFull) => {
    const mediaUrl = media.media?.thumbnail?.mediaUrl || '';
    const mediaType = isVideo(mediaUrl) ? 'video' : 'image';

    // For images, try to fetch as blob to enable cropping
    if (mediaType === 'image') {
      // First show the preview with direct URL immediately
      const preview: PreviewItem = {
        url: mediaUrl,
        type: mediaType,
      };
      setViewingMedia(preview);
      setViewingMediaData(media);
      setIsPreviewOpen(true);
      setIsLoadingBlob(true);

      try {
        const response = await fetch(mediaUrl, {
          mode: 'cors',
          credentials: 'omit',
          cache: 'default',
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);

        setViewingMedia({
          url: objectUrl,
          type: mediaType,
        });
        setIsLoadingBlob(false);
      } catch (error) {
        console.warn('Could not fetch image as blob (CORS restriction):', error);
        setIsLoadingBlob(false);
      }
    } else {
      const preview: PreviewItem = {
        url: mediaUrl,
        type: mediaType,
      };
      setViewingMedia(preview);
      setViewingMediaData(media);
      setIsPreviewOpen(true);
    }
  };

  const handlePreviewCancel = () => {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      setBlobUrl(null);
    }
    setIsPreviewOpen(false);
    setViewingMedia(null);
    setViewingMediaData(null);
    setIsLoadingBlob(false);
  };

  const handlePreviewUpload = async (croppedUrl?: string) => {
    if (!croppedUrl) {
      showMessage('Please crop the image before uploading', 'error');
      return;
    }

    if (!viewingMedia) {
      showMessage('No media selected', 'error');
      return;
    }

    if (!croppedUrl.startsWith('data:')) {
      showMessage('Invalid cropped image format', 'error');
      return;
    }

    setIsUploading(true);

    try {
      // Use the uploadMedia hook which now accepts data URL strings
      await uploadMedia.mutateAsync(croppedUrl);

      showMessage('MEDIA IS UPLOADED', 'success');

      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      setIsPreviewOpen(false);
      setViewingMedia(null);
      setViewingMediaData(null);
      setIsLoadingBlob(false);
    } catch (error) {
      console.error('Failed to upload cropped media:', error);

      if (viewingMedia.type === 'video') {
        showMessage('Video upload failed. File may be too large or format not supported.', 'error');
      } else {
        const errorMessage =
          error instanceof Error ? error.message : 'Image upload failed. Please try again.';
        showMessage(errorMessage, 'error');
      }
    } finally {
      setIsUploading(false);
    }
  };

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  return {
    viewingMedia,
    viewingMediaData,
    isPreviewOpen,
    isUploading,
    isLoadingBlob,
    setIsPreviewOpen,
    handleViewMedia,
    handlePreviewCancel,
    handlePreviewUpload,
  };
}
