import { adminService } from 'api/api';
import type { common_DesignRun, common_MediaFull } from 'api/proto-http/admin';
import { useUploadMedia } from 'components/managers/media/utils/useUploadMedia';
import {
  isRunLive,
  runShortFailure,
  runStatus,
} from 'components/managers/tech-card/components/design/generation/run-state';
import { emptyParams } from 'components/managers/tech-card/components/design/playground/registry/common';
import { useStartDesignRun } from 'components/managers/tech-card/components/design/render/use-design-run';
import { selectVisiblePictures } from 'components/managers/tech-card/components/design/visibility';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { notify } from 'lib/stores/store';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ═══ WHITE BG ON A MODEL PHOTO ═══════════════════════════════════════════════════════════════════
 *
 * THE SAME PAID ROUTE AS `remove bg` ON THE MOODBOARD (`mood-cutout.tsx`): run kind `cutout` (fal
 * BiRefNet, one picture in, one PNG with alpha out), started through the one run door
 * (`useStartDesignRun`) — so the press is reserved against the day, is idempotent by its
 * `client_request_id` (a lost answer replays the same key instead of buying a second cut-out) and
 * shows up in the one history. Nothing new on the server.
 *
 * THEN, CLIENT-SIDE: the alpha PNG is laid on pure white at the photo's own size (padded to 3:4 —
 * on white the padding is invisible, a crop would cut the person), uploaded as a new library media
 * through the ordinary image door, and it takes the photo's place in the form
 * (the first of `mediaIds`).
 * The original stays in the library; the form still has to be saved, as after any pick.
 *
 * ⚠ NOT MOUNTED ANYWHERE (owner, 19.10: white bg is being re-specified — «not exactly a background
 * cutout»). Kept as the wired route for when it comes back.
 *
 * ⚠ THE DOOR NEEDS A TECH CARD, AND A MODEL IS NOT ONE. `StartDesignRun` refuses `tech_card_id <= 0`
 * and loads the card, and `design_run.tech_card_id` is NOT NULL with a foreign key: every run lives
 * in some card's history. So `card` is an input here, and there is no honest value for it on a model
 * form until the backend gives one (a card-free cutout, or a system card for model photos).
 * Borrowing a garment's card from a fitting was tried and dropped: the paid run landed in that
 * garment's history.
 */

export const WHITE_BG_SCOPE = 'model:white-bg';

/** One press at a time, per form. `placing` = the cut-out is back; compositing and uploading. */
export type WhiteBgPhase = 'starting' | 'running' | 'placing';

type Press = {
  /** The photo pressed on — what the result replaces. */
  original: common_MediaFull;
  card: number;
  /** The run's `client_request_id`, '' until the ledger minted it. */
  key: string;
  phase: WhiteBgPhase;
};

const POLL_MS = 2500;
/** The server caps an image run at 6 min (`RUN_CAP_MS`); past that + 2 min a row is stale. */
const WATCH_CAP_MS = 8 * 60_000;
/** Read errors in a row before the watch gives up (a deploy or a blip is not a failure). */
const MAX_READ_MISSES = 5;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

const messageOf = (error: unknown, fallback: string) =>
  (error instanceof Error ? error.message : '').trim() || fallback;

/**
 * The cut-out on pure white, at the photo's own size, padded to 3:4. Returned as a JPEG `File` for
 * the ordinary upload door (the server recompresses it like any library image).
 *
 * The pixels come from a fetched Blob (direct, then the media proxy — `fetchMediaBlob`), never from
 * an `<img>` of another origin, so the canvas is not tainted and can be encoded.
 */
