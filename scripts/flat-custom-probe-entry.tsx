// Точка входа `flat-custom-probe.mjs`: настоящие `flat-input.ts` (умолчание прогона флэта, T19) и
// `flat-custom.tsx` (дверь `custom` у GENERATE, T18), разметка — `renderToStaticMarkup`.
// Лежит в репозитории по той же причине, что `assembly-views-probe-entry.tsx`: react-dom/server
// разрешается относительно файла.
import { renderToStaticMarkup } from 'react-dom/server';

import { FlatCustom } from '../src/components/managers/tech-card/components/design/flat-custom';
import {
  DEFAULT_FLAT_LAYOUT,
  defaultFlatViews,
  isDefaultFlatChoice,
} from '../src/components/managers/tech-card/components/design/flat-input';

export { DEFAULT_FLAT_LAYOUT, defaultFlatViews, isDefaultFlatChoice };

export function render(open: boolean, modified: boolean): string {
  return renderToStaticMarkup(
    <FlatCustom
      open={open}
      modified={modified}
      onToggle={() => {}}
      after={<i data-after=''>what the model gets</i>}
    >
      <b data-panel-body=''>layout and views</b>
    </FlatCustom>,
  );
}

// Review majors 06.10 (M4/c5, c2, c7): the join replay, the mood fingerprint, the run ledger.
export {
  dropItem,
  editAbsence,
  editItem,
  keepPhotos,
  replayEdit,
} from '../src/components/managers/tech-card/components/design/joins-model';
export {
  flatRefusalWords,
  moodPictureIds,
} from '../src/components/managers/tech-card/components/design/flat-mode';
export { refusalFromError } from '../src/components/managers/tech-card/components/design/generation/refusal';
export { flatSnapshot } from '../src/components/managers/tech-card/components/design/flat-run-row';
export {
  awaitRun,
  ledgerIdOf,
  runLedger,
  settleRunLedger,
} from '../src/components/managers/tech-card/components/design/generation/run-ledger';
