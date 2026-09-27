import * as Dialog from '@radix-ui/react-dialog';
import type { common_MediaFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
} from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

import { GenerateRow, LockBar, RunRefusal } from '../../render/generate-row';
import { useStartDesignRun } from '../../render/use-design-run';
import { useDesignBand } from '../../use-design-band';
import { playgroundRunScope } from '../address';
import { cardRecentTexts } from '../card-recent';
import { FoldSection, OptionRow, PromptField } from '../fields';
import { bandSuggestsPrompts, ideaMediaIds, ideasContext } from '../ideas-server';
import { recentTextKey, rememberRecentText } from '../recent';
import {
  RETOUCH_WORDS_KEY,
  RETOUCH_WORDS_MAX,
  retouchCaveat,
  retouchPriceLine,
  retouchRefusal,
  retouchRequest,
  retouchRoute,
} from '../registry/tiles/retouch-zone';
import {
  BRUSH_SIZES,
  paintStrokes,
  zoneOfStrokes,
  type BrushSize,
  type MaskPoint,
  type MaskStroke,
} from './geometry';
import { forgetMaskDraft, readMaskDraft, writeMaskDraft } from './mask-draft';
import { MaskNotDrawn, maskUploaderFor } from './mask-upload';

/**
 * ═══ MASK — PAINT A ZONE OF A PICTURE, SAY WHAT GOES THERE, GENERATE (C-11, tile 10) ══════════════
 *
 * Opened by the ONE Mask action of a picture (its tile corner, or the viewer while that picture is
 * on stage). The picture fills the dark stage the zoomed views use; the brush paints over it; the
 * panel beside it (under it on a phone) holds the whole toolbar — brush size, undo, clear — the
 * words, the honest line, and GENERATE. Nothing else: no erase tool, no shapes, no second button
 * for any of these (owner: few buttons, never two for one action).
 *
 * THE REQUEST IS `retouchRequest`'s (the tile's one writer), fed the zone `zoneOfStrokes` makes of
 * the paint. On the phase-2 window route the paint never leaves: the server takes a polygon and
 * redraws the rectangle around it — «The rectangle around your zone may change», under the brush.
 * On the mask route (C-14: `run_kinds` lists `inpaint` and the picture states its pixel size) the
 * press first uploads the mask PNG — ONCE PER PAINT (`mask-upload.ts`), so a second press on the
 * same strokes sends the same request and the ledger's idempotency key repeats — then starts the
 * `inpaint` run; the line under the brush says only the painted zone changes. The editor is frozen
 * while the mask goes up; closed before it is up, nothing is started (and it says so).
 *
 * FOCUS GOES BACK TO THE DOOR THAT OPENED IT (G-02 m-4). The editor is opened by state from three
 * doors — a result tile's `mask` corner, the viewer's Mask (the viewer closes first, so its button is
 * gone by the time this closes) and tile 10's own picture slot — and none is a `Dialog.Trigger`, so
 * Radix's own restore has nothing to go back to. The opener hands `onCloseAutoFocus` in
 * (`useFocusReturn`, `../focus.ts`) with a fallback that still stands: that picture's `mask` corner.
 *
 * ⚠ THE PRESS OUTLIVES THIS DIALOG. The idempotency key and «starting…» are the scoped hook's
 * (`playgroundRunScope('retouch_zone')`, render/run-ledger.ts), so closing the dialog while a run
 * is starting cannot buy a second one on the next press — AND THE PAINT OUTLIVES IT TOO (G-03 Codex
 * BLOCKER): from the first press on, the strokes, the words and the uploaded mask of this picture
 * are kept (`mask-draft.ts`) until the door accepts a run from them, so a reopened editor lays the
 * same paint back and its press repeats the same request and so the same key. The mask's uploader is
 * the card's, not this dialog's (`maskUploaderFor`). While the mask is going up the dialog does not
 * close (✕ off, Escape and a click outside ignored): the upload is one short wait, and a close in the
 * middle of it used to throw the paint away (G-03 m-3).
 *
 * ⚠ THE KEYBOARD PAINTS TOO (G-03 Codex MAJOR). The picture is a focusable brush: arrows move a ring
 * (one brush radius a press, four with Shift), Space puts the brush down and lifts it (the stroke
 * follows the arrows between), Enter generates, Escape lifts a stroke that is down, then closes. The
 * toolbar stays the owner's three controls; the keys are told on the picture while it has focus and
 * to a screen reader through one status line.
 */

const RETOUCH_WORDS_HINT =
  'an instruction to an image model that repaints one painted zone of a garment picture';

