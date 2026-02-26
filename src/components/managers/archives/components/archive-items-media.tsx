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

  const mainMediaIds = new Set(values.mainMediaIds ?? []);
  const mainMedia = media.filter((m) => m.id != null && mainMediaIds.has(m.id));
  const otherMedia = media.filter((m) => m.id == null || !mainMediaIds.has(m.id));

  return (
    <div className='space-y-2'>
      {mainMedia.length > 0 && (
        <div className='space-y-2'>
          {mainMedia.map((item) => (
            <div key={item.id} className='w-full relative'>
              <Media
                src={item.media?.fullSize?.mediaUrl || ''}
                type={isVideo(item.media?.fullSize?.mediaUrl) ? 'video' : 'image'}
                alt='archive main media'
                aspectRatio={isVideo(item.media?.fullSize?.mediaUrl) ? '16/9' : '2/1'}
                fit='cover'
                autoPlay={isVideo(item.media?.fullSize?.mediaUrl)}
              />
              <Button
                onClick={() => remove(item.id || 0, values, isVideo(item.media?.fullSize?.mediaUrl))}
                className='absolute right-0 top-0'
              >
                <Cross1Icon />
              </Button>
            </div>
          ))}
        </div>
      )}

      {otherMedia.length > 0 && (
        <div className={`grid ${isSm ? 'grid-cols-2' : 'grid-cols-4'} gap-2`}>
          {otherMedia.map((item) => (
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
