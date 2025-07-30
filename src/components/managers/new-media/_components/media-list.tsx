import { common_MediaFull } from 'api/proto-http/admin';
import { VideoSize } from '..';
import { MediaItem } from './media-item';

interface MediaListProps {
  media: common_MediaFull[];
  disabled?: boolean;
  selection: {
    toggleMedia: (media: common_MediaFull) => void;
    isSelected: (mediaId: number) => boolean;
  };
  videoSizes: Record<number, VideoSize>;
  onVideoLoad: (mediaId: number, event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onDragStart?: (media: common_MediaFull) => void;
  onDragEnd?: () => void;
  onReorder?: (draggedMedia: common_MediaFull, targetMedia: common_MediaFull) => void;
}

export function MediaList({
  media,
  selection,
  disabled = false,
  videoSizes,
  onVideoLoad,
}: MediaListProps) {
  return (
    <div className='grid grid-cols-2 lg:grid-cols-4 gap-2'>
      {media.map((m, index) => (
        <MediaItem
          media={m}
          isSelected={selection.isSelected(m.id || 0)}
          onToggle={() => selection.toggleMedia(m)}
          disabled={disabled}
          videoSizes={videoSizes}
          onVideoLoad={onVideoLoad}
        />
      ))}
    </div>
  );
}
