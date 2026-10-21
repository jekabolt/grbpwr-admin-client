// «GRBPWR line» — the one stroke style of placeholder, quiz and measurement icons.
// Every stroked element is non-scaling, so the line is the same on-screen width whether the icon
// renders at 20 px or 144 px: never compensate the stroke for the render size.
import type { SVGProps } from 'react';

export const LINE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  vectorEffect: 'non-scaling-stroke',
} satisfies SVGProps<SVGElement>;

/** The one thing the icon is about: the measured band, the picked part, the error. */
export const LINE_EMPHASIS = 2;
/** The measured line on a body figure: reads at a glance over the ghost mannequin. */
export const LINE_BOLD = 3;
/** Secondary: dimension lines, ticks, inner detail. */
export const LINE_HAIRLINE = 1;
/** «This area» tint, as fill='currentColor'. */
export const ACCENT_FILL_OPACITY = 0.12;
/** Base figure under a highlight. */
export const GHOST_OPACITY = 0.35;
/** Pictogram drawn faint behind a slot. */
export const BACKDROP_OPACITY = 0.15;
/** Hidden / back side / not yet. */
export const DASH = '3 3';

export const GRID = { glyph: 24, tile: 64, figure: [64, 96] } as const;
