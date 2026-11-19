import { cn } from 'lib/utility';
import { CheckboxCommon } from 'ui';

/**
 * One feature (or read-only) switch of the console: the kit's square, ink = on. A live square is
 * clicked anywhere on its label: the whole matrix cell (`cell`) or the square with its word. A
 * locked square (only the first team may have it) cannot change and says nothing on click; in a
 * matrix cell a locked feature that is off draws nothing at all.
 */
export function FeatureSquare({
  name,
  checked,
  locked,
  label,
  cell,
  children,
  onChange,
}: {
  name: string;
  checked: boolean;
  locked?: boolean;
  /** the accessible name when no word is drawn beside the square */
  label?: string;
  /** fill a matrix cell: the cell is the click target */
  cell?: boolean;
  children?: React.ReactNode;
  onChange: (on: boolean) => void;
}) {
  if (cell && locked && !checked) return <div className='min-h-11' />;
  return (
    <label
      htmlFor={name}
      className={cn(
        'flex items-center',
        cell ? 'min-h-11 w-full justify-center' : 'min-h-8 gap-2 whitespace-nowrap',
        locked ? 'cursor-not-allowed text-labelColor' : 'cursor-pointer',
      )}
    >
      <CheckboxCommon
        name={name}
        role='switch'
        checked={checked}
        disabled={locked}
        aria-label={label}
        onChange={(v: boolean) => onChange(v)}
      />
      {children}
    </label>
  );
}
