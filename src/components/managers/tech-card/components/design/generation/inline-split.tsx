import type { common_DesignPicture } from 'api/proto-http/admin';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Button } from 'ui/components/button';

import { pictureHandle } from '../handles';
import {
  SPLIT_QUIET,
  SplitError,
  SplitQuietActions,
  SplitStage,
  useSplitCut,
} from '../split-modal';
import { closeSurface, openSurface } from './bench-store';

/**
 * ═══ «KEEP AS ONE PICTURE» — A PICTURE THE GATE MISREAD AS A SHEET (gate wave 3, W6) ════════════
 *
 * `splitViewsOf` reads a `one` run's lone output as a sheet even when the provider answered with a
 * single drawing (the legacy `readSplit` fallback). Drawn only as the editor, such a picture had no
 * way back to its tile. The person says so once: the picture id goes into this card's kept set
 * (localStorage, per card, best effort) and the bench draws it as the ordinary tile again, its
 * `split` corner still there for a change of mind. No write.
 */
const KEPT_KEY = (card: number) => `grbpwr.design.split.kept.${card}`;
const keptCache = new Map<number, ReadonlySet<number>>();
const keptListeners = new Set<() => void>();
const NONE: ReadonlySet<number> = new Set();

function readKept(card: number): ReadonlySet<number> {
  const cached = keptCache.get(card);
  if (cached) return cached;
  let kept: ReadonlySet<number> = NONE;
  try {
    const raw = window.localStorage.getItem(KEPT_KEY(card));
    const ids = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(ids)) kept = new Set(ids.map(Number).filter((n) => n > 0));
  } catch {
    /* no storage, or a value this build did not write — nothing kept */
  }
  keptCache.set(card, kept);
  return kept;
}

export function keepAsOnePicture(card: number, pictureId: number): void {
  if (card <= 0 || pictureId <= 0) return;
  const next = new Set(readKept(card));
  next.add(pictureId);
  keptCache.set(card, next);
  try {
    window.localStorage.setItem(KEPT_KEY(card), JSON.stringify([...next]));
  } catch {
    /* the session still remembers it */
  }
  keptListeners.forEach((l) => l());
}

function subscribeKept(listener: () => void): () => void {
  keptListeners.add(listener);
  return () => {
    keptListeners.delete(listener);
  };
}

/** The pictures of this card kept as one picture — the bench draws them as tiles, not the editor. */
export function useKeptWhole(card: number): ReadonlySet<number> {
  const read = () => readKept(card);
  return useSyncExternalStore(subscribeKept, read, read);
}

/**
 * ═══ THE SHEETS THE BENCH ALREADY TRIED TO CUT ITSELF (T26) ══════════════════════════════════════
 * One automatic attempt per picture per session (module + sessionStorage, best effort): a failed
 * or refused auto-cut leaves the sheet to the person, and a sheet whose pieces were later removed
 * is not cut again behind their back on the next re-read or reload.
 */
const AUTO_KEY = 'grbpwr.design.split.auto';
let autoTried: Set<number> | null = null;

function autoTriedSet(): Set<number> {
  if (autoTried) return autoTried;
  autoTried = new Set();
  try {
    const ids = JSON.parse(window.sessionStorage.getItem(AUTO_KEY) || '[]') as unknown;
    if (Array.isArray(ids)) ids.map(Number).forEach((n) => n > 0 && autoTried?.add(n));
  } catch {
    /* no storage — the module still remembers */
  }
  return autoTried;
}

/** Claims the one automatic attempt for `pictureId`; `false` when it was already spent. */
function claimAutoCut(pictureId: number): boolean {
  const tried = autoTriedSet();
  if (pictureId <= 0 || tried.has(pictureId)) return false;
  tried.add(pictureId);
  try {
    window.sessionStorage.setItem(AUTO_KEY, JSON.stringify([...tried].slice(-500)));
  } catch {
    /* the module still remembers */
  }
  return true;
}

/**
 * ═══ THE SPLIT, INLINE ON THE BENCH (03.10, owner item 19, T20) ═══════════════════════════════════
 *
 * Owner, verbatim: «в LATEST GENERATION если мы имеем дело с не сплитнутой картинкой нам это прямо
 * в этом же блоке надо разметить и спилтнуть и кропнуть должны видеть то что на скриншоте и снизу
 * кнопка confirm».
 *
 * An uncut sheet on the FLAT bench is not a tile with a SPLIT corner: it is the sheet itself at the
 * block's width, its frames pre-placed from the declared views, each with its black chip (the chip
 * is the view picker), dragged and resized in place, and one `confirm` under it. `confirm` is the
 * popup's cut: the same `useSplitCut`, the same `SplitDesignPicture` payload, `for_input` false
 * (a cut on the bench lays a sheet out into views; it does not feed the prompt, T-15).
 *
 * THE BENCH HOLDS WHILE SOMEBODY CUTS. The first touch of a frame (or the press of `confirm`) opens
 * a surface of this run (`bench-store.ts`), exactly as the popup did on open: a newer run landing on
 * a poll does not swap the sheet out from under the frames, and the pieces land here. Merely seeing
 * the editor holds nothing. The surface goes when the editor does, which is when the band re-read
 * brings the pieces and the bench draws them instead (`piecesInPlace`).
 */
