import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import MediaComponent from 'ui/components/media';

interface MediaPreviewWithSelectorProps {
  mediaUrl?: string;
  aspectRatio: string[];
  allowMultiple?: boolean;
  showVideos?: boolean;
  alt?: string;
  onSaveMedia: (media: common_MediaFull[]) => void;
  label?: string;
}

export function MediaPreviewWithSelector({
  mediaUrl,
  aspectRatio,
  allowMultiple = false,
  showVideos = false,
  alt = 'Media preview',
  onSaveMedia,
  label = 'select media',
}: MediaPreviewWithSelectorProps) {
  const previewAspectRatio = aspectRatio[0]?.replace(':', '/') || '4/5';

  if (mediaUrl) {
    return (
      <div className='relative border border-text p-2'>
        <MediaComponent
          src={mediaUrl}
          alt={alt}
          aspectRatio={previewAspectRatio}
          className='max-w-full h-auto'
        />
        <div className='absolute top-0 right-0'>
          <MediaSelector
            label={label}
            aspectRatio={aspectRatio}
            allowMultiple={allowMultiple}
            showVideos={showVideos}
            saveSelectedMedia={onSaveMedia}
          />
        </div>
      </div>
    );
  }

  return (
    <MediaSelector
      label={label}
      aspectRatio={aspectRatio}
      allowMultiple={allowMultiple}
      showVideos={showVideos}
      saveSelectedMedia={onSaveMedia}
    />
  );
}
