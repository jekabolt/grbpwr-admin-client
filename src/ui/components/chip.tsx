import { cva, VariantProps } from 'class-variance-authority';

import { cn } from 'lib/utility';

/**
 * Interactive counterpart of `Pill` — filters, toggles, removable selections.
 * `selected` fills with ink. Use `ChipRow` as the wrapper so nobody hand-rolls
 * `flex flex-wrap gap-1`.
 */
const chipVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap border px-[7px] py-px text-micro uppercase tracking-pill transition-colors disabled:cursor-not-allowed',
  {
    variants: {
      selected: {
        true: ['border-textColor', 'bg-textColor', 'text-bgColor'],
        false: ['border-borderColor', 'bg-bgColor', 'text-labelColor', 'hover:text-textColor'],
      },
      tone: {
        default: [],
        // A chip pointing at broken data (a dangling piece code, a missing material).
        error: ['border-error', 'text-error'],
      },
      dashed: { true: ['border-dashed'], false: [] },
    },
    compoundVariants: [
      { selected: true, tone: 'error', className: 'bg-error text-bgColor border-error' },
    ],
    defaultVariants: { selected: false, tone: 'default', dashed: false },
  },
);

interface Props extends VariantProps<typeof chipVariants> {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** Renders a trailing ✕ that calls this instead of `onClick`. */
  onRemove?: () => void;
  disabled?: boolean;
  title?: string;
  /** Set for toggle chips so screen readers announce the pressed state. */
  pressed?: boolean;
  /**
   * Render as a `span` with a button role instead of a real `<button>`.
   *
   * For chips that must keep working inside a `<fieldset disabled>` — a read-only view control
   * (switch the view, reset a layout) on a frozen record. `disabled` is INHERITED by every form
   * control under a disabled fieldset and `aria-disabled` does not undo it, so a plain chip there
   * is dead however its own props read. Only for controls that change no data: anything that
   * writes must stay a real button so the fieldset can stop it.
   */
  nonForm?: boolean;
  /** Anything else (draggable, onDragStart, onKeyDown, data-*, role, tabIndex…). */
  [k: string]: unknown;
}

export function Chip({
  children,
  className,
  selected,
  tone,
  dashed,
  onClick,
  onRemove,
  disabled,
  pressed,
  nonForm,
  ...props
}: Props) {
  const interactive = !!onClick || !!onRemove;
  const asSpan = !interactive || nonForm;
  const Component = asSpan ? 'span' : 'button';
  // `nonForm` управляет ролью, фокусом и клавиатурой сам — эти четыре пропа он у вызывающего
  // ПЕРЕХВАТЫВАЕТ, а не дополняет; чужой `onKeyDown` composed поверх встроенного, чтобы
  // родительские горячие клавиши не потерялись.
  const outerKeyDown = props.onKeyDown as ((e: React.KeyboardEvent) => void) | undefined;
  const spanRole =
    nonForm && interactive
      ? {
          role: 'button' as const,
          tabIndex: disabled ? undefined : 0,
          onClick: disabled ? undefined : onClick,
          'aria-disabled': disabled || undefined,
          onKeyDown: (e: React.KeyboardEvent) => {
            outerKeyDown?.(e);
            if (disabled || e.defaultPrevented) return;
            if (e.key !== 'Enter' && e.key !== ' ') return;
            // Автоповтор удерживаемой клавиши не должен переключать по разу на каждое событие —
            // нативная кнопка так себя не ведёт.
            if (e.repeat) return;
            e.preventDefault();
            onClick?.();
          },
          className: disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        }
      : {};
  return (
    <Component
      {...props}
      {...spanRole}
      {...(interactive && !nonForm ? { type: 'button' as const, disabled, onClick } : {})}
      aria-pressed={pressed}
      className={chipVariants({ selected, tone, dashed, className: cn(spanRole.className, className) })}
    >
      {children}
      {/* Задизейбленный чип не удаляется. Настоящей `<button disabled>` это давал браузер; в
          span-варианте гейт приходится ставить руками, иначе ✕ остаётся живым на выключенном
          чипе. */}
      {onRemove && !(nonForm && disabled) && (
        <span
          role='button'
          tabIndex={-1}
          aria-label='remove'
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onRemove();
          }}
          className='cursor-pointer leading-none'
        >
          ✕
        </span>
      )}
    </Component>
  );
}

export function ChipRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`flex flex-wrap items-center gap-1 ${className ?? ''}`}>{children}</div>;
}
