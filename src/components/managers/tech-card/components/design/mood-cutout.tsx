import type { common_MediaFull, GetDesignBandResponse } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { type JSX, useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { TILE_CORNER, TILE_QUIET } from 'ui/components/tile-skin';

import { isRunLive, runStatus } from './generation/run-state';
import { useRunPolling } from './generation/use-generation';
import { isRasterPicture } from './pattern/fabrics-hardware';
import { emptyParams } from './playground/registry/common';
import { REMOVE_BACKGROUND } from './playground/registry/tiles/remove-background';
import { useStartDesignRun } from './render/use-design-run';
import { EMPTY_BAND } from './use-design-band';
import { selectVisiblePictures } from './visibility';

/**
 * ═══ `remove bg` ON A MOODBOARD TILE (M17, owner 07.10) ═════════════════════════════════════════
 *
 * Owner: «в мудборде на ховер рядом с кропом должна быть кнопка remove bg».
 *
 * THE SAME PAID ROUTE AS THE PLAYGROUND'S Remove Background — run kind `cutout` (fal BiRefNet, one
 * picture in, one PNG with alpha out), started through the one run door (`useStartDesignRun`): the
 * estimate is reserved against the day and the run is in the one history. Nothing new on the server.
 *
 * THE RESULT TAKES THE TILE THE WAY A CROP DOES (`placeCropped` in `mood-board.tsx`, whole frame):
 * same place, same purpose, the callouts unchanged, a person's view/detail label carried; a model's
 * label is read anew, as for any new board picture. The original stays in the library. A cut-out is
 * the output of a `cutout` run, which the flat input keeps (M16 drops other generation outputs).
 *
 * ONE PRESS PER PICTURE. The press is held per card and picture OUTSIDE the component: the board is
 * unmounted on other steps, and the result lands the next time it is open (not across a reload — the
 * run and its picture then stay in the playground history). While it runs the corner says `…` and
 * the picture itself shows a transparency checker wiping across it (`PictureBusy` kind `cut`, owner
 * 07.10: «какую-то анимацию показывать на картинке, что фон удаляется»); a refusal or a failed run
 * leaves one word, `failed`, and the corner presses again.
 */

export const BOARD_CUTOUT_SCOPE = 'moodboard:cutout';

type CutState = 'starting' | 'running' | 'failed';

export type BoardCut = {
  /** The picture the press was made on — what the result replaces, and what `undo` puts back. */
  original: common_MediaFull;
  /** The run's `client_request_id`, '' until the ledger minted it. */
  key: string;
  state: CutState;
  /** Why it failed, as the server said it (the corner's title). */
  why: string;
};

/** The press is on its way or running — the tile shows the background going. */
export const isCutBusy = (cut: BoardCut | null | undefined) => !!cut && cut.state !== 'failed';

const cuts = new Map<number, Map<number, BoardCut>>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const snapshot = () => version;

function cutsOf(card: number): Map<number, BoardCut> {
  let m = cuts.get(card);
  if (!m) {
    m = new Map();
    cuts.set(card, m);
  }
  return m;
}

function patch(card: number, mediaId: number, next: Partial<BoardCut>) {
  const m = cutsOf(card);
  const was = m.get(mediaId);
  if (!was) return;
  if (Object.entries(next).every(([k, v]) => was[k as keyof BoardCut] === v)) return;
  m.set(mediaId, { ...was, ...next });
  emit();
}

function drop(card: number, mediaId: number) {
  if (cutsOf(card).delete(mediaId)) emit();
}

/** What `land` did with a finished cut-out. `wait` = the board cannot be written now; ask again. */
export type CutLanding = 'placed' | 'wait' | 'gone';

export function useBoardCutout({
  techCardId,
  band,
  enabled,
  land,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  /** Not read-only, and the server speaks the band. */
  enabled: boolean;
  land: (original: common_MediaFull, cut: common_MediaFull) => CutLanding;
}) {
  const seen = useSyncExternalStore(subscribe, snapshot);
  const { showMessage } = useSnackBarStore();
  const run = useStartDesignRun(techCardId, { scope: BOARD_CUTOUT_SCOPE });
  const mine = techCardId > 0 ? cuts.get(techCardId) : undefined;

  const offered = enabled && techCardId > 0 && REMOVE_BACKGROUND.gate(band).available === true;
  // A tile that already IS a cut-out does not offer it again.
  const outputs = useMemo(() => {
    const ids = new Set<number>();
    for (const r of band.runs ?? []) {
      if ((r.kind ?? '').trim().toLowerCase() !== 'cutout') continue;
      for (const p of r.pictures ?? []) if ((p.media?.id ?? 0) > 0) ids.add(p.media?.id as number);
    }
    return ids;
  }, [band.runs]);

  const can = useCallback(
    (full: common_MediaFull | undefined) =>
      offered &&
      !!full &&
      (full.id ?? 0) > 0 &&
      isRasterPicture(full) &&
      !outputs.has(full.id as number),
    [offered, outputs],
  );

  const stateOf = (mediaId: number): BoardCut | null => mine?.get(mediaId) ?? null;

  const start = (full: common_MediaFull) => {
    const card = techCardId;
    const mediaId = full.id ?? 0;
    if (!(card > 0) || mediaId <= 0) return;
    const m = cutsOf(card);
    const was = m.get(mediaId);
    // THE LOCK: one press per picture until it lands or fails.
    if (was && was.state !== 'failed') return;
    m.set(mediaId, { original: full, key: '', state: 'starting', why: '' });
    emit();
    run.start(
      {
        kind: 'cutout',
        ask: '',
        params: { ...emptyParams(), extraInputMediaIds: [mediaId] },
      },
      {
        startedSay: '',
        beforeSend: (key) => {
          patch(card, mediaId, { key });
          return true;
        },
        onAccepted: (key) => patch(card, mediaId, { key, state: 'running' }),
        // The door's own toast says why; the tile keeps one word.
        onRefused: (error) =>
          patch(card, mediaId, {
            state: 'failed',
            why: (error as Error)?.message?.trim() || 'the run did not start',
          }),
      },
    );
  };

  // A press that settled with neither an acceptance nor a refusal (no answer): the tile stops
  // waiting. The key is kept by the ledger — the next press replays it, and if that run was booked
  // after all, the band shows it and the landing below takes it.
  useEffect(() => {
    if (run.isPending || !(techCardId > 0)) return;
    for (const [mediaId, c] of cutsOf(techCardId))
      if (c.state === 'starting')
        patch(techCardId, mediaId, { state: 'failed', why: 'no answer from the server' });
  }, [run.isPending, techCardId]);

  // THE LANDING: the run with the press's key, read off the band.
  useEffect(() => {
    if (!(techCardId > 0) || !enabled) return;
    const m = cuts.get(techCardId);
    if (!m?.size) return;
    const byKey = new Map((band.runs ?? []).map((r) => [(r.clientRequestId ?? '').trim(), r]));
    let again = false;
    for (const [mediaId, c] of [...m]) {
      const r = c.key ? byKey.get(c.key) : undefined;
      if (!r) continue;
      if (isRunLive(r)) {
        patch(techCardId, mediaId, { state: 'running', why: '' });
        continue;
      }
      if (runStatus(r) === 'done') {
        const cut = selectVisiblePictures(r.pictures ?? []).find(
          (p) => (p.media?.id ?? 0) > 0,
        )?.media;
        if (!cut) {
          patch(techCardId, mediaId, { state: 'failed', why: 'the run returned no picture' });
          continue;
        }
        const landed = land(c.original, cut);
        // A flat run is being started: the board is not written now — asked again shortly.
        if (landed === 'wait') {
          again = true;
          continue;
        }
        drop(techCardId, mediaId);
        if (landed === 'gone')
          showMessage(
            'the picture left the board while its background was removed — the cut-out is in the playground history',
            'success',
          );
        continue;
      }
      const why = (r.lastError ?? '').trim() || (r.errorCode ?? '').trim() || runStatus(r);
      if (c.state !== 'failed') showMessage(`remove bg failed — ${why}`, 'error');
      patch(techCardId, mediaId, { state: 'failed', why });
    }
    if (!again) return;
    const timer = window.setTimeout(emit, 1500);
    return () => window.clearTimeout(timer);
    // `land` is the board's latest writer; the band and the store drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [band.runs, techCardId, enabled, seen]);

  // The band is re-read while a press of this board waits for its run.
  const waiting = !!mine && [...mine.values()].some((c) => c.state !== 'failed');
  useRunPolling(techCardId, waiting ? band : EMPTY_BAND);

  return { can, stateOf, start };
}

/**
 * THE CORNER — the skin and the quiet of `crop` beside it (`TILE_CORNER + TILE_QUIET`). Busy, it
 * says `…` and stays visible; failed, it says `failed` and stays visible, and presses again.
 */
export function CutoutCorner({
  mediaId,
  n,
  cut,
  onPress,
}: {
  mediaId: number;
  n: number;
  cut: BoardCut | null;
  onPress: () => void;
}): JSX.Element {
  const busy = isCutBusy(cut);
  const failed = cut?.state === 'failed';
  return (
    <button
      type='button'
      data-mood-cutout={mediaId}
      data-state={busy ? 'busy' : failed ? 'failed' : undefined}
      aria-label={`remove the background of moodboard picture ${n}`}
      aria-busy={busy || undefined}
      disabled={busy}
      title={
        busy
          ? 'removing the background…'
          : failed
            ? `remove bg failed — ${cut?.why || 'no reason given'}. Press to try again`
            : 'remove bg — cut the subject out onto transparency (a paid run); the cut-out takes this tile, the original stays in the library'
      }
      onClick={onPress}
      // The press does not reach the frame (pan / placing) — the same as `crop`.
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        TILE_CORNER,
        TILE_QUIET,
        'py-0.5 leading-none',
        (busy || failed) && 'opacity-100',
      )}
    >
      {busy ? '…' : failed ? 'failed' : 'remove bg'}
    </button>
  );
}
