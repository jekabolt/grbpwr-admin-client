import { adminService } from 'api/api';
import type { common_DesignRun, common_MediaFull } from 'api/proto-http/admin';
import { useUploadMedia } from 'components/managers/media/utils/useUploadMedia';
import { isDefinitiveRefusal } from 'components/managers/tech-card/components/design/generation/refusal';
import {
  isRunLive,
  runStatus,
} from 'components/managers/tech-card/components/design/generation/run-state';
import { emptyParams } from 'components/managers/tech-card/components/design/playground/registry/common';
import {
  ledgerSend,
  ledgerSettle,
  operatorKey,
  requestFingerprint,
} from 'components/managers/tech-card/components/design/render/run-ledger';
import { selectVisiblePictures } from 'components/managers/tech-card/components/design/visibility';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { notify } from 'lib/stores/store';
import { useCallback, useEffect, useRef, useState } from 'react';
import { autoFrame } from './auto-frame';

/**
 * ═══ WHITE BG ON A MODEL PHOTO ═══════════════════════════════════════════════════════════════════
 *
 * THE SAME PAID ROUTE AS `remove bg` ON THE MOODBOARD (`mood-cutout.tsx`): run kind `cutout` (fal
 * BiRefNet, one picture in, one PNG with alpha out), with the same run ledger as the design screens
 * — so the press is idempotent by its `client_request_id` (a lost answer replays the same key instead
 * of buying a second cut-out) and shows up in the one history. Nothing new on the server.
 *
 * THEN, CLIENT-SIDE: the alpha PNG is re-framed by its own mask into a 3:4 headshot (`autoFrame`,
 * `./auto-frame.ts`) on pure white, uploaded as a new library media through the ordinary image door,
 * and it takes the photo's place in the form (the first of `mediaIds`; the rest stay). The original
 * stays in the library; the form still has to be saved, as after any pick.
 *
 * THE CARD: `StartDesignRun` needs a tech card (`design_run.tech_card_id` is NOT NULL with a foreign
 * key: every run lives in some card's history). A model is not one, so every model white-bg run is
 * booked on the hidden system card «model photos» (`useModelPhotoCard`, from the dictionary).
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
const START_DEADLINE_MS = 45_000;
const READ_DEADLINE_MS = 15_000;
const DOWNLOAD_DEADLINE_MS = 30_000;
const COMPOSE_DEADLINE_MS = 45_000;
const UPLOAD_DEADLINE_MS = 60_000;
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

class DeadlineError extends Error {}

function within<T>(
  work: Promise<T>,
  ms: number,
  message: string,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (done: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      done();
    };
    const onAbort = () => finish(() => reject(new Error('aborted')));
    const timer = window.setTimeout(() => finish(() => reject(new DeadlineError(message))), ms);
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    work.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

const shortReason = (error: unknown) => {
  const message = error instanceof Error ? error.message.trim() : '';
  return message && message.split(/\s+/).length <= 4 ? message : 'request failed';
};

/** The smallest headshot written when the source allows (the MODELS list portraits). */
const OUT_MIN_W = 1086;
/** A canvas over ~16.7 MP fails to encode on iOS Safari. */
const OUT_MAX_PX = 16_000_000;
/** The mask is read at most this big: the frame is a few rows' precision, not a pixel's. */
const MASK_MAX_PX = 1_500_000;

/**
 * THE HEADSHOT: the cut-out re-framed by its own alpha (`autoFrame`: head top 10%, head width 43%,
 * 3:4) on pure white, as a JPEG `File` for the ordinary upload door. Where the frame leaves the
 * picture it is white, like the ground. The person's pixels are the photo's own — nothing is
 * regenerated.
 *
 * The pixels come from a fetched Blob (direct, then the media proxy — `fetchMediaBlob`), never from
 * an `<img>` of another origin, so the canvas is not tainted and can be read and encoded.
 */
