import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import MediaComponent from 'ui/components/media';
import Text from 'ui/components/text';

interface MediaPreviewWithSelectorProps {
  mediaUrl?: string;
  aspectRatio: string[];
  allowMultiple?: boolean;
  showVideos?: boolean;
  label?: string;
  /** What this media is for (e.g. "landscape"); shown in the picker dialog header. */
  purpose?: string;
  alt?: string;
  editMode?: boolean;
  showSelectorWhenEmpty?: boolean;
  /**
   * When set, the preview is sized by height (width derived from the aspect ratio)
   * instead of filling its container's width. Pass a responsive class, e.g. 'sm:h-44'.
   */
  heightClass?: string;
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
  purpose,
  editMode = true,
  showSelectorWhenEmpty = true,
  heightClass,
  onSaveMedia,
  onClear,
}: MediaPreviewWithSelectorProps) {
  const previewAspectRatio = aspectRatio[0]?.replace(':', '/') || '4/5';
  // Height-driven (w-fit) when heightClass given, otherwise fill the container width.
  const sizeClass = heightClass ? cn('w-full sm:w-fit', heightClass) : 'w-full';
  const mediaIsVideo = isVideo(mediaUrl);

  if (mediaUrl) {
    return (
      <div
        className={cn('relative border border-textColor overflow-hidden', sizeClass)}
        style={{ aspectRatio: previewAspectRatio }}
      >
        <MediaComponent
          src={mediaUrl}
          alt={alt}
          aspectRatio={previewAspectRatio}
          type={mediaIsVideo ? 'video' : 'image'}
          controls={mediaIsVideo}
          fit={mediaIsVideo ? 'contain' : 'cover'}
        />
        {mediaIsVideo && (
          <span className='absolute left-1 top-1 z-10 bg-textColor px-1.5 py-0.5'>
            <Text className='!text-bgColor' size='small' variant='uppercase'>
              video
            </Text>
          </span>
        )}
        {editMode && (
          <div className='absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-1 border-t border-textColor bg-bgColor/90 px-1.5 py-1'>
            <MediaSelector
              label='change'
              purpose={purpose}
              aspectRatio={aspectRatio}
              allowMultiple={allowMultiple}
              showVideos={showVideos}
              saveSelectedMedia={onSaveMedia}
              triggerClassName='px-2 py-0.5 text-small cursor-pointer'
            />
            {onClear && (
              <Button
                type='button'
                variant='secondary'
                onClick={onClear}
                className='px-2 py-0.5 text-small cursor-pointer'
              >
                remove
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  if (!showSelectorWhenEmpty) {
    return (
      <div
        className={cn('relative border border-textColor', sizeClass)}
        style={{ aspectRatio: previewAspectRatio }}
      />
    );
  }

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center gap-2 border border-dashed border-textInactiveColor',
        sizeClass,
      )}
      style={{ aspectRatio: previewAspectRatio }}
    >
      <MediaSelector
        label={label}
        purpose={purpose}
        aspectRatio={aspectRatio}
        allowMultiple={allowMultiple}
        showVideos={showVideos}
        saveSelectedMedia={onSaveMedia}
        triggerClassName='px-2 py-1 text-small cursor-pointer'
      />
      {aspectRatio[0] && (
        <Text variant='inactive' size='small'>
          {aspectRatio.join(' / ')}
        </Text>
      )}
    </div>
  );
}
