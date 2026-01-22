import { ASPECT_RATIOS } from 'constants/constants';
import getCroppedImg from 'lib/features/getCropped';
import { cn } from 'lib/utility';
import { FC, useState } from 'react';
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
  const [aspect, setAspect] = useState<number | undefined>(4 / 5);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [customCropData, setCustomCropData] = useState<{
    crop: PixelCrop;
    imgRef: HTMLImageElement;
  } | null>(null);

  const getCroppedImgFromCanvas = (image: HTMLImageElement, crop: PixelCrop): Promise<string> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No 2d context');
    }

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;

    const displayedWidth = image.width;
    const displayedHeight = image.height;

    const scaleX = naturalWidth / displayedWidth;
    const scaleY = naturalHeight / displayedHeight;

    const naturalCropX = crop.x * scaleX;
    const naturalCropY = crop.y * scaleY;
    const naturalCropWidth = crop.width * scaleX;
    const naturalCropHeight = crop.height * scaleY;

    canvas.width = Math.round(naturalCropWidth);
    canvas.height = Math.round(naturalCropHeight);

    ctx.drawImage(
      image,
      naturalCropX,
      naturalCropY,
      naturalCropWidth,
      naturalCropHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          throw new Error('Canvas is empty');
        }
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
      }, 'image/jpeg');
    });
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    try {
      const format = selectedFile.endsWith('.webp') ? 'image/webp' : 'image/jpeg';

      if (aspect === undefined && customCropData) {
        const croppedImage = await getCroppedImgFromCanvas(
          customCropData.imgRef,
          customCropData.crop,
        );
        saveCroppedImage(croppedImage);
      } else if (croppedAreaPixels && aspect !== undefined) {
        const croppedImage = await getCroppedImg(selectedFile, croppedAreaPixels, aspect, format);
        saveCroppedImage(croppedImage);
      } else {
        console.warn('No crop data available');
      }
    } catch (error) {
      console.error('Error cropping image:', error);
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
      <Button className='absolute right-1 top-1 px-1 py-1 cursor-pointer' onClick={onCancel}>
        x
      </Button>

      <div className='w-full h-full flex flex-col items-center justify-center gap-4'>
        <div className='w-full h-full flex items-start justify-between'>
          <div className='w-[500px] h-[400px]'>
            {aspect === undefined ? (
              <CustomCrop
                selectedFile={selectedFile}
                onCropComplete={(crop, imgRef) => setCustomCropData({ crop, imgRef })}
              />
            ) : (
              <PresetCrop
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
