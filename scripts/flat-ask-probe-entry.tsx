// Точка входа `flat-ask-probe.mjs` (82-INPUT-REDESIGN, 06.10; M7 07.10): чистые модели ряда FLAT —
// цели `target ▾`, маршрут, правило stale, авто-раскладка, слова отказов — и дверь
// `custom` (`flat-custom.tsx`), которую по-прежнему держит FABRICS AND HARDWARE. Разметка —
// `renderToStaticMarkup`. Лежит в репозитории: react-dom/server разрешается относительно файла.
import { renderToStaticMarkup } from 'react-dom/server';

import { FlatCustom } from '../src/components/managers/tech-card/components/design/flat-custom';

export {
  DEFAULT_FLAT_ASK,
  flatDraftOf,
  patchFlatInput,
  rememberFlatDraft,
} from '../src/components/managers/tech-card/components/design/flat-input';
export {
  VIEWS_ORDER,
  VIEWS_TARGET,
  detailFlatSlotIds,
  detailTarget,
  flatRefFate,
  flatSentRefs,
  flatWordsSent,
  flatTargets,
  modeOfRoute,
  routeOf,
  settleTarget,
  targetSlotId,
} from '../src/components/managers/tech-card/components/design/flat-route';
export {
  KEEP_REFUSAL_WORDS,
  staleShown,
} from '../src/components/managers/tech-card/components/design/stale-details';
export { autoApplies } from '../src/components/managers/tech-card/components/design/generation/apply-flat-slots';
export {
  detailPlacementOf,
  detailPlacements,
  detailRunSlot,
} from '../src/components/managers/tech-card/components/design/generation/detail-auto-place';

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

// Review majors 06.10 (c2, c7): the mood fingerprint, the run ledger; M7/M8 refusal words.
export {
  flatRefusalWords,
  moodPictureIds,
} from '../src/components/managers/tech-card/components/design/flat-mode';
export { refusalFromError } from '../src/components/managers/tech-card/components/design/generation/refusal';
export {
  flatRunInFlight,
  flatSnapshot,
} from '../src/components/managers/tech-card/components/design/flat-run-row';
export {
  awaitRun,
  ledgerIdOf,
  runLedger,
  settleRunLedger,
} from '../src/components/managers/tech-card/components/design/generation/run-ledger';
