import * as Slider from '@radix-ui/react-slider';
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
        <Slider.Root
          value={[zoom]}
          min={1}
          max={3}
          step={0.1}
          aria-label='Zoom'
          onValueChange={([value]: number[]) => setZoom(value)}
          className='relative flex w-full touch-none select-none items-center'
        >
          <Slider.Track className='relative h-1.5 grow rounded-full bg-textInactiveColor'>
            <Slider.Range className='absolute h-full rounded-full bg-textColor' />
          </Slider.Track>
          <Slider.Thumb className='block h-4 w-4 rounded-full border border-textColor bg-bgColor shadow focus:outline-none focus:ring-2 focus:ring-textColor/50' />
        </Slider.Root>
      </div>
    </div>
  );
};
