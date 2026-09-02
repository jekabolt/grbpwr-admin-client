import { cn } from 'lib/utility';
import type { JSX } from 'react';
import { PLACEHOLDER_SURFACE } from 'ui/components/placeholder';
import Text from 'ui/components/text';

/**
 * A LABELLED CONTROL ROW — the `#e6e6e6` hairline weight of the ladder, with a control in it.
 *
 * `ui/components/row` is the row for a label and a VALUE: it right-aligns and tabulates the second
 * column, which is what makes a stack of figures read as a ledger and what makes a select in it sit
 * in the wrong place. Every organ of this band that puts a control on a ruled line writes this same
 * flex line by hand (`artifacts-panel`, `references-section`); this is that idiom, once, so the render
 * menu and the 3D menu cannot drift by two pixels of padding.
 */
export function FieldRow({
  label,
  children,
  className,
  ...rest
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  /** `data-*` for probes and nothing else: this row owns no behaviour worth a prop. */
  [k: `data-${string}`]: unknown;
}): JSX.Element {
  return (
    <div
      {...rest}
      className={cn('flex flex-wrap items-center gap-2 border-b border-hairline py-1', className)}
    >
      <Text
        size='micro'
        variant='label'
        tracking='label'
        component='span'
        className='w-[92px] shrink-0 uppercase'
      >
        {label}
      </Text>
      {children}
    </div>
  );
}

/** The grey sentence that rides with a control and says what it is for. */
export function Hint({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <Text size='micro' variant='label' component='span' className='min-w-0 normal-case'>
      {children}
    </Text>
  );
}

/**
 * A colour square.
 *
 * AN UNKNOWN COLOUR IS STRIPED, NEVER BLACK. `''` reaches here from a fabric photo (which has no
 * colour at all) and from a dictionary code this card's dictionary does not carry — and a swatch
 * that paints an unknown colour black tells a lie the eye believes completely.
 */
export function Swatch({
  hex,
  size = 22,
  className,
  title,
}: {
  hex: string;
  size?: number;
  className?: string;
  title?: string;
}): JSX.Element {
  const value = (hex ?? '').trim();
  return (
    <span
      title={title}
      aria-hidden='true'
      className={cn('block shrink-0 border border-textColor', className)}
      style={
        value
          ? { width: size, height: size, background: value }
          : { width: size, height: size, ...PLACEHOLDER_SURFACE }
      }
    />
  );
}
