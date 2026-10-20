import { adminService } from 'api/api';
import type {
  common_DesignExtendParams,
  common_DesignRun,
  common_MediaFull,
  StartDesignRunRequest,
} from 'api/proto-http/admin';
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
import { detectFace } from './face-detect';
import { faceFrame, needsExtend, type FaceFrame, type FrameRect } from './face-frame';

/**
 * ═══ WHITE BG ON A MODEL PHOTO ═══════════════════════════════════════════════════════════════════
 *
 * THE SAME PAID ROUTE AS `remove bg` ON THE MOODBOARD (`mood-cutout.tsx`): run kind `cutout` (fal
 * BiRefNet, one picture in, one PNG with alpha out), with the same run ledger as the design screens
 * — so the press is idempotent by its `client_request_id` (a lost answer replays the same key instead
 * of buying a second cut-out) and shows up in the one history.
 *
 * THE FACE ROUTE (SPEC-UNIFORM — every model photo the same passport frame, faces aligned):
 *   1. the photo's face (`detectFace`, MediaPipe, lazy) → the frame from the face (`faceFrame`:
 *      eye line, chin and centre at the reference shares, 3:4);
 *   2. the frame inside the photo → the cut-out of the photo, cropped to the frame;
 *      the frame past an edge → the photo cropped to frame ∩ photo, uploaded, and an `extend` run
 *      (outpaint) grows it by exactly the missing pixels per side, so the answer IS the frame; then
 *      the cut-out of that extended picture;
 *   3. on pure white at 1086 × 1448, JPEG 0.95.
 * THE MASK ROUTE (the fallback, the behaviour before the face route): no face, no usable frame, or
 * any failure on the face route (the extend refused, failed, timed out…) → the cut-out of the photo
 * re-framed by its own alpha (`autoFrame`, `./auto-frame.ts`). The person hears of a failure only
 * when the mask route fails too. The cut-out of the original is bought once per press: a face route
 * that already has it and then fails hands it to the mask route.
 *
 * THE RESULT is uploaded as a new library media through the ordinary image door and takes the
 * photo's place in the form (the first of `mediaIds`; the rest stay). The original stays in the
 * library; the form still has to be saved, as after any pick.
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
  /** The latest run's `client_request_id`, '' until the ledger minted it. */
  key: string;
  phase: WhiteBgPhase;
};

type RunWire = Omit<StartDesignRunRequest, 'clientRequestId'>;

const POLL_MS = 2500;
const START_DEADLINE_MS = 45_000;
const READ_DEADLINE_MS = 15_000;
const DOWNLOAD_DEADLINE_MS = 30_000;
const COMPOSE_DEADLINE_MS = 45_000;
const UPLOAD_DEADLINE_MS = 60_000;
/** The first press loads the detector (its chunk, the wasm and the model). */
const FACE_DEADLINE_MS = 45_000;
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
/** The face route's passport size (SPEC-UNIFORM). */
const PASSPORT_W = 1086;
const PASSPORT_H = 1448;
/** A picture whose proportion is this far off the one expected is not the picture asked for. */
const ASPECT_TOLERANCE = 0.02;
const JPEG_QUALITY = 0.95;

const mediaUrl = (m: common_MediaFull) =>
  m.media?.fullSize?.mediaUrl || m.media?.compressed?.mediaUrl || m.media?.thumbnail?.mediaUrl;

/** The stored full-size pixels of a media, or null when the row does not say. */
function storedSize(m: common_MediaFull): { w: number; h: number } | null {
  const w = m.media?.fullSize?.width ?? 0;
  const h = m.media?.fullSize?.height ?? 0;
  return w > 0 && h > 0 ? { w, h } : null;
}

const aspectOff = (w: number, h: number, expected: number) =>
  Math.abs(w / h - expected) / expected > ASPECT_TOLERANCE;

/**
 * A media's pixels as a bitmap. They come from a fetched Blob (direct, then the media proxy —
 * `fetchMediaBlob`), never from an `<img>` of another origin, so a canvas drawn from them is not
 * tainted and can be read and encoded.
 */
