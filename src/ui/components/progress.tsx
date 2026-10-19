import { cn } from 'lib/utility';

/** Flat 4px completion rail. No radius, no animation beyond the width transition. */
export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      // twMerge, so a caller's height (a 2px rail) wins over the default 4px.
      className={cn('h-1 w-full bg-hairline', className)}
      role='progressbar'
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className='h-full bg-textColor transition-[width] duration-200 motion-reduce:transition-none'
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
