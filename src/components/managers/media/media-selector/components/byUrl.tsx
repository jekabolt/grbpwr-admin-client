import Input from 'components/ui/input';
import { checkIsHttpHttpsMediaLink } from 'features/utilitty/checkIsHttpHttpsLink';
import { useMediaSelectorStore } from 'lib/stores/media/store';
import { cn } from 'lib/utility';
import { FC } from 'react';

export const ByUrl: FC = () => {
  const { uploadState, prepareUpload } = useMediaSelectorStore();

  const isValidUrl = (urlString: string) => {
    if (!urlString) return true;
    try {
      new URL(urlString);
      return checkIsHttpHttpsMediaLink(urlString);
    } catch (e) {
      return false;
    }
  };

  return (
    <div className='w-full'>
      <Input
        name='url'
        placeholder='Enter URL to upload media'
        value={uploadState.url}
        onChange={(e: any) => prepareUpload({ url: e.target.value })}
        className={cn('w-full', {
          'focus:border-red-500': !isValidUrl(uploadState.url),
        })}
      />
    </div>
  );
};
