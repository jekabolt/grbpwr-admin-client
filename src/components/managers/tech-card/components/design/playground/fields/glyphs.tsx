import type { JSX } from 'react';

import Tooltip from 'ui/components/tooltip';

/**
 * The small line glyphs that head a playground section: what KIND of input sits under the title.
 *
 * One family, drawn here once: a 12px square, 1.25px stroke in the current colour, square caps, no
 * fill. The admin has no icon library (DESIGN.md: literal glyph controls), and each tile drawing its
 * own would drift by a pixel of stroke on the first edit. They are `aria-hidden`: the title next to
 * them already says it.
 */
export type FieldGlyphName = 'image' | 'text' | 'format' | 'boost' | 'cube' | 'colour' | 'options';

const PATHS: Record<FieldGlyphName, JSX.Element> = {
  image: (
    <>
      <rect x='1.5' y='2.5' width='13' height='11' />
      <circle cx='5.5' cy='6' r='1.1' />
      <path d='M1.5 11.5 6 8l3 2.5 2-1.5 3.5 3' />
    </>
  ),
  text: <path d='M2 4h12M2 8h12M2 12h7' />,
  format: <path d='M4.5 1.5v10h10M1.5 4.5h10v10' />,
  boost: <path d='M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z' />,
  cube: (
    <>
      <path d='M8 1.5 14 4.75v6.5L8 14.5 2 11.25v-6.5z' />
      <path d='M2 4.75 8 8l6-3.25M8 8v6.5' />
    </>
  ),
  colour: (
    <>
      <rect x='1.5' y='1.5' width='13' height='13' />
      <path d='M1.5 14.5 14.5 1.5' />
    </>
  ),
  options: <path d='M2 4h8M12 4h2M2 12h2M6 12h8M10 2.5v3M4 10.5v3' />,
};

export function FieldGlyph({ name }: { name: FieldGlyphName }): JSX.Element {
  return (
    <svg
      viewBox='0 0 16 16'
      width={12}
      height={12}
      aria-hidden='true'
      focusable='false'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.25}
      strokeLinecap='square'
      className='shrink-0 self-center'
    >
      {PATHS[name]}
    </svg>
  );
}

/**
 * ⓘ — a footnote on a title, opened by hover AND by keyboard focus (Radix wires both). A real
 * button so Tab reaches it; it does nothing on press.
 */
export function InfoTip({ label, children }: { label: string; children: string }): JSX.Element {
  return (
    <Tooltip
      side='top'
      align='start'
      className='max-w-[260px] normal-case'
      trigger={
        <button
          type='button'
          aria-label={`about ${label}`}
          className='inline-flex cursor-help items-center text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
        >
          ⓘ
        </button>
      }
    >
      {children}
    </Tooltip>
  );
}
