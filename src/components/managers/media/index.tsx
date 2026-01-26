import { common_MediaFull } from 'api/proto-http/admin';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { Filter } from './components/filter';
import { MediaList } from './components/media-list';
import { PendingMediaPlate } from './components/pending-media-plate';
import { PreviewMedia } from './components/preview-media';
import { useFilter } from './utils/useFilter';
import { useInfiniteMedia } from './utils/useMediaQuery';
import { usePendingFiles } from './utils/usePendingFiles';
import { usePreviewMedia } from './utils/usePreviewMedia';
import { useSelection } from './utils/useSelectMedia';

export type VideoSize = { width: number; height: number };

interface MediaLayoutProps {
  aspectRatio?: string[];
  allowMultiple?: boolean;
  disabled?: boolean;
  showVideos?: boolean;
  selectionMode?: boolean;
  showFilters?: boolean;
  onSelectionChange?: (selectedMedia: common_MediaFull[]) => void;
}

export function MediaManager({
  aspectRatio,
  allowMultiple,
  disabled,
  showVideos,
  selectionMode = false,
  showFilters = true,
  onSelectionChange,
}: MediaLayoutProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteMedia();
  const { ref, inView } = useInView();
  const media = data?.pages.flatMap((page) => page.media as common_MediaFull[]) || [];
  const [videoSizes, setVideoSizes] = useState<Record<number, VideoSize>>({});

  const pendingFilesHook = usePendingFiles();

  const {
    viewingMedia,
    viewingMediaData,
    isPreviewOpen,
    isUploading,
    isLoadingBlob,
    setIsPreviewOpen,
    handleViewMedia,
    handlePreviewCancel,
    handlePreviewUpload,
  } = usePreviewMedia();

  const { filteredMedia, type, order, setType, setOrder } = useFilter(
    media,
    aspectRatio,
    videoSizes,
    showVideos ? undefined : 'image',
  );

  const selection = useSelection({
    allowMultiple,
    disabled,
    onSelectionChange,
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleVideoLoad = (mediaId: number, event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.target as HTMLVideoElement;
    setVideoSizes((prev) => ({
      ...prev,
      [mediaId]: {
        width: video.videoWidth,
        height: video.videoHeight,
      },
    }));
  };

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex lg:flex-row flex-col lg:justify-betwenn'>
        {pendingFilesHook.previews.length > 0 && (
          <PendingMediaPlate
            previews={pendingFilesHook.previews}
            croppedUrls={pendingFilesHook.croppedUrls}
            uploadingIndices={pendingFilesHook.uploadingIndices}
            onUpload={pendingFilesHook.handleUpload}
            onCrop={pendingFilesHook.setCroppedUrl}
            onRemove={pendingFilesHook.removeFile}
          />
        )}
        {showFilters && <Filter type={type} order={order} setType={setType} setOrder={setOrder} />}
      </div>

      <MediaList
        media={filteredMedia || []}
        selection={selection}
        disabled={disabled}
        videoSizes={videoSizes}
        onVideoLoad={handleVideoLoad}
        onView={selectionMode ? undefined : handleViewMedia}
        selectionMode={selectionMode}
        pendingFilesHook={pendingFilesHook}
      />
      <PreviewMedia
        open={isPreviewOpen}
        preview={viewingMedia}
        onOpenChange={setIsPreviewOpen}
        onUpload={handlePreviewUpload}
        onCancel={handlePreviewCancel}
        isExistingMedia={true}
        mediaData={viewingMediaData}
        isUploading={isUploading}
        isLoadingBlob={isLoadingBlob}
      />

      {hasNextPage && (
        <div ref={ref} className='flex justify-center p-4'>
          {isFetchingNextPage && <div>loading more media...</div>}
        </div>
      )}
    </div>
  );
}
