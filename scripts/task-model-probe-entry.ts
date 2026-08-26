// Точка входа чистой пробы очереди А: один реэкспорт на каждое правило, которое проба судит.
// Собирается esbuild'ом с absWorkingDir=репо, поэтому алиасы внутри модулей (`api/…`, `ui/…`)
// разрешаются как в обычной сборке.
export {
  taskInsertToWire,
  mapInsert,
  mapTask,
} from '../src/components/managers/tasks/api/tasksService';
export {
  emptyTaskInsert,
} from '../src/components/managers/tasks/api/types';
export {
  dueMeta,
} from '../src/components/managers/tasks/utils/meta';
export {
  applyFilters,
  assigneePiles,
  setFilter,
  emptyFilters,
  filtersActive,
} from '../src/components/managers/tasks/components/filters-bar';
export {
  mergeInlinePatch,
} from '../src/components/managers/tasks/hooks/useTasks';
// ── ОЧЕРЕДЬ Б ──────────────────────────────────────────────────────────────────────────────
export {
  openBlockers,
  isBlocked,
  relationsOfKind,
  RELATION_KINDS,
} from '../src/components/managers/tasks/utils/relations';
export {
  splitDescription,
} from '../src/components/managers/tasks/components/task-description';
export {
  canDeleteComment,
  isOwnComment,
} from '../src/components/managers/tasks/components/task-comments';

