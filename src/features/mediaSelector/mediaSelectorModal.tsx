import ClearIcon from '@mui/icons-material/Clear';
import { Alert, AppBar, Button, Dialog, IconButton, Snackbar, Toolbar } from '@mui/material';
import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelectorModalProps } from 'features/interfaces/mediaSelectorInterfaces';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useState } from 'react';
import styles from 'styles/media-selector.scss';
import { MediaSelector } from './mediaSelector';

export const MediaSelectorModal: FC<MediaSelectorModalProps> = ({
  closeMediaSelector,
  allowMultiple,
  saveSelectedMedia,
}) => {
  const { snackBarMessage, closeSnackBar, isSnackBarOpen, showMessage, snackBarSeverity } =
    useMediaSelector();
  const [selectedMedia, setSelectedMedia] = useState<common_MediaFull[]>([]);
  const [open, setOpen] = useState(true);

  const handleMediaAndCloseSelector = async () => {
    if (selectedMedia.length === 0) {
      showMessage('NO SELECTED MEDIA', 'error');
      return;
    }
    saveSelectedMedia(selectedMedia);
    handleClose();
  };

  const select = (media: common_MediaFull, allowMultiple: boolean) => {
    setSelectedMedia((prevSelected) => {
      return allowMultiple
        ? prevSelected.some((item) => item.id === media.id)
          ? prevSelected.filter((item) => item.id !== media.id)
          : [...prevSelected, media]
        : [media];
    });
  };

  const handleClose = () => {
    setOpen(false);
    closeMediaSelector();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby='media-selector-dialog-title'
      fullWidth={true}
      maxWidth='xl'
      className={styles.modal}
    >
      <IconButton
        className={styles.close_modal}
        size='small'
        aria-label='close'
        onClick={handleClose}
      >
        <ClearIcon />
      </IconButton>
      <MediaSelector allowMultiple={allowMultiple} select={select} selectedMedia={selectedMedia} />
      <AppBar
        position='sticky'
        sx={{ bottom: 0, right: 0, backgroundColor: 'transparent', boxShadow: 'none' }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={handleMediaAndCloseSelector} variant='contained' size='small'>
            Save
          </Button>
        </Toolbar>
      </AppBar>
      <Snackbar open={isSnackBarOpen} autoHideDuration={3000} onClose={closeSnackBar}>
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Dialog>
  );
};
