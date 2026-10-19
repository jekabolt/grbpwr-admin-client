/**
 * Очередь загрузки файлов — состояние вне компонентов.
 *
 * Стор существует ровно по одной причине: отправка обязана пережить уход на другой экран.
 * Пока очередь жила в состоянии диалога, закрытие диалога (или переход в другую тему) молча
 * убивало XHR — поэтому XHR теперь живут ЗДЕСЬ, в модуле, который не размонтируется.
 * Полоса `up.v3` — только зритель этого стора; её монтирование и размонтирование ничего не
 * останавливает.
 *
 * Прецедент — `useSnackBarStore` в `store.ts`, единственный другой zustand-стор проекта.
 *
 * Разделение обязанностей: правила переходов — `files/upload/queue.ts` (чистые, с пробой
 * `scripts/upload-queue-probe.mjs`), таймлайн вызовов — `files/upload/engine.ts`, сам XHR —
 * `files/upload/transport.ts`. Здесь — только склейка с react.
 */
import { create } from 'zustand';
import { MAX_UPLOAD_BYTES } from 'components/managers/files/api/filesService';
import { createUploadEngine } from 'components/managers/files/upload/engine';
import {
  canHideBar,
  createQueue,
  hasLiveUploads,
  inheritTopics,
  isLive,
  isSettled,
  type BatchTopics,
  type QueueRow,
  type QueueState,
} from 'components/managers/files/upload/queue';
import { uploadJob } from 'components/managers/files/upload/text';
import { browserUploadTransport } from 'components/managers/files/upload/transport';
import { notify, removeNotify, updateNotify } from './store';

export interface UploadQueueStore {
  queue: QueueState;
  /** Полоса свёрнута до одной строки-сводки. */
  collapsed: boolean;
  /** Полосу убрали с глаз; отправка при этом продолжается. */
  hidden: boolean;
  /**
   * Растёт на каждый файл, который сервер принял (включая дубликаты — у них тоже меняется
   * картина библиотеки). На него вешается инвалидация списка файлов: стор про react-query
   * ничего не знает и знать не должен.
   */
  completions: number;
  /**
   * Имена тем по id — их публикует полоса, пока она на экране (словарь тем живёт в
   * react-query, а стор про react-query не знает и знать не должен). Нужны итоговой сводке:
   * её показывают и тому, кто из раздела УШЁЛ, а «#7» вместо «съёмка» там ничего не значит.
   */
  topicNames: Record<number, string>;

  enqueue: (files: File[], topics: BatchTopics) => void;
  cancel: (id: string) => void;
  dismiss: (id: string) => void;
  retry: (id: string) => void;
  retryAll: () => void;
  rename: (id: string, name: string) => void;
  setRowTopics: (id: string, topicIds: number[], newTopics: string[]) => void;
  clearSettled: () => void;
  reset: () => void;
  setCollapsed: (collapsed: boolean) => void;
  setHidden: (hidden: boolean) => void;
  setTopicNames: (names: Record<number, string>) => void;
}

/** Строки, за которые `completions` уже посчитан: событие «принято» одноразовое. */
const counted = new Set<string>();

/* ── СТРАЖ ЗАКРЫТИЯ ВКЛАДКИ ───────────────────────────────────────────────────────────────
 *
 * Живёт ЗДЕСЬ, а не в полосе. Полоса смонтирована только на двух экранах раздела, а стор
 * написан ровно затем, чтобы отправка пережила уход на любой другой: страж, который уезжает
 * вместе с полосой, защищает как раз не тот случай, ради которого он заведён — человек ушёл
 * в заказы, закрыл вкладку, половина пачки умерла молча.
 */
const guard = (e: BeforeUnloadEvent) => {
  e.preventDefault();
  // Текст свой браузеры давно не показывают, но непустое значение всё ещё включает диалог.
  e.returnValue = '';
  return '';
};
let guarding = false;

function syncGuard(queue: QueueState): void {
  if (typeof window === 'undefined') return;
  const live = hasLiveUploads(queue);
  if (live === guarding) return;
  guarding = live;
  if (live) window.addEventListener('beforeunload', guard);
  else window.removeEventListener('beforeunload', guard);
}

/* ── ИТОГ ПАЧКИ СЛОВАМИ ───────────────────────────────────────────────────────────────────
 *
 * Тоже здесь и по той же причине: пачку ставят на холсте и уходят работать дальше, а итог
 * («отправлено 7 из 9 · 2 обрыва») нужен именно ушедшему — на экране он ничего не видит.
 * Тост НЕ показывается, когда итог и так напечатан в развёрнутой полосе перед глазами:
 * там он ничего не добавил бы, зато накрыл бы собой первые строки очереди — ровно те, к
 * которым после отказа и тянутся.
 */
let barsMounted = 0;

/** Полоса объявляет себя смонтированной. Возвращает снятие — прямо в уборку эффекта. */
export function noteUploadBarMounted(): () => void {
  barsMounted += 1;
  return () => {
    barsMounted -= 1;
  };
}

/* ONE JOB PER BATCH. A batch starts when the queue goes live and ends when it settles; it holds
   the rows that were new or went live in between (a retried old row too), not the whole queue. */
