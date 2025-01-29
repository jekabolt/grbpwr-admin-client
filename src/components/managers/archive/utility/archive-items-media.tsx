import ClearIcon from '@mui/icons-material/Clear';
import { IconButton, ImageList, ImageListItem, useMediaQuery, useTheme } from '@mui/material';
import { common_ArchiveInsert, common_MediaFull } from 'api/proto-http/admin';
import styles from 'styles/archive.scss';

export function ArchiveMediaDisplay({
  media,
  values,
  remove,
}: {
  media: common_MediaFull[];
  values: common_ArchiveInsert;
  remove: (id: number, values: common_ArchiveInsert) => void;
}) {
  const theme = useTheme();
  const isSm = useMediaQuery(theme.breakpoints.down('sm'));
  return (
    <ImageList cols={isSm ? 2 : 4} gap={8} rowHeight={200} className={styles.image_list}>
      {media.map((item) => (
        <ImageListItem key={item.id} className={styles.image_list_item}>
          <img
            src={item.media?.fullSize?.mediaUrl}
            style={{ objectFit: isSm ? 'scale-down' : 'cover' }}
          />
          <IconButton onClick={() => remove(item.id || 0, values)} className={styles.remove_btn}>
            <ClearIcon />
          </IconButton>
        </ImageListItem>
      ))}
    </ImageList>
  );
}
