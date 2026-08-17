import { useCallback, useEffect, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import {
  buildPageText,
  hasTextLayer,
  TEXT_LAYER_SAMPLE_PAGES,
  type PageText,
  type TextRun,
} from '../utils/reader-find';

/**
 * Загрузка pdf для читалки.
 *
 * pdfjs тянется динамическим импортом — как в utils/preview.ts. Большинство сессий читалку не
 * открывают вовсе, и полтора мегабайта разбора pdf в основном бандле платили бы все.
 */
let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

export function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      // Воркер лежит в пакете; import.meta.url даёт Vite отпечатать и раздать его самому —
      // CDN здесь запретил бы CSP.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** Куски текста страницы. Разметка (beginMarkedContent и прочее) приходит без `str` — она не текст. */
export function textRuns(items: unknown[]): TextRun[] {
  const out: TextRun[] = [];
  for (const item of items) {
    const it = item as { str?: unknown; hasEOL?: unknown };
    if (typeof it.str !== 'string') continue;
    out.push({ str: it.str, hasEOL: it.hasEOL === true });
  }
  return out;
}

export async function pageTextOf(doc: PDFDocumentProxy, pageNumber: number): Promise<PageText> {
  const page = await doc.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = buildPageText(textRuns(content.items));
  // Разобранную страницу отпускаем сразу: индекс по каталогу в триста страниц иначе держит в
  // памяти разбор всех трёхсот. cleanup() у страницы с идущим рендером — no-op, поэтому
  // читаемой прямо сейчас странице он не мешает.
  page.cleanup();
  return text;
}

export type PdfStatus = 'loading' | 'ready' | 'failed';

export interface PdfDocumentState {
  doc: PDFDocumentProxy | null;
  status: PdfStatus;
  numPages: number;
  /** Проба текстового слоя по первым страницам — чтобы сказать про скан ДО первого поиска. */
  sampleHasText: boolean;
  /** Текст всех страниц. Строится по требованию: он нужен только поиску. */
  index: PageText[] | null;
  /**
   * Разбор текста ОБОРВАЛСЯ. Третье состояние, без которого поиск врал: провал давал пустой
   * индекс, а пустой индекс на экране неотличим от «искали и не нашли» — человек читал «нет
   * совпадений» и делал вывод, что слова в документе нет.
   */
  indexFailed: boolean;
  indexing: boolean;
  buildIndex: () => void;
}

/**
 * Держит открытый документ по ссылке. Смена `url` (обновили просроченную ссылку) перезагружает
 * документ, но НЕ трогает страницу и масштаб — их держит вызывающий, и в этом весь смысл
 * кнопки «обновить»: человек возвращается туда же, где читал.
 */
export function usePdfDocument(url: string | undefined): PdfDocumentState {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<PdfStatus>('loading');
  const [sampleHasText, setSampleHasText] = useState(true);
  const [index, setIndex] = useState<PageText[] | null>(null);
  const [indexFailed, setIndexFailed] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexRequested, setIndexRequested] = useState(false);

  useEffect(() => {
    if (!url) {
      setStatus('failed');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setIndex(null);
    // Явно, а не «оно само»: старый документ рушится в уборке этого же эффекта, и пока `doc`
    // на него показывает, рельс и страница держат мёртвый PDFDocumentProxy.
    setDoc(null);
    let task: PDFDocumentLoadingTask | null = null;

    (async () => {
      const pdfjs = await loadPdfjs();
      task = pdfjs.getDocument({ url });
      const loaded = await task.promise;
      if (cancelled) {
        loaded.destroy();
        return;
      }
      setDoc(loaded);
      setStatus('ready');

      const samples: string[] = [];
      const upto = Math.min(TEXT_LAYER_SAMPLE_PAGES, loaded.numPages);
      for (let n = 1; n <= upto; n++) {
        const text = (await pageTextOf(loaded, n)).text;
        if (cancelled) return;
        samples.push(text);
      }
      setSampleHasText(hasTextLayer(samples));
    })().catch(() => {
      // Просроченная ссылка, отозванный доступ, сеть — с клиента они неразличимы, и
      // называть причину точнее, чем «ссылка не открылась», было бы выдумкой.
      if (!cancelled) setStatus('failed');
    });

    return () => {
      cancelled = true;
      // Рушим ЗАДАЧУ, а не документ: если ссылку обновили, пока файл ещё качается, документа
      // просто нет — и старая закачка вместе с разбором в воркере доедет до конца впустую.
      // destroy() задачи закрывает и её, и уже полученный из неё документ.
      void task?.destroy().catch(() => {});
    };
  }, [url]);

  // Индекс строится ровно один раз на документ и только когда его попросили: getTextContent по
  // трёхсотстраничному каталогу стоит секунд, а большинство открытий читалки — просто чтение.
  // Зависимости — только `doc` и «попросили ли»: положи сюда `indexing`, и уборка первого
  // прохода отменила бы его же, как только он выставит флаг. Индекс бы никогда не достроился.
  useEffect(() => {
    if (!doc || !indexRequested) return;
    let cancelled = false;
    setIndexing(true);
    setIndexFailed(false);
    (async () => {
      const pages: PageText[] = [];
      for (let n = 1; n <= doc.numPages; n++) {
        pages.push(await pageTextOf(doc, n));
        if (cancelled) return;
      }
      setIndex(pages);
      setSampleHasText(hasTextLayer(pages.map((p) => p.text)));
    })()
      .catch(() => {
        // Пустой индекс, а не отсутствие индекса: иначе поиск вечно показывал бы «читаем текст…».
        // Но пустой индекс сам по себе — ещё и «ничего не нашлось», поэтому провал ОБЪЯВЛЯЕТСЯ
        // отдельным флагом: два разных ответа не имеют права выглядеть одинаково.
        if (!cancelled) {
          setIndex([]);
          setIndexFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIndexing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, indexRequested]);

  const buildIndex = useCallback(() => setIndexRequested(true), []);

  return {
    doc,
    status,
    numPages: doc?.numPages ?? 0,
    sampleHasText,
    index,
    indexFailed,
    indexing,
    buildIndex,
  };
}
