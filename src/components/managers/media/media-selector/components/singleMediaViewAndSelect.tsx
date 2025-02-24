import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { cn } from 'lib/utility';
import { FC } from 'react';
import Media from 'ui/components/media';
import { MediaSelectorLayout } from '../layout';

interface SingleMediaView {
  link: string | undefined;
  isEditMode?: boolean;
  isAddingProduct?: boolean;
  aspectRatio?: string[];
  hideVideos?: boolean;
  isDeleteAccepted?: boolean;
  saveSelectedMedia: (newSelectedMedia: common_MediaFull[]) => void;
}

export const SingleMediaViewAndSelect: FC<SingleMediaView> = ({
  link,
  isEditMode,
  isAddingProduct,
  aspectRatio = ['4/5'],
  hideVideos,
  isDeleteAccepted,
  saveSelectedMedia,
}) => {
  return (
    <div className='flex items-center justify-center relative group'>
      <div className='w-full'>
        {link && (
          <Media
            alt={link}
            src={link}
            type={isVideo(link) ? 'video' : 'image'}
            controls={isVideo(link)}
          />
        )}
        {(isEditMode === undefined || isEditMode || isAddingProduct) && (
          <MediaSelectorLayout
            label={link ? 'edit' : 'select media'}
            allowMultiple={false}
            aspectRatio={aspectRatio}
            hideVideos={hideVideos}
            isDeleteAccepted={isDeleteAccepted}
            className={cn('hidden', {
              'group-hover:block absolute top-0 right-0': link,
              block: !link,
            })}
            saveSelectedMedia={saveSelectedMedia}
          />
        )}
      </div>
    </div>
  );
};
