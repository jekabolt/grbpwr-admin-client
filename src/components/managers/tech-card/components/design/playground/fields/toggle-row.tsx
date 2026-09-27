import type { JSX, ReactNode } from 'react';

import { ToggleSwitch } from 'ui/components/toggle-switch';

import { FieldRow } from '../../render/field-row';

/**
 * The row, with its label no narrower than the band's 92px column but free to be WIDER: the control
 * stands at the right edge (`ml-auto`), so a long label («Realistic materials», 14.png) takes the
 * room it needs on one line instead of breaking in two (C-02 handoff f, fixed in C-10).
 */
const ROW = 'py-2 [&>span:first-child]:w-auto [&>span:first-child]:min-w-[92px]';

/**
 * ═══ AN ON/OFF OPTION ON ONE RULED LINE (C-02, owner ref 14.png: Texture, Realistic materials) ═══
 *
 * The label on the left, the app's `ToggleSwitch` at the right edge, on the band's `FieldRow`.
 *
 * ⚠ THE SWITCH IS NAMED BY A `<label>` AROUND IT. `ToggleSwitch` without its own `label` renders a
 * bare Radix switch (a `<button role=switch>`) with no accessible name, and passing `label` would
 * print the words AFTER the switch, on the wrong side of the row. A `<button>` is a labelable
 * element, so a `<label>` wrapping it with the row's words (visually hidden: the row already shows
 * them) names it for a screen reader, and clicking anywhere in that label flips it.
 */
export type ToggleRowProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** A grey line under the row (what switching it does); optional. */
  note?: ReactNode;
  /** Probe anchor; lands as `data-toggle-row`. */
  anchor?: string;
};

export function ToggleRow({
  label,
  checked,
  onChange,
  disabled,
  note,
  anchor,
}: ToggleRowProps): JSX.Element {
  return (
    <FieldRow label={label} className={ROW} data-toggle-row={anchor ?? label}>
      {/* The shared switch draws `outline-none` and no focus ring of its own; the label draws the
          system's 2px ink outline while the switch inside it holds keyboard focus. */}
      <label className='ml-auto flex cursor-pointer items-center has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-textColor'>
        <span className='sr-only'>{label}</span>
        <ToggleSwitch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      </label>
      {note && <div className='w-full text-micro text-labelColor'>{note}</div>}
    </FieldRow>
  );
}
