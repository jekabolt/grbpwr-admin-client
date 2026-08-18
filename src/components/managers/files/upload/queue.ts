/**
 * Очередь загрузки файлов — чистая машина состояний.
 *
 * Здесь нет ни dom, ни сети, ни react: только переходы. Причина в том, что очередь обязана
 * пережить уход на другой экран, а значит её состояние не может жить в компоненте — и если
 * оно живёт снаружи, единственный способ доказать, что оно верно, это прогнать переходы
 * без браузера. Драйвер (кто и когда зовёт сеть) — `engine.ts`, слова для человека —
 * `text.ts`, реальный XHR — `transport.ts`.
 *
 * Восемь исходов строки, все восемь одновременно бывают на экране:
 *
 *   wait — стоит в очереди, файлы уходят по одному;
 *   prev — браузер строит превью; это работа процессора, а не сети, и она идёт параллельно
 *          чужой отправке, но саму строку до готовности превью не отправляют;
 *   run  — идёт отправка, есть проценты;
 *   done — сервер принял, файл лежит в библиотеке;
 *   big  — больше предела; ОТРЕЗАН ДО ОТПРАВКИ, в сеть не уходит ни байта;
 *   dup  — сервер посчитал sha256 и сказал, что такое содержимое уже лежит; вскрывается
 *          ТОЛЬКО на 100%, потому что считает сервер, и заплатить трафиком приходится
 *          по-настоящему; это не ошибка — цвет нейтральный. Сервер дубликат НЕ отвергает:
 *          `sha256` в `library_file` — обычный индекс («duplicate hint now, dedup later»),
 *          файл сохраняется второй копией, и слова строки говорят именно это;
 *   lost — связь оборвалась (XHR onerror либо status 0): сервер файл НЕ получил;
 *   fail — сервер ответил кодом 4xx/5xx: запрос дошёл, файл не сохранён.
 *
 * lost и fail разведены намеренно: у них разные причины и разные тексты, хотя действие
 * одно — «повторить». Повтор ВСЕГДА начинается с нуля: докачки у multipart-потока нет, и
 * честный 0% лучше выдуманных 41%.
 *
 * Проба: scripts/upload-queue-probe.mjs.
 */

export type QueueStatus = 'wait' | 'prev' | 'run' | 'done' | 'big' | 'dup' | 'lost' | 'fail';

/**
 * Предел размера. Авторитет предела — сервер (роутер режет тело на 95 MiB); в браузере он
 * проверяется ДО отправки, чтобы 412 МБ не уезжали в сеть ради отказа. Значение здесь —
 * значение по умолчанию для машины; стор передаёт своё (`MAX_UPLOAD_BYTES` из filesService),
 * а проба сверяет, что эти два предела не разъехались.
 */
export const DEFAULT_MAX_UPLOAD_BYTES = 95 * 1024 * 1024;

/**
 * Файлы уходят по одному. Три параллельных отправки на домашнем канале делают медленнее
 * каждую и не заканчивают раньше; кроме того, последовательность делает очередь читаемой:
 * «идёт 1» — это одна строка с процентами, а не три ползунка вразнобой.
 */
export const UPLOAD_CONCURRENCY = 1;

/** Всё, что машине нужно знать о файле. `File` подходит структурно, подделка пробы — тоже. */
export interface UploadSource {
  readonly name: string;
  readonly size: number;
  readonly type: string;
}

/** Оригинал, найденный сервером по sha256. */
export interface DuplicateRef {
  id: number;
  name: string;
}

/**
 * Темы пачки. Одно правило на все три входа (кнопка, бросок, ⌘V): пачка наследует ВСЕ
 * выбранные чипы холста; при пустом выборе файлы уезжают в «разобрать» — это нормальный
 * ход, а не ошибка.
 */
export interface BatchTopics {
  topicIds: number[];
  newTopics: string[];
}

export interface QueueFailure {
  kind: 'lost' | 'fail';
  /** 0 — сеть оборвалась и статуса нет вовсе. */
  status: number;
  /** Технический текст сервера; человеку показывают слова из `text.ts`, не это. */
  message: string;
}

