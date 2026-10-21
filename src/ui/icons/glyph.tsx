import type { SVGProps } from 'react';
import { cn } from 'lib/utility';
import { LINE } from './line';

/**
 * The placeholder glyphs of empty slots, on the 24 grid in the «GRBPWR line» style (see `./line`).
 * `photo` — an image goes here; `model` — a 3D model box; `pen` — draw / sketch here;
 * `sparkle` — generate here. Default size 20; a `className` with a size class overrides it.
 */
export type GlyphName = 'photo' | 'model' | 'pen' | 'sparkle';

const DRAWINGS: Record<GlyphName, JSX.Element> = {
  photo: (
    <>
      <rect {...LINE} x='2.5' y='4.5' width='19' height='15' />
      <circle {...LINE} cx='8' cy='9.5' r='1.5' />
      <path {...LINE} d='M2.5 16.5 8.5 11l4.5 4 3-2.5 5.5 4.5' />
    </>
  ),
  model: (
    <>
      <path {...LINE} d='M12 2.75 20.5 7v10L12 21.25 3.5 17V7z' />
      <path {...LINE} d='M3.5 7 12 11.25 20.5 7' />
      <path {...LINE} d='M12 11.25v10' />
    </>
  ),
  pen: (
    <>
      <path {...LINE} d='M4.5 19.5 6 14.5 16.5 4l3.5 3.5L9.5 18z' />
      <path {...LINE} d='M14.5 6l3.5 3.5' />
      <path {...LINE} d='M6 14.5l3.5 3.5' />
    </>
  ),
  sparkle: <path {...LINE} d='M12 3c0 5 4 9 9 9-5 0-9 4-9 9 0-5-4-9-9-9 5 0 9-4 9-9Z' />,
};

export function Glyph({
  name,
  className,
  ...props
}: { name: GlyphName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden
      focusable='false'
      width={20}
      height={20}
      viewBox='0 0 24 24'
      data-glyph={name}
      className={cn('shrink-0', className)}
      {...props}
    >
      {DRAWINGS[name]}
    </svg>
  );
}
