import type { common_MediaFull, common_TechCardAnnotation } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useRef } from 'react';
import { decimalToInput } from 'utils/decimal';

import { runHandle } from '../handles';
import { recallDesignRun, useRecalledRun } from '../history-recall';
import type { PlaygroundDraft } from './drafts';
import {
  PLAYGROUND_ITEMS_MAX,
  REGIONS_PER_ITEM_MAX,
  isPlaygroundRole,
  type PlaygroundItem,
  type PlaygroundRegion,
} from './model';

/**
 * ═══ «RUN THAT AGAIN» — THE PLAYGROUND'S OWN RECEIVER ═════════════════════════════════════════
 *
 * `recallTargetKind` sends a `freeform`/`cutout` run HERE (`history-recall.tsx`), and this is what
 * answers. Without a receiver the door would switch the step and do nothing — a gesture that moves
 * a person and leaves them where they cannot see why.
 *
 * ⚠ THE TABLE IS REBUILT FROM THE RUN'S OWN FROZEN PARAMETERS, NOT FROM TODAY'S CARD. The pictures
 * and the areas are in `params.freeform.items[]` exactly as they left; the media OBJECTS (the thumb
 * a cell draws) come from the run's input snapshot, which is the only place they survive at all
 * once a picture has left the feed page. An item whose media the snapshot no longer carries is
 * DROPPED and said out loud: putting an id on the table with no picture behind it would give a cell
 * that cannot be looked at and a run that cannot be checked before it is paid for.
 *
 * ⚠ THIS DOES NOT START A RUN. Recall fills the draft; GENERATE is still a press, and the gate
 * still has to pass. A rerun that spent money on arrival would be a door that reads like navigation
 * and behaves like a purchase.
 */
function pointsOf(region: common_TechCardAnnotation): { x: number; y: number }[] {
  return (region.points ?? [])
    .map((p) => ({ x: Number(decimalToInput(p.x)), y: Number(decimalToInput(p.y)) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

export function PlaygroundRecallIntake({
  techCardId,
  draft,
  disabled,
}: {
  techCardId: number;
  draft: PlaygroundDraft;
  disabled?: boolean;
}): null {
  const selection = useRecalledRun(techCardId);
  const { showMessage } = useSnackBarStore();
  /** The run already taken, so a re-render does not re-lay the same table over an edited one. */
  const taken = useRef('');

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
    // The choice is consumed the moment it is read: leaving it armed would re-lay the table on the
    // next card switch, over work done since.
    recallDesignRun(techCardId, null);

    const handle = runHandle(runId) || 'that run';
    if (disabled) {
      showMessage(`this card is read-only — nothing was taken from ${handle}`, 'error');
      return;
    }

    const media = new Map<number, common_MediaFull>();
    for (const ref of run.inputs?.refs ?? []) {
      const id = ref.mediaId ?? 0;
      if (id > 0 && ref.media && !ref.deleted) media.set(id, ref.media);
    }

    const kind = (run.kind ?? '').trim().toLowerCase();
    const wire = run.params?.freeform;
    const items: PlaygroundItem[] = [];
    let lost = 0;

    if (kind === 'cutout') {
      // A cut-out names its one picture in `extra_input_media_ids`, never in `freeform` — one list
      // per fact, both on the way out and on the way back.
      for (const id of run.params?.extraInputMediaIds ?? []) {
        const found = media.get(id ?? 0);
        if (found) items.push({ media: found, role: '', regions: [] });
        else lost++;
      }
    } else {
      for (const item of wire?.items ?? []) {
        const id = item.mediaId ?? 0;
        const found = media.get(id);
        if (!found) {
          lost++;
          continue;
        }
        const texts = item.texts ?? [];
        const regions: PlaygroundRegion[] = (item.regions ?? [])
          .map((region, i) => ({ points: pointsOf(region), text: (texts[i] ?? '').trim() }))
          .filter((r) => r.points.length >= 3)
          .slice(0, REGIONS_PER_ITEM_MAX);
        /* ⚠ THE ROLE IS READ, NOT CAST. `item.role` is a plain string off the wire — a run frozen
           by a server that knows a role this bundle does not carries that word, and a cast would
           put it on the table typed as one of four. From there it would ride the next paid call
           into `unknown_role`, refused after the reservation for a word the person never typed.
           A role this build cannot spell becomes «just a picture», which is what the empty role
           means to the server and what the missing chip says on screen. */
        const role = (item.role ?? '').trim();
        items.push({ media: found, role: isPlaygroundRole(role) ? role : '', regions });
      }
    }

    if (items.length === 0) {
      showMessage(
        lost > 0
          ? `nothing was laid out — the ${lost === 1 ? 'picture' : `${lost} pictures`} of ${handle} ${lost === 1 ? 'is' : 'are'} no longer on this card`
          : `${handle} put no picture on the table`,
        'error',
      );
      return;
    }

    const dropped = Math.max(0, items.length - PLAYGROUND_ITEMS_MAX);
    draft.adopt(
      items,
      kind === 'cutout' ? 'cutout' : (wire?.preset ?? '').trim(),
      kind === 'cutout' ? '' : (run.ask ?? '').trim(),
    );
    const said = [`the table of ${handle} is back`];
    if (lost) said.push(`${lost} of its pictures ${lost === 1 ? 'is' : 'are'} gone from this card`);
    if (dropped) said.push(`${dropped} over the ${PLAYGROUND_ITEMS_MAX} the run takes, skipped`);
    showMessage(said.join(' · '), lost || dropped ? 'error' : 'success');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, disabled, techCardId]);

  return null;
}
