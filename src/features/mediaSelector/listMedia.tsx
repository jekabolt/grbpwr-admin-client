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
import { calculateAspectRatio } from 'features/utilitty/calculateAspectRatio';
import { isVideo } from 'features/utilitty/filterContentType';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useCallback, useEffect, useState } from 'react';
import styles from 'styles/media-selector.scss';
import { FullSizeMediaModal } from './fullSizeMediaModal';

export const MediaList: FC<MediaSelectorMediaListProps> = ({
  allowMultiple,
  selectedMedia,
  enableModal = false,
  croppedImage,
  aspectRatio,
  hideVideos = false,
  isDeleteAccepted = true,
  setCroppedImage,
  select,
  setMedia,
  sortedAndFilteredMedia,
  handleUploadMedia,
}) => {
  const { isSnackBarOpen, snackBarMessage, snackBarSeverity, showMessage, closeSnackBar } =
    useMediaSelector();
  const [openModal, setOpenModal] = useState(false);
  const [clickedMedia, setClickedMedia] = useState<common_MediaItem | undefined>();
  const theme = useTheme();
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [videoSizes, setVideoSizes] = useState<Record<number, { width: number; height: number }>>(
    {},
  );
  const [confirmDeletionId, setConfirmDeletionId] = useState<number | undefined>(undefined);
  const [deletingMedia, setDeletingMedia] = useState<number | undefined>(undefined);
  const [hoveredMediaId, setHoveredMediaId] = useState<number | undefined>(undefined);
  const [filteredMedia, setFilteredMedia] = useState<common_MediaFull[]>([]);
  const handleCloseModal = () => setOpenModal(false);

  const mediaAspectRatio = useCallback(
    (media: common_MediaFull) => {
      const width = media.media?.thumbnail?.width || videoSizes[media.id || 0]?.width;
      const height = media.media?.thumbnail?.height || videoSizes[media.id || 0]?.height;
      return calculateAspectRatio(width, height);
    },
    [calculateAspectRatio, videoSizes],
  );

  useEffect(() => {
    const applyFilter = () => {
      const filtered = sortedAndFilteredMedia().filter((media) => {
        if (hideVideos && isVideo(media.media?.thumbnail?.mediaUrl)) return false;

        if (!aspectRatio || aspectRatio.length === 0) {
          return true;
        }

        const mediaRatio = mediaAspectRatio(media);
        return mediaRatio && aspectRatio.includes(mediaRatio);
      });
      setFilteredMedia(filtered);
    };
    applyFilter();
  }, [aspectRatio, hideVideos, sortedAndFilteredMedia, mediaAspectRatio]);

  useEffect(() => {
    const fetchVideoSizes = async () => {
      const sizes: Record<number, { width: number; height: number }> = {};

      for (const media of sortedAndFilteredMedia()) {
        const mediaUrl = media.media?.thumbnail?.mediaUrl;
        if (isVideo(mediaUrl)) {
          const video = document.createElement('video');
          video.src = mediaUrl || '';

          await new Promise((resolve) => {
            video.onloadedmetadata = () => {
              sizes[media.id || 0] = { width: video.videoWidth, height: video.videoHeight };
              resolve(true);
            };
          });
        }
      }

      setVideoSizes(sizes);
    };

    fetchVideoSizes();
  }, [sortedAndFilteredMedia]);

  const handleDeleteFile = async (id: number | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDeletionId === id) {
      setDeletingMedia(id);
      try {
        await deleteFiles({ id });
        setMedia((currentFiles) => currentFiles?.filter((file) => file.id !== id));
        showMessage('MEDIA WAS SUCCESSFULLY DELETED', 'success');
      } catch {
        showMessage('MEDIA CANNOT BE REMOVED', 'error');
      } finally {
        setConfirmDeletionId(undefined);
        setDeletingMedia(undefined);
      }
    } else {
      setConfirmDeletionId(id);
    }
  };

  const handleSelect = (media: common_MediaFull | undefined, event: React.MouseEvent) => {
    event.stopPropagation();
    if (enableModal) {
      setOpenModal(true);
      setClickedMedia(media?.media);
    } else if (media) {
      select(media, allowMultiple);
    }
  };

  const aspectRatioColor = useCallback((aspectRatio?: string) => {
    const colorMap: Record<string, string> = {
      '16:9': '#cc0000',
      '4:3': '#e69138',
      '1:1': '#f1c232',
      '4:5': '#6aa84f',
      '3:4': '#45818e',
      '5:4': '#3d85c6',
      '9:16': '#674ea7',
    };
    return colorMap[aspectRatio || ''] || '#808080';
  }, []);

  return (
    <Grid container justifyContent='center'>
      <Grid item xs={12}>
        <ImageList
          variant='standard'
          sx={{ width: '100%' }}
          cols={isSmallScreen ? 1 : 5}
          gap={8}
          rowHeight={200}
        >
          {filteredMedia.map((media) => (
            <Box key={media.id}>
              <ImageListItem
                onClick={(event) => handleSelect(media, event)}
                onMouseEnter={() => setHoveredMediaId(media.id)}
                onMouseLeave={() => setHoveredMediaId(undefined)}
                className={styles.list_media_item}
              >
                <InputLabel htmlFor={`${media.id}`}>
                  {selectedMedia?.some((item) => item.id === media.id) && (
                    <span className={styles.selected_flag}>selected</span>
                  )}
                  {deletingMedia === media.id ? (
                    <Typography variant='h5'>media removed</Typography>
                  ) : isVideo(media.media?.thumbnail?.mediaUrl) ? (
                    <video
                      src={media.media?.thumbnail?.mediaUrl}
                      className={
                        selectedMedia?.some((item) => item.id === media.id)
                          ? styles.selected_media
                          : ''
                      }
                      controls
                    />
                  ) : (
                    <img
                      src={media.media?.thumbnail?.mediaUrl}
                      alt='media'
                      className={
                        selectedMedia?.some((item) => item.id === media.id)
                          ? styles.selected_media
                          : ''
                      }
                    />
                  )}
                </InputLabel>
                {hoveredMediaId === media.id && isDeleteAccepted && (
                  <IconButton
                    size='small'
                    onClick={(e) => handleDeleteFile(media.id, e)}
                    className={styles.delete_btn}
                  >
                    {confirmDeletionId === media.id ? <CheckIcon /> : <ClearIcon />}
                  </IconButton>
                )}
              </ImageListItem>
              <Typography
                variant='overline'
                style={{
                  backgroundColor: mediaAspectRatio(media)
                    ? aspectRatioColor(mediaAspectRatio(media))
                    : '#808080',
                }}
              >
                {mediaAspectRatio(media) ? `RATIO: ${mediaAspectRatio(media)}` : 'RATIO: UNKNOWN'}
              </Typography>
            </Box>
          ))}
        </ImageList>
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
