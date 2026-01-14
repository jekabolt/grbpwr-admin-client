import { common_ProductFull } from 'api/proto-http/admin';
import { useState } from 'react';
import { Control } from 'react-hook-form';
import { ProductFormData } from '../utility/schema';
import { SecondaryThumbnail } from './secondary-thumbnail';
import { Thumbnail } from './thumbnail';

type Props = {
  product?: common_ProductFull;
  control: Control<ProductFormData>;
};

export function ThumbnailsCarousel({ product, control }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const thumbnails = [
    { component: <Thumbnail product={product} control={control} />, label: 'Primary' },
    { component: <SecondaryThumbnail product={product} control={control} />, label: 'Secondary' },
  ];

  const goToNext = () => {
    setCurrentIndex((prev) => (prev + 1) % thumbnails.length);
  };

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + thumbnails.length) % thumbnails.length);
  };

  return (
    <div className='relative'>
      {/* Current thumbnail */}
      <div>{thumbnails[currentIndex].component}</div>

      {/* Navigation buttons */}
      <div className='flex items-center justify-between mt-3'>
        <button
          type='button'
          onClick={goToPrevious}
          className='px-4 py-2 text-sm border border-textColor hover:bg-[rgba(0,0,0,0.05)] transition-colors'
        >
          ← Previous
        </button>

        {/* Dots indicator */}
        <div className='flex gap-2'>
          {thumbnails.map((_, index) => (
            <button
              key={index}
              type='button'
              onClick={() => setCurrentIndex(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex ? 'bg-textColor' : 'bg-textColor/30'
              }`}
              aria-label={`Go to ${thumbnails[index].label} thumbnail`}
            />
          ))}
        </div>

        <button
          type='button'
          onClick={goToNext}
          className='px-4 py-2 text-sm border border-textColor hover:bg-[rgba(0,0,0,0.05)] transition-colors'
        >
          Next →
        </button>
      </div>

      {/* Current slide label */}
      <div className='text-center mt-2 text-sm text-textColor/70'>
        {thumbnails[currentIndex].label} Thumbnail ({currentIndex + 1} / {thumbnails.length})
      </div>
    </div>
  );
}
