import { ContentCopy } from '@mui/icons-material';
import {
  Button,
  Dialog,
  DialogContent,
  Snackbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { common_MediaInsert } from 'api/proto-http/admin';
import { FullSizeMediaModalInterface } from 'features/interfaces/mediaSelectorInterfaces';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/modalFullSizeMedia.scss';

type MediaKey = keyof common_MediaInsert;

export const FullSizeMediaModal: FC<FullSizeMediaModalInterface> = ({
  open,
  close,
  clickedMedia,
}) => {
  const [mediaDimensions, setMediaDimensions] = useState({
    compressed: '',
    thumbnail: '',
    fullSize: '',
  });
  const [snackBarOpen, setSnackbarOpen] = useState(false);
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

  const showMessage = (message: string) => {
    setSnackBarMessage(message);
    setSnackbarOpen(true);
  };

  const handleCopyToClipboard = async (text: string | undefined) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showMessage('URL copied to clipboard!');
    } catch (err) {
      showMessage('Failed to copy URL');
    }
  };

  const trimUrl = (url: string | undefined, maxLength = 30): string => {
    if (!url) return '';
    return url.length > maxLength ? `${url.substring(0, maxLength)}...` : url;
  };

  const loadDimensions = (url: string | undefined, key: MediaKey) => {
    if (!url) return;

    const element = isVideo(url) ? document.createElement('video') : new Image();

    const updateDimensions = () => {
      if (element instanceof HTMLVideoElement) {
        setMediaDimensions((prev) => ({
          ...prev,
          [key]: `${element.videoWidth}px x ${element.videoHeight}px`,
        }));
      } else if (element instanceof HTMLImageElement) {
        setMediaDimensions((prev) => ({
          ...prev,
          [key]: `${element.width}px x ${element.height}px`,
        }));
      }
    };

    if (element instanceof HTMLVideoElement) {
      element.onloadedmetadata = updateDimensions;
    } else {
      element.onload = updateDimensions;
    }
    element.src = url;
  };

  useEffect(() => {
    if (clickedMedia) {
      const keys: MediaKey[] = ['compressed', 'thumbnail', 'fullSize'];
      keys.forEach((key) => {
        const url = clickedMedia[key as keyof common_MediaInsert];
        if (typeof url === 'string') {
          loadDimensions(url, key);
        }
      });
    }
  }, [clickedMedia]);

  return (
    <div>
      <Dialog open={open} onClose={close} scroll='paper' fullScreen>
        <DialogContent>
          {clickedMedia &&
            (isVideo(clickedMedia.thumbnail) ? (
              <video src={clickedMedia.thumbnail} className={styles.video} controls />
            ) : (
              <img src={clickedMedia.thumbnail} alt='Media' className={styles.image} />
            ))}
          {['fullSize', 'compressed', 'thumbnail'].map((type) => (
            <Typography variant='body1' key={type}>
              {`${type.charAt(0).toUpperCase() + type.slice(1)}: ${trimUrl(clickedMedia?.[type as MediaKey])}`}
              <Button
                size='small'
                onClick={() =>
                  clickedMedia?.[type as MediaKey] &&
                  handleCopyToClipboard(clickedMedia?.[type as MediaKey])
                }
              >
                <ContentCopy />
              </Button>
              ({mediaDimensions?.[type as MediaKey]})
            </Typography>
          ))}
        </DialogContent>
      </Dialog>
      <Snackbar
        open={snackBarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={snackBarMessage}
      />
    </div>
  );
};
