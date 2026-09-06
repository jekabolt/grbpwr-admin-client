import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { Button } from 'ui/components/button';

import { EmptyState } from '../core';

/**
 * THE EMPTY STUDIO — RETIRED FROM THE FLAT STEP, KEPT AS AN ORGAN.
 *
 * It used to be a whole block («pictures on this card · nothing here yet», two equal doors) drawn
 * INSTEAD of the generation history on a card with no runs and no uploads. The redesigned flat
 * step (`_step-flat.js`) has no such block: the history is always on screen and carries its own
 * empty line («no runs to show · go to the run»), so `GenerationStudio` no longer mounts this.
 *
 * WHY THE FILE STAYS. `generation/index.ts` re-exports it and that file is not this wave's to
 * edit; an export that vanishes breaks the build of every importer at once. So the organ is kept,
 * shrunk to the one honest thing it can still say — a single `EmptyState` line with the door to
 * the input — and NOT a block: mounted anywhere, it must not become a second white slab saying
 * what the history already says. Delete this file and its export together, in one move.
 */
export function EmptyStudio({
  disabled,
  onGenerate,
}: {
  band?: GetDesignBandResponse;
  techCardId?: number;
  disabled?: boolean;
  /** Opens the generation form when the caller has one; absent, only the input door is drawn. */
  onGenerate?: () => void;
}) {
  const { showMessage } = useSnackBarStore();

  // The door leads to INPUT — REFERENCES: «bring files» means «put them into the input» since the
  // uploads shelf was removed (R-18). The anchor `#design-input` is stamped by `studio-tab.tsx`.
  const gotoInput = () => {
    const el = document.getElementById('design-input');
    if (!el) {
      showMessage('the input block is not on this screen', 'error');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <EmptyState
      action={
        <span className='flex flex-wrap items-center gap-1'>
          <Button variant='secondary' size='xs' onClick={gotoInput}>
            + reference
          </Button>
          {onGenerate && (
            <Button variant='secondary' size='xs' onClick={onGenerate} disabled={disabled}>
              generate ▸
            </Button>
          )}
        </span>
      }
    >
      nothing has been generated or brought yet
    </EmptyState>
  );
}
