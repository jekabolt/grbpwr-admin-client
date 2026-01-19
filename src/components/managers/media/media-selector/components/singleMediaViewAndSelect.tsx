import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { FC } from 'react';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { MediaSelectorLayout } from '../layout';

interface SingleMediaView {
  link: string | undefined;
  isEditMode?: boolean;
  isAddingProduct?: boolean;
  aspectRatio?: string[];
  hideVideos?: boolean;
  isDeleteAccepted?: boolean;
  aspectOnPreview?: string;
  fit?: 'cover' | 'contain';
  error?: string;
  saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}

export const SingleMediaViewAndSelect: FC<SingleMediaView> = ({
  link,
  isEditMode,
  isAddingProduct,
  aspectRatio = ['4/5'],
  aspectOnPreview = '4/5',
  hideVideos,
  isDeleteAccepted,
  fit = 'cover',
  error,
  saveSelectedMedia,
}) => {
  return (
    <div className='space-y-2'>
      <div
        className={cn('flex items-center justify-center relative group border', {
          'border-red-500': error,
          'border-text': !error,
        })}
        style={{ aspectRatio: aspectOnPreview }}
      >
        <div className='w-full h-full'>
          {link ? (
            <Media
              aspectRatio={aspectOnPreview}
              alt={link}
              src={link}
              type={isVideo(link) ? 'video' : 'image'}
              controls={isVideo(link)}
              fit={fit}
            />
          ) : (
            <div className='w-full h-full flex items-center justify-center bg-bgColor' />
          )}
          {(isEditMode === undefined || isEditMode || isAddingProduct) && (
            <MediaSelectorLayout
              label={link ? 'edit' : 'select media'}
              allowMultiple={false}
              aspectRatio={aspectRatio}
              hideVideos={hideVideos}
              isDeleteAccepted={isDeleteAccepted}
              className={
                link
                  ? 'hidden group-hover:block absolute top-0 right-0'
                  : 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
              }
              saveSelectedMedia={saveSelectedMedia}
            />
          )}
        </div>
      </div>
      {error && <Text variant='error'>{error}</Text>}
    </div>
  );
};
