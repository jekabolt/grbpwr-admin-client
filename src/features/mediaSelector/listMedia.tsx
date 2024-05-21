import ClearIcon from '@mui/icons-material/Clear';
import {
  Alert,
  Grid,
  IconButton,
  ImageList,
  ImageListItem,
  InputLabel,
  Snackbar,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { deleteFiles } from 'api/admin';
import { common_MediaFull, common_MediaInsert } from 'api/proto-http/admin';
import { MediaSelectorMediaListProps } from 'features/interfaces/mediaSelectorInterfaces';
import { isVideo } from 'features/utilitty/filterContentType';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useState } from 'react';
import styles from 'styles/media-selector.scss';
import { FullSizeMediaModal } from './fullSizeMediaModal';

export const MediaList: FC<MediaSelectorMediaListProps> = ({
  setMedia,
  allowMultiple,
  select,
  selectedMedia,
  height = 480,
  sortedAndFilteredMedia,
  enableModal = false,
}) => {
  const { showMessage, isSnackBarOpen, closeSnackBar, snackBarMessage, snackBarSeverity } =
    useMediaSelector();
  const [openModal, setOpenModal] = useState(false);
  const [clickedMedia, setClickedMedia] = useState<common_MediaInsert | undefined>();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const handleDeleteFile = async (id: number | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteFiles({ id });
    showMessage('MEDIA WAS SUCCESSFULLY DELETED', 'success');
    setMedia((currentFiles) => currentFiles?.filter((file) => file.id !== id));
  };

  const handleSelect = (
    media: common_MediaFull | undefined,
    allowMultiple: boolean,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    if (enableModal) {
      setOpenModal(true);
      setClickedMedia(media?.media);
    } else {
      if (media) {
        select(media, allowMultiple);
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
                onClick={(event) => handleSelect(m, allowMultiple, event)}
                className={styles.list_media_item}
                key={m.id}
              >
                <InputLabel htmlFor={`${m.id}`}>
                  {selectedMedia?.some((item) => item.id === m.id) ? (
                    <span className={styles.selected_flag}>selected</span>
                  ) : null}
                  {isVideo(m.media?.thumbnail?.mediaUrl) ? (
                    <video
                      key={m.id}
                      src={m.media?.thumbnail?.mediaUrl}
                      className={`${selectedMedia?.some((item) => item.id === m.id) ? styles.selected_media : ''}`}
                      controls
                    />
                  ) : (
                    <img
                      key={m.id}
                      src={m.media?.thumbnail?.mediaUrl}
                      alt='media'
                      className={`${selectedMedia?.some((item) => item.id === m.id) ? styles.selected_media : ''}`}
                    />
                  )}
                </InputLabel>
                <IconButton
                  aria-label='delete'
                  size='small'
                  onClick={(e) => handleDeleteFile(m.id, e)}
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
      <Snackbar open={isSnackBarOpen} autoHideDuration={3000} onClose={closeSnackBar}>
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Grid>
  );
};
