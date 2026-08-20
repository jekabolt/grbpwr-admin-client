// Точка входа пробы записи последнего жеста: esbuild бандлит только с файла, а модуль чистый —
// одного реэкспорта хватает.
export {
  appendLabel,
  canUndo,
  dissolveLabel,
  resolvePending,
  undoTitle,
} from '../src/components/managers/tech-card/components/last-mutation';
