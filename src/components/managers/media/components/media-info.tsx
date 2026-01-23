import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { CopyToClipboard } from 'ui/components/copyToClipboard';
import Text from 'ui/components/text';

const MEDIA_TYPES = ['fullSize', 'compressed', 'thumbnail'] as const;

export function MediaInfo({ media }: { media: common_MediaFull }) {
  return (
    <div className='flex items-center justify-center gap-x-5 w-full'>
      {MEDIA_TYPES.map((t) => {
        const info = media.media?.[t];
        const url = info?.mediaUrl;
        const dimensions = `${info?.width || 'N/A'}px x ${info?.height || 'N/A'}px`;
        const mediaType = url ? (isVideo(url) ? 'video' : 'image') : 'N/A';

        if (!url) return null;

        return (
          <div key={t} className='flex flex-col gap-2 border p-2'>
            <Text variant='uppercase' className='leading-none'>
              {t}
            </Text>
            <div className='flex flex-col gap-1'>
              <div className='flex items-center gap-2 '>
                <Text variant='uppercase' className='leading-none'>
                  type:
                </Text>
                <Text className='leading-none'>{mediaType}</Text>
              </div>
              <div className='flex items-center gap-2 '>
                <Text variant='uppercase' className='leading-none'>
                  url:
                </Text>
                <CopyToClipboard text={url} cutText={true} />
              </div>
              <div className='flex items-center gap-2'>
                <Text variant='uppercase' className='leading-none'>
                  size:
                </Text>
                <Text className='leading-none'>{dimensions}</Text>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
