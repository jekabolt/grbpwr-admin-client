import { common_MediaFull } from 'api/proto-http/admin';
import { VideoSize } from '..';
import { usePendingFiles } from '../utils/usePendingFiles';
import { DragDropArea } from './dragdrop-area';
import { MediaItem } from './media-item';

interface MediaListProps {
  media: common_MediaFull[];
  disabled?: boolean;
  selection: {
    toggleMedia: (media: common_MediaFull) => void;
    isSelected: (mediaId: number) => boolean;
  };
  videoSizes: Record<number, VideoSize>;
  selectionMode?: boolean;
  pendingFilesHook: ReturnType<typeof usePendingFiles>;
  onVideoLoad: (mediaId: number, event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onView?: (media: common_MediaFull) => void | Promise<void>;
}

export function MediaList({
  media,
  selection,
  disabled = false,
  videoSizes,
  selectionMode = false,
  pendingFilesHook,
  onVideoLoad,
  onView,
}: MediaListProps) {
  return (
    <DragDropArea
      mediaLength={media.length}
      className='grid grid-cols-2 lg:grid-cols-4 gap-4'
      pendingFilesHook={pendingFilesHook}
    >
      {media.map((m) => (
        <MediaItem
          key={m.id}
          media={m}
          isSelected={selection.isSelected(m.id || 0)}
          onToggle={() => selection.toggleMedia(m)}
          disabled={disabled}
          videoSizes={videoSizes}
          onVideoLoad={onVideoLoad}
          onView={onView}
          selectionMode={selectionMode}
        />
      ))}
    </DragDropArea>
  );
}
