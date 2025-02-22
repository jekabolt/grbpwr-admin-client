import Rotate90DegreesCwIcon from '@mui/icons-material/Rotate90DegreesCw';
import { Slider } from '@mui/material';
import { Button } from 'components/ui/components/button';
import { Dialog } from 'components/ui/components/dialog';
import Text from 'components/ui/components/text';
import getCroppedImg from 'lib/features/getCropped';
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

const aspectRatios = [
  { label: '16:9', value: 1.7778, color: '#cc0000' },
  { label: '4:3', value: 1.3333, color: '#e69138' },
  { label: '2:1', value: 2, color: '#c0c0c0' },
  { label: '1:1', value: 1.0, color: '#f1c232' },
  { label: '4:5', value: 0.8, color: '#6aa84f' },
  { label: '3:4', value: 0.75, color: '#45818e' },
  { label: '5:4', value: 1.25, color: '#3d85c6' },
  { label: '9:16', value: 0.5625, color: '#674ea7' },
];

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

  useEffect(() => {
    if (selectedFile) {
      const img = new Image();
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

  const rotateRight = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  return (
    <Dialog open={selectedFile ? open : false} onClose={close} isSaveButton save={handleSave}>
      <div className='w-[700px] flex h-[480px] items-start justify-between'>
        <div className=' w-1/2 h-[450px] space-y-4'>
          <div className='relative w-full h-full'>
            <div className='absolute inset-0'>
              <Cropper
                onCropChange={setCrop}
                image={selectedFile || ''}
                zoom={zoom}
                crop={crop}
                aspect={aspect}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
                onRotationChange={setRotation}
                rotation={rotation}
                restrictPosition={true}
                objectFit='contain'
              />
            </div>
          </div>
          <div className='flex items-center gap-2 mb-4'>
            <Slider
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby='Zoom'
              onChange={(_, zoom) => setZoom(Number(zoom))}
              size='small'
            />
            <Button onClick={rotateRight}>
              <Rotate90DegreesCwIcon />
            </Button>
          </div>
        </div>

        <div className='space-y-5 w-56'>
          <Text variant='uppercase' className='text-xl font-bold'>
            select Aspect Ratio
          </Text>
          <div className='flex flex-col items-start gap-4'>
            {aspectRatios.map((ratio) => (
              <Button
                key={ratio.label}
                size='lg'
                onClick={() => handleAspectRatioChange(ratio.value)}
                className={`w-full transition-all ${
                  aspect === ratio.value
                    ? `outline outline-2 outline-offset-2 outline-${ratio.color}`
                    : ''
                }`}
                style={{
                  backgroundColor: ratio.color,
                  color: '#ffffff',
                  opacity: aspect === ratio.value ? 1 : 0.8,
                }}
              >
                {ratio.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
};
