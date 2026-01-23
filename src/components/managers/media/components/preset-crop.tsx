import { Slider } from '@mui/material';
import { FC, useCallback, useState } from 'react';
import Cropper, { Area, Point } from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';

interface PresetCropProps {
  selectedFile: string;
  aspect: number;
  onCropComplete: (croppedAreaPixels: Area) => void;
}

export const PresetCrop: FC<PresetCropProps> = ({ selectedFile, aspect, onCropComplete }) => {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const handleCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      onCropComplete(croppedAreaPixels);
    },
    [onCropComplete],
  );

  return (
    <div className='w-full h-full flex flex-col '>
      <div className='relative w-full flex-1 border border-2 border-text'>
        <Cropper
          onCropChange={setCrop}
          image={selectedFile}
          zoom={zoom}
          crop={crop}
          aspect={aspect}
          onCropComplete={handleCropComplete}
          onZoomChange={setZoom}
          restrictPosition={true}
          objectFit='contain'
        />
      </div>
      <div className='flex items-center gap-2 pt-4'>
        <Slider
          value={zoom}
          min={1}
          max={3}
          step={0.1}
          aria-labelledby='Zoom'
          onChange={(_, zoom) => setZoom(Number(zoom))}
          size='small'
        />
      </div>
    </div>
  );
};
