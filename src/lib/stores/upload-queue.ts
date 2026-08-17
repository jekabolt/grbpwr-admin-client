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
  isSettled,
  tally,
  type BatchTopics,
  type QueueRow,
  type QueueState,
} from 'components/managers/files/upload/queue';
import { batchSummary } from 'components/managers/files/upload/text';
import { browserUploadTransport } from 'components/managers/files/upload/transport';
import { useSnackBarStore } from './store';

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

let wasLive = false;

function announceSettled(queue: QueueState): void {
  if (hasLiveUploads(queue)) {
    wasLive = true;
    return;
  }
  if (!wasLive) return;
  wasLive = false;
  if (!queue.rows.length) return;
  const { collapsed, hidden, topicNames } = useUploadQueueStore.getState();
  const readable = barsMounted > 0 && !collapsed && !hidden;
  if (readable) return;
  const union = inheritTopics(
    queue.rows.flatMap((r) => r.topicIds),
    queue.rows.flatMap((r) => r.newTopics),
  );
  const labels = [
    ...union.topicIds.map((id) => topicNames[id] ?? `#${id}`),
    ...union.newTopics,
  ];
  const t = tally(queue);
  // Тон по факту, а не по намерению: пачка, где половина не уехала, «успехом» не была.
  useSnackBarStore
    .getState()
    .showMessage(batchSummary(queue, labels), t.lost + t.fail ? 'error' : 'success');
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
    announceSettled(queue);
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