async function loadBitmap(m: common_MediaFull, signal?: AbortSignal): Promise<ImageBitmap> {
  const url = mediaUrl(m);
  if (!url) throw new Error('no file');
  let blob: Blob;
  try {
    blob = await within(
      fetchMediaBlob(url, signal),
      DOWNLOAD_DEADLINE_MS,
      'download timed out',
      signal,
    );
  } catch (error) {
    if (error instanceof DeadlineError || signal?.aborted) throw error;
    throw new Error('download failed');
  }
  const bitmap = await createImageBitmap(blob);
  if (!(bitmap.width > 0 && bitmap.height > 0)) {
    bitmap.close();
    throw new Error('empty picture');
  }
  return bitmap;
}

async function jpegFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
  );
  if (!blob) throw new Error('not encoded');
  return new File([blob], name, { type: 'image/jpeg' });
}

/** `bitmap` under the frame `rect` (its own pixels), on pure white, `ow × oh`. */
function onWhite(bitmap: ImageBitmap, rect: FrameRect, ow: number, oh: number): HTMLCanvasElement {
  const s = ow / rect.w;
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
  ctx.drawImage(bitmap, -rect.x * s, -rect.y * s, bitmap.width * s, bitmap.height * s);
  return canvas;
}

const resultName = (original: common_MediaFull | undefined, cut: common_MediaFull) =>
  `white-bg-${original?.id ?? cut.id ?? 0}.jpg`;

/**
 * THE MASK ROUTE'S HEADSHOT: the cut-out re-framed by its own alpha (`autoFrame`: head top 10%, head
 * width 43%, 3:4) on pure white, as a JPEG `File` for the ordinary upload door. Where the frame
 * leaves the picture it is white, like the ground. The person's pixels are the photo's own —
 * nothing is regenerated.
 */
export async function composeHeadshot(
  cut: common_MediaFull,
  original?: common_MediaFull,
  signal?: AbortSignal,
): Promise<File> {
  const bitmap = await loadBitmap(cut, signal);
  try {
    const iw = bitmap.width;
    const ih = bitmap.height;

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
    const rect = {
      x: framed.rect.x / ms,
      y: framed.rect.y / ms,
      w: framed.rect.w / ms,
      h: framed.rect.h / ms,
    };

    // 3. On white: at least OUT_MIN_W wide, under the iOS canvas cap.
    let ow = Math.max(OUT_MIN_W, Math.round(rect.w));
    if (ow * ((ow * 4) / 3) > OUT_MAX_PX) ow = Math.floor(Math.sqrt((OUT_MAX_PX * 3) / 4));
    const oh = Math.round((ow * 4) / 3);
    return await jpegFile(onWhite(bitmap, rect, ow, oh), resultName(original, cut));
  } finally {
    bitmap.close();
  }
}

/**
 * THE FACE ROUTE'S HEADSHOT: the cut-out under the face frame, 1086 × 1448 on white. `frameIn` maps
 * the frame into the cut-out's pixels; `aspect` is the proportion the cut-out must have (the photo's,
 * or the extend's frame) — anything else is not the picture that frame was measured on.
 */
async function composeFramed(
  cut: common_MediaFull,
  original: common_MediaFull,
  aspect: number,
  frameIn: (w: number, h: number) => FrameRect,
  signal: AbortSignal,
): Promise<File> {
  const bitmap = await loadBitmap(cut, signal);
  try {
    if (aspectOff(bitmap.width, bitmap.height, aspect)) throw new Error('wrong picture');
    const rect = frameIn(bitmap.width, bitmap.height);
    return await jpegFile(onWhite(bitmap, rect, PASSPORT_W, PASSPORT_H), resultName(original, cut));
  } finally {
    bitmap.close();
  }
}

/** The part of the photo inside the frame, as a JPEG for the extend's source. */
function cropFile(bitmap: ImageBitmap, r: FrameRect, name: string): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return jpegFile(canvas, name);
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

