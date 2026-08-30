import { cn } from 'lib/utility';
import type { JSX } from 'react';
import MediaComponent from 'ui/components/media';
import { PLACEHOLDER_SURFACE, placeholderClass } from 'ui/components/placeholder';
import Text from 'ui/components/text';

/**
 * ONE CELL OF AN INPUT STRIP — a frame, two caption lines and one action, at a fixed width.
 *
 * The two generative screens both open on a horizontal band of inputs, and they must be the same
 * band: the render's flats and the 3D's renders are read in the same glance, on the same baseline,
 * with the provenance in the same place. Two cell components would drift by a pixel and by a word.
 *
 * THE FRAME IS A FIXED BOX AND THE PICTURE IS CONTAINED IN IT, which is deliberate and is the same
 * choice the bench makes. A frame cut to each picture's own proportions would give a strip of
 * ragged heights whose captions no longer line up, and the rule that a frame must match its
 * picture's ratio binds only where FRACTIONAL geometry is drawn over the frame — a callout at 0.5,
 * 0.16 lands in a different place on a letterboxed image than on a fitted one. Nothing fractional
 * is drawn here: the view badge and the zoom button are anchored to corners, so `object-contain`
 * inside a fixed box is honest. The moment a marker is placed on one of these frames, the box has
 * to become the picture's own ratio — and `media.thumbnail.width/height` is on the wire for it.
 */

export const CELL_WIDTH = 'w-[132px] shrink-0';
const FRAME_HEIGHT = 'h-[148px]';

export function StripCell({
  src,
  alt,
  /** Drawn in the top-left corner of the frame, filled ink — the view this picture stands for. */
  badge,
  /** Top-right corner: `zoom`, or nothing. */
  corner,
  /** Shown instead of the frame when there is no picture. */
  empty,
  emphasis,
  lines,
  action,
  className,
}: {
  src?: string;
  alt: string;
  badge?: string;
  corner?: React.ReactNode;
  empty?: React.ReactNode;
  /** The cell holds something the screen READS — a heavier frame, as on a filled bench slot. */
  emphasis?: boolean;
  lines: React.ReactNode[];
  action?: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1', CELL_WIDTH, className)}>
      {src ? (
        <div
          className={cn(
            'relative bg-bgColor',
            FRAME_HEIGHT,
            emphasis ? 'border border-textColor' : 'border border-borderColor',
          )}
        >
          {/* `contain`, never `cover`: these are DRAWINGS, and a crop of a flat loses the outline
              of the garment — the one thing the sheet is printed for. */}
          <MediaComponent src={src} alt={alt} aspectRatio='auto' fit='contain' />
          {badge && (
            <span className='pointer-events-none absolute left-1 top-1 z-10 bg-textColor px-1.5 py-0.5'>
              <Text size='nano' variant='uppercase' component='span' className='!text-bgColor'>
                {badge}
              </Text>
            </span>
          )}
          {corner && <span className='absolute right-1 top-1 z-10'>{corner}</span>}
        </div>
      ) : (
        <div
          className={cn(placeholderClass({ dashed: true }), FRAME_HEIGHT, 'w-full px-1 text-center')}
          style={PLACEHOLDER_SURFACE}
        >
          {empty}
        </div>
      )}

      {lines.map((line, i) => (
        <Text key={i} size='nano' variant='label' component='span' className='min-w-0 break-words'>
          {line}
        </Text>
      ))}

      {action && <div className='mt-auto pt-0.5'>{action}</div>}
    </div>
  );
}

/**
 * The scrolling band the cells sit in.
 *
 * `overflow-x-auto` ON ITS OWN CONTAINER, not on the page: a card with a dozen flats is exactly the
 * case this strip exists for, and a page that scrolls sideways to show it takes every other block
 * with it.
 */
export function Strip({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className='flex items-stretch gap-2 overflow-x-auto pb-1'>{children}</div>;
}

/** The vertical rule that separates «what the render reads» from «everything else on the card». */
export function StripDivider(): JSX.Element {
  return <span aria-hidden='true' className='w-px shrink-0 self-stretch bg-borderColor' />;
}
