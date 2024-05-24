import { Box, Button, Dialog, DialogActions, DialogContent, Typography } from '@mui/material';
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
  const [aspect, setAspect] = useState<number | undefined>(16 / 9);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const aspectRatios = [
    { label: '16:9', value: 16 / 9 },
    { label: '4:3', value: 4 / 3 },
    { label: '1:1', value: 1 / 1 },
    { label: '4:5', value: 4 / 5 },
    { label: '3:4', value: 3 / 4 },
    { label: '5:4', value: 5 / 4 },
    { label: '9:16', value: 9 / 16 },

    { label: 'Free', value: undefined },
  ];

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  return (
    <Dialog open={selectedFile ? open : false} onClose={close} fullWidth maxWidth='md'>
      <DialogContent style={{ height: '500px', position: 'relative' }}>
        <Cropper
          onCropChange={setCrop}
          image={selectedFile || undefined}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropComplete={onCropComplete}
        />
      </DialogContent>
      <DialogActions>
        <Box display='flex' justifyContent='space-between' alignItems='center' mb={2}>
          <Typography variant='h6'>Select Aspect Ratio</Typography>
          <Box>
            {aspectRatios.map((ratio) => (
              <Button
                key={ratio.label}
                onClick={() => setAspect(ratio.value)}
                variant={aspect === ratio.value ? 'contained' : 'outlined'}
              >
                {ratio.label}
              </Button>
            ))}
          </Box>
        </Box>
      </DialogActions>
    </Dialog>
  );
};
