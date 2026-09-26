import type { JSX } from 'react';

import { PantonePicker } from '../../../pantone-picker';
import { findPantone } from '../../../pantone-swatches';
import { Swatch } from '../../render/field-row';

/**
 * ═══ THE COLOUR OF A PLAYGROUND RUN, PICKED FROM PANTONE (C-02, tile 4) ══════════════════════════
 *
 * Owner, on Change a Color: «только там где колорпикер наш пикер с пантоном». So the field is the
 * app's `PantonePicker` (its search, families and recent list) and nothing else: no hex wheel, no
 * second way to say a colour.
 *
 * It hands the caller `{code, hex}` because the recolour wire (`recolourWireColour`) carries both:
 * the code is the instruction, the hex the swatch's APPROXIMATE screen colour. A code the book does
 * not hold (a dye-house number typed by hand) comes back with `hex: ''`, and its swatch draws striped
 * rather than inventing a colour.
 *
 * `PantoneValue` is the same pair drawn small for the fold header: swatch + code, or `—`.
 */
export type PantoneColour = { code: string; hex: string };

export const NO_PANTONE: PantoneColour = { code: '', hex: '' };

/** A code → the pair the wire carries. `''` → `NO_PANTONE`. */
export function pantoneColour(code: string): PantoneColour {
  // The picker already hands back the stored spelling («407 C»); only blank space is trimmed here.
  const clean = code.trim();
  if (!clean) return NO_PANTONE;
  // EXACT match only: `findPantone` also answers a prefix («407» → «407 C»), and a hand-typed
  // dye-house number must not borrow the colour of whichever book entry starts the same way.
  const hit = findPantone(clean);
  return { code: clean, hex: hit && hit.code.toLowerCase() === clean.toLowerCase() ? hit.hex : '' };
}

export type PantoneFieldProps = {
  value: PantoneColour;
  onChange: (next: PantoneColour) => void;
  disabled?: boolean;
  /** Probe anchor and the picker's name; one per field. */
  name: string;
  /** Trigger text while nothing is picked. */
  placeholder?: string;
};

export function PantoneField({
  value,
  onChange,
  disabled,
  name,
  placeholder = 'pick a Pantone',
}: PantoneFieldProps): JSX.Element {
  return (
    <div data-pantone-field={name}>
      <PantonePicker
        name={name}
        value={value.code}
        disabled={disabled}
        label={placeholder}
        onPick={(code) => onChange(pantoneColour(code))}
      />
    </div>
  );
}

/** Swatch + code for a fold header; `—` when nothing is picked. */
export function PantoneValue({ value }: { value: PantoneColour }): JSX.Element {
  if (!value.code) return <span>—</span>;
  return (
    <span className='inline-flex items-center gap-1.5'>
      <Swatch
        hex={value.hex}
        size={10}
        title={value.hex ? `approx. ${value.hex}` : 'no screen colour'}
      />
      <span>{value.code}</span>
    </span>
  );
}
