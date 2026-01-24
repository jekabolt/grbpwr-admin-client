import { FC, useEffect, useRef, useState } from 'react';
import ReactCrop, { PixelCrop, Crop as ReactCropType } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface CustomCropProps {
  selectedFile: string;
  onCropComplete: (croppedAreaPixels: PixelCrop, imgRef: HTMLImageElement) => void;
}

export const CustomCrop: FC<CustomCropProps> = ({ selectedFile, onCropComplete }) => {
  const [crop, setCrop] = useState<ReactCropType>({
    unit: '%',
    width: 50,
    height: 50,
    x: 25,
    y: 25,
  });
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset crop state when selectedFile changes
  useEffect(() => {
    if (selectedFile) {
      setCrop({
        unit: '%',
        width: 50,
        height: 50,
        x: 25,
        y: 25,
      });
    }
  }, [selectedFile]);

  const handleCropComplete = (c: PixelCrop) => {
    if (imgRef.current) {
      onCropComplete(c, imgRef.current);
    }
  };

  return (
    <div className='w-full h-full flex items-start justify-center border border-2 border-text'>
      <ReactCrop
        key={selectedFile}
        crop={crop}
        onChange={(c) => setCrop(c)}
        onComplete={handleCropComplete}
        style={{ maxHeight: '100%', maxWidth: '100%' }}
      >
        <img
          key={selectedFile}
          ref={imgRef}
          src={selectedFile}
          alt='Crop preview'
          style={{
            display: 'block',
            maxHeight: '400px',
            maxWidth: '100%',
            width: '100%',
          }}
        />
      </ReactCrop>
    </div>
  );
};
