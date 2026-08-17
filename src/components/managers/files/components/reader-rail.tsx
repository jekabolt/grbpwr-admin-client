import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { cn } from 'lib/utility';

/** Ширина миниатюры в css-пикселях. Меньше — и разворот уже не отличить от одной страницы. */
const THUMB_WIDTH = 76;

/**
 * Рельс страниц. Счётчик совпадений на миниатюре — не украшение: без него человек знает, что
 * совпадений пять, но не знает, куда листать, и листает подряд.
 */
export function ReaderRail({
  doc,
  numPages,
  current,
  visible,
  counts,
  onPick,
}: {
  doc: PDFDocumentProxy;
  numPages: number;
  current: number;
  /** Все страницы, которые сейчас на экране (в развороте их две). */
  visible: number[];
  counts: Record<number, number>;
  onPick: (page: number) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const el = currentRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }, [current]);

  return (
    <div
      ref={railRef}
      className='flex w-[100px] shrink-0 flex-col overflow-y-auto border border-borderColor bg-bgColor'
    >
      {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          ref={n === current ? currentRef : undefined}
          type='button'
          aria-pressed={visible.includes(n)}
          aria-label={`страница ${n}`}
          onClick={() => onPick(n)}
          className={cn(
            'flex flex-col items-center gap-1 border-b border-hairline p-1.5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-textColor',
            visible.includes(n) ? 'bg-textColor' : 'hover:bg-bgZebra',
          )}
        >
          <ReaderThumb doc={doc} pageNumber={n} />
          <span
            className={cn(
              'flex items-center gap-1 text-nano tabular-nums',
              visible.includes(n) ? 'text-bgColor' : 'text-labelColor',
            )}
          >
            {n}
            {counts[n] ? (
              <span
                className={cn(
                  'px-1 text-nano tabular-nums',
                  visible.includes(n) ? 'bg-bgColor text-textColor' : 'bg-textColor text-bgColor',
                )}
              >
                {counts[n]}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Миниатюра рисуется, только когда доезжает до глаз. Разворачивать триста страниц в растр
 * при открытии — это секунды на пустом месте: рельс почти всегда прокручивают на десяток.
 */
function ReaderThumb({ doc, pageNumber }: { doc: PDFDocumentProxy; pageNumber: number }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = holderRef.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  useEffect(() => {
    if (!seen) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: THUMB_WIDTH / base.width });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      task = page.render({ canvasContext: ctx, viewport });
      await task.promise;
    })().catch(() => {
      // Не нарисовалась — остаётся белый прямоугольник нужного размера. Рельс от этого не ломается.
    });
    return () => {
      cancelled = true;
      try {
        task?.cancel();
      } catch {
        /* документ уже разрушен — отменять нечего */
      }
    };
  }, [doc, pageNumber, seen]);

  return (
    // min-h держит место до отрисовки: без него нерисованные миниатюры схлопываются в нить,
    // весь рельс умещается в экран, и IntersectionObserver разом просит все триста страниц.
    <div ref={holderRef} className='min-h-[96px] w-[76px] border border-borderColor bg-bgColor'>
      <canvas ref={canvasRef} className='block w-full' />
    </div>
  );
}