/** A cut-out of one picture: fal BiRefNet, one PNG with alpha. */
function cutoutWire(card: number, mediaId: number): RunWire {
  return {
    techCardId: card,
    kind: 'cutout',
    ask: '',
    params: { ...emptyParams(), extraInputMediaIds: [mediaId] },
    rerunOfRunId: 0,
  };
}

/** Whole pixels the extend adds on each side of its source. */
type ExtendSides = {
  expandTop: number;
  expandBottom: number;
  expandLeft: number;
  expandRight: number;
};

/**
 * THE EXTEND WIRE — the one place the per-side request is spelled. One source picture (the frame's
 * visible part), grown by `sides` pixels of THAT picture per side, so the answer is the whole frame;
 * no ratio (the sides fix the canvas), no words (`extend_takes_no_words`).
 *
 * RECONCILE: the per-side fields of `DesignExtendParams` are being added by the backend lane
 * (SPEC-UNIFORM «Backend»); the generated `proto-http` type does not have them yet. Their names are
 * assumed here and the block is cast here — only here — until `make proto` brings the real type;
 * then the cast goes and the names follow the proto.
 */
function extendWire(card: number, mediaId: number, sides: ExtendSides): RunWire {
  const extend = { aspectRatio: '', ...sides } as common_DesignExtendParams;
  return {
    techCardId: card,
    kind: 'extend',
    ask: '',
    params: { ...emptyParams(), extraInputMediaIds: [mediaId], extend },
    rerunOfRunId: 0,
  };
}

/**
 * The frame's missing pixels in the uploaded source's own pixels: the upload door may store the crop
 * at another size than it was sent, and the extend reads the stored one.
 */
function extendSides(frame: FaceFrame, source: common_MediaFull): ExtendSides {
  const stored = storedSize(source);
  const sx = stored ? stored.w / frame.visible.w : 1;
  const sy = stored ? stored.h / frame.visible.h : 1;
  const m = frame.missing;
  return {
    expandTop: Math.round(m.top * sy),
    expandBottom: Math.round(m.bottom * sy),
    expandLeft: Math.round(m.left * sx),
    expandRight: Math.round(m.right * sx),
  };
}

