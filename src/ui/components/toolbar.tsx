import { cn } from 'lib/utility';
/**
 * The reference's `.bar`: a bordered strip holding controls — filters, actions,
 * a search field. `sticky` tints it so it reads as chrome rather than content.
 */
export function Toolbar({
  children,
  sticky,
  className,
}: {
  children: React.ReactNode;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 border border-borderColor px-2.5 py-2',
        sticky ? 'bg-bgSecondary' : 'bg-bgColor',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Pushes everything after it to the right edge of a Toolbar. */
export function ToolbarSpacer() {
  return <div className='ml-auto' />;
}
