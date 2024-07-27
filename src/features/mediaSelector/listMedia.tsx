import CheckIcon from '@mui/icons-material/Check';
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
import { common_MediaFull, common_MediaItem } from 'api/proto-http/admin';
import { MediaSelectorMediaListProps } from 'features/interfaces/mediaSelectorInterfaces';
import { isVideo } from 'features/utilitty/filterContentType';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/media-selector.scss';
import { FullSizeMediaModal } from './fullSizeMediaModal';

export const MediaList: FC<MediaSelectorMediaListProps> = ({
  allowMultiple,
  selectedMedia,
  enableModal = false,
  croppedImage,
  setCroppedImage,
  select,
  setMedia,
  sortedAndFilteredMedia,
  handleUploadMedia,
  aspectRatio,
  hideVideos = false,
}) => {
  const { isSnackBarOpen, snackBarMessage, snackBarSeverity, showMessage, closeSnackBar } =
    useMediaSelector();
  const [openModal, setOpenModal] = useState(false);
  const [clickedMedia, setClickedMedia] = useState<common_MediaItem | undefined>();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [videoSizes, setVideoSizes] = useState<{
    [key: number]: { width: number; height: number };
  }>({});
  const [confirmDeletionId, setConfirmDeletionId] = useState<number | undefined>(undefined);
  const [deletingMedia, setDeletingMedia] = useState<number | undefined>(undefined);
  const [hoveredMediaId, setHoveredMediaId] = useState<number | undefined>(undefined);
  const [filteredMedia, setFilteredMedia] = useState<common_MediaFull[]>([]);

  const mediaAspectRatio = (media: common_MediaFull) => {
    const width = media.media?.thumbnail?.width || videoSizes[media.id as number]?.width;
    const height = media.media?.thumbnail?.height || videoSizes[media.id as number]?.height;
    return calculateAspectRatio(width, height);
  };

  useEffect(() => {
    const applyFilter = () => {
      const filtered = sortedAndFilteredMedia().filter((m) => {
        const mediaRatio = mediaAspectRatio(m);
        const matchesAspectRatio = !aspectRatio || (mediaRatio && aspectRatio.includes(mediaRatio));
        const isNotVideo = !hideVideos || !isVideo(m.media?.thumbnail?.mediaUrl);
        const isVideoWithAspectRatio = isVideo(m.media?.thumbnail?.mediaUrl) && matchesAspectRatio;
        return (
          (!hideVideos && isVideo(m.media?.thumbnail?.mediaUrl)) ||
          ((isNotVideo || isVideoWithAspectRatio) && matchesAspectRatio)
        );
      });
      setFilteredMedia(filtered);
    };
    applyFilter();
  }, [aspectRatio, hideVideos, sortedAndFilteredMedia, videoSizes]);

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

    if (confirmDeletionId !== id) {
      setConfirmDeletionId(id);
    } else {
      setDeletingMedia(id);
      try {
        await deleteFiles({ id });
        setMedia((currentFiles) => currentFiles?.filter((file) => file.id !== id));
        setTimeout(() => setConfirmDeletionId(undefined), 1000);
      } catch (e) {
        showMessage('MEDIA CANNOT BE REMOVED', 'error');
      } finally {
        setConfirmDeletionId(undefined);
        showMessage('MEDIA WAS SUCCESSFULLY DELETED', 'success');
      }
    }
  };

  const handleSelect = async (
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
    return colorMap[aspectRatio as keyof typeof colorMap] || '#808080';
  };

  return (
    <Grid container justifyContent='center'>
      <Grid item xs={12}>
        {filteredMedia && (
          <ImageList
            variant='standard'
            sx={{
              width: '100%',
            }}
            cols={isSmallScreen ? 1 : 5}
            gap={8}
            rowHeight={200}
          >
            {filteredMedia.map((m) => (
              <Box key={m.id}>
                <ImageListItem
                  onClick={(event) => handleSelect(m, allowMultiple, event)}
                  onMouseEnter={() => setHoveredMediaId(m.id)}
                  onMouseLeave={() => setHoveredMediaId(undefined)}
                  className={styles.list_media_item}
                >
                  <InputLabel htmlFor={`${m.id}`}>
                    {selectedMedia?.some((item) => item.id === m.id) ? (
                      <span className={styles.selected_flag}>selected</span>
                    ) : null}
                    {deletingMedia === m.id ? (
                      <Typography variant='h5'>media removed</Typography>
                    ) : isVideo(m.media?.thumbnail?.mediaUrl) ? (
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
                  {hoveredMediaId === m.id && (
                    <IconButton
                      size='small'
                      onClick={(e) => handleDeleteFile(m.id, e)}
                      className={styles.delete_btn}
                    >
                      {confirmDeletionId === m.id ? <CheckIcon /> : <ClearIcon />}
                    </IconButton>
                  )}
                </ImageListItem>
                <Typography
                  variant='overline'
                  style={{
                    backgroundColor: mediaAspectRatio(m)
                      ? aspectRatioColor(mediaAspectRatio(m))
                      : '#808080',
                  }}
                >
                  {mediaAspectRatio(m) ? `RATIO: ${mediaAspectRatio(m)}` : 'RATIO: UNKNOWN'}
                </Typography>
              </Box>
            ))}
          </ImageList>
        )}
      </Grid>
      <FullSizeMediaModal
        open={openModal}
        clickedMedia={clickedMedia}
        croppedImage={croppedImage}
        close={handleCloseModal}
        setCroppedImage={setCroppedImage}
        handleUploadMedia={handleUploadMedia}
      />
      <Snackbar open={isSnackBarOpen} autoHideDuration={3000} onClose={closeSnackBar}>
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Grid>
  );
};