export interface QueueRow {
  /** Клиентский id строки. Серверный id файла появляется только в `fileId` и только у done. */
  id: string;
  /** Имя, под которым файл уедет. Правится до отправки (⌘V-модалка). */
  name: string;
  size: number;
  contentType: string;
  status: QueueStatus;
  /** Доля отправленного, 0..1. У big всегда 0, у done/dup всегда 1. */
  progress: number;
  /** Сколько раз НАЧИНАЛИ отправку. Первая попытка — 1, после «повторить» — 2. */
  tries: number;
  /** Темы, унаследованные от холста в момент постановки в очередь. */
  topicIds: number[];
  newTopics: string[];
  /** Превью построено браузером и уедет третьей частью multipart. */
  hasPreview: boolean;
  fileId?: number;
  /** У dup — тот файл, что уже лежит: «показать тот файл» и «дать ему темы» про него. */
  duplicateOf?: DuplicateRef;
  failure?: QueueFailure;
}

export interface QueueState {
  rows: QueueRow[];
  /** Счётчик выданных id. В состоянии, а не в модуле, — чтобы машина оставалась чистой. */
  seq: number;
}

export function createQueue(): QueueState {
  return { rows: [], seq: 0 };
}

export type QueueEvent =
  | { type: 'enqueue'; sources: UploadSource[]; topics: BatchTopics; cap: number }
  | { type: 'preview'; id: string; ok: boolean }
  | { type: 'start'; id: string }
  | { type: 'progress'; id: string; fraction: number }
  | { type: 'uploaded'; id: string; fileId: number; duplicates: DuplicateRef[] }
  | { type: 'failed'; id: string; status: number; message: string }
  | { type: 'retry'; id: string }
  | { type: 'retryAll' }
  | { type: 'remove'; id: string }
  | { type: 'removeSettled' }
  | { type: 'rename'; id: string; name: string }
  | { type: 'setTopics'; id: string; topicIds: number[]; newTopics: string[] };

/* ── классификация ────────────────────────────────────────────────────────────────────── */

/** Очередь ещё работает: эти строки нельзя ни спрятать, ни бросить молча. */
export function isLive(status: QueueStatus): boolean {
  return status === 'wait' || status === 'prev' || status === 'run';
}

/** Дело кончено и переигрывать нечего. Отказы сюда НЕ входят — их повторяют. */
export function isSettled(status: QueueStatus): boolean {
  return status === 'done' || status === 'dup' || status === 'big';
}

/** Не ушло, но может уйти: обрыв связи и отказ сервера. */
export function isFailed(status: QueueStatus): boolean {
  return status === 'lost' || status === 'fail';
}

/**
 * Обрыв или отказ. Единственный признак — есть ли у ответа код: XHR при обрыве связи и при
 * отмене отдаёт status 0, сервер при любом исходе отдаёт код. Смешивать их нельзя: при
 * обрыве файла на сервере нет вовсе, при отказе он мог быть отвергнут по существу.
 */
export function failureKind(status: number): 'lost' | 'fail' {
  return status > 0 ? 'fail' : 'lost';
}

/**
 * ОТКАЗЫ, КОТОРЫЕ ПОВТОР НЕ ЛЕЧИТ, — и потому «повторить» им не предлагают.
 *
 * Истёкшая сессия посреди пачки из сорока файлов даёт сорок одинаковых строк, и «повторить
 * все» долбит 401 столько раз, сколько по ней нажмут. Права и предел размера ведут себя так
 * же: ответ будет тем же самым, а человеку нужно СДЕЛАТЬ другое — войти заново, попросить
 * право, разбить файл. Слова здесь те же, что у сервисного модуля (`api/filesService.ts`).
 */
export function hopelessReason(status?: number): string | null {
  switch (status) {
    case 401:
      return 'the session expired';
    case 403:
      return 'no files:write right';
    case 413:
      return 'over the server limit';
    default:
      return null;
  }
}

/** Отказ, который имеет смысл повторить: связь и всё, что не безнадёжно по существу. */
export function canRetry(row: QueueRow): boolean {
  return isFailed(row.status) && hopelessReason(row.failure?.status) === null;
}

