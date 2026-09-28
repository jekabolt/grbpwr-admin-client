import type { JSX, ReactNode } from 'react';

import SelectComponent from 'ui/components/select';
import { ViewSwitch } from 'ui/components/view-switch';

import { FieldRow } from '../../render/field-row';

/**
 * The row, with its label no narrower than the band's 92px column but free to be WIDER: the control
 * stands at the right edge (`ml-auto`), so a long label («Realistic materials», 14.png) takes the
 * room it needs on one line instead of breaking in two (C-02 handoff f, fixed in C-10).
 */
const ROW = 'py-2 [&>span:first-child]:w-auto [&>span:first-child]:min-w-[92px]';

/**
 * ═══ A LABELLED CHOICE ON ONE RULED LINE (C-02) ══════════════════════════════════════════════════
 *
 * Label on the left, the control pushed to the right edge: `Logo size [Medium ▾]`,
 * `Quality [Standard | Detailed]`. The row is the band's `FieldRow` (hairline between rows, none
 * under the last), so a stack of option rows reads as one ledger.
 *
 * TWO CONTROLS, CHOSEN BY THE NUMBER OF OPTIONS, NOT BY TASTE. Two or three short options stand side
 * by side as a segmented `ViewSwitch` (every option visible, one press); a longer list (framing has
 * seven) goes into a `SelectComponent`. The caller says which with `control`.
 */
export type OptionRowOption<T extends string> = {
  value: T;
  label: string;
  /** Tooltip on a segment / why an option is disabled. */
  hint?: string;
  disabled?: boolean;
};

export type OptionRowProps<T extends string> = {
  label: string;
  value: T;
  options: readonly OptionRowOption<T>[];
  onChange: (value: T) => void;
  /** `select` (default) for a list, `segmented` for two or three short options. */
  control?: 'select' | 'segmented';
  disabled?: boolean;
  /** A grey line under the row (what the option does); optional. */
  note?: ReactNode;
  /** Probe anchor; lands as `data-option-row`. */
  anchor?: string;
};

export function OptionRow<T extends string>({
  label,
  value,
  options,
  onChange,
  control = 'select',
  disabled,
  note,
  anchor,
}: OptionRowProps<T>): JSX.Element {
  return (
    <FieldRow label={label} className={ROW} data-option-row={anchor ?? label}>
      <div className='ml-auto flex min-w-0 items-center'>
        {control === 'segmented' ? (
          <ViewSwitch<T>
            label={label}
            value={value}
            disabled={disabled}
            options={options.map((o) => ({ value: o.value, label: o.label, hint: o.hint }))}
            onChange={(next) => {
              if (options.find((o) => o.value === next)?.disabled) return;
              onChange(next);
            }}
          />
        ) : (
          <SelectComponent
            name={`option-${anchor ?? label}`}
            placeholder={label}
            value={value}
            disabled={disabled}
            className='min-w-[140px]'
            items={options.map((o) => ({ value: o.value, label: o.label, disabled: o.disabled }))}
            onValueChange={(next: string) => {
              const hit = options.find((o) => o.value === next);
              if (hit && !hit.disabled) onChange(hit.value);
            }}
          />
        )}
      </div>
      {note && <div className='w-full text-micro text-labelColor'>{note}</div>}
    </FieldRow>
  );
}
