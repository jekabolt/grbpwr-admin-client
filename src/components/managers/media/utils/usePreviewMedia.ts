import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { PreviewItem } from '../components/preview-media';
import { dataUrlToFile } from './dataUrlToFile';
import { useUploadMedia } from './useUploadMedia';

export function usePreviewMedia() {
  const [viewingMedia, setViewingMedia] = useState<PreviewItem | null>(null);
  const [viewingMediaData, setViewingMediaData] = useState<common_MediaFull | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const uploadMedia = useUploadMedia();
  const { showMessage } = useSnackBarStore();

  const handleViewMedia = (media: common_MediaFull) => {
    const mediaUrl = media.media?.fullSize?.mediaUrl || media.media?.thumbnail?.mediaUrl || '';
    const preview: PreviewItem = {
      url: mediaUrl,
      type: isVideo(mediaUrl) ? 'video' : 'image',
    };
    setViewingMedia(preview);
    setViewingMediaData(media);
    setIsPreviewOpen(true);
  };

  const handlePreviewCancel = () => {
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
