import { cn } from 'lib/utility';

/** A strip's tile on the shelf and the tray: its BOM name and how many go in a garment. */
export function StripTileFace({
  name,
  qty,
  className,
}: {
  name: string;
  qty: number;
  className?: string;
}) {
  return (
    <span
      data-cut-strip-tile
      className={cn(
        'flex min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden px-0.5 text-micro font-bold leading-none text-textColor',
        className,
      )}
    >
      <span className='w-full truncate text-center'>{name}</span>
      <span>×{qty}</span>
    </span>
  );
}