/**
 * Превью «бывает» у картинок и pdf — их рисует браузер (`utils/preview.ts`). У всего
 * остального превью не будет никогда, и строка сразу встаёт в очередь: спиннер там был бы
 * враньём, а не ожиданием.
 */
export function expectsPreview(source: UploadSource): boolean {
  const type = (source.type || '').toLowerCase();
  if (type.startsWith('image/')) return true;
  if (type === 'application/pdf') return true;
  return source.name.toLowerCase().endsWith('.pdf');
}

export function classifySize(size: number, cap: number): 'big' | 'ok' {
  return size > cap ? 'big' : 'ok';
}

/**
 * Приводит выбор холста к темам пачки: пустое и отрицательное выкидывается, повторы
 * схлопываются, имена новых тем сравниваются без учёта регистра (тот же довод, что у
 * словаря тем на сервере: «Съёмка» и «съёмка» — одна тема).
 */
export function inheritTopics(
  topicIds: readonly number[],
  newTopics: readonly string[],
): BatchTopics {
  const ids: number[] = [];
  for (const raw of topicIds) {
    const id = Number(raw);
    if (!Number.isFinite(id) || id <= 0 || ids.includes(id)) continue;
    ids.push(id);
  }
  const names: string[] = [];
  for (const raw of newTopics) {
    const name = (raw ?? '').trim();
    if (!name) continue;
    if (names.some((n) => n.toLowerCase() === name.toLowerCase())) continue;
    names.push(name);
  }
  return { topicIds: ids, newTopics: names };
}

/** Пачка без тем уедет в «разобрать». */
export function isUnsorted(topics: BatchTopics): boolean {
  return topics.topicIds.length === 0 && topics.newTopics.length === 0;
}

/* ── переходы ─────────────────────────────────────────────────────────────────────────── */

