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
  RETOUCH_CAVEAT,
  RETOUCH_WORDS_KEY,
  RETOUCH_WORDS_MAX,
  retouchRefusal,
  retouchRequest,
} from '../registry/tiles/retouch-zone';
import {
  BRUSH_SIZES,
  paintStrokes,
  zoneOfStrokes,
  type BrushSize,
  type MaskPoint,
  type MaskStroke,
} from './geometry';

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
 * the paint. The paint itself never leaves in phase 2: the server takes a polygon and redraws the
 * rectangle around it — «The rectangle around your zone may change», printed under the brush.
 *
 * FOCUS GOES BACK TO THE DOOR THAT OPENED IT (G-02 m-4). The editor is opened by state from three
 * doors — a result tile's `mask` corner, the viewer's Mask (the viewer closes first, so its button is
 * gone by the time this closes) and tile 10's own picture slot — and none is a `Dialog.Trigger`, so
 * Radix's own restore has nothing to go back to. The opener hands `onCloseAutoFocus` in
 * (`useFocusReturn`, `../focus.ts`) with a fallback that still stands: that picture's `mask` corner.
 *
 * ⚠ THE PRESS OUTLIVES THIS DIALOG. The idempotency key and «starting…» are the scoped hook's
 * (`playgroundRunScope('retouch_zone')`, render/run-ledger.ts), so closing the dialog while a run
 * is starting cannot buy a second one on the next press.
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
  const [strokes, setStrokes] = useState<MaskStroke[]>([]);
  const [brush, setBrush] = useState<BrushSize>('m');
  const [words, setWords] = useState(initialWords);
  const [aspect, setAspect] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  const stage = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  /** The stroke under the pointer — a ref, redrawn per move without a render per move. */
  const live = useRef<MaskStroke | null>(null);

  const zone = useMemo(() => (aspect ? zoneOfStrokes(strokes, aspect) : null), [strokes, aspect]);
  const input = { media, zone, painted: strokes.length > 0, words };
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
  const frozen = disabled || run.isPending;

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (frozen || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    live.current = { size: BRUSH_SIZES[brush], points: [at(e)] };
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

  const generate = () => {
    if (refusal || frozen) return;
    const said = words;
    run.start(request, {
      onAccepted: () => {
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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-black/90' />
        <Dialog.Content
          aria-label={`mask ${label}`}
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col bg-black/90 focus:outline-none'
          data-mask-editor={media.id ?? 0}
          onCloseAutoFocus={onCloseAutoFocus}
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
              className='flex size-8 shrink-0 items-center justify-center border border-bgColor/40 text-bgColor transition-colors hover:bg-bgColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bgColor'
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
                  role='img'
                  aria-label='the painted zone — drag over the picture to paint'
                  onPointerDown={onDown}
                  onPointerMove={onMove}
                  onPointerUp={onUp}
                  onPointerCancel={onUp}
                  className='absolute touch-none opacity-50'
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
                      onClick={() => setStrokes([])}
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
                    {RETOUCH_CAVEAT}
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
                  pending={run.isPending}
                  disabled={disabled}
                  onGenerate={generate}
                  trailing={
                    <Text size='micro' variant='label' component='span' className='min-w-0'>
                      1 picture · priced by the server when the run starts
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
