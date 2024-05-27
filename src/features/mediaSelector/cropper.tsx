import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Typography,
} from '@mui/material';
import getCroppedImg from 'features/utilitty/getCropped';
import { FC, useCallback, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';

interface CropperInterface {
  selectedFile: string | null;
  open: boolean;
  close: () => void;
  saveCroppedImage: (croppedImage: string) => void;
}

export const MediaCropper: FC<CropperInterface> = ({
  selectedFile,
  open,
  close,
  saveCroppedImage,
}) => {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number | undefined>(4 / 5);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const aspectRatios = [
    { label: '16:9', value: 1.7778, color: '#cc0000' },
    { label: '4:3', value: 1.3333, color: '#e69138' },
    { label: '1:1', value: 1.0, color: '#f1c232' },
    { label: '4:5', value: 0.8, color: '#6aa84f' },
    { label: '3:4', value: 0.75, color: '#45818e' },
    { label: '5:4', value: 1.25, color: '#3d85c6' },
    { label: '9:16', value: 0.5625, color: '#674ea7' },
    { label: 'free', value: undefined },
  ];

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    console.log(croppedArea, croppedAreaPixels);
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (selectedFile && croppedAreaPixels) {
      const format = selectedFile.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      const croppedImage = await getCroppedImg(selectedFile, croppedAreaPixels, aspect, format);
      saveCroppedImage(croppedImage);
      close();
    }
  };

  return (
    <Dialog open={selectedFile ? open : false} onClose={close} fullWidth maxWidth='md'>
      <Box display='flex' position='relative'>
        <IconButton onClick={close} style={{ position: 'absolute', right: '0' }}>
          <CloseIcon fontSize='medium' />
        </IconButton>
        <DialogContent
          style={{
            height: '400px',
            minWidth: '300px',
            position: 'relative',
          }}
        >
          <Cropper
            onCropChange={setCrop}
            image={selectedFile || undefined}
            crop={crop}
            aspect={aspect}
            onCropComplete={onCropComplete}
          />
        </DialogContent>
        <DialogActions>
          <Box>
            <Typography variant='h6'>Select Aspect Ratio</Typography>
            <Box display='grid' gap='5px'>
              {aspectRatios.map((ratio) => (
                <Button
                  key={ratio.label}
                  onClick={() => setAspect(ratio.value)}
                  variant={aspect === ratio.value ? 'contained' : 'outlined'}
                  style={{ backgroundColor: aspect === ratio.value ? ratio.color : 'transparent' }}
                >
                  {ratio.label}
                </Button>
              ))}
            </Box>
          </Box>
          <Button onClick={handleSave}>Save Crop</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
};
