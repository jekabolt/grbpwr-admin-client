import type { ReactNode } from 'react';
import { Pin } from 'ui';
import type { ResolvedTechMedia } from '../derive-shared';

export function Missing({ name }: { name: string }) {
  return <span className='font-bold uppercase text-error'>! {name}</span>;
}

export function Swatch({ colour, size = 12 }: { colour?: string; size?: number }) {
  if (!colour) return null;
  return (
    <span
      className='inline-block shrink-0 border border-borderColor align-middle'
      style={{ width: size, height: size, backgroundColor: colour }}
    />
  );
}

export type DrawingPin = {
  label: ReactNode;
  x: number;
  y: number;
  highlighted?: boolean;
};

export function TechpackDrawing({
  media,
  name,
  height,
  pins = [],
  caption,
}: {
  media: ResolvedTechMedia | null;
  name: string;
  height: number;
  pins?: DrawingPin[];
  caption?: string;
}) {
  const ratio = media?.width && media?.height ? `${media.width} / ${media.height}` : '1 / 1';
  return (
    <figure className='flex flex-col items-center'>
      <div
        className='relative flex items-center justify-center overflow-hidden border border-borderColor bg-bgColor'
        style={{ height, aspectRatio: ratio }}
      >
        {media ? (
          <img src={media.url} alt={name} className='h-full w-full object-contain' />
        ) : (
          <Missing name={`${name} flat`} />
        )}
        {media &&
          pins.map((pin, index) => (
            <Pin
              key={`${String(pin.label)}-${index}`}
              x={pin.x}
              y={pin.y}
              label={pin.label}
              highlighted={pin.highlighted}
            />
          ))}
      </div>
      {caption !== '' && (
        <figcaption className='text-micro uppercase tracking-label text-labelColor'>
          {caption || name}
        </figcaption>
      )}
    </figure>
  );
}
