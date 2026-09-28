import type { JSX } from 'react';

import { cn } from 'lib/utility';
import { RatioGlyph } from 'ui/components/ratio-glyph';
import Text from 'ui/components/text';
import { Tile } from 'ui/components/tiles';

/**
 * ═══ FORMAT — THE ASPECT OF THE PICTURE A RUN RETURNS (C-02, owner refs 3.png / 11.png) ══════════
 *
 * Four tiles to a row, each one the proportion drawn by itself (`RatioGlyph`, sized by the long
 * side so the column of glyphs shares one box). `auto` is a dashed square: «whatever the route
 * picks». The chosen tile takes the ink border (Tile `selected`, 2px) and its glyph fills with ink,
 * so the choice reads twice, by weight and by mass.
 *
 * A ratio the current engine cannot make stays ON the grid, dimmed, with the reason written once
 * under it: a grid that silently lost tiles would re-flow under the pointer every time the engine
 * changed, and a person would not learn why 21:9 went away. The dimmed tile takes no click.
 *
 * `snapRatio` is the rule the caller uses when the engine changes under a chosen ratio: the nearest
 * allowed proportion by shape, never «auto» by surprise.
 */

/** Every ratio a playground grid can show, in the owner's grid order. */
export const FORMAT_RATIOS = [
  'auto',
  '9:16',
  '1:1',
  '4:5',
  '3:4',
  '2:3',
  '16:9',
  '4:3',
  '3:2',
  '5:4',
  '21:9',
  '9:21',
] as const;
export type FormatRatio = (typeof FORMAT_RATIOS)[number];

/** The generation grid of refs 3.png, 4.png, 5.png, 13.png: `auto` + ten ratios, no 9:21. */
export const IMAGE_FORMAT_RATIOS: readonly FormatRatio[] = FORMAT_RATIOS.filter(
  (r) => r !== '9:21',
);
/** «New final format» of Extend Image (11.png): no auto, no 4:5 / 5:4, with 9:21. */
export const EXTEND_FORMAT_RATIOS: readonly FormatRatio[] = [
  '9:16',
  '1:1',
  '3:4',
  '2:3',
  '16:9',
  '4:3',
  '3:2',
  '21:9',
  '9:21',
];

function shapeOf(ratio: string): number | null {
  const [a, b] = ratio.split(':').map(Number);
  return a > 0 && b > 0 ? Math.log(a / b) : null;
}

/**
 * The allowed ratio nearest in shape to `value` (log-aspect distance); `value` itself when it is
 * allowed. `auto` stays `auto` when allowed, otherwise the first allowed ratio.
 */
export function snapRatio(value: string, allowed: readonly string[]): string {
  if (allowed.length === 0 || allowed.includes(value)) return value;
  const want = shapeOf(value);
  if (want === null) return allowed[0];
  let best = allowed[0];
  let bestDistance = Infinity;
  for (const ratio of allowed) {
    const shape = shapeOf(ratio);
    if (shape === null) continue;
    const distance = Math.abs(shape - want);
    if (distance < bestDistance) {
      best = ratio;
      bestDistance = distance;
    }
  }
  return best;
}

export type FormatGridProps = {
  value: string;
  onChange: (ratio: string) => void;
  /** Which tiles the grid draws, in order. Default: the generation grid (`IMAGE_FORMAT_RATIOS`). */
  ratios?: readonly string[];
  /**
   * What the engine can make. Omitted = everything drawn is allowed. A drawn ratio outside the set
   * is dimmed and cannot be picked; `disallowedReason` says why, once, under the grid.
   */
  allowed?: readonly string[];
  disallowedReason?: string;
  disabled?: boolean;
  /** Accessible name of the group. */
  label?: string;
};

function Glyph({ ratio, on }: { ratio: string; on: boolean }): JSX.Element {
  if (ratio === 'auto') {
    return <span aria-hidden className='inline-block size-5 border border-dashed border-current' />;
  }
  return <RatioGlyph ratio={ratio} size={22} className={cn(on && 'bg-current')} />;
}

export function FormatGrid({
  value,
  onChange,
  ratios = IMAGE_FORMAT_RATIOS,
  allowed,
  disallowedReason,
  disabled,
  label = 'format',
}: FormatGridProps): JSX.Element {
  const allow = allowed ? new Set(allowed) : null;
  const anyDimmed = !!allow && ratios.some((r) => !allow.has(r));

  return (
    <div data-format-grid=''>
      <div role='group' aria-label={label} className='grid grid-cols-4 gap-2'>
        {ratios.map((ratio) => {
          const on = ratio === value;
          const blocked = !!allow && !allow.has(ratio);
          const live = !disabled && !blocked;
          return (
            <Tile
              key={ratio}
              selected={on}
              pressed={live ? on : undefined}
              onClick={live ? () => onChange(ratio) : undefined}
              title={blocked ? disallowedReason ?? 'not available here' : undefined}
              className={cn(
                // A square-ish cell with the glyph centred over its name: the glyph area is one
                // fixed height, so a row of mixed proportions keeps its labels on one line.
                'items-center justify-center gap-1.5 py-3 text-center',
                on ? 'text-textColor' : 'text-labelColor',
                live && !on && 'hover:text-textColor',
                blocked && 'border-dashed opacity-40',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              )}
            >
              <span className='flex h-6 items-center justify-center'>
                <Glyph ratio={ratio} on={on} />
              </span>
              <Text
                size='micro'
                component='span'
                tracking='label'
                className={cn(on ? 'font-bold text-textColor' : 'text-labelColor')}
              >
                {ratio}
              </Text>
            </Tile>
          );
        })}
      </div>
      {anyDimmed && disallowedReason && (
        <Text size='micro' variant='label' component='p' className='mt-2'>
          dimmed: {disallowedReason}
        </Text>
      )}
    </div>
  );
}
