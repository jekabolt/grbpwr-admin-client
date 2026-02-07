import { CheckIcon } from '@radix-ui/react-icons';
import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { VideoSize } from '..';
import {
  getAspectRatioBackgroundClass,
  isKnownAspectRatio,
  mediaAspectRatio,
} from '../utils/calculate-aspect';
import { useDeleteMedia } from '../utils/useMediaQuery';

interface MediaItemProps {
  media: common_MediaFull;
  isSelected: boolean;
  disabled?: boolean;
  videoSizes: Record<number, VideoSize>;
  onToggle: () => void;
  onVideoLoad: (mediaId: number, event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onView?: (media: common_MediaFull) => void | Promise<void>;
  selectionMode?: boolean;
}

export function MediaItem({
  media,
  isSelected,
  disabled = false,
  videoSizes,
  onToggle,
  onVideoLoad,
  onView,
  selectionMode = false,
}: MediaItemProps) {
  const mediaUrl = media.media?.thumbnail?.mediaUrl;
  const deleteMediaMutation = useDeleteMedia();
  const { showMessage } = useSnackBarStore();
  const [confirmDelete, setConfirmDelete] = useState<number | undefined>(undefined);
  const width = media.media?.thumbnail?.width || videoSizes[media.id || 0]?.width;
  const height = media.media?.thumbnail?.height || videoSizes[media.id || 0]?.height;
  const aspectRatio = mediaAspectRatio(media, videoSizes);

  const handleVideoLoadEvent = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (media.id) {
      onVideoLoad(media.id, event);
    }
  };

  const handleSelect = (event: React.MouseEvent) => {
    if (disabled) return;
    event.stopPropagation();
    onToggle();
  };

  const handleClick = (event: React.MouseEvent) => {
    if (selectionMode) {
      if (!disabled) {
        handleSelect(event);
      }
      return;
    }

    if (onView) {
      event.stopPropagation();
      onView(media);
    } else if (!disabled) {
      handleSelect(event);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (confirmDelete === media.id) {
      deleteMediaMutation.mutate(media.id || 0, {
        onError: (error) => {
          const message = error instanceof Error ? error.message : 'Media cannot be removed';
          showMessage(message, 'error');
        },
      });
      setConfirmDelete(undefined);
    } else {
      setConfirmDelete(media.id || 0);
    }
  };

  return (
    <div className='w-full h-full'>
      <Button
        asChild
        onClick={handleClick}
        className='relative overflow-hidden w-full h-full group cursor-pointer bg-white'
      >
        <div className='relative w-full h-full'>
          <div>
            <Text
              variant='selected'
              component='span'
              className={cn(
                'absolute hidden top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 p-2',
                {
                  block: isSelected && !disabled,
                },
              )}
            >
              selected
            </Text>
            <Media
              src={mediaUrl || ''}
              type={isVideo(mediaUrl) ? 'video' : 'image'}
              alt={mediaUrl || 'media not found'}
              controls={isVideo(mediaUrl)}
              className={cn('w-full h-full w-full transition-opacity', {
                'opacity-75': isSelected && !disabled,
              })}
              onLoadedMetadata={handleVideoLoadEvent}
              fit='contain'
            />
          </div>
          <Text
            variant='uppercase'
            className={cn('text-center', getAspectRatioBackgroundClass(aspectRatio))}
          >
            {!isKnownAspectRatio(aspectRatio) && width && height
              ? `${width}:${height}`
              : aspectRatio
                ? `ratio: ${aspectRatio}`
                : 'ratio: unknown'}
          </Text>
          <Button
            className='absolute top-0 right-0 hidden group-hover:block cursor-pointer'
            onClick={handleDelete}
          >
            {confirmDelete === media.id ? <CheckIcon /> : '[x]'}
          </Button>
        </div>
      </Button>
    </div>
  );
}
