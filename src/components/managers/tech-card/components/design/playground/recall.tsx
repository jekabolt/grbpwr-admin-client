import type { common_MediaFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useRef } from 'react';

import { runHandle } from '../handles';
import { recallDesignRun, useRecalledRun } from '../history-recall';
import { workflowByKey, workflowOfRun } from './registry';
import type { Draft, WorkflowKey } from './registry/types';

/**
 * ═══ «RUN THAT AGAIN» — THE PLAYGROUND'S RECEIVER (C-03) ═════════════════════════════════════════
 *
 * `recallTargetKind` sends a `recolor`, `freeform` or `cutout` run HERE (`history-recall.tsx`), and
 * this is what answers: the run's workflow (`workflowOfRun`) is opened and its draft is rebuilt by
 * that workflow's own `recall` from the run's FROZEN parameters — recolour → Change a Color (photos,
 * garment words, Pantone), cut-out → Remove Background, freeform → Create or edit. The retired
 * presets (`add_hardware`, `repaint_parts`) land in Create or edit with their pictures and words,
 * and the intake says what did not come along; a rerun of those runs stays legal on the server.
 *
 * ⚠ THE MEDIA OBJECTS COME FROM THE RUN'S INPUT SNAPSHOT, the only place they survive once a
 * picture left the feed page. A picture the snapshot no longer carries is DROPPED and said out loud.
 *
 * ⚠ THIS DOES NOT START A RUN. Recall fills the draft; GENERATE is still a press, and the gate still
 * has to pass. A rerun that spent money on arrival would be navigation that behaves like a purchase.
 */
export function PlaygroundRecallIntake({
  techCardId,
  disabled,
  onRecall,
}: {
  techCardId: number;
  disabled?: boolean;
  /** Put the rebuilt draft in place and open its workflow. */
  onRecall: (key: WorkflowKey, draft: Draft) => void;
}): null {
  const selection = useRecalledRun(techCardId);
  const { showMessage } = useSnackBarStore();
  /** The run already taken, so a re-render does not re-lay the same form over an edited one. */
  const taken = useRef('');
  const answer = useRef(onRecall);
  answer.current = onRecall;

  useEffect(() => {
    if (!selection || selection.kind !== 'playground') {
      taken.current = '';
      return;
    }
    const { run } = selection;
    const runId = run.id ?? 0;
    const stamp = `${runId}:${selection.mode}`;
    if (!runId || taken.current === stamp) return;
    taken.current = stamp;
    // Consumed the moment it is read: left armed it would re-lay the form on the next card switch.
    recallDesignRun(techCardId, null);

    const handle = runHandle(runId) || 'that run';
    if (disabled) {
      showMessage(`this card is read-only — nothing was taken from ${handle}`, 'error');
      return;
    }

    const key = workflowOfRun(run);
    const def = workflowByKey(key);
    if (!key || !def?.run?.recall) {
      showMessage(
        `${handle} cannot be laid out here — ${def ? `${def.title} is not on this build yet` : 'its kind is not a playground workflow'}`,
        'error',
      );
      return;
    }

    const media = new Map<number, common_MediaFull>();
    for (const ref of run.inputs?.refs ?? []) {
      const id = ref.mediaId ?? 0;
      if (id > 0 && ref.media && !ref.deleted) media.set(id, ref.media);
    }

    const back = def.run.recall(run, media);
    const said = [`${handle} is back in ${def.title}`, ...back.said];
    if (back.lost) {
      said.push(
        `${back.lost} of its pictures ${back.lost === 1 ? 'is' : 'are'} no longer on this card`,
      );
    }
    answer.current(key, back.draft);
    showMessage(said.join(' · '), back.said.length || back.lost ? 'error' : 'success');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, disabled, techCardId]);

  return null;
}
