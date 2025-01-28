import { Button, ImageList, ImageListItem } from '@mui/material';
import { common_ArchiveInsert, common_MediaFull } from 'api/proto-http/admin';

export function ArchiveMediaDisplay({
  media,
  values,
  remove,
}: {
  media: common_MediaFull[];
  values: common_ArchiveInsert;
  remove: (id: number, values: common_ArchiveInsert) => void;
}) {
  return (
    <ImageList cols={4} gap={8} rowHeight={200}>
      {media.map((item) => (
        <ImageListItem key={item.id} sx={{ position: 'relative' }}>
          <img
            src={item.media?.fullSize?.mediaUrl}
            alt={'Archive media'}
            loading='lazy'
            style={{ height: '200px', objectFit: 'cover' }}
          />
          <Button
            onClick={() => remove(item.id || 0, values)}
            variant='contained'
            color='error'
            size='small'
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              minWidth: 'auto',
              padding: '4px 8px',
            }}
          >
            ×
          </Button>
        </ImageListItem>
      ))}
    </ImageList>
  );
}
