import CheckIcon from '@mui/icons-material/Check';
import ClearIcon from '@mui/icons-material/Clear';
import { common_MediaFull, common_MediaItem } from 'api/proto-http/admin';
import { MediaSelectorMediaListProps } from 'components/managers/media/media-selector/interfaces/mediaSelectorInterfaces';
import { aspectRatioColor, mediaAspectRatio } from 'lib/features/aspect-ratio';
import { isVideo } from 'lib/features/filterContentType';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { FC, useEffect, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';

import { MEDIA_TYPE_OPTIONS, ORDER_FILTER_OPTIONS } from 'constants/filter';
import Selector from 'ui/components/selector';
import { useMedia } from './useMedia';
import { useDeleteMedia, useInfiniteMedia } from './useMediaQuery';

export const MediaList: FC<MediaSelectorMediaListProps> = ({
  allowMultiple,
  selectedMedia,
  enableModal = false,
  aspectRatio,
  hideVideos = false,
  isDeleteAccepted = true,
  select,
  onModalStateChange,
}) => {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteMedia();
  const media = data?.pages.flatMap((page) => page.media) || [];
  const deleteMediaMutation = useDeleteMedia();
  const {
    mediaTypeFilter,
    orderFilter,
    videoSizes,
    filteredMedia,
    handleVideoLoad,
    setMediaTypeFilter,
    setOrderFilter,
  } = useMedia({
    media,
    hideVideos,
    aspectRatio,
  });
  const { showMessage } = useSnackBarStore();
  const [openModal, setOpenModal] = useState(false);
  const [clickedMedia, setClickedMedia] = useState<common_MediaItem | undefined>();
  const [hoverMedia, setHoverMedia] = useState<number | undefined>();
  const [confirmDeletionId, setConfirmDeletionId] = useState<number | undefined>();

  const { ref, inView } = useInView();
  const isSelected = (id: number) => selectedMedia?.some((item) => item.id === id);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // useEffect(() => {
  //   if (onModalStateChange) {
  //     onModalStateChange(openModal);
  //   }
  // }, [openModal, onModalStateChange]);

  const handleSelect = (media: common_MediaFull | undefined, event: React.MouseEvent) => {
    event.stopPropagation();
    if (enableModal) {
      setOpenModal(true);
      setClickedMedia(media?.media);
    } else if (media) {
      select(media, allowMultiple);
    }
  };

  const handleDeleteFile = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();

    if (confirmDeletionId === id) {
      try {
        await deleteMediaMutation.mutateAsync(id);
        showMessage('MEDIA WAS SUCCESSFULLY DELETED', 'success');
        setConfirmDeletionId(undefined);
      } catch (error) {
        showMessage('MEDIA CANNOT BE REMOVED', 'error');
        setConfirmDeletionId(undefined);
      }
    } else {
      setConfirmDeletionId(id);
    }
  };

  return (
    <div className='w-full space-y-4'>
      <div className='w-40'>
        <Selector
          label='Media Type'
          value={mediaTypeFilter}
          options={MEDIA_TYPE_OPTIONS}
          onChange={(value) => setMediaTypeFilter(value)}
        />
        <Selector
          label='Order'
          value={orderFilter}
          options={ORDER_FILTER_OPTIONS}
          onChange={(value) => setOrderFilter(value)}
        />
      </div>
      <div className='grid grid-cols-2 md:grid-cols-6 gap-2'>
        {filteredMedia.map((m) => (
          <div key={m.id} className='flex flex-col gap-1'>
            <div
              className='relative cursor-pointer group'
              onClick={(event) => handleSelect(m, event)}
              onMouseEnter={() => setHoverMedia(m.id)}
              onMouseLeave={() => setHoverMedia(undefined)}
            >
              <label htmlFor={`${m.id}`} className='block'>
                <Text
                  variant='selected'
                  component='span'
                  className={cn(
                    'absolute hidden top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 p-2 bg-black/50',
                    {
                      block: isSelected(m.id || 0),
                    },
                  )}
                >
                  selected
                </Text>

                <Media
                  alt={m.media?.thumbnail?.mediaUrl || ''}
                  src={m.media?.thumbnail?.mediaUrl || ''}
                  type={isVideo(m.media?.thumbnail?.mediaUrl) ? 'video' : 'image'}
                  controls={isVideo(m.media?.thumbnail?.mediaUrl)}
                  onLoadedMetadata={
                    isVideo(m.media?.thumbnail?.mediaUrl)
                      ? (e: any) => handleVideoLoad(m.id || 0, e)
                      : undefined
                  }
                />
              </label>

              {hoverMedia === m.id && isDeleteAccepted && (
                <Button
                  className='absolute top-0 right-0'
                  onClick={(e: any) => handleDeleteFile(m.id || 0, e)}
                >
                  {confirmDeletionId === m.id ? <CheckIcon /> : <ClearIcon />}
                </Button>
              )}
            </div>
            <Text
              variant='uppercase'
              className='text-center'
              style={{
                backgroundColor: mediaAspectRatio(m, videoSizes)
                  ? aspectRatioColor(mediaAspectRatio(m, videoSizes))
                  : '#808080',
              }}
            >
              {mediaAspectRatio(m, videoSizes)
                ? `ratio: ${mediaAspectRatio(m, videoSizes)}`
                : 'ratio: unknown'}
            </Text>
          </div>
        ))}
      </div>
      {hasNextPage && (
        <div ref={ref} className='flex justify-center p-4'>
          {isFetchingNextPage && <div>Loading more media...</div>}
        </div>
      )}

      {/* <FullSizeMediaModal open={openModal} clickedMedia={clickedMedia} close={handleCloseModal} /> */}
    </div>
  );
};
