// Точка входа пробы автосейва / авто-стейджа / отката текста (волна 25.09, CL-A).
export {
  createAutosaveMachine,
  deepEqual,
  isSaveShortcut,
} from '../src/components/managers/tech-card/components/useTechCardAutosave';
export { decideAutoStage } from '../src/components/managers/tech-card/components/stage-progress';
export {
  diffTextSections,
  restoreTextSections,
  textSnapshotOf,
  TEXT_SECTIONS,
} from '../src/components/managers/tech-card/components/save-history';
export { techCardDefaultData } from '../src/components/managers/tech-card/components/schema';
