import { ASPECT_RATIOS } from 'constants/constants';
import getCroppedImg from 'lib/features/getCropped';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { FC, useEffect, useState } from 'react';
import { Area } from 'react-easy-crop';
import { PixelCrop } from 'react-image-crop';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { CustomCrop } from './custom-crop';
import { PresetCrop } from './preset-crop';

interface CropperInterface {
  selectedFile: string | undefined;
  saveCroppedImage: (croppedImage: string) => void;
  onCancel: () => void;
  /** Preset crop ratio (e.g. the target slot's ratio). */
  initialAspect?: number;
  /** When provided, shows a "use without crop" action that assigns the image as-is. */
  onUseOriginal?: () => void;
  /** Disables actions (e.g. while uploading). */
  busy?: boolean;
}

export const MediaCropper: FC<CropperInterface> = ({
  selectedFile,
  saveCroppedImage,
  onCancel,
  initialAspect,
  onUseOriginal,
  busy = false,
}) => {
  const { showMessage } = useSnackBarStore();
  const defaultAspect = initialAspect ?? 4 / 5;
  const [aspect, setAspect] = useState<number | undefined>(defaultAspect);
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
      setAspect(defaultAspect);
    }
  }, [selectedFile, defaultAspect]);

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

  const saveDisabled =
    (aspect === undefined && !customCropData) || (aspect !== undefined && !croppedAreaPixels);

  return (
    <div className='flex w-full flex-col gap-4'>
      <div className='flex items-center justify-between border-b border-textColor pb-2'>
        <Text variant='uppercase' size='large'>
          crop image
        </Text>
        <Button className='cursor-pointer py-1' onClick={onCancel}>
          [x]
        </Button>
      </div>

      <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
        <div className='h-[340px] w-full lg:h-[440px] lg:flex-1'>
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
              onCropComplete={(croppedAreaPixels: Area) => setCroppedAreaPixels(croppedAreaPixels)}
            />
          )}
        </div>

        <div className='flex flex-col gap-2 lg:w-40 lg:shrink-0'>
          <Text variant='inactive' size='small'>
            aspect ratio
          </Text>
          <div className='grid grid-cols-3 gap-2 lg:grid-cols-2'>
            {ASPECT_RATIOS.map((ratio) => {
              const selected = aspect === ratio.value;
              return (
                <Button
                  key={ratio.label}
                  type='button'
                  onClick={() => handleAspectRatioChange(ratio.value)}
                  className={cn(
                    'border border-textColor px-2 py-1 text-center uppercase transition-colors cursor-pointer',
                    selected
                      ? 'bg-textColor text-bgColor'
                      : 'bg-bgColor text-textColor hover:bg-textColor/10',
                  )}
                >
                  {ratio.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <div className='flex flex-wrap items-center justify-between gap-2 border-t border-textColor pt-3'>
        {onUseOriginal ? (
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase cursor-pointer'
            onClick={onUseOriginal}
            disabled={busy}
          >
            use without crop
          </Button>
        ) : (
          <span />
        )}
        <div className='flex gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase cursor-pointer'
            onClick={onCancel}
            disabled={busy}
          >
            cancel
          </Button>
          <Button
            type='button'
            size='lg'
            variant='main'
            className='uppercase cursor-pointer'
            onClick={handleSave}
            disabled={saveDisabled || busy}
            loading={busy}
          >
            crop &amp; use
          </Button>
        </div>
      </div>
    </div>
  );
};
