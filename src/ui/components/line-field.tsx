import {
  type ChangeEvent,
  type ComponentProps,
  type FocusEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { cn } from 'lib/utility';
import { PinToggle } from './pin-toggle';

export type LineFieldProps = Omit<ComponentProps<'input'>, 'size' | 'placeholder'> & {
  /** The field's name in the row («Chest», «Model Name»). */
  label?: ReactNode;
  /** Same as `label` (kept so a plain input call reads naturally). */
  placeholder?: string;
  pin?: { pinned: boolean; onToggle: () => void; label?: string };
  /** The rule turns `error` red; the label stays. No message. */
  error?: boolean;
  /** Classes of the row (the underline box); `className` goes to the input. */
  rowClassName?: string;
};

/**
 * The underline field of the fill system (Lekalo): no box, 33px tall, a 1px rule under it, 12px.
 *
 * THE LABEL MOVES, NOT A PLACEHOLDER. At rest (empty, not focused) the label sits at the left in
 * `placeholder` grey and the `PinToggle` at the right end. On focus, and while there is a value, the
 * label slides to the right — stopping ~13px before the pin — and the input takes its place at the
 * left; on blur with an empty value it slides back. A pinned field's label is ink, in both places.
 * The slide is two nested transforms (the track moves by its own width, the label back by its
 * own), so no width is measured for the motion itself; the soft ease, none under reduced motion.
 *
 * Error = the rule turns red, nothing else. The RHF-bound form is `LineInputField`.
 */
export function LineField({
  label,
  placeholder,
  pin,
  error,
  rowClassName,
  className,
  id,
  name,
  ref,
  value,
  defaultValue,
  onChange,
  onFocus,
  onBlur,
  ...props
}: LineFieldProps) {
  const invalid = error || props['aria-invalid'] === true || props['aria-invalid'] === 'true';
  const inputId = id ?? name;
  const caption = label ?? placeholder;
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState(() => String(defaultValue ?? '').length > 0);
  const filled = value !== undefined ? String(value ?? '').length > 0 : typed;
  const moved = focused || filled;

  // The input stops where the moved label starts.
  const labelRef = useRef<HTMLLabelElement>(null);
  const [labelWidth, setLabelWidth] = useState(0);
  useLayoutEffect(() => {
    const w = labelRef.current?.offsetWidth ?? 0;
    setLabelWidth((prev) => (prev === w ? prev : w));
  }, [caption]);

  return (
    <div
      className={cn(
        'relative flex h-8.25 min-w-0 items-center gap-2 border-b px-2 transition-colors duration-500 ease-soft',
        invalid ? 'border-error' : 'border-textColor',
        props.disabled && 'border-placeholder',
        rowClassName,
      )}
    >
      <input
        ref={ref}
        id={inputId}
        name={name}
        aria-invalid={invalid || undefined}
        value={value}
        defaultValue={defaultValue}
        {...props}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setTyped(e.target.value.length > 0);
          onChange?.(e);
        }}
        onFocus={(e: FocusEvent<HTMLInputElement>) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e: FocusEvent<HTMLInputElement>) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={moved && labelWidth ? { paddingRight: labelWidth + 13 } : undefined}
        className={cn(
          'h-full min-w-0 flex-1 appearance-none rounded-none border-0 bg-transparent p-0 text-textBaseSize text-ink caret-ink outline-none disabled:text-placeholder',
          !moved && 'text-transparent',
          className,
        )}
      />
      {caption != null && (
        <span
          aria-hidden={false}
          className={cn(
            'pointer-events-none absolute inset-y-0 left-2 flex items-center',
            pin ? 'right-7.5' : 'right-5',
          )}
        >
          <span
            className={cn(
              'block w-full transition-transform duration-700 ease-soft motion-reduce:transition-none',
              moved && 'translate-x-full',
            )}
          >
            <label
              ref={labelRef}
              htmlFor={inputId}
              className={cn(
                'pointer-events-auto inline-block max-w-full cursor-text truncate align-middle text-textBaseSize transition-[transform,color] duration-700 ease-soft motion-reduce:transition-none',
                moved && '-translate-x-full',
                pin?.pinned ? 'text-ink' : 'text-placeholder',
              )}
            >
              {caption}
            </label>
          </span>
        </span>
      )}
      {pin && (
        <PinToggle
          pinned={pin.pinned}
          onToggle={pin.onToggle}
          label={pin.label}
          className='relative z-10 ml-auto'
        />
      )}
    </div>
  );
}
