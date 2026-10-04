import type { GetDesignBandResponse } from 'api/proto-http/admin';

import { GenerationHistory } from './generation-history';
import { LatestGeneration, type WorkbenchKind } from './latest-generation';

/**
 * ═══ THE WORKBENCH — ONE BLOCK: THE LAST RUN ON TOP, THE GENERATION HISTORY UNDER IT (T30) ═══
 * Owner, item 30, verbatim: «LATEST GENERATION должно называться workbench и generation history и
 * workbench должны быть одим блоком где history все равно заколапшена по дефолту». FLAT and FABRIC
 * RENDER mount this and nothing else for the two: `LatestGeneration` draws the block (`workbench`)
 * and takes the history as its last part, folded on every visit (T22). The block stands even with
 * no run, for the reason below: the history must stay mounted.
 *
 * WHAT STOOD HERE BEFORE T30 — the generative half of the flat step, composing ONE organ: the
 * generation history.
 *
 * WHAT STOOD HERE. The prototype's old assembly rule (`proto.html:3873`, `briefContent`) chose
 * between the history and an EMPTY STUDIO block («pictures on this card · nothing here yet») by
 * whether the band held any runs or uploads. The redesign's step screen (`_step-flat.js`,
 * `RENDER['step-flat']`) has no such block: the order is INPUT — REFERENCES → GENERATION HISTORY →
 * FLAT SLOTS, always (since O-67 with LATEST GENERATION between the first two — `studio-tab.tsx`), and the history carries its own empty states («no runs to show», «every run
 * on this card is archived — open the archived shelf above», «no flat generations among the loaded
 * runs»). A second block saying «nothing here yet» above a block already saying it would be the
 * same sentence twice, in two boxes.
 *
 * WHY THE HISTORY IS ALWAYS MOUNTED, EVEN ON A CARD WITH NOTHING. `GenerationHistory` mounts
 * `useRunPolling` — the one place a live run is re-read from — and `RecallBenchIntake`, the home
 * of the recall gesture. A card whose first run has just been started has zero pictures and one
 * live run; unmounting the history over «no pictures» would leave that run un-polled and
 * «starting…» standing forever. That defect existed exactly once (E-21…E-23) and this file is
 * where it was closed.
 *
 * `defaultRep='flat'` — owner, verbatim: «в FLAT — SHEET GENERATION HISTORY REPRESENTATION по
 * дефолту фильтр на флеты только».
 *
 * `defaultOpen={false}` (26.09, O-54) — owner, verbatim: «по дефолту GENERATION HISTORY должен быть
 * заколапшен и справа должно показывать цифру колличество генераций и стрелочку для анколапса».
 * It stood open because the flat had no outputs strip of its own and the history was the only place
 * a run's result was seen. That reason is gone: the latest generation lands under GENERATE, in a
 * block of its own right under INPUT — REFERENCES (`latest-generation.tsx`, O-53; O-67, D-73), with
 * the same doors. The count and
 * the chevron are the history's own fold door on the right of its header (`N FLAT RUNS ▸`); the fold
 * is not remembered, as on the other four steps, and a live run does not unfold it. Folded, the
 * organ stays MOUNTED — the poll and the recall intake above live in it.
 */
export function Workbench({
  band,
  techCardId,
  disabled,
  kind = 'flat',
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** FLAT, or FABRIC RENDER (T24: the same grid history; T30: the same one block). */
  kind?: WorkbenchKind;
}) {
  return (
    <LatestGeneration
      band={band}
      techCardId={techCardId}
      disabled={disabled}
      kind={kind}
      history={
        <GenerationHistory
          band={band}
          techCardId={techCardId}
          disabled={disabled}
          defaultRep={kind}
          defaultOpen={false}
        />
      }
    />
  );
}
