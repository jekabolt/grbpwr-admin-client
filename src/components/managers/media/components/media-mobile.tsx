import { cn } from 'lib/utility';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Sticky phone bar at the bottom of the viewport: `+ upload`, or the select-mode actions. */
export function MobileBottomBar({
  dark,
  children,
  onHeight,
}: {
  dark?: boolean;
  children: ReactNode;
  /** The bar's real height, safe-area padding included: what the date pill must stay above. */
  onHeight?: (height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const report = useRef(onHeight);
  report.current = onHeight;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => report.current?.(el.getBoundingClientRect().height);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={cn(
        'fixed inset-x-0 bottom-0 z-[var(--z-sticky)] flex items-center gap-2 border-t px-2.5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]',
        dark ? 'border-textColor bg-textColor text-bgColor' : 'border-borderColor bg-bgColor',
      )}
    >
      {children}
    </div>
  );
}
