import { common_MediaFull } from 'api/proto-http/admin';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { Filter } from './components/filter';
import { MediaList } from './components/media-list';
import { useFilter } from './utils/useFilter';
import { useInfiniteMedia } from './utils/useMediaQuery';
import { useSelection } from './utils/useSelectMedia';
import { useUploadMedia } from './utils/useUploadMedia';

export type VideoSize = { width: number; height: number };

interface MediaLayoutProps {
  aspectRatio?: string[];
  allowMultiple?: boolean;
  disabled?: boolean;
  onSelectionChange?: (selectedMedia: common_MediaFull[]) => void;
}

export function MediaManager({
  aspectRatio,
  allowMultiple,
  disabled,
  onSelectionChange,
}: MediaLayoutProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteMedia();
  const { ref, inView } = useInView();
  const media = data?.pages.flatMap((page) => page.media as common_MediaFull[]) || [];
  const [videoSizes, setVideoSizes] = useState<Record<number, VideoSize>>({});
  const uploadMedia = useUploadMedia();

  const { filteredMedia, type, order, setType, setOrder } = useFilter(
    media,
    aspectRatio,
    videoSizes,
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
      <div className='flex justify-end'>
        <Filter type={type} order={order} setType={setType} setOrder={setOrder} />
      </div>
      <MediaList
        media={filteredMedia || []}
        selection={selection}
        disabled={disabled}
        videoSizes={videoSizes}
        onVideoLoad={handleVideoLoad}
      />
      {hasNextPage && (
        <div ref={ref} className='flex justify-center p-4'>
          {isFetchingNextPage && <div>Loading more media...</div>}
        </div>
      )}
    </div>
  );
}
