/**
 * Драйвер очереди: кто и когда зовёт сеть.
 *
 * Транспорт — ИНЪЕКТИРУЕМАЯ зависимость, а не импорт. Ровно из-за этого проба гоняет
 * настоящую машину (пуск, проценты, обрыв, повтор, отмена) на подделке, без браузера:
 * доказывать переходы кликами по бете нельзя — половина исходов там не воспроизводится
 * по требованию.
 *
 * Драйвер сам не хранит правил: любое изменение состояния проходит через `reduce` из
 * `queue.ts`. Здесь живут только побочные эффекты — таймлайн вызовов, отмена и
 * непереносимые в состояние вещи: сами файлы, построенные превью и AbortController'ы.
 */
import {
  DEFAULT_MAX_UPLOAD_BYTES,
  UPLOAD_CONCURRENCY,
  createQueue,
  nextToPreview,
  nextToSend,
  reduce,
  type BatchTopics,
  type DuplicateRef,
  type QueueEvent,
  type QueueState,
  type UploadSource,
} from './queue';

export interface UploadRequest<S, P> {
  source: S;
  /** Имя, под которым файл ляжет в библиотеку (могли поправить до отправки). */
  name: string;
  /** Превью, построенное браузером; уезжает третьей частью multipart. */
  preview: P | null;
  topicIds: number[];
  newTopics: string[];
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}

export interface UploadOutcome {
  fileId: number;
  /** Непусто — сервер посчитал sha256 и нашёл то же содержимое. */
  duplicates: DuplicateRef[];
}

export interface UploadTransport<S, P> {
  /** Никогда не отказывает по существу: файл без превью полностью годен. */
  buildPreview(source: S): Promise<P | null>;
  upload(req: UploadRequest<S, P>): Promise<UploadOutcome>;
}

/**
 * Отказ с кодом ответа. Код — единственное, чем обрыв связи отличается от отказа сервера,
 * поэтому транспорт обязан его донести: текст сообщения для этого не годится.
 */
export class UploadError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'UploadError';
    this.status = status;
  }
}

/** Код ответа из чего угодно, что прилетело в catch. Нет кода — считаем обрывом связи. */
export function statusOf(err: unknown): number {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === 'number' && Number.isFinite(status) ? status : 0;
}

export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'не удалось загрузить';
}

export interface EngineOptions<S extends UploadSource, P> {
  transport: UploadTransport<S, P>;
  /** Предел размера; строка тяжелее него становится `big` и в сеть не уходит. */
  cap?: number;
  concurrency?: number;
  /** Зовётся после КАЖДОГО изменения состояния — на нём висит стор. */
  onChange?: (state: QueueState) => void;
}

export interface UploadEngine<S extends UploadSource> {
  state(): QueueState;
  /** Ставит пачку в очередь с темами холста; возвращает id созданных строк. */
  enqueue(sources: S[], topics: BatchTopics): string[];
  /** Отмена живой строки: обрывает XHR и убирает строку. */
  cancel(id: string): void;
  /** Убрать отстоявшуюся строку с глаз. */
  dismiss(id: string): void;
  retry(id: string): void;
  retryAll(): void;
  rename(id: string, name: string): void;
  setTopics(id: string, topicIds: number[], newTopics: string[]): void;
  clearSettled(): void;
  /** Сброс очереди целиком: всё живое обрывается. */
  reset(): void;
}