export async function composeOnWhite(
  cut: common_MediaFull,
  original?: common_MediaFull,
): Promise<File> {
  const url =
    cut.media?.fullSize?.mediaUrl ||
    cut.media?.compressed?.mediaUrl ||
    cut.media?.thumbnail?.mediaUrl;
  if (!url) throw new Error('the cut-out has no file');
  const bitmap = await createImageBitmap(await fetchMediaBlob(url));
  try {
    const iw = bitmap.width;
    const ih = bitmap.height;
    if (!(iw > 0 && ih > 0)) throw new Error('the cut-out is empty');
    // «The original size»: the photo's stored size when the row knows it, else the cut-out's own.
    const ow = original?.media?.fullSize?.width ?? 0;
    const oh = original?.media?.fullSize?.height ?? 0;
    const bw = ow > 0 && oh > 0 ? ow : iw;
    const bh = ow > 0 && oh > 0 ? oh : ih;
    // 3:4 by EXTENDING the short side — white padding on a white ground does not show.
    let tw = bw;
    let th = bh;
    if (bw * 4 > bh * 3) th = Math.round((bw * 4) / 3);
    else tw = Math.round((bh * 3) / 4);
    // A canvas over ~16.7 MP fails to encode on iOS Safari; only then is the result scaled down.
    const scale = Math.min(1, Math.sqrt(16_000_000 / (tw * th)));
    const cw = Math.max(1, Math.round(tw * scale));
    const ch = Math.max(1, Math.round(th * scale));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas is not available');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // Contained in the photo's box, centred: never stretched, whatever size the provider returned.
    const fit = Math.min((bw * scale) / iw, (bh * scale) / ih);
    const dw = iw * fit;
    const dh = ih * fit;
    ctx.drawImage(bitmap, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.95),
    );
    if (!blob) throw new Error('the picture could not be encoded');
    return new File([blob], `white-bg-${original?.id ?? cut.id ?? 0}.jpg`, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

export function useWhiteBg({
  card,
  onLanded,
}: {
  /** The card the run is booked on; 0 = no door. */
  card: number;
  /** The white photo is uploaded. The caller decides whether it still has a place to go. */
  onLanded: (original: common_MediaFull, white: common_MediaFull) => void;
}) {
  const run = useStartDesignRun(card, { scope: WHITE_BG_SCOPE });
  const upload = useUploadMedia({ silent: true });
  const [press, setPress] = useState<Press | null>(null);
  const pressRef = useRef<Press | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const gone = useRef(false);
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;
  const uploadRef = useRef(upload.mutateAsync);
  uploadRef.current = upload.mutateAsync;

  const put = useCallback((next: Press | null) => {
    pressRef.current = next;
    if (!gone.current) setPress(next);
  }, []);

  const fail = useCallback(
    (why: string) => {
      abortRef.current?.abort();
      put(null);
      if (!gone.current) notify({ sev: 'error', subject: 'WHITE BG', text: 'failed', bad: why });
    },
    [put],
  );

  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      abortRef.current?.abort();
    };
  }, []);

  const place = useCallback(
    async (p: Press, cut: common_MediaFull, signal: AbortSignal) => {
      put({ ...p, phase: 'placing' });
      try {
        const file = await composeOnWhite(cut, p.original);
        if (signal.aborted) return;
        const white = await uploadRef.current(file);
        if (signal.aborted) return;
        put(null);
        landedRef.current(p.original, white);
      } catch (error) {
        if (!signal.aborted) fail(messageOf(error, 'not placed'));
      }
    },
    [put, fail],
  );

  /**
   * THE WATCH: the run is found by its key on the card's first history page (the start's answer
   * does not reach this side of the door), then followed by id through `GetDesignRun` — the one-row
   * read the contract names for watching a live run, instead of the whole band per tick.
   */
  const watch = useCallback(
    async (p: Press) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const until = Date.now() + WATCH_CAP_MS;
      let runId = 0;
      let misses = 0;
      while (!ctrl.signal.aborted) {
        await sleep(POLL_MS, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (Date.now() > until) return fail('no result in time');
        if (document.hidden) continue;
        let row: common_DesignRun | undefined;
        try {
          if (!runId) {
            const page = await adminService.ListDesignRuns({
              techCardId: p.card,
              limit: 12,
              pageToken: '',
              includeArchived: true,
            });
            row = (page.runs ?? []).find((r) => (r.clientRequestId ?? '').trim() === p.key);
            runId = row?.id ?? 0;
          } else {
            row = (await adminService.GetDesignRun({ runId })).run;
          }
          misses = 0;
        } catch (error) {
          misses += 1;
          if (misses >= MAX_READ_MISSES) return fail(messageOf(error, 'cannot read the run'));
          continue;
        }
        if (ctrl.signal.aborted) return;
        if (!row || isRunLive(row)) continue;
        if (runStatus(row) !== 'done') return fail(runShortFailure(row));
        const cut = selectVisiblePictures(row.pictures ?? []).find(
          (pic) => (pic.media?.id ?? 0) > 0,
        )?.media;
        if (!cut) return fail('no picture returned');
        return place(p, cut, ctrl.signal);
      }
    },
    [fail, place],
  );

  // A press that settled with neither an acceptance nor a refusal (no answer): stop waiting. The
  // ledger keeps the key, so the next press replays it and the server hands back that run if it
  // was booked after all.
  useEffect(() => {
    if (run.isPending) return;
    if (pressRef.current?.phase === 'starting') fail('no answer from the server');
  }, [run.isPending, fail]);

  const start = useCallback(
    (original: common_MediaFull) => {
      const mediaId = original.id ?? 0;
      const c = card;
      if (!(c > 0) || mediaId <= 0) return;
      // THE LOCK: one press until it lands or fails.
      if (pressRef.current) return;
      const p: Press = { original, card: c, key: '', phase: 'starting' };
      put(p);
      let sent = false;
      run.start(
        { kind: 'cutout', ask: '', params: { ...emptyParams(), extraInputMediaIds: [mediaId] } },
        {
          beforeSend: (key) => {
            sent = true;
            p.key = key;
            return true;
          },
          onAccepted: (key) => {
            if (gone.current) return;
            const cur = pressRef.current;
            // Another press is on screen: this answer is not about it.
            if (cur && cur.key !== key) return;
            // A late acceptance after «no answer» resumes the watch: the run was booked.
            const next: Press = { original, card: c, key, phase: 'running' };
            put(next);
            void watch(next);
          },
          onRefused: (error) => fail(messageOf(error, 'the run did not start')),
        },
      );
      if (!sent) fail('not started');
    },
    [card, run, put, fail, watch],
  );

  return {
    start,
    /** The photo a press is out for, or 0. */
    busyId: press?.original.id ?? 0,
    phase: press?.phase ?? null,
  };
}
