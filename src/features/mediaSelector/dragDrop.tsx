import { Alert, Box, CircularProgress, Grid, Paper, Snackbar, Typography } from '@mui/material';
import { getBase64File } from 'features/utilitty/getBase64';
import React, { Dispatch, FC, SetStateAction, useState } from 'react';

interface DragDropProps {
  selectedFileUrl: string;
  setSelectedFileUrl: (url: string) => void;
  selectedFiles: File[];
  setSelectedFiles: Dispatch<SetStateAction<File[]>>;
  loading: boolean;
}

export const DragDrop: FC<DragDropProps> = ({
  selectedFileUrl,
  setSelectedFileUrl,
  selectedFiles,
  setSelectedFiles,
  loading,
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

  const processFiles = async (files: FileList) => {
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFiles([file]);
      const b64 = await getBase64File(file);
      setSelectedFileUrl(b64);
      console.log(selectedFileUrl);
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
    if (e.target instanceof HTMLInputElement) {
      e.target.value = '';
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
    </Grid>
  );
};
