/**
 * Поиск внутри pdf: текст страницы, совпадения и связь «текущее совпадение ↔ видимая страница».
 *
 * Здесь нет ни dom, ни pdfjs — сюда вынесено ровно то, что обязано быть доказуемо верным.
 * Главная величина — не сам поиск, а СИНХРОНИЗАЦИЯ: счётчик «N из M» ссылается на подсветку,
 * и если подсветка лежит на странице, которой сейчас нет на экране, счётчик врёт при первом же
 * взгляде — человек читает «3 из 5» и не видит ни одной жёлтой полосы.
 *
 * Проба: scripts/reader-find-probe.mjs.
 */

/** Кусок текста, как его отдаёт `page.getTextContent()`: строка + признак конца строки. */
export interface TextRun {
  str: string;
  hasEOL?: boolean;
}

export interface RunSpan {
  start: number;
  end: number;
}

export interface PageText {
  /** Склеенный текст страницы. Смещения в нём — единственная система координат поиска. */
  text: string;
  /** Диапазон каждого куска в `text`; индекс совпадает с индексом куска (и с textDivs pdfjs). */
  runs: RunSpan[];
}

/**
 * Склеивает куски в текст страницы.
 *
 * Перевод строки после `hasEOL` — СИНТЕТИЧЕСКИЙ символ: он не принадлежит ни одному куску,
 * и подсветка обязана его пропускать. Он нужен, потому что в pdf строка рвётся ровно там, где
 * человек напечатал пробел, и без него «состав и уход» не нашлось бы через перенос.
 */
export function buildPageText(runs: TextRun[]): PageText {
  let text = '';
  const spans: RunSpan[] = [];
  for (const run of runs) {
    const s = run.str ?? '';
    spans.push({ start: text.length, end: text.length + s.length });
    text += s;
    if (run.hasEOL) text += '\n';
  }
  return { text, runs: spans };
}

/**
 * Регэксп запроса. Пробелы внутри запроса становятся `\s+` по той же причине, что и выше:
 * в тексте страницы на этом месте может стоять перенос, а человек ищет фразу, а не строку.
 */
export function queryPattern(query: string): RegExp | null {
  const words = query.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(escaped.join('\\s+'), 'gi');
}

export interface Span {
  start: number;
  end: number;
}

