import type { ReactNode } from 'react';
import { Pin } from 'ui';
import type { ResolvedTechMedia } from '../derive-shared';

/** A required fact the card does not hold. `data-missing` feeds the cover's «missing» count. */
export function Missing({ name }: { name: string }) {
  return (
    <span className='font-bold uppercase text-error' data-missing=''>
      ! {name}
    </span>
  );
}

/** The card's status pill: released / approved read as done, obsolete as a warning. */
export const statusTone = (status: string): 'ok' | 'warn' | 'attention' => {
  const value = status.toLowerCase();
  if (value.includes('released') || value.includes('approved')) return 'ok';
  if (value.includes('obsolete')) return 'warn';
  return 'attention';
};

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

/** Width / height of a picture; a square when the media has no size. */
export function mediaRatio(media: { width?: number; height?: number } | null): number {
  return media?.width && media?.height ? media.width / media.height : 1;
}

/**
 * A technical drawing at `height`, narrower when its column is: the box keeps the picture's
 * ratio, so pins in % of the box stay on the garment. The frame belongs to the panel around it.
 */
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
  const ratio = mediaRatio(media);
  return (
    <figure className='flex min-w-0 max-w-full flex-col items-center'>
      <div
        className='relative flex max-w-full items-center justify-center bg-bgColor'
        style={{ width: Math.round(height * ratio), aspectRatio: String(ratio) }}
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