function withRow(
  state: QueueState,
  id: string,
  fn: (row: QueueRow) => QueueRow | null,
): QueueState {
  const i = state.rows.findIndex((r) => r.id === id);
  if (i < 0) return state; // строку уже убрали — событие опоздало, это норма
  const next = fn(state.rows[i]);
  if (!next) return state; // переход незаконен из этого состояния — тихо игнорируем
  const rows = state.rows.slice();
  rows[i] = next;
  return { ...state, rows };
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Единственный способ изменить очередь. Незаконный переход не бросает исключение и не пишет
 * в лог — он не меняет состояние: события приходят из асинхронных хвостов (progress отменённой
 * строки, ответ на уже убранную), и падать на них было бы хуже, чем их пережить.
 */
export function reduce(state: QueueState, e: QueueEvent): QueueState {
  switch (e.type) {
    case 'enqueue': {
      const topics = inheritTopics(e.topics.topicIds, e.topics.newTopics);
      const added = e.sources.map((source, i) => {
        const big = classifySize(source.size, e.cap) === 'big';
        const row: QueueRow = {
          id: `q${state.seq + i + 1}`,
          // Имя берётся БУКВАЛЬНО. Диалог загрузки причёсывал его (`tidyFileName`), но там
          // причёсанное имя стояло в поле ввода и человек видел, что с ним сделали. В полосе
          // поля нет: молчаливое «IMG_4821.jpg» → «IMG.jpg» (числовой хвост съедается как
          // «_2» копии) сделало бы файл ненаходимым, и никто бы этого не заметил. Правку
          // имени предлагает ⌘V-модалка — там она видна.
          name: source.name,
          size: source.size,
          contentType: source.type || '',
          status: big ? 'big' : expectsPreview(source) ? 'prev' : 'wait',
          progress: 0,
          tries: 0,
          topicIds: topics.topicIds.slice(),
          newTopics: topics.newTopics.slice(),
          hasPreview: false,
        };
        return row;
      });
      return { rows: [...state.rows, ...added], seq: state.seq + e.sources.length };
    }
    case 'preview':
      return withRow(state, e.id, (r) =>
        r.status === 'prev' ? { ...r, status: 'wait', hasPreview: e.ok } : null,
      );
    case 'start':
      return withRow(state, e.id, (r) =>
        r.status === 'wait' ? { ...r, status: 'run', progress: 0, tries: r.tries + 1 } : null,
      );
    case 'progress':
      return withRow(state, e.id, (r) =>
        r.status === 'run' ? { ...r, progress: clamp01(e.fraction) } : null,
      );
    case 'uploaded':
      return withRow(state, e.id, (r) => {
        if (r.status !== 'run') return null;
        const dup = e.duplicates?.[0];
        // Ровно 1: и done, и dup — это «файл ушёл целиком». Дубликат раньше 100% невозможен
        // по построению, потому что sha256 считает сервер.
        const landed = { ...r, progress: 1, fileId: e.fileId, failure: undefined };
        return dup
          ? { ...landed, status: 'dup' as const, duplicateOf: dup }
          : { ...landed, status: 'done' as const };
      });
    case 'failed':
      return withRow(state, e.id, (r) => {
        if (r.status !== 'run') return null;
        const kind = failureKind(e.status);
        // Проценты НЕ обнуляются: «обрыв на 41%» — это факт, который человек видел своими
        // глазами. Обнуляет их «повторить», и обнуляет честно.
        return { ...r, status: kind, failure: { kind, status: e.status, message: e.message } };
      });
    case 'retry':
      return withRow(state, e.id, (r) =>
        canRetry(r) ? { ...r, status: 'wait', progress: 0, failure: undefined } : null,
      );
    case 'retryAll': {
      // Безнадёжные отказы «повторить все» НЕ трогает: сорок 401 после истёкшей сессии
      // уехали бы в сеть заново и вернулись бы теми же сорока 401.
      if (!state.rows.some(canRetry)) return state;
      return {
        ...state,
        rows: state.rows.map((r) =>
          canRetry(r) ? { ...r, status: 'wait', progress: 0, failure: undefined } : r,
        ),
      };
    }
    case 'remove': {
      const rows = state.rows.filter((r) => r.id !== e.id);
      return rows.length === state.rows.length ? state : { ...state, rows };
    }
    case 'removeSettled': {
      const rows = state.rows.filter((r) => !isSettled(r.status));
      return rows.length === state.rows.length ? state : { ...state, rows };
    }
    case 'rename':
      return withRow(state, e.id, (r) => {
        if (r.status !== 'wait' && r.status !== 'prev') return null; // ушедшее не переименовать
        const name = e.name.trim();
        return name ? { ...r, name } : null;
      });
    case 'setTopics':
      return withRow(state, e.id, (r) => {
        if (r.status !== 'wait' && r.status !== 'prev') return null;
        const topics = inheritTopics(e.topicIds, e.newTopics);
        return { ...r, topicIds: topics.topicIds, newTopics: topics.newTopics };
      });
    default:
      return state;
  }
}

/* ── выборки ──────────────────────────────────────────────────────────────────────────── */

export interface QueueTally {
  all: number;
  wait: number;
  prev: number;
  run: number;
  done: number;
  big: number;
  dup: number;
  lost: number;
  fail: number;
  /** Строки, ради которых полосу нельзя убрать с глаз. */
  live: number;
  /** Сколько строк можно отправить прямо сейчас (включая повторяемые). */
  sendable: number;
  /** Отказы, которые повтор может вылечить. Число в кнопке «повторить все». */
  retryable: number;
  /** Файл у сервера: и `done`, и `dup` — дубликат сохранён второй копией, а не отвергнут. */
  landed: number;
  /** Сколько строк вообще уходило в сеть: всё, кроме отрезанных по размеру. */
  attempted: number;
}

export function tally(state: QueueState): QueueTally {
  const n = (s: QueueStatus) => state.rows.filter((r) => r.status === s).length;
  const t: QueueTally = {
    all: state.rows.length,
    wait: n('wait'),
    prev: n('prev'),
    run: n('run'),
    done: n('done'),
    big: n('big'),
    dup: n('dup'),
    lost: n('lost'),
    fail: n('fail'),
    live: 0,
    sendable: 0,
    retryable: 0,
    landed: 0,
    attempted: 0,
  };
  t.live = t.wait + t.prev + t.run;
  t.sendable = t.wait + t.lost + t.fail;
  t.retryable = state.rows.filter(canRetry).length;
  // ОДНА ПАРА ЧИСЕЛ НА ВЕСЬ МОДУЛЬ. И свёрнутая полоса, и итоговый тост считают этими двумя
  // величинами, потому что человек видит обе строки за одну минуту и разойтись им нельзя.
  t.landed = t.done + t.dup;
  t.attempted = t.all - t.big;
  return t;
}

/** Очередь в покое: ничего не едет и ничего не готовится. */
export function isQueueSettled(state: QueueState): boolean {
  return !state.rows.some((r) => isLive(r.status));
}

/** «Убрать» полосу заблокировано, пока идёт отправка: прятать нечего, но потерять — можно. */
export function canHideBar(state: QueueState): boolean {
  return isQueueSettled(state);
}

/** Есть ли живая отправка — для beforeunload-стража. */
export function hasLiveUploads(state: QueueState): boolean {
  return !isQueueSettled(state);
}

/**
 * Следующая строка на отправку — первая в очереди, и только если сеть свободна.
 * Порядок строк = порядок постановки: человек бросил файлы в известном ему порядке.
 */
export function nextToSend(state: QueueState, concurrency = UPLOAD_CONCURRENCY): QueueRow | null {
  const running = state.rows.filter((r) => r.status === 'run').length;
  if (running >= concurrency) return null;
  return state.rows.find((r) => r.status === 'wait') ?? null;
}

/**
 * Сколько превью строится ОДНОВРЕМЕННО. Одно: разбор pdf тяжёлый, и десять параллельных
 * pdfjs-задач кладут вкладку колом.
 */
export const PREVIEW_CONCURRENCY = 1;

/**
 * Следующая строка на построение превью. Канал превью свой: pdfjs рисует первую страницу,
 * пока сеть занята чужим файлом.
 *
 * ЗАНЯТОСТЬ СЧИТАЕТСЯ ПО МНОЖЕСТВУ РАБОТ, а не по пересечению с рядами очереди. Разница
 * видна ровно при отмене: строка из очереди исчезает мгновенно, а её рендер продолжает
 * крутиться — pdfjs отменять не умеет. Пока занятость мерили строками, каждая отмена
 * «освобождала» канал под новый разбор: замерено 3 pdf → 1 рендер, после отмены первой → 2
 * параллельных, после второй → 3. Десять тяжёлых pdf и пять отмен подряд — и вкладка встаёт.
 */
export function nextToPreview(state: QueueState, busy: ReadonlySet<string>): QueueRow | null {
  if (busy.size >= PREVIEW_CONCURRENCY) return null;
  return state.rows.find((r) => r.status === 'prev' && !busy.has(r.id)) ?? null;
}

export type QueueAction = 'cancel' | 'dismiss' | 'retry' | 'reveal' | 'assignTopics';

/**
 * Действия строки — ровно те, что осмысленны в её состоянии.
 *
 * `dup` несёт три: «убрать», «показать тот файл» (карточка оригинала) и «дать ему темы» —
 * темы пачки дописываются существующему файлу (`AssignLibraryFileTopics`, семантика
 * дописывающая). Ради этого строка и хранит `topicIds`/`newTopics` после отправки.
 *
 * У `lost`/`fail` — «повторить», и только пока повтор что-то меняет: 401, 403 и 413 вернут
 * ровно тот же ответ, поэтому им остаётся «убрать», а слова строки говорят, что делать
 * вместо повтора.
 */
export function rowActions(row: QueueRow): QueueAction[] {
  switch (row.status) {
    case 'wait':
    case 'prev':
    case 'run':
      return ['cancel'];
    case 'big':
    case 'done':
      return ['dismiss'];
    case 'dup':
      return ['reveal', 'assignTopics', 'dismiss'];
    case 'lost':
    case 'fail':
      return canRetry(row) ? ['retry'] : ['dismiss'];
    default:
      return [];
  }
}

/** Заполнение полоски строки, 0..1. big — ноль: в сеть не ушло ни байта. */
export function barFraction(row: QueueRow): number {
  if (row.status === 'big') return 0;
  if (row.status === 'done' || row.status === 'dup') return 1;
  return row.progress;
}
