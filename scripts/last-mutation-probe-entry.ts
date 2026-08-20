// Точка входа пробы истории жестов: esbuild бандлит только с файла, а модули чистые — одного
// реэкспорта хватает.
//
// `unitRenameAct` уезжает СЮДА ЖЕ, а не переписывается в пробе моделью: цикл «жест → запись →
// отмена» обязан ходить через тот же расчёт, который стоит в мутаторе. Своя копия тут уже жила и
// уже разошлась с оригиналом на две ветки — молча, потому что расхождение видно только тому, кто
// читает обе.
export {
  HISTORY_DEPTH,
  appendLabel,
  canRedo,
  canUndo,
  dissolveLabel,
  dropForm,
  dropMove,
  dropRedoTop,
  emptyHistory,
  isFormEntry,
  moveLabel,
  peekRedo,
  peekUndo,
  pushUndo,
  record,
  redoStep,
  redoTitle,
  renameLabel,
  resolvePending,
  undoStep,
  undoTitle,
} from '../src/components/managers/tech-card/components/last-mutation';
export { unitRenameAct } from '../src/components/managers/tech-card/components/assembly-rename';
