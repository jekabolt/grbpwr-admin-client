// Точка входа пробы автосейва / авто-стейджа / отката текста (волна 25.09, CL-A).
export {
  anyDirty,
  bodyMoved,
  bodyWorkOf,
  createAutosaveMachine,
  deepEqual,
  isSaveShortcut,
  liveIsDirty,
  settleFormAfterSave,
  watchOwnFailure,
} from '../src/components/managers/tech-card/components/useTechCardAutosave';
// m2: a panel's failure read off a REAL TanStack mutation cache.
export { QueryClient } from '@tanstack/react-query';
// R-1 / R-8: the post-save settle runs on a REAL react-hook-form (createFormControl — no React
// render needed) over values from the REAL mapper.
export { createFormControl } from 'react-hook-form';
export { decideAutoStage } from '../src/components/managers/tech-card/components/stage-progress';
export {
  diffTextSections,
  restoreTextSections,
  textSnapshotOf,
  TEXT_SECTIONS,
} from '../src/components/managers/tech-card/components/save-history';
export {
  mapTechCardToForm,
  techCardDefaultData,
} from '../src/components/managers/tech-card/components/schema';
