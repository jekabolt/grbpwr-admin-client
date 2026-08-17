import { useCallback, useEffect, useState } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import {
  resolveReaderFailure,
  shouldRetryWithoutRange,
  type ReaderFailure,
} from '../api/rpc-error';
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
  //
  // В try: текст уже прочитан и вернуть его надо в любом случае. Без этого сбой освобождения
  // (документ успели разрушить) поднялся бы по цепочке и погасил бы экран «ссылка истекла» —
  // на ровном месте, при полностью прочитанной странице.
  try {
    page.cleanup();
  } catch {
    /* документа уже нет — освобождать нечего */
  }
  return text;
}

export type PdfStatus = 'loading' | 'ready' | 'failed';

/**
 * ОТВЕТИЛО ЛИ ХРАНИЛИЩЕ ВООБЩЕ.
 *
 * Ошибка pdfjs на запрете CORS и на обрыве сети — одна и та же строка «Failed to fetch»: браузер
 * сознательно не рассказывает странице, чем именно ей не дали ответ. Но режим `no-cors` правил
 * CORS не проверяет — ответ приходит непрозрачным, читать его нечем, зато сам факт ответа виден.
 * Значит: resolve — хранилище на связи и вопрос в доступе, reject — до хранилища не дошли.
 *
 * HEAD, а не GET: подписан url под GET, и HEAD прилетит отказом подписи — но нам нужен ровно
 * факт ответа, а не его содержимое, и тащить ради него весь файл второй раз незачем.
 *
 * Идёт ТОЛЬКО по пути отказа: на успешном чтении лишних запросов не появляется.
 */
async function storageReachable(url: string, signal: AbortSignal): Promise<boolean | null> {
  try {
    await fetch(url, { mode: 'no-cors', method: 'HEAD', cache: 'no-store', signal });
    return true;
  } catch {
    // Отменили мы сами (ушли со страницы, сменили ссылку) — это не ответ про сеть.
    return signal.aborted ? null : false;
  }
}

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
  /**
   * ПОЧЕМУ не открылось — словами. Раньше здесь не было ничего, и экран на любой отказ писал
   * «ссылка истекла»: на не настроенный доступ к бакету, на обрыв сети, на повреждённый файл и
   * на файл, у которого ссылки просмотра не было вовсе. Из четырёх случаев фраза была верна в
   * одном, а действие подсказывала бесполезное во всех остальных.
   */
  failure: ReaderFailure | null;
}

/**
 * Держит открытый документ по ссылке. Смена `url` (обновили просроченную ссылку) перезагружает
 * документ, но НЕ трогает страницу и масштаб — их держит вызывающий, и в этом весь смысл
 * кнопки «обновить»: человек возвращается туда же, где читал.
 */
export function usePdfDocument(
  url: string | undefined,
  /** Срок ссылок, который назвал сервер: без него «истекла» — догадка, а не факт. */
  urlsExpireAt?: string | null,
): PdfDocumentState {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<PdfStatus>('loading');
  const [failure, setFailure] = useState<ReaderFailure | null>(null);
  const [sampleHasText, setSampleHasText] = useState(true);
  const [index, setIndex] = useState<PageText[] | null>(null);
  const [indexFailed, setIndexFailed] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [indexRequested, setIndexRequested] = useState(false);

  useEffect(() => {
    if (!url) {
      setStatus('failed');
      setFailure(resolveReaderFailure({ error: null, reachable: null, url: '' }));
      return;
    }
    let cancelled = false;
    setStatus('loading');
    setFailure(null);
    setIndex(null);
    // Явно, а не «оно само»: старый документ рушится в уборке этого же эффекта, и пока `doc`
    // на него показывает, рельс и страница держат мёртвый PDFDocumentProxy.
    setDoc(null);
    let task: PDFDocumentLoadingTask | null = null;
    const probe = new AbortController();

    (async () => {
      const pdfjs = await loadPdfjs();
      let loaded: PDFDocumentProxy;
      try {
        task = pdfjs.getDocument({ url });
        loaded = await task.promise;
      } catch (e) {
        if (cancelled) return;
        // ОДИН повтор без диапазонов — и только на том отказе, который диапазоны и дают
        // (см. shouldRetryWithoutRange). Не по умолчанию: без диапазонов первая страница
        // ждёт полной закачки, а на каталоге в сорок мегабайт это сорок мегабайт вместо
        // сотни килобайт. Платить эту цену на КАЖДОМ открытии ради случая, который здесь
        // ещё ни разу не наблюдался, — плохой размен.
        if (!shouldRetryWithoutRange(e)) throw e;
        task = pdfjs.getDocument({ url, disableRange: true });
        loaded = await task.promise;
      }
      if (cancelled) {
        loaded.destroy();
        return;
      }
      setDoc(loaded);
      setStatus('ready');

      // ПРОБА ТЕКСТА — В СВОЁМ try. Документ уже открыт и показан; сбой разбора его страниц
      // не имеет права переводить экран в отказ. Раньше он это делал: `.catch` внизу был один
      // на загрузку и на пробу, и полностью открытый документ сменялся плашкой «ссылка
      // истекла» — на ссылке, по которой он только что приехал целиком.
      try {
        const samples: string[] = [];
        const upto = Math.min(TEXT_LAYER_SAMPLE_PAGES, loaded.numPages);
        for (let n = 1; n <= upto; n++) {
          const text = (await pageTextOf(loaded, n)).text;
          if (cancelled) return;
          samples.push(text);
        }
        setSampleHasText(hasTextLayer(samples));
      } catch {
        // Текстового слоя не добыли — поиск об этом скажет сам. Документ читается.
      }
    })().catch(async (e) => {
      if (cancelled) return;
      // Проба идёт ЗДЕСЬ, а не в разборе: она сетевая и асинхронная, а разбор обязан
      // оставаться чистой функцией — иначе его нечем проверить.
      const reachable = await storageReachable(url, probe.signal);
      if (cancelled) return;
      setFailure(resolveReaderFailure({ error: e, reachable, url, urlsExpireAt }));
      setStatus('failed');
    });

    return () => {
      cancelled = true;
      probe.abort();
      // Рушим ЗАДАЧУ, а не документ: если ссылку обновили, пока файл ещё качается, документа
      // просто нет — и старая закачка вместе с разбором в воркере доедет до конца впустую.
      // destroy() задачи закрывает и её, и уже полученный из неё документ.
      void task?.destroy().catch(() => {});
    };
  }, [url, urlsExpireAt]);

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
    failure,
  };
}
