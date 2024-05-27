import ClearIcon from '@mui/icons-material/Clear';
import {
  Alert,
  Box,
  Grid,
  IconButton,
  ImageList,
  ImageListItem,
  InputLabel,
  Snackbar,
  Typography,
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
  sortedAndFilteredMedia,
  enableModal = false,
}) => {
  const { showMessage, isSnackBarOpen, closeSnackBar, snackBarMessage, snackBarSeverity } =
    useMediaSelector();
  const [openModal, setOpenModal] = useState(false);
  const [clickedMedia, setClickedMedia] = useState<common_MediaInsert | undefined>();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [videoSizes, setVideoSizes] = useState<{
    [key: number]: { width: number; height: number };
  }>({});

  const handleVideoLoadedMetadata = (
    event: React.SyntheticEvent<HTMLVideoElement>,
    id: number | undefined,
  ) => {
    if (!id) return;
    const target = event.target as HTMLVideoElement;
    setVideoSizes((prevSizes) => ({
      ...prevSizes,
      [id]: { width: target.videoWidth, height: target.videoHeight },
    }));
  };

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
    setOpenModal(!openModal);
  };

  const calculateAspectRatio = (width: number | undefined, height: number | undefined) => {
    if (!width || !height) return;
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(width, height);
    const newWidth = width / divisor;
    const newHeight = height / divisor;
    return `${newWidth}:${newHeight}`;
  };

  const aspectRatioColor = (aspectRatio: string | undefined) => {
    const colorMap: { [key: string]: string } = {
      '16:9': '#cc0000',
      '4:3': '#e69138',
      '1:1': '#f1c232',
      '4:5': '#6aa84f',
      '3:4': '#45818e',
      '5:4': '#3d85c6',
      '9:16': '#674ea7',
    };
    return colorMap[aspectRatio as keyof typeof colorMap] || '#000';
  };

  return (
    <Grid container justifyContent='center'>
      <Grid item xs={11}>
        {sortedAndFilteredMedia && (
          <ImageList
            variant='standard'
            sx={{
              width: '100%',
            }}
            cols={isSmallScreen ? 1 : 5}
            gap={8}
            rowHeight={200}
          >
            {sortedAndFilteredMedia().map((m) => (
              <Box>
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
                        onLoadedMetadata={(e) => handleVideoLoadedMetadata(e, m.id)}
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
                <Typography
                  variant='overline'
                  style={{
                    color:
                      isVideo(m.media?.thumbnail?.mediaUrl) && videoSizes[m.id ?? 0]
                        ? aspectRatioColor(
                            calculateAspectRatio(
                              videoSizes[m.id ?? 0].width,
                              videoSizes[m.id ?? 0].height,
                            ),
                          )
                        : aspectRatioColor(
                            calculateAspectRatio(
                              m.media?.fullSize?.width,
                              m.media?.fullSize?.height,
                            ),
                          ),
                  }}
                >
                  {isVideo(m.media?.thumbnail?.mediaUrl) && videoSizes[m.id ?? 0] ? (
                    <>
                      ASPECT RATIO:{' '}
                      {calculateAspectRatio(
                        videoSizes[m.id ?? 0].width,
                        videoSizes[m.id ?? 0].height,
                      )}
                    </>
                  ) : (
                    <>
                      ASPECT RATIO:{' '}
                      {calculateAspectRatio(m.media?.fullSize?.width, m.media?.fullSize?.height)}
                    </>
                  )}
                </Typography>
              </Box>
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
