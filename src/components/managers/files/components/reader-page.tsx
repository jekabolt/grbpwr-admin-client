import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask, TextLayer } from 'pdfjs-dist';
import { cn } from 'lib/utility';
import Text from 'ui/components/text';
import { loadPdfjs, textRuns } from '../hooks/usePdfDocument';
import { buildPageText, sliceMatch, type PageText, type Span } from '../utils/reader-find';

/** Совпадение в координатах ЭТОЙ страницы плюс признак «оно сейчас выбрано». */
export interface PageHit extends Span {
  active: boolean;
}

/** Потолок отметок на одну страницу. Текущее совпадение сверх него рисуется всегда. */
const MAX_BOXES_PER_PAGE = 300;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  active: boolean;
}

/** Растр страницы + прозрачный текстовый слой поверх него + подсветка совпадений. */
export function ReaderPage({
  doc,
  pageNumber,
  zoom,
  hits,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  zoom: number;
  /** Обязан быть мемоизирован вызывающим: по нему пересчитывается подсветка. */
  hits: PageHit[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  // Текст и его span'ы живут в ref, а не в state: подсветка читает их синхронно, а перерисовку
  // запускает счётчик `layout` — так пересчёт подсветки не тянет за собой рендер страницы.
  const layoutRef = useRef<{ page: PageText; divs: HTMLElement[] } | null>(null);
  const [layout, setLayout] = useState(0);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [boxes, setBoxes] = useState<Box[]>([]);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    let textLayer: TextLayer | null = null;
    layoutRef.current = null;
    setBoxes([]);

    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const scale = zoom / 100;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const container = textRef.current;
      if (!canvas || !container) return;

      const w = Math.max(1, Math.floor(viewport.width));
      const h = Math.max(1, Math.floor(viewport.height));
      // Растр рисуется в плотности экрана, а раскладка остаётся в css-пикселях: без этого
      // страница на retina выглядит мыльной ровно там, где её читают — в мелком тексте.
      const density = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * density);
      canvas.height = Math.floor(h * density);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      setSize({ w, h });

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        renderTask = page.render({
          canvasContext: ctx,
          viewport,
          transform: density === 1 ? undefined : [density, 0, 0, density, 0, 0],
        });
        // Растр и текстовый слой строятся НЕЗАВИСИМО, и это не оптимизация. Ждать растр перед
        // текстом значило бы: страница, которая не отрисовалась, НИКОГДА не получит текстового
        // слоя — а счётчик всё равно считает на ней совпадения. Получилось бы «3 из 5» над
        // белым листом без единой отметки, и само по себе это уже не починится.
        renderTask.promise.catch(() => {});
      }

      container.replaceChildren();
      // Размеры слоя ставит сам pdfjs в конструкторе TextLayer (setLayerDimensions), причём
      // НЕПОВЁРНУТЫМИ величинами плюс атрибут data-main-rotation. Наши width/height здесь были
      // бы затёрты через две строки, поэтому их тут нет — доворот живёт в global.css.
      container.style.setProperty('--scale-factor', String(scale));
      const content = await page.getTextContent();
      if (cancelled) return;
      const pdfjs = await loadPdfjs();
      textLayer = new pdfjs.TextLayer({ textContentSource: content, container, viewport });
      await textLayer.render();
      if (cancelled) return;

      // pdfjs перестаёт создавать span'ы после своего потолка; обрезаем текст ровно по тому,
      // что реально легло в dom, иначе смещения разъедутся со span'ами.
      const runs = textRuns(content.items).slice(0, textLayer.textDivs.length);
      layoutRef.current = { page: buildPageText(runs), divs: textLayer.textDivs };
      setLayout((n) => n + 1);
    })().catch(() => {
      // Отменённый рендер приходит сюда же, что и настоящая ошибка страницы. Ни то, ни другое
      // не повод рушить читалку: страница просто останется белой.
    });

    return () => {
      cancelled = true;
      // Обновление просроченной ссылки рушит СТАРЫЙ документ раньше, чем размонтируется эта
      // страница, и отмена задачи уже мёртвого документа полетела бы исключением из уборки.
      try {
        renderTask?.cancel();
        textLayer?.cancel();
      } catch {
        /* документа уже нет — отменять нечего */
      }
    };
  }, [doc, pageNumber, zoom]);

  useEffect(() => {
    const state = layoutRef.current;
    const container = textRef.current;
    if (!state || !container || !hits.length) {
      setBoxes([]);
      return;
    }
    const base = container.getBoundingClientRect();
    const out: Box[] = [];
    for (const hit of hits) {
      // Однобуквенный запрос по плотной странице даёт тысячи отметок — рисовать их все значит
      // подвесить вкладку на каждом нажатии клавиши. Текущее совпадение рисуется ВСЕГДА:
      // счётчик считает совпадения, а не прямоугольники, и врать он от этого не начинает.
      if (!hit.active && out.length >= MAX_BOXES_PER_PAGE) continue;
      for (const slice of sliceMatch(state.page, hit)) {
        const node = state.divs[slice.run]?.firstChild;
        if (!node || node.nodeType !== Node.TEXT_NODE) continue;
        const range = document.createRange();
        try {
          range.setStart(node, slice.from);
          range.setEnd(node, slice.to);
        } catch {
          continue;
        }
        for (const r of Array.from(range.getClientRects())) {
          if (r.width <= 0 || r.height <= 0) continue;
          out.push({
            left: r.left - base.left,
            top: r.top - base.top,
            width: r.width,
            height: r.height,
            active: hit.active,
          });
        }
      }
    }
    setBoxes(out);
  }, [hits, layout]);

  // Текущее совпадение подтягивается в поле зрения. Прокрутка — единственная анимация экрана,
  // поэтому и единственное место, где спрашиваем про prefers-reduced-motion.
  const activeBox = boxes.find((b) => b.active);
  useLayoutEffect(() => {
    if (!activeBox || !activeRef.current) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    activeRef.current.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'center',
      inline: 'center',
    });
  }, [activeBox?.left, activeBox?.top]);

  return (
    <div
      className='relative shrink-0 border border-borderColor bg-bgColor'
      style={size ? { width: size.w, height: size.h } : undefined}
    >
      <canvas ref={canvasRef} className='block' />
      <div ref={textRef} className='pdf-text-layer' />
      <div className='pointer-events-none absolute inset-0'>
        {boxes.map((b, i) => (
          <div
            key={i}
            ref={b.active ? activeRef : undefined}
            className={cn(
              'absolute',
              b.active
                ? 'bg-textColor/30 outline-2 outline-textColor'
                : 'bg-textColor/12 outline-1 outline-labelColor',
            )}
            style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
          />
        ))}
      </div>
      {!size && (
        <div className='flex h-[520px] w-[380px] items-center justify-center'>
          <Text size='micro' variant='label'>
            рисуем страницу…
          </Text>
        </div>
      )}
    </div>
  );
}
