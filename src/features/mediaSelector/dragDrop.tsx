import { Alert, Box, CircularProgress, Grid, Paper, Snackbar, Typography } from '@mui/material';
import React, { Dispatch, FC, SetStateAction, useState } from 'react';
import { MediaCropper } from './cropper';

interface DragDropProps {
  selectedFileUrl: string;
  setSelectedFileUrl: (url: string) => void;
  selectedFiles: File[];
  setSelectedFiles: Dispatch<SetStateAction<File[]>>;
  setCroppedImage: (img: string | null) => void;
  loading: boolean;
  isCropperOpen: boolean;
  setIsCropperOpen: Dispatch<SetStateAction<boolean>>;
  setMime: (str: string) => void;
}

export const DragDrop: FC<DragDropProps> = ({
  selectedFileUrl,
  setSelectedFileUrl,
  selectedFiles,
  setSelectedFiles,
  setCroppedImage,
  loading,
  isCropperOpen,
  setIsCropperOpen,
  setMime,
}) => {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackbarMessage(message);
    setSnackBarSeverity(severity);
    setSnackbarOpen(true);
  };

  const processFiles = (files: FileList) => {
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFiles([file]);
      setSelectedFileUrl(URL.createObjectURL(file));
      setMime(file.type);
    }
  };

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement> | React.DragEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();

    let files: FileList | null = null;
    if (e.type === 'drop' && 'dataTransfer' in e) {
      files = e.dataTransfer.files;
    } else if (e.type === 'change' && e.target instanceof HTMLInputElement && e.target.files) {
      files = e.target.files;
    }

    if (files && files.length > 0) {
      processFiles(files);
    } else {
      showMessage('NO SELECTED FILES', 'error');
    }
    if ('dataTransfer' in e) {
      setIsDragging(false);
    }
  };

  const handleDrag = (event: React.DragEvent<HTMLDivElement>, dragging: boolean) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(dragging);
  };

  return (
    <Grid container>
      <Grid item>
        <Box
          onDragOver={(e) => handleDrag(e, true)}
          onDragEnter={(e) => handleDrag(e, true)}
          onDragLeave={(e) => handleDrag(e, false)}
          onDrop={handleFileChange}
          display='flex'
          alignItems='center'
        >
          <Paper sx={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {!selectedFiles.length && <label htmlFor='files'>DRAG AND DROP HERE</label>}
            <input
              id='files'
              type='file'
              accept='image/*, video/*'
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            {selectedFiles.length > 0 && <Typography>Media is selected</Typography>}
          </Paper>
          {loading && <CircularProgress />}
        </Box>
        <Snackbar open={snackbarOpen} autoHideDuration={6000} onClose={handleSnackbarClose}>
          <Alert severity={snackBarSeverity}>{snackbarMessage}</Alert>
        </Snackbar>
      </Grid>
      {selectedFileUrl && (
        <MediaCropper
          selectedFile={selectedFileUrl}
          open={isCropperOpen}
          close={() => setIsCropperOpen(false)}
          saveCroppedImage={(croppedImageUrl: string) => {
            setCroppedImage(croppedImageUrl);
            setIsCropperOpen(false);
          }}
        />
      )}
    </Grid>
  );
};
