import { useMediaQuery, useTheme } from '@mui/material';
import { Cross1Icon } from '@radix-ui/react-icons';
import { common_ArchiveInsert, common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';

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
  const images = media.filter((item) => !isVideo(item.media?.fullSize?.mediaUrl));
  const video = media.find(
    (item) => isVideo(item.media?.fullSize?.mediaUrl) && item.id === values.videoId,
  );

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