export async function composeHeadshot(
  cut: common_MediaFull,
  original?: common_MediaFull,
  signal?: AbortSignal,
): Promise<File> {
  const url =
    cut.media?.fullSize?.mediaUrl ||
    cut.media?.compressed?.mediaUrl ||
    cut.media?.thumbnail?.mediaUrl;
  if (!url) throw new Error('no file');
  let source: Blob;
  try {
    source = await within(
      fetchMediaBlob(url, signal),
      DOWNLOAD_DEADLINE_MS,
      'download timed out',
      signal,
    );
  } catch (error) {
    if (error instanceof DeadlineError || signal?.aborted) throw error;
    throw new Error('download failed');
  }
  const bitmap = await createImageBitmap(source);
  try {
    const iw = bitmap.width;
    const ih = bitmap.height;
    if (!(iw > 0 && ih > 0)) throw new Error('empty cut-out');

    // 1. The mask, read on a (possibly smaller) canvas.
    const ms = Math.min(1, Math.sqrt(MASK_MAX_PX / (iw * ih)));
    const mw = Math.max(1, Math.round(iw * ms));
    const mh = Math.max(1, Math.round(ih * ms));
    const probe = document.createElement('canvas');
    probe.width = mw;
    probe.height = mh;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    if (!pctx) throw new Error('no canvas');
    pctx.drawImage(bitmap, 0, 0, mw, mh);
    const rgba = pctx.getImageData(0, 0, mw, mh).data;
    const alpha = new Uint8Array(mw * mh);
    for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
    const framed = autoFrame(alpha, mw, mh);
    if (!framed) throw new Error('no person');

    // 2. The frame in the cut-out's own pixels.
    const fx = framed.rect.x / ms;
    const fy = framed.rect.y / ms;
    const fw = framed.rect.w / ms;

    // 3. On white: at least OUT_MIN_W wide, under the iOS canvas cap.
    let ow = Math.max(OUT_MIN_W, Math.round(fw));
    if (ow * ((ow * 4) / 3) > OUT_MAX_PX) ow = Math.floor(Math.sqrt((OUT_MAX_PX * 3) / 4));
    const oh = Math.round((ow * 4) / 3);
    const s = ow / fw;
    const canvas = document.createElement('canvas');
    canvas.width = ow;
    canvas.height = oh;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ow, oh);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // The whole picture placed under the frame (no source-rect clipping quirks past the edges).
    ctx.drawImage(bitmap, -fx * s, -fy * s, iw * s, ih * s);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.95),
    );
    if (!blob) throw new Error('not encoded');
    return new File([blob], `white-bg-${original?.id ?? cut.id ?? 0}.jpg`, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}

/**
 * THE CARD THE RUNS ARE BOOKED ON: the hidden system tech card «model photos», whose id the
 * dictionary carries as `model_photo_tech_card_id`. 0 (old backend, dictionary not loaded) = no
 * door: the icon is hidden and nothing runs.
 */
export function useModelPhotoCard(): number {
  const { dictionary } = useDictionary();
  const id = dictionary?.modelPhotoTechCardId;
  return typeof id === 'number' && id > 0 ? id : 0;
}

async function bookRun(p: Press, signal: AbortSignal): Promise<common_DesignRun> {
  const wire = {
    techCardId: p.card,
    kind: 'cutout',
    ask: '',
    params: { ...emptyParams(), extraInputMediaIds: [p.original.id ?? 0] },
    rerunOfRunId: 0,
  };
  const operator = operatorKey();
  const fingerprint = requestFingerprint(wire);
  const { id } = ledgerSend(p.card, WHITE_BG_SCOPE, fingerprint, operator);
  p.key = id;
  let ledgerSettled = false;

  try {
    const answer = await within(
      adminService.StartDesignRun({ ...wire, clientRequestId: id }),
      START_DEADLINE_MS,
      'start timed out',
      signal,
    );
    const runId = answer.run?.id ?? 0;
    if (!(runId > 0)) {
      ledgerSettle(p.card, WHITE_BG_SCOPE, fingerprint, 'unknown', id, operator);
      ledgerSettled = true;
      throw new Error('run missing');
    }
    const { matched } = ledgerSettle(p.card, WHITE_BG_SCOPE, fingerprint, 'accepted', id, operator);
    ledgerSettled = true;
    if (!matched) throw new Error('run expired');
    return answer.run!;
  } catch (error) {
    if (!ledgerSettled) {
      ledgerSettle(
        p.card,
        WHITE_BG_SCOPE,
        fingerprint,
        isDefinitiveRefusal(error) ? 'refused' : 'unknown',
        id,
        operator,
      );
    }
    if (error instanceof DeadlineError || signal.aborted) throw error;
    throw new Error('run not started');
  }
}

