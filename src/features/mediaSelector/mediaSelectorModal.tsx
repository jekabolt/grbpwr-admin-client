import { Alert, Snackbar } from '@mui/material';
import { common_MediaFull } from 'api/proto-http/admin';

import { Dialog } from 'components/common/dialog';
import { MediaSelectorModalProps } from 'features/interfaces/mediaSelectorInterfaces';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useState } from 'react';
import { MediaSelector } from './mediaSelector';

export const MediaSelectorModal: FC<MediaSelectorModalProps> = ({
  allowMultiple,
  aspectRatio,
  hideVideos,
  isDeleteAccepted,
  closeMediaSelector,
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
    <Dialog open={open} onClose={handleClose} isSaveButton save={handleMediaAndCloseSelector}>
      <MediaSelector
        allowMultiple={allowMultiple}
        aspectRatio={aspectRatio}
        hideVideos={hideVideos}
        isDeleteAccepted={isDeleteAccepted}
        selectedMedia={selectedMedia}
        select={select}
      />
      <Snackbar open={isSnackBarOpen} autoHideDuration={3000} onClose={closeSnackBar}>
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Dialog>
  );
};
