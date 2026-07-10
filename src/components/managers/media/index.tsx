import { common_MediaFull } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { SECTION } from 'constants/routes';
import { useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
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
  const prevInViewRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const media = data?.pages.flatMap((page) => page.media as common_MediaFull[]) || [];
  const [videoSizes, setVideoSizes] = useState<Record<number, VideoSize>>({});

  const pendingFilesHook = usePendingFiles();
  const { canWrite } = usePermissions();

  // Standalone page shows a header + toolbar; the embedded selector (selectionMode) stays minimal.
  const isStandalone = !selectionMode;

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
    );
    if (files.length) pendingFilesHook.addFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
    showVideos === false ? 'image' : undefined,
  );

  const selection = useSelection({
    allowMultiple,
    disabled,
    onSelectionChange,
  });

  useEffect(() => {
    const justEnteredView = inView && !prevInViewRef.current;
    prevInViewRef.current = inView;
    if (justEnteredView && hasNextPage && !isFetchingNextPage) {
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

  const pendingPlate = pendingFilesHook.previews.length > 0 && (
    <PendingMediaPlate
      previews={pendingFilesHook.previews}
      croppedUrls={pendingFilesHook.croppedUrls}
      uploadingIndices={pendingFilesHook.uploadingIndices}
      onUploadAll={pendingFilesHook.handleUploadAll}
      onCrop={pendingFilesHook.setCroppedUrl}
      onRemove={pendingFilesHook.removeFile}
    />
  );

  return (
    <div className='flex flex-col gap-6 pb-16'>
      {isStandalone ? (
        <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textColor bg-bgColor px-2.5 py-3'>
          <div className='flex items-baseline gap-2'>
            <Text variant='uppercase' size='large'>
              Media
            </Text>
            {media.length > 0 && (
              <Text variant='inactive'>
                {(filteredMedia?.length ?? 0) === media.length
                  ? media.length
                  : `${filteredMedia?.length ?? 0} / ${media.length}`}
              </Text>
            )}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            {showFilters && (
              <Filter type={type} order={order} setType={setType} setOrder={setOrder} />
            )}
            {pendingPlate}
            <input
              ref={fileInputRef}
              type='file'
              accept='image/*,video/*'
              multiple
              className='hidden'
              onChange={handleFileChange}
            />
            {canWrite(SECTION.media) && (
              <Button variant='main' size='lg' onClick={handleUploadClick}>
                upload
              </Button>
            )}
          </div>
        </div>
      ) : (
        (pendingFilesHook.previews.length > 0 || showFilters) && (
          <div className='flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end'>
            {pendingPlate}
            {showFilters && (
              <Filter type={type} order={order} setType={setType} setOrder={setOrder} />
            )}
          </div>
        )
      )}

      <MediaList
        media={filteredMedia || []}
        selection={selection}
        disabled={disabled}
        videoSizes={videoSizes}
        onVideoLoad={handleVideoLoad}
        onView={selectionMode ? undefined : handleViewMedia}
        selectionMode={selectionMode}
        pendingFilesHook={pendingFilesHook}
        showAddButton={false}
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
          {isFetchingNextPage && (
            <Text variant='inactive' className='animate-pulse'>
              loading more media…
            </Text>
          )}
        </div>
      )}
    </div>
  );
}
