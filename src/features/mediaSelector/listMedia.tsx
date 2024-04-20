import ClearIcon from '@mui/icons-material/Clear';
import {
  Grid,
  IconButton,
  ImageList,
  ImageListItem,
  InputLabel,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { deleteFiles } from 'api/admin';
import { common_MediaInsert } from 'api/proto-http/admin';
import { MediaSelectorMediaListProps } from 'features/interfaces/mediaSelectorInterfaces';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC, useState } from 'react';
import styles from 'styles/media-selector.scss';
import { FullSizeMediaModal } from './fullSizeMediaModal';

export const MediaList: FC<MediaSelectorMediaListProps> = ({
  media,
  setMedia,
  allowMultiple,
  select,
  selectedMedia,
  height = 480,
  sortedAndFilteredMedia,
  enableModal = false,
}) => {
  const [openModal, setOpenModal] = useState(false);
  const [clickedMedia, setClickedMedia] = useState<common_MediaInsert>();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const handleDeleteFile = async (id: number | undefined) => {
    await deleteFiles({ id });
    setMedia((currentFiles) => currentFiles?.filter((file) => file.id !== id));
  };

  const handleSelect = (
    mediaUrl: common_MediaInsert | undefined,
    allowMultiple: boolean,
    event: any,
  ) => {
    event.stopPropagation();
    if (enableModal) {
      setOpenModal(true);
      setClickedMedia(mediaUrl);
    } else {
      if (mediaUrl?.thumbnail) {
        select(mediaUrl.thumbnail, allowMultiple);
      }
    }
  };

  const handleCloseModal = () => {
    setOpenModal(false);
  };

  return (
    <Grid container justifyContent='center'>
      <Grid item xs={11}>
        {sortedAndFilteredMedia && (
          <ImageList
            variant='standard'
            sx={{
              width: '100%',
              height: height,
            }}
            cols={isSmallScreen ? 1 : 5}
            gap={8}
            rowHeight={200}
          >
            {sortedAndFilteredMedia().map((m) => (
              <ImageListItem
                onClick={(event) => handleSelect(m.media, allowMultiple, event)}
                className={styles.list_media_item}
                key={m.id}
              >
                <InputLabel htmlFor={`${m.id}`}>
                  {selectedMedia?.some((item) => item.url === (m.media?.thumbnail ?? '')) ? (
                    <span className={styles.selected_flag}>selected</span>
                  ) : null}
                  {isVideo(m.media?.thumbnail) ? (
                    <video
                      key={m.id}
                      src={m.media?.thumbnail}
                      className={`${selectedMedia?.some((item) => item.url === (m.media?.thumbnail ?? '')) ? styles.selected_media : ''}`}
                      controls
                    />
                  ) : (
                    <img
                      key={m.id}
                      src={m.media?.thumbnail}
                      alt='media'
                      className={`${selectedMedia?.some((item) => item.url === (m.media?.thumbnail ?? '')) ? styles.selected_media : ''}`}
                    />
                  )}
                </InputLabel>
                <IconButton
                  aria-label='delete'
                  size='small'
                  onClick={() => handleDeleteFile(m.id)}
                  className={styles.delete_btn}
                >
                  <ClearIcon />
                </IconButton>
              </ImageListItem>
            ))}
          </ImageList>
        )}
      </Grid>
      <FullSizeMediaModal open={openModal} close={handleCloseModal} clickedMedia={clickedMedia} />
    </Grid>
  );
};
