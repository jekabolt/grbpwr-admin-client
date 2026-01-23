import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { PreviewItem } from '../components/preview-media';
import { dataUrlToFile } from './dataUrlToFile';
import { useUploadMedia } from './useUploadMedia';

export function usePreviewMedia() {
  const [viewingMedia, setViewingMedia] = useState<PreviewItem | null>(null);
  const [viewingMediaData, setViewingMediaData] = useState<common_MediaFull | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const uploadMedia = useUploadMedia();
  const { showMessage } = useSnackBarStore();

  const handleViewMedia = async (media: common_MediaFull) => {
    const mediaUrl = media.media?.fullSize?.mediaUrl || media.media?.thumbnail?.mediaUrl || '';
    const mediaType = isVideo(mediaUrl) ? 'video' : 'image';

    // For images, fetch as blob to enable cropping without CORS issues
    if (mediaType === 'image') {
      try {
        const response = await fetch(mediaUrl);
        if (!response.ok) {
          throw new Error('Failed to fetch media');
        }
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);

        const preview: PreviewItem = {
          url: objectUrl,
          type: mediaType,
        };
        setViewingMedia(preview);
        setViewingMediaData(media);
        setIsPreviewOpen(true);
      } catch (error) {
        console.error('Failed to load media:', error);
        showMessage('Failed to load media for preview', 'error');
      }
    } else {
      // For videos, use direct URL
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
      const extension = viewingMedia.type === 'video' ? 'mp4' : 'jpg';
      const fileName = viewingMediaData?.id
        ? `cropped-media-${viewingMediaData.id}.${extension}`
        : `cropped-media.${extension}`;

      const fileToUpload = dataUrlToFile(croppedUrl, fileName);

      await uploadMedia.mutateAsync(fileToUpload);

      showMessage('MEDIA IS UPLOADED', 'success');

      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }
      setIsPreviewOpen(false);
      setViewingMedia(null);
      setViewingMediaData(null);
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
    setIsPreviewOpen,
    handleViewMedia,
    handlePreviewCancel,
    handlePreviewUpload,
  };
}
