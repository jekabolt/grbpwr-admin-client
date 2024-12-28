import {
  Box,
  Button,
  CircularProgress,
  Grid,
  Paper,
  Theme,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { getBase64File } from 'features/utilitty/getBase64';
import { useSnackBarStore } from 'lib/stores/store';
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
  const { showMessage } = useSnackBarStore();
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));

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
      showMessage('no files selected', 'error');
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
      <Grid item xs={12}>
        <Box
          onDragOver={(e) => handleDrag(e, true)}
          onDragEnter={(e) => handleDrag(e, true)}
          onDragLeave={(e) => handleDrag(e, false)}
          onDrop={handleFileChange}
          display='flex'
          alignItems='center'
        >
          <Paper
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              width: isMobile ? '100%' : 'auto',
            }}
          >
            {!selectedFiles.length && (
              <Button
                variant='outlined'
                component='label'
                sx={{ width: isMobile ? '100%' : 'auto' }}
              >
                DRAG AND DROP YOUR MEDIA HERE
                <input
                  id='files'
                  type='file'
                  accept='image/*, video/*'
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </Button>
            )}
            {selectedFiles.length > 0 && <Typography>Media is selected</Typography>}
          </Paper>
          {loading && <CircularProgress />}
        </Box>
      </Grid>
    </Grid>
  );
};