export function InlineSplit({
  techCardId,
  picture,
  views,
  runId,
  auto = false,
}: {
  techCardId: number;
  picture: common_DesignPicture;
  /** The views the frames are seeded from — the tile gate's own reading (`splitViewsOf`). */
  views: readonly string[];
  runId: number;
  /**
   * ═══ THE SHEET CUTS ITSELF (05.10, owner item 11, R19, T26) ════════════════════════════════════
   * Owner: «на воркбенче когда нам надо сделать сплит автоматически его делать». When the detector
   * is CONFIDENT (exactly N−1 clear gaps, `detect-split.ts`) and nobody touched a frame, the editor
   * presses its own `confirm` once: the same `SplitDesignPicture` with the detected frames, the
   * views in `composite_views` order, `for_input` false. Silent — a refusal stays in the editor's
   * own callout, no snackbar — and the sheet is then the person's to cut, as before. Unsure: the
   * frames are only seeded. `put the N pieces into sides ▸` stays a button.
   */
  auto?: boolean;
}) {
  const pictureId = picture.id ?? 0;
  const surface = `split:inline:${pictureId}`;
  const cut = useSplitCut({
    techCardId,
    picture,
    views,
    forInput: false,
    active: true,
    onTouch: () => openSurface(techCardId, surface, runId),
  });
  useEffect(() => () => closeSurface(techCardId, surface), [techCardId, surface]);
  const [autoCutting, setAutoCutting] = useState(false);
  const confident = !!cut.detection?.confident;
  useEffect(() => {
    if (!auto || !confident || !cut.ready || cut.pending || cut.landed) return;
    if (!cut.untouched() || !claimAutoCut(pictureId)) return;
    setAutoCutting(true);
    cut.autoSubmit();
  });
  if (autoCutting && !cut.pending && !cut.landed) setAutoCutting(false);
  const locked = cut.landed || autoCutting;
  /**
   * THE LAST FRAME OUT IS «KEEP AS ONE PICTURE» (03.10, owner item 36: «если мы находимся в
   * состоянии сплита и мы удалили все рамки то картинка без сплита остается в воркбенче и вью
   * кропа закрывается»). An editor with no frame has nothing to cut, so its last `✕` closes it the
   * way W6 does: the picture joins this card's kept set and stands as the ordinary tile, its
   * `split` corner there for a change of mind (the popup seeds its frames afresh). Every other `✕`
   * is the shared one, and `reset` still brings the frames back. The popup keeps its own rule.
   */
  const removeSide = (index: number) => {
    if (cut.frames.length <= 1) keepAsOnePicture(techCardId, pictureId);
    else cut.removeSide(index);
  };
  const stageCut = { ...cut, removeSide };

  const handle = pictureHandle(picture);
  return (
    <div data-inline-split={pictureId} className='space-y-2'>
      <div
        data-split-auto={confident ? 'confident' : cut.detection ? 'unsure' : undefined}
        inert={locked || undefined}
        className={locked ? 'pointer-events-none' : undefined}
      >
        <SplitStage cut={stageCut} nameInFrame maxHeight={560} />
      </div>
      <div className='flex items-center justify-between gap-3'>
        {/* A LANDED CUT IS TERMINAL (W7): the edits go, and the line says what it waits for until
            the band re-read brings the pieces and the bench draws them instead of this editor. */}
        {autoCutting ? (
          <span
            role='status'
            data-split-autocut={pictureId}
            className='text-micro uppercase tracking-label text-labelColor'
          >
            cutting into {cut.frames.length} pictures…
          </span>
        ) : cut.landed ? (
          <span
            role='status'
            data-split-waiting={pictureId}
            className='text-micro uppercase tracking-label text-labelColor'
          >
            cut · waiting for the pieces…
          </span>
        ) : (
          <SplitQuietActions cut={cut}>
            <button
              type='button'
              className={SPLIT_QUIET}
              data-split-keep={pictureId}
              onClick={() => keepAsOnePicture(techCardId, pictureId)}
            >
              keep as one picture
            </button>
          </SplitQuietActions>
        )}
        <Button
          type='button'
          variant='main'
          size='sm'
          data-split-confirm={pictureId}
          aria-label={`cut ${handle} into ${cut.frames.length} pictures`}
          title={cut.viewless > 0 ? 'name every side' : undefined}
          disabled={!cut.ready || cut.pending || locked}
          onClick={cut.submit}
        >
          confirm
        </Button>
      </div>
      <SplitError cut={cut} />
    </div>
  );
}