async function waitForCutout(
  started: common_DesignRun,
  signal: AbortSignal,
): Promise<common_MediaFull> {
  const runId = started.id ?? 0;
  if (!(runId > 0)) throw new Error('run missing');
  const until = Date.now() + WATCH_CAP_MS;
  let row = started;
  let misses = 0;

  while (!signal.aborted) {
    if (!isRunLive(row)) {
      if (runStatus(row) !== 'done') throw new Error('run failed');
      const cut = selectVisiblePictures(row.pictures ?? []).find(
        (picture) => (picture.media?.id ?? 0) > 0,
      )?.media;
      if (!cut) throw new Error('no picture');
      return cut;
    }
    if (Date.now() >= until) throw new DeadlineError('run timed out');
    await sleep(POLL_MS, signal);
    if (signal.aborted) throw new Error('aborted');
    if (document.hidden) continue;

    try {
      const answer = await within(
        adminService.GetDesignRun({ runId }),
        READ_DEADLINE_MS,
        'run read timed out',
        signal,
      );
      if (!answer.run) throw new Error('run missing');
      row = answer.run;
      misses = 0;
    } catch (error) {
      if (signal.aborted) throw error;
      misses += 1;
      if (misses >= MAX_READ_MISSES) throw new Error('run unavailable');
    }
  }
  throw new Error('aborted');
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

  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      abortRef.current?.abort();
    };
  }, []);

  const start = useCallback(
    (original: common_MediaFull) => {
      const mediaId = original.id ?? 0;
      const c = card;
      if (!(c > 0) || mediaId <= 0) return;
      // THE LOCK: one press until it lands or fails.
      if (pressRef.current) return;
      const p: Press = { original, card: c, key: '', phase: 'starting' };
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      put(p);
      void (async () => {
        try {
          const started = await bookRun(p, ctrl.signal);
          if (ctrl.signal.aborted) return;
          put({ ...p, phase: 'running' });
          const cut = await waitForCutout(started, ctrl.signal);
          if (ctrl.signal.aborted) return;
          put({ ...p, phase: 'placing' });
          const file = await within(
            composeHeadshot(cut, p.original, ctrl.signal),
            COMPOSE_DEADLINE_MS,
            'image timed out',
            ctrl.signal,
          );
          if (ctrl.signal.aborted) return;
          let white: common_MediaFull;
          try {
            white = await within(
              uploadRef.current(file),
              UPLOAD_DEADLINE_MS,
              'upload timed out',
              ctrl.signal,
            );
          } catch (error) {
            if (error instanceof DeadlineError || ctrl.signal.aborted) throw error;
            throw new Error('upload failed');
          }
          if (!ctrl.signal.aborted) landedRef.current(p.original, white);
        } catch (error) {
          if (!ctrl.signal.aborted && !gone.current) {
            notify({
              sev: 'error',
              subject: 'WHITE BG',
              text: 'failed',
              bad: shortReason(error),
            });
          }
        } finally {
          if (abortRef.current === ctrl) abortRef.current = null;
          ctrl.abort();
          put(null);
        }
      })();
    },
    [card, put],
  );

  return {
    start,
    /** The photo a press is out for, or 0. */
    busyId: press?.original.id ?? 0,
    phase: press?.phase ?? null,
  };
}
