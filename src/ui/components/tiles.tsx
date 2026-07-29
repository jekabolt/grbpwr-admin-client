import Text from 'ui/components/text';
import { cn } from 'lib/utility';

/** Auto-filling grid of small cards. Used for anything picked by looking at it. */
export function Tiles({
  children,
  min = 96,
  className,
}: {
  children: React.ReactNode;
  min?: number;
  className?: string;
}) {
  return (
    <div
      className={`grid gap-2 ${className ?? ''}`}
      style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function Tile({
  media,
  name,
  sub,
  selected,
  dashed,
  tone,
  onClick,
  className,
  children,
}: {
  media?: React.ReactNode;
  name?: React.ReactNode;
  sub?: React.ReactNode;
  selected?: boolean;
  dashed?: boolean;
  tone?: 'default' | 'error';
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'block bg-bgColor p-1.5 text-left',
        // Weight carries selection, colour carries health — so a tile can be both.
        selected ? 'border-2' : 'border',
        dashed ? 'border-dashed' : '',
        tone === 'error' ? 'border-error' : selected ? 'border-textColor' : 'border-borderColor',
        onClick ? 'hover:border-textColor' : '',
        className,
      )}
    >
      {media}
      {name && (
        <Text size='micro' className='mt-1 truncate font-bold uppercase'>
          {name}
        </Text>
      )}
      {sub && (
        <Text size='micro' variant='label' className='truncate'>
          {sub}
        </Text>
      )}
      {children}
    </Component>
  );
}