export function createUploadEngine<S extends UploadSource, P>(
  options: EngineOptions<S, P>,
): UploadEngine<S> {
  const cap = options.cap ?? DEFAULT_MAX_UPLOAD_BYTES;
  const concurrency = options.concurrency ?? UPLOAD_CONCURRENCY;
  const { transport, onChange } = options;

  let state = createQueue();
  const sources = new Map<string, S>();
  const previews = new Map<string, P | null>();
  const aborts = new Map<string, AbortController>();
  const previewing = new Set<string>();

  /** Меняет состояние и уведомляет; насос не трогает. */
  function apply(event: QueueEvent): void {
    const next = reduce(state, event);
    if (next === state) return;
    state = next;
    onChange?.(state);
  }

  function dispatch(event: QueueEvent): void {
    apply(event);
    pump();
  }

  function forget(id: string): void {
    sources.delete(id);
    previews.delete(id);
    previewing.delete(id);
    aborts.delete(id);
  }

  function startPreview(id: string): void {
    // Помечаем занятым ПЕРВЫМ действием: иначе строка без исходника вернулась бы в насос
    // тем же кандидатом и закрутила бы его вхолостую.
    previewing.add(id);
    const source = sources.get(id);
    if (!source) {
      previewing.delete(id);
      apply({ type: 'remove', id });
      return;
    }
    const finish = (preview: P | null) => {
      previews.set(id, preview);
      previewing.delete(id);
      dispatch({ type: 'preview', id, ok: Boolean(preview) });
    };
    transport.buildPreview(source).then(
      (preview) => finish(preview ?? null),
      // Превью — best-effort: провал рендера (шифрованный pdf, экзотический профиль) не имеет
      // права остановить отправку файла, который в остальном годен.
      () => finish(null),
    );
  }

  function startSend(id: string): void {
    const source = sources.get(id);
    if (!source) {
      apply({ type: 'remove', id });
      return;
    }
    const controller = new AbortController();
    aborts.set(id, controller);
    apply({ type: 'start', id });
    // Имя и темы читаются ПОСЛЕ перехода в `run`: править их можно было вплоть до этого мига.
    const row = state.rows.find((r) => r.id === id);
    if (!row) return;
    transport
      .upload({
        source,
        name: row.name,
        preview: previews.get(id) ?? null,
        topicIds: row.topicIds.slice(),
        newTopics: row.newTopics.slice(),
        onProgress: (fraction) => dispatch({ type: 'progress', id, fraction }),
        signal: controller.signal,
      })
      .then(
        (outcome) => {
          aborts.delete(id);
          dispatch({
            type: 'uploaded',
            id,
            fileId: outcome.fileId,
            duplicates: outcome.duplicates ?? [],
          });
        },
        (err: unknown) => {
          aborts.delete(id);
          // Отмена — не отказ: строки уже нет, и рисовать по ней «обрыв» значило бы врать.
          if (controller.signal.aborted) return;
          dispatch({ type: 'failed', id, status: statusOf(err), message: messageOf(err) });
        },
      );
  }

  let pumping = false;

  /**
   * Двигает оба канала: превью (процессор) и отправку (сеть). Каналы независимы — pdfjs
   * рисует первую страницу, пока по сети едет чужой файл, — но строка не уезжает раньше
   * своего превью: превью едет в том же запросе.
   */
  function pump(): void {
    if (pumping) return; // старты внутри зовут dispatch — рекурсия сюда не нужна
    pumping = true;
    try {
      for (;;) {
        const preview = nextToPreview(state, previewing);
        if (preview) startPreview(preview.id);
        const send = nextToSend(state, concurrency);
        if (send) startSend(send.id);
        if (!preview && !send) break;
      }
    } finally {
      pumping = false;
    }
  }

  function abort(id: string): void {
    aborts.get(id)?.abort();
  }

  return {
    state: () => state,
    enqueue(list, topics) {
      const before = state.rows.length;
      apply({ type: 'enqueue', sources: list, topics, cap });
      const added = state.rows.slice(before);
      added.forEach((row, i) => sources.set(row.id, list[i]));
      pump();
      return added.map((r) => r.id);
    },
    // «отменить» и «убрать» — две подписи одного действия: строка уходит из очереди. Обрыв
    // XHR стоит в обоих, а не только в «отменить»: строка без отправки — это утечка, которую
    // никто не увидит (байты продолжают уходить в фон), и цена страховки — один no-op.
    cancel(id) {
      abort(id);
      forget(id);
      dispatch({ type: 'remove', id });
    },
    dismiss(id) {
      abort(id);
      forget(id);
      dispatch({ type: 'remove', id });
    },
    retry(id) {
      dispatch({ type: 'retry', id });
    },
    retryAll() {
      dispatch({ type: 'retryAll' });
    },
    rename(id, name) {
      dispatch({ type: 'rename', id, name });
    },
    setTopics(id, topicIds, newTopics) {
      dispatch({ type: 'setTopics', id, topicIds, newTopics });
    },
    clearSettled() {
      const before = state.rows;
      apply({ type: 'removeSettled' });
      before.filter((r) => !state.rows.some((x) => x.id === r.id)).forEach((r) => forget(r.id));
      pump();
    },
    reset() {
      state.rows.forEach((r) => abort(r.id));
      sources.clear();
      previews.clear();
      previewing.clear();
      aborts.clear();
      state = createQueue();
      onChange?.(state);
    },
  };
}
