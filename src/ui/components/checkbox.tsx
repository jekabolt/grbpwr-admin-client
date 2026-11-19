import * as Checkbox from '@radix-ui/react-checkbox';
import { cn } from 'lib/utility';

/**
 * The 12px square. Two opt-in variants; with neither, it renders exactly as it always has.
 *
 * `locked` — on or off, but nobody here can change it, and it must LOOK so: a hairline frame, and
 *   «on» is a grey fill instead of ink. Distinct from plain disabled-and-off. Implies disabled.
 * `cell` — the whole parent cell is the click target (a matrix cell, a row): the root stretches to
 *   the cell (full width, 44px tall) and centres the square; hovering a live cell inks the frame.
 */
export default function CheckboxCommon({
  name,
  onChange,
  className,
  locked,
  cell,
  ...props
}: {
  name: string;
  onChange?: (checked: boolean) => void;
  className?: string;
  locked?: boolean;
  cell?: boolean;
  [k: string]: unknown;
}) {
  if (!locked && !cell) {
    return (
      <Checkbox.Root
        className={cn(
          'flex h-3 w-3 flex-none appearance-none items-center justify-center border border-borderColor cursor-pointer',
          className,
        )}
        id={name}
        name={name}
        onCheckedChange={onChange}
        {...props}
      >
        <Checkbox.Indicator className='h-full w-full bg-textColor'></Checkbox.Indicator>
      </Checkbox.Root>
    );
  }

  const indicator = (
    <Checkbox.Indicator
      className={cn('h-full w-full', locked ? 'bg-borderColor' : 'bg-textColor')}
    ></Checkbox.Indicator>
  );
  const frame = locked
    ? 'border-hairline data-[state=checked]:border-borderColor'
    : 'border-borderColor';

  if (!cell) {
    return (
      <Checkbox.Root
        className={cn(
          'flex h-3 w-3 flex-none appearance-none items-center justify-center border cursor-not-allowed',
          frame,
          className,
        )}
        id={name}
        name={name}
        onCheckedChange={onChange}
        {...props}
        disabled
      >
        {indicator}
      </Checkbox.Root>
    );
  }

  return (
    <Checkbox.Root
      className={cn(
        'group flex min-h-11 w-full appearance-none items-center justify-center',
        locked ? 'cursor-not-allowed' : 'cursor-pointer disabled:cursor-not-allowed',
        'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor',
        className,
      )}
      id={name}
      name={name}
      onCheckedChange={onChange}
      {...props}
      {...(locked ? { disabled: true } : {})}
    >
      <span
        className={cn(
          'flex h-3 w-3 flex-none items-center justify-center border',
          locked
            ? 'border-hairline group-data-[state=checked]:border-borderColor'
            : 'border-borderColor group-hover:group-enabled:border-textColor',
        )}
      >
        {indicator}
      </span>
    </Checkbox.Root>
  );
}