async function bookRun(p: Press, wire: RunWire, signal: AbortSignal): Promise<common_DesignRun> {
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

/** The run's one picture, once it is done. */
async function waitForPicture(
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
      const picture = selectVisiblePictures(row.pictures ?? []).find(
        (pic) => (pic.media?.id ?? 0) > 0,
      )?.media;
      if (!picture) throw new Error('no picture');
      return picture;
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

/** What a route needs from the press it runs in. */
type PressIo = {
  signal: AbortSignal;
  phase: (phase: WhiteBgPhase) => void;
  /** Book one run and wait for its picture. */
  run: (wire: RunWire) => Promise<common_MediaFull>;
  /** The cut-out of the original — bought at most once per press. */
  cutOfOriginal: () => Promise<common_MediaFull>;
  upload: (file: File) => Promise<common_MediaFull>;
};

/**
 * THE FACE ROUTE (see the file head). Resolves null when there is no face or no usable frame (the
 * mask route answers); rejects on any failure (the mask route answers too).
 */
async function faceRoute(
  original: common_MediaFull,
  card: number,
  io: PressIo,
): Promise<File | null> {
  const { signal } = io;
  const bitmap = await loadBitmap(original, signal);
  const sw = bitmap.width;
  const sh = bitmap.height;
  let frame: FaceFrame | null = null;
  let crop: File | null = null;
  try {
    const points = await within(detectFace(bitmap), FACE_DEADLINE_MS, 'face timed out', signal);
    frame = points ? faceFrame(points, sw, sh) : null;
    if (frame && needsExtend(frame)) {
      crop = await cropFile(bitmap, frame.visible, `white-bg-src-${original.id ?? 0}.jpg`);
    }
  } finally {
    bitmap.close();
  }
  if (!frame) return null;
  const f = frame;

  // Inside the photo: the photo's own cut-out, cropped to the frame.
  if (!crop) {
    const cut = await io.cutOfOriginal();
    if (signal.aborted) throw new Error('aborted');
    io.phase('placing');
    return within(
      composeFramed(
        cut,
        original,
        sw / sh,
        (w, h) => ({
          x: (f.rect.x * w) / sw,
          y: (f.rect.y * h) / sh,
          w: (f.rect.w * w) / sw,
          h: (f.rect.h * h) / sh,
        }),
        signal,
      ),
      COMPOSE_DEADLINE_MS,
      'image timed out',
      signal,
    );
  }

  // Past an edge: the visible part, grown by the outpaint to the whole frame, then cut out.
  let source: common_MediaFull;
  try {
    source = await within(io.upload(crop), UPLOAD_DEADLINE_MS, 'upload timed out', signal);
  } catch (error) {
    if (error instanceof DeadlineError || signal.aborted) throw error;
    throw new Error('upload failed');
  }
  if (!((source.id ?? 0) > 0)) throw new Error('upload failed');
  const boxAspect = f.box.w / f.box.h;
  const extended = await io.run(extendWire(card, source.id!, extendSides(f, source)));
  const grown = storedSize(extended);
  // An answer that did not grow to the frame (an old server ignoring the sides) is not paid on.
  if (grown && aspectOff(grown.w, grown.h, boxAspect)) throw new Error('wrong picture');
  const cut = await io.run(cutoutWire(card, extended.id ?? 0));
  if (signal.aborted) throw new Error('aborted');
  io.phase('placing');
  return within(
    composeFramed(
      cut,
      original,
      boxAspect,
      // The cut-out spans the box; the frame sits inside it by its sub-pixel offset.
      (w, h) => ({
        x: ((f.rect.x - f.box.x) * w) / f.box.w,
        y: ((f.rect.y - f.box.y) * h) / f.box.h,
        w: (f.rect.w * w) / f.box.w,
        h: (f.rect.h * h) / f.box.h,
      }),
      signal,
    ),
    COMPOSE_DEADLINE_MS,
    'image timed out',
    signal,
  );
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
      const { signal } = ctrl;
      abortRef.current = ctrl;
      put(p);

      const phase = (next: WhiteBgPhase) => {
        if (!signal.aborted && pressRef.current?.original === original) {
          put({ ...p, phase: next });
        }
      };
      const run = async (wire: RunWire) => {
        const started = await bookRun(p, wire, signal);
        if (signal.aborted) throw new Error('aborted');
        phase('running');
        return waitForPicture(started, signal);
      };
      let cutOnce: Promise<common_MediaFull> | null = null;
      const io: PressIo = {
        signal,
        phase,
        run,
        cutOfOriginal: () => (cutOnce ??= run(cutoutWire(c, mediaId))),
        upload: (file) => uploadRef.current(file),
      };

      void (async () => {
        try {
          let file: File | null = null;
          try {
            file = await faceRoute(original, c, io);
          } catch {
            // Any face-route failure falls back to the mask route below; only its failure is told.
          }
          if (signal.aborted) return;
          if (!file) {
            const cut = await io.cutOfOriginal();
            if (signal.aborted) return;
            phase('placing');
            file = await within(
              composeHeadshot(cut, original, signal),
              COMPOSE_DEADLINE_MS,
              'image timed out',
              signal,
            );
          }
          if (signal.aborted) return;
          let white: common_MediaFull;
          try {
            white = await within(
              uploadRef.current(file),
              UPLOAD_DEADLINE_MS,
              'upload timed out',
              signal,
            );
          } catch (error) {
            if (error instanceof DeadlineError || signal.aborted) throw error;
            throw new Error('upload failed');
          }
          if (!signal.aborted) landedRef.current(original, white);
        } catch (error) {
          if (!signal.aborted && !gone.current) {
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
