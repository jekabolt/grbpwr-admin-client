import { ReactNode } from 'react';
import Text from 'ui/components/text';
import { opexCategorySelectOptions, opexCurrencyOptions } from '../utils/options';

// Shared OPEX form primitives, used by both the creation wizard and the edit modals so the two
// creation/edit paths can never drift (same category set, same currency list, same styling).

// Square, high-contrast control matching the rest of the OPEX admin.
export const fieldCls =
  'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize text-textColor focus:border-textColor focus:outline-none';

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className='flex flex-col gap-1'>
      <Text size='small' variant='label'>
        {label}
      </Text>
      {children}
      {error ? (
        <Text variant='error' size='small'>
          {error}
        </Text>
      ) : hint ? (
        <Text variant='inactive' size='small'>
          {hint}
        </Text>
      ) : null}
    </label>
  );
}

// Category is a CLOSED set backend-side — a native select prevents the "invalid opex category"
// InvalidArgument a free-text field used to allow.
export function CategorySelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  return (
    <select id={id} className={fieldCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {opexCategorySelectOptions.map((c) => (
        <option key={c.value} value={c.value}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

export function CurrencySelect({
  value,
  onChange,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
}) {
  return (
    <select id={id} className={fieldCls} value={value} onChange={(e) => onChange(e.target.value)}>
      {opexCurrencyOptions.map((c) => (
        <option key={c.value} value={c.value}>
          {c.value}
        </option>
      ))}
    </select>
  );
}

export function AmountInput({
  value,
  onChange,
  id,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      id={id}
      className={fieldCls}
      type='number'
      step='0.01'
      min='0'
      inputMode='decimal'
      placeholder='0.00'
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function MonthInput({
  value,
  onChange,
  id,
  min,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  min?: string;
}) {
  return (
    <input
      id={id}
      className={fieldCls}
      type='month'
      value={value}
      min={min}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
