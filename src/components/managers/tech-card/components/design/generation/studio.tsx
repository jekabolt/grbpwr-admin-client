import type { GetDesignBandResponse } from 'api/proto-http/admin';

import { GenerationHistory } from './generation-history';

/**
 * THE GENERATIVE HALF OF THE FLAT STEP, COMPOSED — and since the studio redesign it composes ONE
 * organ: the generation history.
 *
 * WHAT STOOD HERE. The prototype's old assembly rule (`proto.html:3873`, `briefContent`) chose
 * between the history and an EMPTY STUDIO block («pictures on this card · nothing here yet») by
 * whether the band held any runs or uploads. The redesign's step screen (`_step-flat.js`,
 * `RENDER['step-flat']`) has no such block: the order is INPUT — REFERENCES → GENERATION HISTORY →
 * FLAT SLOTS, always, and the history carries its own empty states («no runs to show», «every run
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
 * дефолту фильтр на флеты только». `defaultOpen` — the flat has no outputs strip of its own («the
 * bench slot IS the choice for a flat»), so the history is the only place a run's result is seen,
 * and folding it would hide the result behind a click.
 */
export function GenerationStudio({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}) {
  return (
    <GenerationHistory
      band={band}
      techCardId={techCardId}
      disabled={disabled}
      defaultRep='flat'
      defaultOpen
    />
  );
}
