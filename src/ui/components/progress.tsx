/** Flat 4px completion rail. No radius, no animation beyond the width transition. */
export function Progress({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      className={`h-1 w-full bg-progressBg ${className ?? ''}`}
      role='progressbar'
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className='h-full bg-textColor transition-all' style={{ width: `${pct}%` }} />
    </div>
  );
}
