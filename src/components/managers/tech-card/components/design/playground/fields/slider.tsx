import { useId, type JSX } from 'react';

import { cn } from 'lib/utility';

import { InfoTip } from './glyphs';

/**
 * ═══ A STEPPED SLIDER (C-02, owner ref 10.png: Creative booster Off → High) ═════════════════════
 *
 * A native `<input type=range>` over a handful of named steps, drawn in the system's grammar: a 1px
 * ink track, a square ink thumb, no rounding, no shadow. The step names sit under the track at their
 * own positions, the current one in ink. The value is NOT repeated beside the slider: the fold that
 * holds it prints it in its header («Off»), which is where the owner's reference puts it.
 *
 * Native, not a Radix slider: arrow keys, Home/End, PageUp/Down, touch and the announced value all
 * come with the element; `aria-valuetext` makes a reader say «Medium», not «2».
 */
export type SliderStep<T extends string | number> = { value: T; label: string };

export type SliderProps<T extends string | number> = {
  /** Accessible name; also the visible caption when `showLabel`. */
  label: string;
  steps: readonly SliderStep<T>[];
  value: T;
  onChange: (value: T) => void;
  /** A footnote (ⓘ) beside the caption; only drawn with `showLabel`. */
  info?: string;
  /** Print the caption above the track (when the slider is not the only thing in its fold). */
  showLabel?: boolean;
  disabled?: boolean;
};

/** Off / Low / Medium / High as 0..3 — the creativity steps of tile 7 (B-05). */
export const BOOST_STEPS: readonly SliderStep<number>[] = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
];

/** The name of the current step, for the fold header. `'—'` when the value is not a step. */
export function stepLabel<T extends string | number>(
  steps: readonly SliderStep<T>[],
  value: T,
): string {
  return steps.find((s) => s.value === value)?.label ?? '—';
}

// Track and thumb for both engines. Arbitrary variants, because the pseudo-elements of a range input
// cannot take a class.
const RANGE = cn(
  'block h-5 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
  '[&::-webkit-slider-runnable-track]:h-px [&::-webkit-slider-runnable-track]:bg-textColor',
  '[&::-webkit-slider-thumb]:-mt-[5px] [&::-webkit-slider-thumb]:size-[11px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-none [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-textColor [&::-webkit-slider-thumb]:bg-textColor',
  '[&::-moz-range-track]:h-px [&::-moz-range-track]:bg-textColor',
  '[&::-moz-range-thumb]:size-[11px] [&::-moz-range-thumb]:rounded-none [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-textColor [&::-moz-range-thumb]:bg-textColor',
  'disabled:[&::-webkit-slider-runnable-track]:bg-borderColor disabled:[&::-webkit-slider-thumb]:border-borderColor disabled:[&::-webkit-slider-thumb]:bg-bgColor',
  'disabled:[&::-moz-range-track]:bg-borderColor disabled:[&::-moz-range-thumb]:border-borderColor disabled:[&::-moz-range-thumb]:bg-bgColor',
);

export function Slider<T extends string | number>({
  label,
  steps,
  value,
  onChange,
  info,
  showLabel,
  disabled,
}: SliderProps<T>): JSX.Element {
  const id = useId();
  const at = Math.max(
    0,
    steps.findIndex((s) => s.value === value),
  );
  const last = Math.max(1, steps.length - 1);

  return (
    <div data-slider={label}>
      {showLabel && (
        <div className='mb-1 flex items-center gap-2'>
          <label htmlFor={id} className='text-micro uppercase tracking-label text-labelColor'>
            {label}
          </label>
          {info && <InfoTip label={label}>{info}</InfoTip>}
        </div>
      )}
      <input
        id={id}
        type='range'
        min={0}
        max={steps.length - 1}
        step={1}
        value={at}
        disabled={disabled}
        aria-label={showLabel ? undefined : label}
        aria-valuetext={steps[at]?.label}
        onChange={(e) => {
          const next = steps[Number(e.currentTarget.value)];
          if (next && next.value !== value) onChange(next.value);
        }}
        className={RANGE}
      />
      {/* Step names at their own positions: the first flush left, the last flush right, the rest
          centred on their stop — so each word stands under the place the thumb goes. */}
      <div aria-hidden className='relative mt-1 h-4'>
        {steps.map((s, i) => {
          const pos = (i / last) * 100;
          return (
            <span
              key={String(s.value)}
              style={{ left: `${pos}%` }}
              className={cn(
                'absolute top-0 whitespace-nowrap text-micro',
                i === 0 ? '' : i === steps.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
                i === at ? 'font-bold text-textColor' : 'text-labelColor',
              )}
            >
              {s.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
