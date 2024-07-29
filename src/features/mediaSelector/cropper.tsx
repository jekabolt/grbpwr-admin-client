import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Grid,
  IconButton,
  Slider,
  Typography,
} from '@mui/material';
import getCroppedImg from 'features/utilitty/getCropped';
import { FC, useCallback, useEffect, useState } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { Point } from 'react-easy-crop/types';

interface CropperInterface {
  selectedFile: string | undefined;
  open: boolean;
  close: () => void;
  saveCroppedImage: (croppedImage: string) => void;
}

const calculateAspectRatio = (width: number | undefined, height: number | undefined) => {
  if (!width || !height) return;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  const newWidth = width / divisor;
  const newHeight = height / divisor;
  return newWidth / newHeight;
};

export const MediaCropper: FC<CropperInterface> = ({
  selectedFile,
  open,
  close,
  saveCroppedImage,
}) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [aspect, setAspect] = useState<number | undefined>(4 / 5);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [dynamicAspectRatio, setDynamicAspectRatio] = useState<number | undefined>(undefined);

  const aspectRatios = [
    { label: '16:9', value: 1.7778, color: '#cc0000' },
    { label: '4:3', value: 1.3333, color: '#e69138' },
    { label: '1:1', value: 1.0, color: '#f1c232' },
    { label: '4:5', value: 0.8, color: '#6aa84f' },
    { label: '3:4', value: 0.75, color: '#45818e' },
    { label: '5:4', value: 1.25, color: '#3d85c6' },
    { label: '9:16', value: 0.5625, color: '#674ea7' },
    ...(imageDimensions ? [{ label: 'free', value: undefined, color: '#808080' }] : []),
  ];

  useEffect(() => {
    if (selectedFile) {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
        if (aspect === undefined) {
          setDynamicAspectRatio(calculateAspectRatio(img.width, img.height));
        }
      };
      img.src = selectedFile;
    }
  }, [selectedFile, aspect]);

  const onCropComplete = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    if (selectedFile && croppedAreaPixels) {
      const format = selectedFile.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      const croppedImage = await getCroppedImg(
        selectedFile,
        croppedAreaPixels,
        aspect,
        format,
        rotation,
      );
      saveCroppedImage(croppedImage);
      close();
    }
  };

  const handleAspectRatioChange = (value: number | undefined) => {
    setAspect(value);
  };

  useEffect(() => {
    if (aspect === undefined && imageDimensions) {
      setDynamicAspectRatio(calculateAspectRatio(imageDimensions.width, imageDimensions.height));
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
  }, [aspect, imageDimensions]);

  return (
    <Dialog open={selectedFile ? open : false} onClose={close} fullWidth maxWidth='md'>
      <Box display='flex' justifyContent='center' position='relative'>
        <IconButton onClick={close} style={{ position: 'absolute', right: '0', top: '0' }}>
          <CloseIcon fontSize='medium' />
        </IconButton>
        <Grid container spacing={2} padding='8%'>
          <Grid item xs={12} md={8}>
            <DialogContent
              style={{
                height: '500px',
                position: 'relative',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Cropper
                onCropChange={setCrop}
                image={selectedFile || ''}
                zoom={zoom}
                crop={crop}
                aspect={aspect !== undefined ? aspect : dynamicAspectRatio}
                cropSize={
                  aspect === undefined && imageDimensions
                    ? { width: imageDimensions.width, height: imageDimensions.height }
                    : undefined
                }
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                rotation={rotation}
                restrictPosition={false}
              />
            </DialogContent>
            <DialogActions>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Typography textTransform='uppercase'>zoom</Typography>
                  <Slider
                    value={zoom}
                    min={1}
                    max={3}
                    step={0.1}
                    aria-labelledby='Zoom'
                    onChange={(e, zoom) => setZoom(Number(zoom))}
                  />
                </Grid>
                <Grid item xs={12}>
                  <Typography textTransform='uppercase'>rotation</Typography>
                  <Slider
                    value={rotation}
                    min={0}
                    max={360}
                    step={1}
                    aria-labelledby='Rotation'
                    onChange={(e, rotation) => setRotation(Number(rotation))}
                  />
                </Grid>
              </Grid>
            </DialogActions>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box position='relative'>
              <Typography variant='h6'>Select Aspect Ratio</Typography>
              <Box display='grid' gap='5px'>
                {aspectRatios.map((ratio) => (
                  <Button
                    key={ratio.label}
                    onClick={() => handleAspectRatioChange(ratio.value)}
                    variant={aspect === ratio.value ? 'contained' : 'outlined'}
                    style={{
                      backgroundColor: aspect === ratio.value ? ratio.color : 'transparent',
                    }}
                  >
                    {ratio.label}
                  </Button>
                ))}
                <Button onClick={handleSave}>Save Crop</Button>
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Dialog>
  );
};
