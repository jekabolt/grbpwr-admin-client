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
  isSettled,
  type BatchTopics,
  type QueueRow,
  type QueueState,
} from 'components/managers/files/upload/queue';
import { browserUploadTransport } from 'components/managers/files/upload/transport';

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
}

/** Строки, за которые `completions` уже посчитан: событие «принято» одноразовое. */
const counted = new Set<string>();

const engine = createUploadEngine<File, Blob>({
  transport: browserUploadTransport,
  cap: MAX_UPLOAD_BYTES,
  onChange: (queue) => {
    let fresh = 0;
    for (const row of queue.rows) {
      if ((row.status === 'done' || row.status === 'dup') && !counted.has(row.id)) {
        counted.add(row.id);
        fresh += 1;
      }
    }
    useUploadQueueStore.setState((s) => ({ queue, completions: s.completions + fresh }));
  },
});

export const useUploadQueueStore = create<UploadQueueStore>((set) => ({
  queue: createQueue(),
  collapsed: false,
  hidden: false,
  completions: 0,

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