/** The paint's tone on screen: the system's one highlight accent, half through (DESIGN.md). */
const PAINT = '#311eee';

const SIZE_OPTIONS: readonly { value: BrushSize; label: string }[] = [
  { value: 's', label: 'S' },
  { value: 'm', label: 'M' },
  { value: 'l', label: 'L' },
];

/** The picture's rendered box inside the stage (object-fit: contain, done by hand). */
type Box = { left: number; top: number; width: number; height: number };

function mediaSrc(media: common_MediaFull): string {
  const m = media.media;
  return m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || m?.thumbnail?.mediaUrl || '';
}

export function MaskEditor({
  open,
  onOpenChange,
  techCardId,
  media,
  label,
  initialWords = '',
  onCloseAutoFocus,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  techCardId: number;
  /** The picture being retouched. */
  media: common_MediaFull;
  /** How the picture is named on screen («picture 2 of run #41»). */
  label: string;
  /** The words the box opens with — a recalled retouch's own (Codex 5). */
  initialWords?: string;
  /** Focus back to the opener on close (G-02 m-4, `useFocusReturn`). */
  onCloseAutoFocus?: (event: Event) => void;
  disabled?: boolean;
}): JSX.Element {
  const run = useStartDesignRun(techCardId, { scope: playgroundRunScope('retouch_zone') });
  // The card's band, from the query every organ of the studio shares (no second read): the words'
  // Ideas ask the server only where it names the assistant (C-15).
  const { band } = useDesignBand(techCardId);
  const { showMessage } = useSnackBarStore();
  const mediaId = media.id ?? 0;
  /* The paint kept from an earlier press on this picture (Codex BLOCKER), read once per mount. */
  const [kept] = useState(() => readMaskDraft(techCardId, mediaId));
  const [strokes, setStrokes] = useState<MaskStroke[]>(() => kept?.strokes ?? []);
  const [brush, setBrush] = useState<BrushSize>('m');
  const [words, setWords] = useState(() => (kept ? kept.words : initialWords));
  const [aspect, setAspect] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  const stage = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  /** The stroke under the pointer — a ref, redrawn per move without a render per move. */
  const live = useRef<MaskStroke | null>(null);

  /* The mask of this paint goes up once (C-14) — once per paint for the CARD, not for this dialog
     (Codex BLOCKER); `alive` stops a press whose upload outlived the editor from starting a run
     nobody is looking at. */
  const uploader = maskUploaderFor(techCardId);
  const [uploading, setUploading] = useState(false);
  /** This browser's canvas refused the mask at a press: the rectangle path from now on (M-1). */
  const [canDraw, setCanDraw] = useState(true);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* A PRESSED PAINT IS KEPT (Codex BLOCKER): from the first press — or from a kept paint this
     editor opened on — every change of the strokes or the words is written through, until the door
     accepts a run from them (`onAccepted` below forgets it). */
  const keep = useRef(!!kept);
  useEffect(() => {
    if (keep.current) writeMaskDraft(techCardId, mediaId, { strokes, words });
  }, [techCardId, mediaId, strokes, words]);

  /* THE KEYBOARD BRUSH (Codex MAJOR): where the ring stands, whether the brush is down, whether the
     picture has keyboard focus (the ring and the key line show only then), and the one status line a
     screen reader hears. */
  const [cursor, setCursor] = useState<MaskPoint>({ x: 0.5, y: 0.5 });
  const [penDown, setPenDown] = useState(false);
  const [keyFocus, setKeyFocus] = useState(false);
  const [status, setStatus] = useState('');
  /** Enter pressed with the brush down: the stroke lands first, the press follows on that render. */
  const [queued, setQueued] = useState(false);

  const route = retouchRoute(band, media, canDraw);
  const zone = useMemo(() => (aspect ? zoneOfStrokes(strokes, aspect) : null), [strokes, aspect]);
  const input = {
    media,
    zone,
    painted: strokes.length > 0,
    words,
    route,
    shownAspect: aspect || undefined,
  };
  const refusal = retouchRefusal(input);
  const request = retouchRequest(input);

  /* THE PICTURE'S BOX: the stage's size and the picture's own proportion, fitted by hand, so the
     canvas lies on the picture pixel for pixel (a fraction of the canvas IS a fraction of the
     picture — the coordinate system of the region). */
  useLayoutEffect(() => {
    const node = stage.current;
    if (!node || !aspect) return;
    const fit = () => {
      const w = node.clientWidth;
      const h = node.clientHeight;
      if (w <= 0 || h <= 0) return;
      const width = Math.min(w, h * aspect);
      const height = width / aspect;
      setBox({ left: (w - width) / 2, top: (h - height) / 2, width, height });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(node);
    return () => ro.disconnect();
  }, [aspect, open]);

  const draw = useCallback(() => {
    const el = canvas.current;
    if (!el || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(box.width * dpr);
    const h = Math.round(box.height * dpr);
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    const all = live.current ? [...strokes, live.current] : strokes;
    paintStrokes(ctx, all, w, h, PAINT);
  }, [box, strokes]);

  useEffect(draw, [draw]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>): MaskPoint => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };
  const frozen = disabled || run.isPending || uploading;

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (frozen || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setKeyFocus(false);
    const p = at(e);
    setCursor(p);
    live.current = { size: BRUSH_SIZES[brush], points: [p] };
    draw();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const stroke = live.current;
    if (!stroke || !box) return;
    const p = at(e);
    const last = stroke.points[stroke.points.length - 1];
    // A point per third of the brush radius: the hull and the paint lose nothing, and a long
    // stroke stays a few hundred points rather than one per pointer event.
    const step = (stroke.size * Math.min(box.width, box.height)) / 3;
    if (Math.hypot((p.x - last.x) * box.width, (p.y - last.y) * box.height) < step) return;
    live.current = { ...stroke, points: [...stroke.points, p] };
    draw();
  };
  const onUp = () => {
    const stroke = live.current;
    live.current = null;
    if (stroke) setStrokes((list) => [...list, stroke]);
  };

  /** Lift the keyboard brush: the stroke it drew joins the paint. */
  const lift = () => {
    const stroke = live.current;
    live.current = null;
    setPenDown(false);
    if (!stroke) return;
    setStrokes((list) => [...list, stroke]);
    setStatus(`stroke ${strokes.length + 1} painted`);
  };

  /** One brush radius on screen, as fractions of the picture's width and height. */
  const stepOf = (big: boolean) => {
    if (!box) return { dx: 0.02, dy: 0.02 };
    const px = BRUSH_SIZES[brush] * Math.min(box.width, box.height) * (big ? 4 : 1);
    return { dx: px / box.width, dy: px / box.height };
  };

  const ARROWS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };

  const onKey = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (live.current) {
        lift();
        setQueued(true);
      } else if (refusal) setStatus(refusal.reason);
      else void generate();
      return;
    }
    const arrow = ARROWS[e.key];
    if (!arrow && e.key !== ' ') return;
    e.preventDefault();
    setKeyFocus(true);
    if (frozen) return;
    if (arrow) {
      const { dx, dy } = stepOf(e.shiftKey);
      const next = {
        x: Math.min(1, Math.max(0, cursor.x + arrow[0] * dx)),
        y: Math.min(1, Math.max(0, cursor.y + arrow[1] * dy)),
      };
      setCursor(next);
      const stroke = live.current;
      if (stroke) {
        live.current = { ...stroke, points: [...stroke.points, next] };
        draw();
      }
      return;
    }
    if (live.current) {
      lift();
      return;
    }
    live.current = { size: BRUSH_SIZES[brush], points: [cursor] };
    setPenDown(true);
    setStatus('brush down: the arrows paint, Space lifts it');
    draw();
  };

  /* Enter with the brush down: `lift` has put the stroke in the paint; press on the render that
     holds it (the request and the refusal are that render's). */
  const pressRef = useRef<() => void>(() => undefined);
  pressRef.current = () => {
    if (refusal) setStatus(refusal.reason);
    else void generate();
  };
  useEffect(() => {
    if (!queued) return;
    setQueued(false);
    pressRef.current();
  }, [queued]);

  const generate = async () => {
    if (refusal || frozen) return;
    const said = words;
    // From this press on the paint is kept (Codex BLOCKER): a close and a reopen repeat THIS request.
    keep.current = true;
    writeMaskDraft(techCardId, mediaId, { strokes, words });
    let wire = request;
    if (route === 'mask') {
      const full = media.media?.fullSize;
      setUploading(true);
      let maskMediaId = 0;
      try {
        maskMediaId = await uploader.maskFor(
          media.id ?? 0,
          strokes,
          full?.width ?? 0,
          full?.height ?? 0,
        );
      } catch (e) {
        if (alive.current) setUploading(false);
        if (e instanceof MaskNotDrawn) {
          /* M-1: this browser cannot draw the mask at the picture's size. Nothing started; the
             picture takes the rectangle path from now on and the lines under the brush and beside
             GENERATE say so — the next press is the person's, on what they now read. */
          if (alive.current) setCanDraw(false);
          showMessage(
            `nothing was started: ${e.message} — the rectangle path is used now`,
            'error',
          );
          return;
        }
        showMessage(
          `the mask did not upload, nothing was started: ${e instanceof Error ? e.message : String(e)}`,
          'error',
        );
        return;
      }
      if (!alive.current) {
        showMessage(
          'the mask closed before its paint was uploaded; no retouch was started',
          'error',
        );
        return;
      }
      setUploading(false);
      wire = retouchRequest({ ...input, maskMediaId });
    }
    run.start(wire, {
      onAccepted: () => {
        // Accepted: this paint is spent — the next press on the picture is a new run.
        keep.current = false;
        forgetMaskDraft(techCardId, mediaId);
        rememberRecentText(recentTextKey('retouch_zone', RETOUCH_WORDS_KEY), said);
        /* WHERE IT LANDS, TRULY (G-02 m-2): the answer is a retouch, filed under Retouch a Zone
           (and on the grid) — not under the tile whose picture it started from, where only the
           live run is shown (`results.tsx`, «pinned»). */
        showMessage('retouch started — the new picture lands under Retouch a Zone', 'success');
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        // m-3: no close while the mask is going up (the ✕ is off; Escape and outside are ignored).
        if (!next && uploading) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-black/90' />
        <Dialog.Content
          aria-label={`mask ${label}`}
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col bg-black/90 focus:outline-none'
          data-mask-editor={media.id ?? 0}
          onCloseAutoFocus={onCloseAutoFocus}
          onEscapeKeyDown={(e) => {
            if (uploading) {
              e.preventDefault();
              return;
            }
            // Escape lifts a keyboard stroke that is down before it closes anything.
            if (live.current && penDown) {
              e.preventDefault();
              lift();
            }
          }}
          onInteractOutside={(e) => {
            if (uploading) e.preventDefault();
          }}
        >
          <Dialog.Title className='sr-only'>mask {label}</Dialog.Title>
          <Dialog.Description className='sr-only'>
            paint the zone to change on the picture, describe what should be there, then generate.
          </Dialog.Description>

          <div className='flex shrink-0 items-center justify-between gap-4 px-4 py-3 text-bgColor'>
            <Text
              size='micro'
              variant='uppercase'
              tracking='group'
              component='span'
              className='min-w-0 truncate font-bold'
            >
              mask · {label}
            </Text>
            <Dialog.Close
              aria-label='close the mask'
              disabled={uploading}
              title={
                uploading ? 'the mask is uploading; the editor closes once it is up' : undefined
              }
              className='flex size-8 shrink-0 items-center justify-center border border-bgColor/40 text-bgColor transition-colors hover:bg-bgColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-bgColor'
            >
              ✕
            </Dialog.Close>
          </div>

          <div className='flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden'>
            {/* THE STAGE — the picture and the paint over it. */}
            <div
              ref={stage}
              className='relative min-h-[50vh] shrink-0 lg:min-h-0 lg:flex-1'
              data-mask-stage=''
            >
              <img
                src={mediaSrc(media)}
                alt={label}
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  if (img.naturalWidth > 0 && img.naturalHeight > 0)
                    setAspect(img.naturalWidth / img.naturalHeight);
                }}
                className='pointer-events-none absolute select-none'
                style={
                  box
                    ? { left: box.left, top: box.top, width: box.width, height: box.height }
                    : { opacity: 0 }
                }
              />
              {box && (
                <canvas
                  ref={canvas}
                  tabIndex={0}
                  role='application'
                  aria-roledescription='brush'
                  aria-label='the picture: drag to paint, or move the brush with the arrows, Space puts it down and lifts it, Enter generates'
                  aria-describedby='mask-brush-status'
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  onKeyDown={onKey}
                  onFocus={(e) => setKeyFocus(e.currentTarget.matches(':focus-visible'))}
                  onBlur={() => {
                    setKeyFocus(false);
                    if (live.current && penDown) lift();
                  }}
                  className='absolute touch-none opacity-50 focus:outline-none'
                  style={{
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    height: box.height,
                    cursor: frozen ? 'not-allowed' : 'crosshair',
                  }}
                  data-mask-canvas=''
                />
              )}
              {box && keyFocus && (
                <>
                  {/* The picture's focus frame and the keyboard brush's ring — drawn beside the
                      half-through canvas so they read at full strength. */}
                  <div
                    aria-hidden
                    className='pointer-events-none absolute outline outline-2 outline-offset-2 outline-bgColor'
                    style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                  />
                  <div
                    aria-hidden
                    data-mask-ring=''
                    // Two tones, hard edges: a white ring inside a black one reads on any picture.
                    className={`pointer-events-none absolute rounded-full border-2 border-bgColor outline outline-1 outline-textColor ${penDown ? 'bg-bgColor/40' : ''}`}
                    style={(() => {
                      const r = BRUSH_SIZES[brush] * Math.min(box.width, box.height);
                      return {
                        left: box.left + cursor.x * box.width - r,
                        top: box.top + cursor.y * box.height - r,
                        width: 2 * r,
                        height: 2 * r,
                      };
                    })()}
                  />
                  <Text
                    size='micro'
                    variant='label'
                    component='p'
                    aria-hidden
                    className='pointer-events-none absolute bottom-2 left-1/2 w-max max-w-[calc(100%-16px)] -translate-x-1/2 bg-textColor px-2 py-1 text-center normal-case !text-bgColor'
                  >
                    arrows move · space {penDown ? 'lifts' : 'paints'} · shift+arrows go further ·
                    enter generates
                  </Text>
                </>
              )}
              <p id='mask-brush-status' role='status' aria-live='polite' className='sr-only'>
                {status}
              </p>
            </div>

            {/* THE PANEL — two sections headed like the tile forms (the zone; the words), then the
                press. The honest line stands under the brush, where the zone is made. */}
            <div className='flex shrink-0 flex-col gap-8 bg-bgColor p-4 lg:w-[380px] lg:overflow-y-auto'>
              <FoldSection title='Zone' glyph='image' collapsible={false} anchor='mask.zone'>
                <div className='flex flex-col gap-3'>
                  <OptionRow<BrushSize>
                    label='Brush'
                    value={brush}
                    options={SIZE_OPTIONS}
                    control='segmented'
                    onChange={setBrush}
                    disabled={frozen}
                    anchor='mask-brush'
                  />
                  <div className='flex items-center gap-2'>
                    <Button
                      variant='secondary'
                      size='xs'
                      disabled={frozen || strokes.length === 0}
                      onClick={() => setStrokes((list) => list.slice(0, -1))}
                    >
                      undo
                    </Button>
                    <Button
                      variant='secondary'
                      size='xs'
                      disabled={frozen || strokes.length === 0}
                      onClick={() => {
                        live.current = null;
                        setPenDown(false);
                        setStrokes([]);
                      }}
                    >
                      clear
                    </Button>
                  </div>
                  <Text
                    size='micro'
                    variant='label'
                    component='p'
                    className='normal-case'
                    data-mask-caveat=''
                  >
                    {retouchCaveat(band, media, canDraw)}
                  </Text>
                </div>
              </FoldSection>

              <FoldSection
                title='What should be there'
                glyph='text'
                required
                collapsible={false}
                anchor='mask.words'
              >
                <PromptField
                  value={words}
                  onChange={setWords}
                  label='What should be there'
                  placeholder='Remove the stain, keep the fabric texture'
                  workflowKey='retouch_zone'
                  fieldKey={RETOUCH_WORDS_KEY}
                  hint={RETOUCH_WORDS_HINT}
                  maxLength={RETOUCH_WORDS_MAX}
                  disabled={frozen}
                  cardRecent={cardRecentTexts(band, 'retouch_zone', RETOUCH_WORDS_KEY)}
                  serverIdeas={
                    bandSuggestsPrompts(band)
                      ? {
                          techCardId,
                          mediaIds: ideaMediaIds(media),
                          context: ideasContext({
                            workflowTitle: 'Retouch a Zone',
                            hint: RETOUCH_WORDS_HINT,
                          }),
                        }
                      : undefined
                  }
                />
              </FoldSection>

              <div className='flex flex-col gap-3'>
                <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />
                {refusal && !disabled && <LockBar reason={refusal.reason} />}
                <GenerateRow
                  gate={refusal ? { ok: false, reason: refusal.reason } : { ok: true }}
                  pending={run.isPending || uploading}
                  pendingLabel={uploading ? 'uploading the mask…' : undefined}
                  disabled={disabled}
                  onGenerate={() => void generate()}
                  trailing={
                    <Text
                      size='micro'
                      variant='label'
                      component='span'
                      className='min-w-0'
                      data-mask-price=''
                    >
                      {retouchPriceLine(band, media, canDraw)}
                    </Text>
                  }
                />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
