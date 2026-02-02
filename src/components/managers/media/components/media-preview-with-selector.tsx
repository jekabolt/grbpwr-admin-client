import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { Button } from 'ui/components/button';
import MediaComponent from 'ui/components/media';

interface MediaPreviewWithSelectorProps {
  mediaUrl?: string;
  aspectRatio: string[];
  allowMultiple?: boolean;
  showVideos?: boolean;
  label?: string;
  alt?: string;
  editMode?: boolean;
  showSelectorWhenEmpty?: boolean;
  onSaveMedia: (media: common_MediaFull[]) => void;
  onClear?: () => void;
}

export function MediaPreviewWithSelector({
  mediaUrl,
  aspectRatio,
  allowMultiple = false,
  showVideos = true,
  alt = 'Media preview',
  label = 'select media',
  editMode = true,
  showSelectorWhenEmpty = true,
  onSaveMedia,
  onClear,
}: MediaPreviewWithSelectorProps) {
  const previewAspectRatio = aspectRatio[0]?.replace(':', '/') || '4/5';

  if (mediaUrl) {
    return (
      <div
        className='relative w-full border border-text group overflow-hidden'
        style={{ aspectRatio: previewAspectRatio }}
      >
        <MediaComponent
          src={mediaUrl}
          alt={alt}
          aspectRatio={previewAspectRatio}
          className='max-w-full h-auto'
        />
        {editMode && (onClear || editMode) && (
          <Button
            type='button'
            onClick={onClear}
            className='absolute top-0 right-0 z-10 cursor-pointer'
          >
            ×
          </Button>
        )}
        {editMode && (
          <div className='absolute left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] group-hover:block hidden'>
            <MediaSelector
              label={label}
              aspectRatio={aspectRatio}
              allowMultiple={allowMultiple}
              showVideos={showVideos}
              saveSelectedMedia={onSaveMedia}
            />
          </div>
        )}
      </div>
    );
  }

  if (!showSelectorWhenEmpty) {
    return (
      <div
        className='relative w-full h-auto border border-text'
        style={{ aspectRatio: previewAspectRatio }}
      />
    );
  }

  return (
    <div
      className='relative w-full h-auto flex items-center justify-center border border-text'
      style={{ aspectRatio: previewAspectRatio }}
    >
      <MediaSelector
        label={label}
        aspectRatio={aspectRatio}
        allowMultiple={allowMultiple}
        showVideos={showVideos}
        saveSelectedMedia={onSaveMedia}
      />
    </div>
  );
}
