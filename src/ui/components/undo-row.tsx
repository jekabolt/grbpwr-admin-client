import { cn } from 'lib/utility';
import { useEffect, useRef, useState } from 'react';

interface UndoRowProps {
  /** What was removed; drawn struck and faded. */
  name: React.ReactNode;
  /** Undo clicked: put the row back. */
  onUndo: () => void;
  /** Time ran out: make the delete final. */
  onCommit: () => void;
  /** How long undo stays offered. */
  ms?: number;
  /** `div` for grid / flex lists (spans every grid column), `li` inside a list. */
  as?: 'div' | 'li';
  /** Inside a table: renders `<tr><td colSpan>` instead. */
  colSpan?: number;
  /** Match the replaced row's height here when it is not the default 32px. */
  className?: string;
}

/**
 * A table wider than its scroll box would push `undo` past the right edge: the ghost is pinned
 * to the left of the scroll box and sized to its visible width.
 */
function StickyCell({ className, children }: { className: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>();

  useEffect(() => {
    let box = ref.current?.parentElement ?? null;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowX)) box = box.parentElement;
    if (!box) return;
    const scroller = box;
    const measure = () => setWidth(scroller.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn(className, 'sticky left-0')} style={{ width }}>
      {children}
    </div>
  );
}

/**
 * Ghost row that stands in for a deleted row: struck name + underlined `undo`, a 1px ink rule
 * depleting along the bottom. Undo calls `onUndo`; the timeout calls `onCommit`. Exactly one fires.
 */
export function UndoRow({
  name,
  onUndo,
  onCommit,
  ms = 5000,
  as = 'div',
  colSpan,
  className,
}: UndoRowProps) {
  const settled = useRef(false);
  const cbs = useRef({ onUndo, onCommit });
  cbs.current = { onUndo, onCommit };
  const btn = useRef<HTMLButtonElement>(null);
  const [run, setRun] = useState(false);

  useEffect(() => {
    // The deleted row took focus with it: hand it to undo so the keyboard is not lost.
    if (document.activeElement === document.body) btn.current?.focus({ preventScroll: true });
    const raf = requestAnimationFrame(() => setRun(true));
    const t = setTimeout(() => {
      if (settled.current) return;
      settled.current = true;
      cbs.current.onCommit();
    }, ms);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [ms]);

  const undo = () => {
    if (settled.current) return;
    settled.current = true;
    cbs.current.onUndo();
  };

  const body = (
    <>
      <s className='min-w-0 flex-1 truncate'>{name}</s>
      <button
        ref={btn}
        type='button'
        onClick={undo}
        className='px-1.5 py-1 text-micro uppercase tracking-label text-textColor underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
      >
        undo
      </button>
      <i
        aria-hidden
        className='pointer-events-none absolute inset-x-0 -bottom-px h-px origin-left bg-textColor motion-reduce:hidden'
        style={{
          transform: run ? 'scaleX(0)' : 'scaleX(1)',
          transition: run ? `transform ${ms}ms linear` : 'none',
        }}
      />
    </>
  );

  const skin =
    'relative flex min-h-8 items-center gap-2.5 border-b border-hairline text-labelColor';

  if (colSpan !== undefined) {
    return (
      <tr>
        <td colSpan={colSpan} className='p-0'>
          <StickyCell className={cn(skin, className)}>{body}</StickyCell>
        </td>
      </tr>
    );
  }
  const Tag = as;
  return <Tag className={cn(skin, 'col-span-full', className)}>{body}</Tag>;
}