interface Batch {
  key: string;
  prior: Set<string>;
  touched: Set<string>;
  /** Last text + progress sent: XHR ticks that change nothing are dropped. */
  said: string;
}
let batch: Batch | null = null;
let batchNo = 0;
/** RETRY reuses its notification: the inbox keeps one entry per batch. */
let retryKey: string | null = null;

function trackJob(queue: QueueState): void {
  const live = hasLiveUploads(queue);
  if (!batch) {
    if (!live) return;
    batch = {
      key: retryKey ?? `upload-${(batchNo += 1)}`,
      prior: new Set(queue.rows.filter((r) => !isLive(r.status)).map((r) => r.id)),
      touched: new Set(),
      said: '',
    };
    retryKey = null;
  }
  const b = batch;
  for (const r of queue.rows) if (isLive(r.status)) b.touched.add(r.id);
  const rows = queue.rows.filter((r) => !b.prior.has(r.id) || b.touched.has(r.id));
  const { collapsed, hidden, topicNames } = useUploadQueueStore.getState();
  // No toast while the expanded bar already prints it; the inbox gets the job either way.
  const toast = !(barsMounted > 0 && !collapsed && !hidden);

  if (live) {
    const { input } = uploadJob(rows, []);
    const said = `${input.text}|${Math.round((input.progress ?? 0) * 50)}`;
    if (said === b.said) return;
    const first = !b.said;
    b.said = said;
    if (first) notify({ ...input, key: b.key }, { toast });
    else updateNotify(b.key, input, { toast });
    return;
  }

  batch = null;
  // Nothing settled (all cancelled, dismissed, reset): drop the job, or it spins forever.
  if (!rows.length) {
    removeNotify(b.key);
    return;
  }
  const union = inheritTopics(
    rows.flatMap((r) => r.topicIds),
    rows.flatMap((r) => r.newTopics),
  );
  const labels = [...union.topicIds.map((id) => topicNames[id] ?? `#${id}`), ...union.newTopics];
  const { input, retryable } = uploadJob(rows, labels);
  notify(
    {
      ...input,
      key: b.key,
      action: retryable.length
        ? {
            label: 'retry',
            onClick: () => {
              // A running batch takes the rows in; only an idle queue reuses this key.
              if (!batch) retryKey = b.key;
              retryable.forEach((id) => engine.retry(id));
              // No row went live: the key must not leak into the next batch.
              if (!hasLiveUploads(engine.state())) retryKey = null;
            },
          }
        : undefined,
    },
    { toast },
  );
}

const engine = createUploadEngine<File, Blob>({
  transport: browserUploadTransport,
  cap: MAX_UPLOAD_BYTES,
  onChange: (queue) => {
    let fresh = 0;
    const alive = new Set(queue.rows.map((r) => r.id));
    for (const row of queue.rows) {
      if ((row.status === 'done' || row.status === 'dup') && !counted.has(row.id)) {
        counted.add(row.id);
        fresh += 1;
      }
    }
    // Забываем id строк, которых в очереди больше нет: без этого множество росло бы весь
    // сеанс — сотня строк в день на вкладке, которую не перезагружают неделями.
    for (const id of counted) if (!alive.has(id)) counted.delete(id);
    useUploadQueueStore.setState((s) => ({ queue, completions: s.completions + fresh }));
    syncGuard(queue);
    trackJob(queue);
  },
});

export const useUploadQueueStore = create<UploadQueueStore>((set) => ({
  queue: createQueue(),
  collapsed: false,
  hidden: false,
  completions: 0,
  topicNames: {},

  enqueue: (files, topics) => {
    // Новая пачка возвращает полосу на экран: убрали её, чтобы не мешала, а не чтобы
    // не видеть следующую отправку.
    set({ hidden: false });
    engine.enqueue(files, topics);
  },
  cancel: (id) => engine.cancel(id),
  dismiss: (id) => engine.dismiss(id),
  retry: (id) => engine.retry(id),
  retryAll: () => engine.retryAll(),
  rename: (id, name) => engine.rename(id, name),
  setRowTopics: (id, topicIds, newTopics) => engine.setTopics(id, topicIds, newTopics),
  clearSettled: () => engine.clearSettled(),
  reset: () => {
    counted.clear();
    retryKey = null;
    engine.reset();
  },
  setCollapsed: (collapsed) => set({ collapsed }),
  setHidden: (hidden) => set({ hidden }),
  setTopicNames: (topicNames) => set({ topicNames }),
}));

/* ── удобные выборки ──────────────────────────────────────────────────────────────────── */

export function useUploadRows(): QueueRow[] {
  return useUploadQueueStore((s) => s.queue.rows);
}

/** Живая отправка: на этом висит beforeunload-страж и блокировка кнопки «убрать». */
export function useUploadIsLive(): boolean {
  return useUploadQueueStore((s) => hasLiveUploads(s.queue));
}

export function useCanHideUploadBar(): boolean {
  return useUploadQueueStore((s) => canHideBar(s.queue));
}

/** Есть что показывать: пустую полосу рисовать незачем. */
export function useHasUploadRows(): boolean {
  return useUploadQueueStore((s) => s.queue.rows.length > 0);
}

/** Строки, которые уже отстоялись — их можно убрать одним движением. */
export function settledRows(state: QueueState): QueueRow[] {
  return state.rows.filter((r) => isSettled(r.status));
}
