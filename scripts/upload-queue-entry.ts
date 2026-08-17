// Точка входа зонда очереди загрузки: только то, у чего есть КОНТРАКТ с экраном.
// Транспорт (`upload/transport.ts`) сюда не тянем — в нём dom и XHR, а зонд именно про то,
// что машина от них не зависит: подделка транспорта подставляется снаружи.
export {
  DEFAULT_MAX_UPLOAD_BYTES,
  UPLOAD_CONCURRENCY,
  barFraction,
  canHideBar,
  classifySize,
  createQueue,
  expectsPreview,
  failureKind,
  hasLiveUploads,
  inheritTopics,
  isFailed,
  isLive,
  isQueueSettled,
  isSettled,
  isUnsorted,
  nextToPreview,
  nextToSend,
  reduce,
  rowActions,
  tally,
} from 'components/managers/files/upload/queue';
export type {
  BatchTopics,
  QueueEvent,
  QueueRow,
  QueueState,
  QueueStatus,
  UploadSource,
} from 'components/managers/files/upload/queue';

export {
  UploadError,
  createUploadEngine,
  messageOf,
  statusOf,
} from 'components/managers/files/upload/engine';

export {
  actionLabel,
  batchSummary,
  inheritanceNote,
  plural,
  rowWhy,
  statusLabel,
  statusTone,
  summaryLine,
} from 'components/managers/files/upload/text';
