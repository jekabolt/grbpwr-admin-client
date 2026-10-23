import type { DragEventHandler, ReactNode } from 'react';
import { Button } from 'ui';
import { cn } from 'lib/utility';

const BASE =
  'flex w-full flex-col items-center justify-center gap-1 border border-dashed bg-bgColor px-2 text-center uppercase tracking-label';

export function PatternDropZone({
  interactive,
  active,
  disabled,
  className,
  children,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  interactive: boolean;
  active?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  onDragOver?: DragEventHandler<HTMLElement>;
  onDragLeave?: DragEventHandler<HTMLElement>;
  onDrop?: DragEventHandler<HTMLElement>;
}) {
  const classes = cn(
    BASE,
    active
      ? 'border-solid border-textColor bg-textColor text-bgColor'
      : disabled
        ? 'border-borderColor text-labelColor'
        : 'border-labelColor text-textColor hover:border-textColor',
    className,
  );
  const events = { onDragOver, onDragLeave, onDrop };

  return interactive ? (
    <Button
      type='button'
      variant='default'
      className={classes}
      disabled={disabled}
      onClick={onClick}
      {...events}
    >
      {children}
    </Button>
  ) : (
    <div className={classes} {...events}>
      {children}
    </div>
  );
}
