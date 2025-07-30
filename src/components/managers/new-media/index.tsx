import { common_MediaFull } from 'api/proto-http/admin';
import { useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { Loader } from 'ui/components/loader';
import { Filter } from './_components/filter';
import { MediaList } from './_components/media-list';
import { UploadMedia } from './_components/upload-media';
import { useFilter } from './utils/useFilter';
import { useInfiniteMedia } from './utils/useMediaQuery';
import { useSelection } from './utils/useSelectMedia';

interface MediaLayoutProps {
  aspectRatio?: string[];
  allowMultiple?: boolean;
  disabled?: boolean;
  onSelectionChange?: (selectedMedia: common_MediaFull[]) => void;
}

export type VideoSize = { width: number; height: number };

export function MediaLayout({
  aspectRatio,
  allowMultiple = true,
  disabled = false,
  onSelectionChange,
}: MediaLayoutProps) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteMedia();
  const media = data?.pages.flatMap((page) => page.media) || [];
  const [videoSizes, setVideoSizes] = useState<Record<number, VideoSize>>({});
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
  const { ref, inView } = useInView();

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
    <div>
      <UploadMedia />
      <Filter type={type} order={order} setType={setType} setOrder={setOrder} />
      <MediaList
        media={filteredMedia}
        selection={selection}
        disabled={disabled}
        videoSizes={videoSizes}
        onVideoLoad={handleVideoLoad}
      />
      {hasNextPage && (
        <div ref={ref} className='flex justify-center'>
          {isFetchingNextPage && <Loader />}
        </div>
      )}
    </div>
  );
}
