import { Box, Button, CircularProgress, Grid, Paper, Snackbar, Typography } from '@mui/material';
import { uploadContentImage, uploadContentVideo } from 'api/admin';
import React, { FC, useState } from 'react';

interface DragDropProps {
  reload: () => void;
}

const fileExtensionToContentType: { [key: string]: string } = {
  jpg: 'image/jpg',
  png: 'image/png',
  webm: 'video/webm',
  mp4: 'video/mp4',
  jpeg: 'image/jpeg',
};

export const DragDrop: FC<DragDropProps> = ({ reload }) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  const showMessage = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarOpen(true);
  };

  const processFiles = (files: FileList) => {
    if (files && files.length > 0) {
      const file = files[0];
      setSelectedFiles([file]);
      setSelectedFileUrl(URL.createObjectURL(file));
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
      alert('No selected files.');
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

  function trimBeforeBase64(input: string): string {
    const parts = input.split('base64,');
    if (parts.length > 1) {
      return parts[1];
    }
    return input;
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      showMessage('NO SELECTED FILE');
      return;
    }

    setLoading(true);

    const selectedFile = selectedFiles[0];
    const fileExtension = (selectedFile.name.split('.').pop() || '').toLowerCase();

    if (!fileExtension) {
      showMessage('INVALID FILE FORMAT');
      setLoading(false);
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target && event.target.result) {
        const baseData64 = event.target.result as string;
        const contentType = fileExtensionToContentType[fileExtension];

        try {
          if (contentType.startsWith('image')) {
            await uploadContentImage({
              rawB64Image: baseData64,
            });
          } else if (contentType.startsWith('video')) {
            const raw = trimBeforeBase64(baseData64);
            await uploadContentVideo({
              raw: raw,
              contentType: contentType,
            });
          }

          showMessage('MEDIA IS UPLOADED');
        } catch (error) {
          showMessage('UPLOAD HAS FAILED. TRY AGAIN');
        } finally {
          setLoading(false);
          setSelectedFiles([]);
          setSelectedFileUrl(null);
          reload();
        }
      }
    };

    reader.readAsDataURL(selectedFile);
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
            <Button variant='contained' size='small' onClick={handleUpload}>
              UPLOAD
            </Button>
          </Paper>
          {loading && <CircularProgress />}
        </Box>
        <Snackbar
          open={snackbarOpen}
          message={snackbarMessage}
          autoHideDuration={6000}
          onClose={handleSnackbarClose}
        />
      </Grid>
    </Grid>
  );
};