export function findInText(text: string, query: string): Span[] {
  const re = queryPattern(query);
  if (!re) return [];
  const out: Span[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Совпадение нулевой длины сдвинуло бы lastIndex на ноль — вечный цикл.
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export interface Match extends Span {
  /** Номер страницы, 1-based — как его видит человек и как он подписан в рельсе. */
  page: number;
}

/** Совпадения по всему документу в порядке чтения. `texts[i]` — текст страницы `i + 1`. */
export function findAcrossPages(texts: string[], query: string): Match[] {
  const out: Match[] = [];
  texts.forEach((text, i) => {
    for (const span of findInText(text, query)) {
      out.push({ page: i + 1, start: span.start, end: span.end });
    }
  });
  return out;
}

/** Сколько совпадений на каждой странице — счётчики в рельсе. */
export function countsByPage(matches: Match[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const m of matches) out[m.page] = (out[m.page] ?? 0) + 1;
  return out;
}

/** Какие страницы сейчас на экране: одна или разворот «текущая + следующая». */
export function visiblePages(page: number, spread: boolean, total: number): number[] {
  if (total <= 0) return [];
  const p = Math.min(Math.max(1, Math.trunc(page)), total);
  if (!spread) return [p];
  return p + 1 <= total ? [p, p + 1] : [p];
}

/** Шаг листания: в развороте лист переворачивается через два, иначе через один. */
export function stepPage(page: number, spread: boolean, total: number, dir: 1 | -1): number {
  if (total <= 0) return 1;
  const by = spread ? 2 : 1;
  return Math.min(Math.max(1, Math.trunc(page) + dir * by), total);
}

/**
 * На какую страницу встать, чтобы показать совпадение `target`, не сломав разворот.
 *
 * Без этого ↓ и ‹/› расходятся: ‹/› честно листает через два и держит пары, а прыжок к
 * совпадению ставил бы страницу как есть — пары съезжали бы на одну, и уже показанная слева
 * страница уезжала бы с экрана без причины.
 */
export function pageForSpread(
  target: number,
  current: number,
  spread: boolean,
  total: number,
): number {
  if (total <= 0) return 1;
  const t = Math.min(Math.max(1, Math.trunc(target)), total);
  if (!spread) return t;
  // Уже видно — не двигаемся вовсе.
  if (visiblePages(current, true, total).includes(t)) return current;
  // Левая страница разворота держит чётность текущей — ту же, что задаёт stepPage.
  const aligned = (t - current) % 2 === 0 ? t : t - 1;
  return aligned >= 1 ? aligned : t;
}

export interface HitSync {
  /** Номер текущего совпадения, 1-based. 0 — совпадений нет вообще. */
  hit: number;
  /** Страница этого совпадения. 0 — совпадений нет. */
  page: number;
  /** Лежит ли текущее совпадение на видимой странице. */
  onScreen: boolean;
}

/**
 * Держит текущее совпадение на видимой странице.
 *
 * Три исхода, и третий — самый важный: если на видимых страницах совпадений НЕТ (человек
 * пролистал в сторону), подменять счётчик нечем. Тогда функция честно говорит `onScreen:false`
 * и называет страницу, где совпадение лежит, — интерфейс обязан показать это словами, а не
 * рисовать «3 из 5» рядом с пустым разворотом.
 */
export function syncHitToPages(matches: Match[], hit: number, pages: number[]): HitSync {
  if (!matches.length) return { hit: 0, page: 0, onScreen: false };
  const h = Math.min(Math.max(1, Math.trunc(hit) || 1), matches.length);
  const current = matches[h - 1];
  if (pages.includes(current.page)) return { hit: h, page: current.page, onScreen: true };
  const i = matches.findIndex((m) => pages.includes(m.page));
  if (i !== -1) return { hit: i + 1, page: matches[i].page, onScreen: true };
  return { hit: h, page: current.page, onScreen: false };
}

/** Страница, на которую надо перейти, чтобы увидеть совпадение `hit`. 0 — совпадений нет. */
export function pageOfHit(matches: Match[], hit: number): number {
  if (!matches.length) return 0;
  const h = Math.min(Math.max(1, Math.trunc(hit) || 1), matches.length);
  return matches[h - 1].page;
}

/** Следующее/предыдущее совпадение с закольцовкой: после последнего — первое. */
export function stepHit(count: number, hit: number, dir: 1 | -1): number {
  if (count <= 0) return 0;
  const h = Math.min(Math.max(1, Math.trunc(hit) || 1), count);
  if (dir === 1) return h >= count ? 1 : h + 1;
  return h <= 1 ? count : h - 1;
}

export interface RunSlice {
  /** Индекс куска (он же индекс textDivs pdfjs). */
  run: number;
  from: number;
  to: number;
}

/**
 * Раскладывает совпадение по кускам текста — по одному отрезку на кусок.
 *
 * Подсветка рисуется по отрезкам, а не одним Range через весь документ: между кусками лежат
 * синтетические переводы строк и служебная разметка pdfjs, и Range через них тянул бы
 * прямоугольники по пустому месту.
 */
export function sliceMatch(page: PageText, span: Span): RunSlice[] {
  const out: RunSlice[] = [];
  page.runs.forEach((run, i) => {
    if (run.start >= span.end || run.end <= span.start) return;
    const from = Math.max(0, span.start - run.start);
    const to = Math.min(run.end - run.start, span.end - run.start);
    if (to > from) out.push({ run: i, from, to });
  });
  return out;
}

/** Сколько первых страниц нюхаем, решая, есть ли в документе текстовый слой. */
export const TEXT_LAYER_SAMPLE_PAGES = 3;

/**
 * Есть ли текстовый слой. Скан и выгрузка «шрифты в кривых» дают пустые строки на всех
 * страницах — по ним поиск обязан сказать это словами, а не показать «0 совпадений».
 */
export function hasTextLayer(samples: string[]): boolean {
  return samples.some((s) => /\S/.test(s));
}

export const ZOOM_MIN = 50;
export const ZOOM_MAX = 200;
export const ZOOM_STEP = 25;

export function stepZoom(zoom: number, dir: 1 | -1): number {
  const snapped = Math.round(zoom / ZOOM_STEP) * ZOOM_STEP;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, snapped + dir * ZOOM_STEP));
}

/**
 * Читает ли читалка этот файл. Только pdf — и это НЕ временное ограничение:
 * `.md` уходит на экран заметки, а не сюда, и читалка про тот экран ничего не знает.
 */
export function isReadablePdf(fileName: string, contentType?: string): boolean {
  if ((contentType ?? '').toLowerCase().split(';')[0].trim() === 'application/pdf') return true;
  return fileName.toLowerCase().endsWith('.pdf');
}
