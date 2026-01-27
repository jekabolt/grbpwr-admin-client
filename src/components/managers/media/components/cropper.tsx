import { ASPECT_RATIOS } from 'constants/constants';
import getCroppedImg from 'lib/features/getCropped';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { FC, useEffect, useState } from 'react';
import { Area } from 'react-easy-crop';
import { PixelCrop } from 'react-image-crop';
import { Button } from 'ui/components/button';
import { CustomCrop } from './custom-crop';
import { PresetCrop } from './preset-crop';

interface CropperInterface {
  selectedFile: string | undefined;
  saveCroppedImage: (croppedImage: string) => void;
  onCancel: () => void;
}

export const MediaCropper: FC<CropperInterface> = ({
  selectedFile,
  saveCroppedImage,
  onCancel,
}) => {
  const { showMessage } = useSnackBarStore();
  const [aspect, setAspect] = useState<number | undefined>(4 / 5);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [customCropData, setCustomCropData] = useState<{
    crop: PixelCrop;
    imgRef: HTMLImageElement;
  } | null>(null);

  // Reset crop state when selectedFile changes
  useEffect(() => {
    if (selectedFile) {
      setCroppedAreaPixels(null);
      setCustomCropData(null);
      setAspect(4 / 5);
    }
  }, [selectedFile]);

  const convertPixelCropToArea = (image: HTMLImageElement, crop: PixelCrop): Area => {
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    const displayedWidth = image.width;
    const displayedHeight = image.height;

    const scaleX = naturalWidth / displayedWidth;
    const scaleY = naturalHeight / displayedHeight;

    return {
      x: crop.x * scaleX,
      y: crop.y * scaleY,
      width: crop.width * scaleX,
      height: crop.height * scaleY,
    };
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    try {
      const format = selectedFile.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

      if (aspect === undefined && customCropData) {
        const area = convertPixelCropToArea(customCropData.imgRef, customCropData.crop);
        const croppedImage = await getCroppedImg(selectedFile, area, undefined, format);
        saveCroppedImage(croppedImage);
      } else if (croppedAreaPixels && aspect !== undefined) {
        const croppedImage = await getCroppedImg(selectedFile, croppedAreaPixels, aspect, format);
        saveCroppedImage(croppedImage);
      } else {
        console.warn('No crop data available');
        showMessage('Please adjust the crop area before saving', 'error');
      }
    } catch (error) {
      console.error('Error cropping image:', error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to crop image. This may be due to CORS restrictions or an invalid image.';
      showMessage(errorMessage, 'error');
    }
  };

  const handleAspectRatioChange = (value: number | undefined) => {
    setAspect(value);
    setCroppedAreaPixels(null);
    setCustomCropData(null);
  };

  if (!selectedFile) return null;

  return (
    <>
      <Button className='absolute right-1 top-1 py-1 cursor-pointer' onClick={onCancel}>
        [x]
      </Button>

      <div className='w-full h-full flex flex-col items-center justify-center gap-4'>
        <div className='w-full h-full flex items-start justify-between'>
          <div className='w-[500px] h-[400px]'>
            {aspect === undefined ? (
              <CustomCrop
                key={selectedFile}
                selectedFile={selectedFile}
                onCropComplete={(crop, imgRef) => setCustomCropData({ crop, imgRef })}
              />
            ) : (
              <PresetCrop
                key={`${selectedFile}-${aspect}`}
                selectedFile={selectedFile}
                aspect={aspect}
                onCropComplete={(croppedAreaPixels: Area) =>
                  setCroppedAreaPixels(croppedAreaPixels)
                }
              />
            )}
          </div>
          <div className='flex flex-col items-start gap-1.5 w-[250px]'>
            {ASPECT_RATIOS.map((ratio) => (
              <Button
                key={ratio.label}
                size='lg'
                onClick={() => handleAspectRatioChange(ratio.value)}
                className={cn('w-full transition-all opacity-80 cursor-pointer', {
                  'outline outline-2 outline-offset-2 outline-': aspect === ratio.value,
                })}
                style={{ backgroundColor: ratio.color }}
              >
                {ratio.label}
              </Button>
            ))}
          </div>
        </div>
        <Button
          size='lg'
          className='uppercase'
          onClick={handleSave}
          disabled={
            (aspect === undefined && !customCropData) ||
            (aspect !== undefined && !croppedAreaPixels)
          }
        >
          save
        </Button>
      </div>
    </>
  );
};
