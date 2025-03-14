import CheckIcon from '@mui/icons-material/Check';
import ClearIcon from '@mui/icons-material/Clear';
import { common_MediaFull, common_MediaItem } from 'api/proto-http/admin';
import { MediaSelectorMediaListProps } from 'components/managers/media/media-selector/interfaces/mediaSelectorInterfaces';
import { aspectRatioColor, mediaAspectRatio } from 'lib/features/aspect-ratio';
import { isVideo } from 'lib/features/filterContentType';
import { useMediaSelectorStore } from 'lib/stores/media/store';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { FC, useEffect, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { FilterMedias } from './filterMedias';
import { FullSizeMediaModal } from './fullSizeMediaModal';

const ITEMS_PER_PAGE = 16;

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
  const { showMessage } = useSnackBarStore();
  const { getSortedMedia, fetchFiles, deleteFile } = useMediaSelectorStore();
  const sortedMedia = getSortedMedia();
  const [openModal, setOpenModal] = useState(false);
  const [clickedMedia, setClickedMedia] = useState<common_MediaItem | undefined>();
  const [hoverMedia, setHoverMedia] = useState<number | undefined>();
  const [confirmDeletionId, setConfirmDeletionId] = useState<number | undefined>();
  const [videoSizes, setVideoSizes] = useState<Record<number, { width: number; height: number }>>(
    {},
  );
  const pageRef = useRef(2);
  const hasMoreRef = useRef(true);
  const [isLoading, setIsLoading] = useState(false);
  const { ref, inView } = useInView();

  const handleCloseModal = () => setOpenModal(false);

  const isSelected = (id: number) => selectedMedia?.some((item) => item.id === id);

  useEffect(() => {
    fetchFiles(ITEMS_PER_PAGE, 0);
  }, [fetchFiles]);

  useEffect(() => {
    if (onModalStateChange) {
      onModalStateChange(openModal);
    }
  }, [openModal, onModalStateChange]);

  const handleSelect = (media: common_MediaFull | undefined, event: React.MouseEvent) => {
    event.stopPropagation();
    if (enableModal) {
      setOpenModal(true);
      setClickedMedia(media?.media);
    } else if (media) {
      select(media, allowMultiple);
    }
  };

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

  const filteredMedia = sortedMedia.filter((media) => {
    if (hideVideos && isVideo(media.media?.thumbnail?.mediaUrl)) {
      return false;
    }

    const isVideoMedia = isVideo(media.media?.thumbnail?.mediaUrl);

    if (aspectRatio) {
      if (isVideoMedia) {
        if (!videoSizes[media.id || 0]) {
          return true;
        }

        const mediaRatio = mediaAspectRatio(media, videoSizes);
        return mediaRatio && aspectRatio.includes(mediaRatio);
      } else {
        const mediaRatio = mediaAspectRatio(media, videoSizes);
        return mediaRatio && aspectRatio.includes(mediaRatio);
      }
    }

    return true;
  });

  const handleDeleteFile = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();

    if (confirmDeletionId === id) {
      const { success } = await deleteFile(id);
      if (success) {
        showMessage('MEDIA WAS SUCCESSFULLY DELETED', 'success');
      } else {
        showMessage('MEDIA CANNOT BE REMOVED', 'error');
      }
      setConfirmDeletionId(undefined);
    } else {
      setConfirmDeletionId(id);
    }
  };

  useEffect(() => {
    const loadMoreData = async () => {
      if (!hasMoreRef.current || isLoading) return;
      setIsLoading(true);

      try {
        const fetchedFiles = await fetchFiles(
          ITEMS_PER_PAGE,
          (pageRef.current - 1) * ITEMS_PER_PAGE,
        );

        pageRef.current += 1;

        if (fetchedFiles?.length < ITEMS_PER_PAGE) {
          hasMoreRef.current = false;
        }
      } catch (error) {
        console.error('Failed to fetch media:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (inView && hasMoreRef.current) {
      loadMoreData();
    }
  }, [inView, isLoading, fetchFiles]);

  return (
    <div className='w-full space-y-4'>
      <div className='lg:w-96 w-full'>
        <FilterMedias />
      </div>
      <div className='grid grid-cols-2 md:grid-cols-6 gap-2'>
        {filteredMedia.map((media) => (
          <div key={media.id} className='flex flex-col gap-1'>
            <div
              className='relative cursor-pointer group'
              onClick={(event) => handleSelect(media, event)}
              onMouseEnter={() => setHoverMedia(media.id)}
              onMouseLeave={() => setHoverMedia(undefined)}
            >
              <label htmlFor={`${media.id}`} className='block'>
                <Text
                  variant='selected'
                  component='span'
                  className={cn(
                    'absolute hidden top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 p-2 bg-black/50',
                    {
                      block: isSelected(media.id || 0),
                    },
                  )}
                >
                  selected
                </Text>

                <Media
                  alt={media.media?.thumbnail?.mediaUrl || ''}
                  src={media.media?.thumbnail?.mediaUrl || ''}
                  type={isVideo(media.media?.thumbnail?.mediaUrl) ? 'video' : 'image'}
                  controls={isVideo(media.media?.thumbnail?.mediaUrl)}
                  onLoadedMetadata={
                    isVideo(media.media?.thumbnail?.mediaUrl)
                      ? (e: any) => handleVideoLoad(media.id || 0, e)
                      : undefined
                  }
                />
              </label>

              {hoverMedia === media.id && isDeleteAccepted && (
                <Button
                  className='absolute top-0 right-0'
                  onClick={(e: any) => handleDeleteFile(media.id || 0, e)}
                >
                  {confirmDeletionId === media.id ? <CheckIcon /> : <ClearIcon />}
                </Button>
              )}
            </div>
            <Text
              variant='uppercase'
              className='text-center'
              style={{
                backgroundColor: mediaAspectRatio(media, videoSizes)
                  ? aspectRatioColor(mediaAspectRatio(media, videoSizes))
                  : '#808080',
              }}
            >
              {mediaAspectRatio(media, videoSizes)
                ? `ratio: ${mediaAspectRatio(media, videoSizes)}`
                : 'ratio: unknown'}
            </Text>
          </div>
        ))}
      </div>
      {hasMoreRef.current && (
        <div ref={ref} className='text-center text-xl'>
          Loading...
        </div>
      )}
      <FullSizeMediaModal open={openModal} clickedMedia={clickedMedia} close={handleCloseModal} />
    </div>
  );
};
