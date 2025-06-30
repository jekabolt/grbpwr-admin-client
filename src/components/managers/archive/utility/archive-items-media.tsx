import { useMediaQuery, useTheme } from '@mui/material';
import { Cross1Icon } from '@radix-ui/react-icons';
import { common_ArchiveInsert, common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';

// Helper function to check if media has 2:1 aspect ratio (main image)
const isMainImage = (media: common_MediaFull): boolean => {
  const width = media.media?.fullSize?.width;
  const height = media.media?.fullSize?.height;
  if (!width || !height) return false;
  const ratio = width / height;
  return Math.abs(ratio - 2) < 0.1; // Allow small tolerance for 2:1 ratio
};

export function ArchiveMediaDisplay({
  media,
  values,
  remove,
}: {
  media: common_MediaFull[];
  values: common_ArchiveInsert;
  remove: (id: number, values: common_ArchiveInsert, isVideo?: boolean) => void;
}) {
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down('sm'));

  const video = media.find(
    (item) => isVideo(item.media?.fullSize?.mediaUrl) && item.id === values.mainMediaId,
  );

  const mainImage = media.find(
    (item) =>
      !isVideo(item.media?.fullSize?.mediaUrl) &&
      isMainImage(item) &&
      item.id === values.mainMediaId,
  );

  const images = media.filter((item) => {
    if (isVideo(item.media?.fullSize?.mediaUrl)) return false;
    if (isMainImage(item)) return false;
    return true;
  });

  return (
    <div className='space-y-2'>
      {video && (
        <div className='w-full relative'>
          <Media
            src={video.media?.fullSize?.mediaUrl || ''}
            type='video'
            alt='archive media item'
            aspectRatio='16/9'
            fit='cover'
            autoPlay
          />
          <Button
            onClick={() => remove(video.id || 0, values, true)}
            className='absolute right-0 top-0'
          >
            <Cross1Icon />
          </Button>
        </div>
      )}

      {mainImage && !video && (
        <div className='w-full relative'>
          <Media
            src={mainImage.media?.fullSize?.mediaUrl || ''}
            alt='archive main image'
            aspectRatio='2/1'
            fit='cover'
          />
          <Button
            onClick={() => remove(mainImage.id || 0, values, false)}
            className='absolute right-0 top-0'
          >
            <Cross1Icon />
          </Button>
        </div>
      )}

      {images.length > 0 && (
        <div className={`grid ${isSm ? 'grid-cols-2' : 'grid-cols-4'} gap-2`}>
          {images.map((item) => (
            <div key={item.id} className='relative'>
              <Media
                src={item.media?.fullSize?.mediaUrl || ''}
                alt='archive media item'
                aspectRatio='3/4'
              />
              <Button
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.preventDefault();
                  remove(item.id || 0, values);
                }}
                className='absolute right-0 top-0'
              >
                <Cross1Icon />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
