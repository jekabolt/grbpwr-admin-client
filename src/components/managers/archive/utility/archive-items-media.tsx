import ClearIcon from '@mui/icons-material/Clear';
import {
  IconButton,
  ImageList,
  ImageListItem,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { common_ArchiveInsert, common_MediaFull } from 'api/proto-http/admin';
import styles from 'styles/archive.scss';
import { isVideo } from '../form/form';

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

  // Separate videos and images
  const images = media.filter((item) => !isVideo(item));
  const videos = media.filter((item) => isVideo(item));

  return (
    <div>
      {videos.length > 0 && (
        <div>
          <Typography
            variant='overline'
            fontWeight='bold'
            fontSize='1.2rem'
            gutterBottom
            textTransform='uppercase'
          >
            video
          </Typography>
          <ImageList cols={1} gap={8} className={styles.media_list}>
            {videos.map((item) => (
              <ImageListItem key={item.id} className={styles.media_list_item}>
                <video
                  src={item.media?.fullSize?.mediaUrl}
                  style={{ width: '100%', maxHeight: '400px' }}
                  controls
                />
                <IconButton
                  onClick={() => remove(item.id || 0, values)}
                  className={styles.remove_btn}
                >
                  <ClearIcon />
                </IconButton>
              </ImageListItem>
            ))}
          </ImageList>
        </div>
      )}
      {images.length > 0 && (
        <div>
          <Typography
            variant='overline'
            fontWeight='bold'
            fontSize='1.2rem'
            gutterBottom
            textTransform='uppercase'
          >
            images
          </Typography>
          <ImageList cols={isSm ? 2 : 4} gap={8} rowHeight={200} className={styles.media_list}>
            {images.map((item) => (
              <ImageListItem key={item.id} className={styles.media_list_item}>
                <img
                  src={item.media?.fullSize?.mediaUrl}
                  style={{ objectFit: isSm ? 'scale-down' : 'cover' }}
                  alt={item.media?.fullSize?.mediaUrl}
                />
                <IconButton
                  onClick={() => remove(item.id || 0, values)}
                  className={styles.remove_btn}
                >
                  <ClearIcon />
                </IconButton>
              </ImageListItem>
            ))}
          </ImageList>
        </div>
      )}
    </div>
  );
}
