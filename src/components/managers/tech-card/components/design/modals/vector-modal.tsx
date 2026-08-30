import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
} from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nearestOnPolyline } from 'ui/components/annotation/geometry';
import { useEditHistory } from 'ui/components/annotation/history';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { pictureHandle } from '../handles';
import { provenanceLabel, readProvenance } from '../provenance';
import { useDesignWrites } from '../use-design-band';
import { RASTER_FALLBACK_W, rasteriseStrokesOverBase } from './rasterise-layer';
import { SvgImportDoor } from './svg-import-door';
import {
  findLayerForMedia,
  layerRefusalText,
  uploadRaster,
  useDesignEditLayer,
  useEditLayerWrites,
  type LayerHandle,
} from './use-edit-layer';
import {
  DEFAULT_RATIO,
  MAX_STROKES_BYTES,
  STITCHES,
  layerSvg,
  readLayer,
  settleTrace,
  stitchName,
  strokeGeometry,
  strokePolyline,
  writeLayer,
  type StitchKey,
  type StrokeWeight,
  type VectorStroke,
} from './vector-strokes';

/**
 * THE VECTOR EDITOR — strokes over a flat, on their own layer, with the raster underneath as a
 * tracing sheet. It is the door `bench-slot.tsx` ships as `edit ▸`, inert, with the reason «a later
 * wave»; this is that wave.
 *
 * THE PICTURE UNDERNEATH IS NEVER TOUCHED, AND THAT IS THE WHOLE ARRANGEMENT. Three objects, not
 * one: the BASE picture (untouched bytes), the LAYER (this client's strokes, addressed by its own
 * id and versioned by a compare-and-set rev), and — only when somebody asks for it — a FLATTENED
 * picture, a sibling of the base carrying `derived_from`. A design that wrote strokes back onto the
 * base would destroy the one thing a minted sheet pins: the hash of the bytes it froze.
 *
 * THE CLIENT RASTERISES. There is no vector renderer in the backend at all and the stroke format is
 * this client's own, so the only honest rasteriser is the canvas that drew the strokes. The bytes
 * go up through `UploadContentImage` and `FlattenDesignEditLayer` records the provenance — see
 * `use-edit-layer.ts` for why the shared upload hook is not the one used.
 *
 * A LAYER THIS BUNDLE CANNOT READ IS NOT AN EMPTY LAYER. `readLayer` flags it, every writer here
 * turns off, and the modal says so — starting clean and saving would replace a colleague's drawing
 * with nothing, and there is no revision history to recover it from (the contract says so in as
 * many words: «there is deliberately no revision history»).
 *
 * THE ROUND TRIP IS WHOLE. `download SVG` is exact — the same renderer that draws the screen writes
 * the file — and `upload SVG` reads one back, through `svg-import.ts`. The door was inert until the
 * stroke format could hold a cubic segment, because the two halves are one thing: an importer over a
 * polyline-only model has to chop every curve it meets, which is the «heap of polygons» the
 * requirement forbids in as many words. Both arrived together. What the importer cannot read it
 * REFUSES BY NAME — the failure it exists to prevent is «loaded fine» over a drawing with a line
 * missing. `source_class = imported_svg` is in the wire's vocabulary and waiting for the origin
 * column that records which of the two ways a layer was born.
 */

type Tool = 'line' | 'freehand' | 'stitch' | 'erase';

/** Where the pointer is, as a fraction of the frame. Clamped: a drag may leave the box. */
function framePoint(rect: DOMRect, clientX: number, clientY: number): [number, number] {
  const x = Math.min(1, Math.max(0, (clientX - rect.left) / (rect.width || 1)));
  const y = Math.min(1, Math.max(0, (clientY - rect.top) / (rect.height || 1)));
  return [x, y];
}

/** The stage's SVG units. Only a coordinate space; the box itself is sized by CSS. */
const STAGE_W = 1000;
/** How close a click has to land, in stage pixels, to mean «this stroke». */
const HIT_PX = 10;
/** The stage's widest drawn size, so a wide plate does not push the layers column off the modal. */
const STAGE_MAX_PX = 360;

export function VectorModal({
  open,
  onOpenChange,
  techCardId,
  band,
  base,
  slot,
  disabled,
  onFlattened,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  techCardId: number;
  band: GetDesignBandResponse;
  /** The picture being traced. Absent = a drawing from nothing, which is its own kind of layer. */
  base?: common_DesignPicture | null;
  /**
   * The bench slot the editor was opened from. The flattened picture takes it — the person acted on
   * that slot, so nothing is guessed. `slotRev` is the CAS token read with the band.
   */
  slot?: { ref: DesignBenchSlotRef; label: string; slotRev: number } | null;
  disabled?: boolean;
  /** The new picture, for a caller that wants to walk to it. */
  onFlattened?: (picture: common_DesignPicture) => void;
}) {
  const { showMessage } = useSnackBarStore();
  const { setBenchSlot } = useDesignWrites(techCardId);
  const { saveLayer, flattenLayer } = useEditLayerWrites(techCardId);

  const baseMedia = base?.media;
  const baseMediaId = baseMedia?.id ?? 0;
  const baseSrc =
    baseMedia?.media?.fullSize?.mediaUrl ||
    baseMedia?.media?.compressed?.mediaUrl ||
    baseMedia?.media?.thumbnail?.mediaUrl ||
    '';

  /** The picture's own shape, from the wire when the bucket knows it. */
  const wireRatio = useMemo(() => {
    const w = baseMedia?.media?.fullSize?.width ?? 0;
    const h = baseMedia?.media?.fullSize?.height ?? 0;
    return w > 0 && h > 0 ? w / h : DEFAULT_RATIO;
  }, [baseMedia]);

  // The layer that already traces this base, if the band listed one. Strokes are NOT in that list.
  const known = useMemo(
    () => findLayerForMedia(band.layers, baseMediaId),
    [band.layers, baseMediaId],
  );
  const knownId = known?.id ?? 0;
  const knownRev = known?.rev ?? 0;
  const layerQuery = useDesignEditLayer(techCardId, open ? knownId : 0);
  const loaded = layerQuery.data?.layer;

  const [strokes, setStrokes] = useState<VectorStroke[]>([]);
  const [tool, setTool] = useState<Tool>('line');
  const [selected, setSelected] = useState<number | null>(null);
  const [vecOn, setVecOn] = useState(true);
  const [rasterOn, setRasterOn] = useState(true);
  const [trace, setTrace] = useState<[number, number][] | null>(null);
  const [ratio, setRatio] = useState<number>(wireRatio);
  const [unreadable, setUnreadable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  /**
   * The layer's identity. STATE, because the header prints the rev and a ref would leave a stale
   * number on screen after a save; MIRRORED IN A REF, because the save chain reads it between two
   * awaits and a closure would hand it the value from before the previous call.
   */
  const [layer, setLayer] = useState<LayerHandle>({ id: 0, rev: 0 });
  const layerRef = useRef(layer);
  layerRef.current = layer;

  /**
   * SEEDED ONCE PER OPENING, AND NEVER AGAIN WHILE IT IS OPEN.
   *
   * This is a boolean rather than a content key on purpose, and the difference is a defect. Every
   * successful save invalidates the band, the band comes back with this layer in its list, the
   * layer query fires for the new id — and a key that included the loaded revision would then
   * RE-SEED: the undo history would be wiped, the tool would jump back to `line`, and anything
   * drawn in the seconds between pressing «save the drawing only» and the refetch landing would be
   * silently thrown away. The editor owns its strokes from the moment it opens; the server's copy
   * is read once, at the start.
   *
   * The consequence is one ignored round trip per newly-created layer — the GET the band's new id
   * triggers. That is the cheaper of the two failures by a wide margin.
   */
  const seeded = useRef(false);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const history = useEditHistory<VectorStroke>(strokes, setStrokes);
  const { record, undo, reset: resetHistory } = history;

  /**
   * Seed on opening — and forget everything on the way out, so reopening over another plate cannot
   * inherit the previous plate's strokes or a rev that belongs to somebody else's layer.
   */
  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (seeded.current) return;
    // A layer the band knows about is not seeded until its strokes arrive; a layer that does not
    // exist yet is seeded immediately, because there is nothing to wait for.
    if (knownId > 0 && !loaded) return;
    seeded.current = true;

    const doc = readLayer(loaded?.strokes, wireRatio);
    setLayer({ id: loaded?.id ?? knownId, rev: loaded?.rev ?? knownRev });
    setStrokes(doc.strokes);
    // WITH A BASE, THE BASE'S SHAPE WINS. The stored ratio is only the memory of a drawing that has
    // no picture under it; letting it override a real picture would put every stroke in the wrong
    // place the moment the two disagree.
    setRatio(baseMediaId > 0 ? wireRatio : doc.ratio);
    setUnreadable(doc.unreadable);
    setSelected(null);
    setTool('line');
    setRefusal(null);
    resetHistory();
  }, [open, knownId, knownRev, baseMediaId, loaded, wireRatio, resetHistory]);

  /**
   * THE EDITOR IS FROZEN UNTIL IT KNOWS WHAT IS ALREADY THERE, and this is a correctness gate
   * rather than a spinner.
   *
   * The band lists this layer WITHOUT its strokes, so between opening and the read landing the
   * canvas is empty for a reason that has nothing to do with the drawing. Two different failures
   * live in that gap. Draw and let the read land, and the seed replaces what was just drawn with
   * the stored version. Draw and press SAVE first, and the write goes out with `layer_id = 0` —
   * which the contract reads as «give birth to a new layer», so the base ends up with TWO layers
   * and the older one becomes unreachable, because the editor finds a base's layer by its media.
   *
   * `layer.id === 0` is the test for «we have not adopted one yet»: once the seed or a save has
   * given us an id, a later refetch of the band can never put us back into the gap.
   */
  const readPending = knownId > 0 && layer.id === 0 && !loaded && !layerQuery.isError;
  const readFailed = knownId > 0 && layer.id === 0 && layerQuery.isError;
  const frozen = !!disabled || unreadable || readPending || readFailed;

  // ⌘Z / Ctrl+Z. MATCHED BY `code`, NEVER BY `key`: on a Russian layout `event.key` is «я» and a
  // comparison against the letter z is dead — the same trap the assembly screen was bitten by.
  useEffect(() => {
    if (!open || frozen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'KeyZ' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      undo();
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, frozen, undo]);

  // ── drawing ────────────────────────────────────────────────────────────────────────────────

  const commitTrace = useCallback(
    (pts: [number, number][], asLine: boolean) => {
      const settled = asLine ? [pts[0], pts[pts.length - 1]] : settleTrace(pts);
      if (settled.length < 2) return;
      // Two identical endpoints are a click, not a line — a zero-length path draws nothing and can
      // never be selected again, so it would sit in the layer for ever as an invisible row.
      if (
        settled.length === 2 &&
        settled[0][0] === settled[1][0] &&
        settled[0][1] === settled[1][1]
      )
        return;
      record();
      setStrokes((prev) => [
        ...prev,
        {
          tool: asLine ? 'line' : 'freehand',
          // A NEW STROKE IS A PLAIN LINE. The stitch is an industrial claim about which machine
          // sews this seam, and nobody has made it yet — pre-filling one would put a machine kind
          // on a technical sheet that no person chose.
          brush: 'plain',
          weight: 'thin',
          dashed: false,
          pts: settled,
        },
      ]);
    },
    [record],
  );

  const onStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (frozen) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const at = framePoint(rect, event.clientX, event.clientY);

    if (tool === 'stitch' || tool === 'erase') {
      const hit = hitStroke(strokes, at, rect);
      if (hit === null) {
        setSelected(null);
        return;
      }
      if (tool === 'erase') {
        record();
        setStrokes((prev) => prev.filter((_, i) => i !== hit));
        setSelected(null);
        return;
      }
      setSelected(hit);
      return;
    }

    event.preventDefault();
    // Capture on the STAGE, not on the event target: the pointer routinely leaves the box mid-drag
    // and without capture the stroke would end wherever it crossed the border.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setTrace([at]);
  };

  const onStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!trace) return;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    const at = framePoint(rect, event.clientX, event.clientY);
    // A LINE KEEPS TWO POINTS, A TRACE ACCUMULATES. Pushing every sample and slicing at the end
    // looks identical on screen and is not: the thinning pass would then run over a hundred nearly
    // collinear samples and the «straight» line would arrive with a wobble nobody drew.
    setTrace((prev) => (!prev ? prev : tool === 'line' ? [prev[0], at] : [...prev, at]));
  };

  const onStagePointerUp = () => {
    if (!trace) return;
    if (trace.length >= 2) commitTrace(trace, tool === 'line');
    setTrace(null);
  };

  // ── the stroke under edit ──────────────────────────────────────────────────────────────────

  const editStroke = (fields: Partial<VectorStroke>) => {
    if (selected === null) return;
    record();
    setStrokes((prev) => prev.map((s, i) => (i === selected ? { ...s, ...fields } : s)));
  };

  const removeSelected = () => {
    if (selected === null) return;
    record();
    setStrokes((prev) => prev.filter((_, i) => i !== selected));
    setSelected(null);
  };

  // ── the wire ───────────────────────────────────────────────────────────────────────────────

  const payload = useMemo(() => writeLayer(strokes, ratio), [strokes, ratio]);
  const payloadBytes = useMemo(() => new TextEncoder().encode(payload).length, [payload]);
  const tooLarge = payloadBytes > MAX_STROKES_BYTES;

  /** Store the strokes and adopt the rev the server hands back. Returns the layer's id. */
  const persist = useCallback(async (): Promise<number> => {
    const res = await saveLayer.mutateAsync({
      layerId: layerRef.current.id,
      baseMediaId,
      expectedRev: layerRef.current.rev,
      strokes: payload,
    });
    const stored = res.layer;
    const next: LayerHandle = {
      id: stored?.id ?? layerRef.current.id,
      rev: stored?.rev ?? layerRef.current.rev,
    };
    layerRef.current = next;
    setLayer(next);
    return next.id;
  }, [saveLayer, baseMediaId, payload]);

  const saveDrawingOnly = async () => {
    if (frozen || tooLarge || !strokes.length || busy) return;
    setBusy('saving the drawing…');
    setRefusal(null);
    try {
      await persist();
      showMessage('the drawing is saved — no picture was made', 'success');
    } catch (error) {
      setRefusal(layerRefusalText(error));
    } finally {
      setBusy(null);
    }
  };

  /**
   * Paint base + strokes into one canvas and hand back a PNG data URL.
   *
   * THE CANVAS ITSELF LIVES IN `rasterise-layer.ts`, SHARED — the fix flow rasterises «plate +
   * layer» with the same code at launch (W-10), and two canvases drawing the same strokes would
   * drift silently. This wrapper only binds the modal's own state to it.
   */
  const rasterise = useCallback(
    () => rasteriseStrokesOverBase({ baseSrc, strokes, ratio }),
    [baseSrc, ratio, strokes],
  );

  const saveAsPicture = async () => {
    if (frozen || tooLarge || !strokes.length || busy) return;
    setRefusal(null);
    try {
      setBusy('saving the drawing…');
      const id = await persist();

      setBusy('rasterising…');
      const dataUrl = await rasterise();

      setBusy('uploading the picture…');
      const media = await uploadRaster(dataUrl);

      setBusy('filing it into the band…');
      const res = await flattenLayer.mutateAsync({
        layerId: id,
        expectedRev: layerRef.current.rev,
        mediaId: media.id ?? 0,
      });
      const picture = res.picture;

      let placed = false;
      if (slot && picture?.id) {
        setBusy(`putting it into ${slot.label}…`);
        // A SEPARATE CALL, AND A FAILURE HERE IS NOT A LOST DRAWING — which is why it has its own
        // catch and its own words. By this point the picture EXISTS in the band; if the slot moved
        // under us the CAS refuses, and reading that refusal out as «the drawing did not go
        // through» would send somebody looking for work that is already saved. The dialog closes
        // either way and says which of the two happened.
        try {
          await setBenchSlot.mutateAsync({
            slot: slot.ref,
            pictureId: picture.id,
            expectedSlotRev: slot.slotRev,
          });
          placed = true;
        } catch {
          showMessage(
            `the picture is saved, but the ${slot.label} slot was not changed — somebody moved it first. Put it in from the band.`,
            'error',
          );
        }
      }

      if (placed) showMessage(`saved and put into ${slot?.label}`, 'success');
      else if (!slot) showMessage('saved as a new picture', 'success');
      if (picture) onFlattened?.(picture);
      onOpenChange(false);
    } catch (error) {
      setRefusal(layerRefusalText(error));
    } finally {
      setBusy(null);
    }
  };

  const download = () => {
    const w = RASTER_FALLBACK_W;
    const h = Math.round(w / (ratio || DEFAULT_RATIO));
    const svg = layerSvg(strokes, { width: w, height: h, baseHref: baseSrc || undefined });
    const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const a = document.createElement('a');
    a.href = href;
    a.download = `${base ? pictureHandle(base) : 'drawing'}-vector.svg`.replace(/[^\w.-]+/g, '-');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  };

  const stageH = STAGE_W / (ratio || DEFAULT_RATIO);
  const selectedStroke = selected === null ? null : strokes[selected] ?? null;
  const ready = !frozen && strokes.length > 0 && !tooLarge && !busy;

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={saveAsPicture}
      onCancel={() => onOpenChange(false)}
      closeOnConfirm={false}
      width='lg'
      title={base ? 'vector edit — flat' : 'vector edit — a new drawing'}
      cancelLabel='discard'
      confirmLabel={busy ?? 'save as a new picture'}
      confirmDisabled={!ready}
      footerHint={
        base
          ? `the picture you started from stays where it is · the edit enters the band as a sibling${
              slot ? ` and takes the ${slot.label} slot` : ''
            }`
          : 'saves as a new picture on the upload shelf — drawn, its own row'
      }
    >
      <div className='space-y-stack'>
        {unreadable && (
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              <b>this layer was written by a version of the admin this one cannot read.</b> Nothing
              here can be saved: writing over it would replace somebody&rsquo;s drawing with an
              empty one, and a layer keeps no revision history to get it back from. Reload the admin
              — if the message survives a reload, the layer was written by a NEWER bundle and this
              tab is the old one.
            </Text>
          </CalloutBox>
        )}

        {readPending && (
          <CalloutBox tone='note'>
            <Text size='micro' component='p'>
              <b>reading the drawing that is already on this plate.</b> The band lists layers
              without their strokes, so an empty canvas here means «not read yet», not «nothing
              drawn» — the tools open as soon as it lands.
            </Text>
          </CalloutBox>
        )}

        {readFailed && (
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              <b>the drawing already on this plate could not be read.</b>{' '}
              {layerRefusalText(layerQuery.error)} Drawing is closed until it can be: a save from
              here would be filed as a SECOND layer on the same picture, and the first would stop
              being reachable.
            </Text>
          </CalloutBox>
        )}

        {refusal && (
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              {refusal}
            </Text>
          </CalloutBox>
        )}

        {tooLarge && (
          <CalloutBox tone='warning'>
            <Text size='micro' component='p'>
              <b>too many strokes for one layer.</b> {Math.round(payloadBytes / 1024)} KB against a
              ceiling of {MAX_STROKES_BYTES / 1024} KB. Nothing is lost on screen — but this cannot
              be stored until some strokes go, and thinning them automatically would move lines
              somebody drew on purpose.
            </Text>
          </CalloutBox>
        )}

        <div className='flex flex-wrap items-baseline gap-2'>
          {base ? (
            <>
              <Pill tone='ink'>base: {pictureHandle(base)}</Pill>
              <Text size='micro' variant='label' component='span'>
                {provenanceLabel(readProvenance(base))} · the original picture is never overwritten
              </Text>
            </>
          ) : (
            <Text size='micro' variant='label' component='span'>
              nothing underneath — the vector base is the drawing itself
            </Text>
          )}
          {layer.id > 0 && (
            <Text size='nano' variant='label' component='span' className='uppercase'>
              layer {layer.id} · r{layer.rev}
            </Text>
          )}
        </div>

        <ChipRow>
          {(['line', 'freehand', 'stitch', 'erase'] as const).map((t) => (
            <Chip
              key={t}
              selected={tool === t}
              pressed={tool === t}
              disabled={frozen}
              onClick={() => {
                setTool(t);
                if (t !== 'stitch') setSelected(null);
              }}
            >
              {t}
            </Chip>
          ))}
          <Text size='micro' variant='label' component='span'>
            {tool === 'stitch'
              ? 'click a stroke to select it, then say which machine sews it'
              : tool === 'erase'
                ? 'click a stroke to remove it'
                : 'press and drag to draw · ⌘Z takes back the last gesture'}
          </Text>
        </ChipRow>

        {tool === 'stitch' && (
          <StitchEditor
            stroke={selectedStroke}
            index={selected}
            disabled={frozen}
            onBrush={(brush) => editStroke({ brush })}
            onWeight={(weight) => editStroke({ weight })}
            onDashed={(dashed) => editStroke({ dashed })}
            onRemove={removeSelected}
            onDone={() => setSelected(null)}
          />
        )}

        <div className='flex flex-wrap items-start gap-2.5'>
          {/* THE FRAME CARRIES THE PICTURE'S OWN RATIO. Strokes are stored as fractions of the
              frame, so a box of another shape puts the same fraction over other pixels — the line
              drifts off the seam it was drawn on and nothing on screen admits it. The SVG's own
              viewBox is given the SAME ratio, so a «hairline» is a hairline in both axes. */}
          <div
            ref={stageRef}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerUp}
            onPointerCancel={onStagePointerUp}
            className={cn(
              'relative w-full touch-none select-none overflow-hidden border border-borderColor bg-bgColor',
              frozen ? 'cursor-default' : tool === 'erase' ? 'cursor-pointer' : 'cursor-crosshair',
            )}
            style={{ aspectRatio: String(ratio || DEFAULT_RATIO), maxWidth: `${STAGE_MAX_PX}px` }}
          >
            {baseSrc && rasterOn && (
              <img
                src={baseSrc}
                alt=''
                draggable={false}
                onLoad={(event) => {
                  const img = event.currentTarget;
                  if (baseMediaId > 0 && img.naturalWidth > 0 && img.naturalHeight > 0) {
                    setRatio(img.naturalWidth / img.naturalHeight);
                  }
                }}
                className='pointer-events-none absolute inset-0 block h-full w-full'
                style={{ objectFit: 'fill' }}
              />
            )}
            {vecOn && (
              <svg
                viewBox={`0 0 ${STAGE_W} ${stageH.toFixed(2)}`}
                preserveAspectRatio='none'
                className='pointer-events-none absolute inset-0 h-full w-full'
              >
                {strokes.map((stroke, i) => {
                  const g = strokeGeometry(stroke, STAGE_W, stageH);
                  if (!g.d) return null;
                  return (
                    <g key={i} opacity={selected !== null && selected !== i ? 0.45 : 1}>
                      {g.offsets.map((dy, k) => (
                        <path
                          key={k}
                          d={g.d}
                          transform={`translate(0 ${dy})`}
                          fill='none'
                          stroke='currentColor'
                          strokeWidth={g.strokeWidth * (selected === i ? 1.8 : 1)}
                          strokeDasharray={g.dash || undefined}
                          strokeLinecap='round'
                          strokeLinejoin='round'
                        />
                      ))}
                    </g>
                  );
                })}
                {trace && trace.length > 1 && (
                  <path
                    d={`M${trace.map(([x, y]) => `${x * STAGE_W},${y * stageH}`).join(' L')}`}
                    fill='none'
                    stroke='currentColor'
                    strokeWidth={6}
                    strokeDasharray='10 10'
                  />
                )}
              </svg>
            )}
          </div>

          <div className='min-w-0 flex-1 space-y-stack'>
            <div>
              <GroupLabel flush>layers</GroupLabel>
              <LayerRow
                on={vecOn}
                onToggle={() => setVecOn((v) => !v)}
                name='vector'
                sub={`${strokes.length} line${strokes.length === 1 ? '' : 's'} · yours`}
              />
              {base && (
                <LayerRow
                  on={rasterOn}
                  onToggle={() => setRasterOn((v) => !v)}
                  name='raster'
                  sub={`${pictureHandle(base)} · never touched`}
                />
              )}
            </div>

            <Text size='micro' variant='label' component='p'>
              {base
                ? 'The picture underneath is a tracing sheet. Saving writes the vector on top of it into a NEW picture — a sibling of the base, under the same row the base arrived in.'
                : 'No raster layer: the vector base is the drawing itself, and it lands on the upload shelf as its own single-picture batch.'}
            </Text>

            <div className='flex flex-wrap items-center gap-1.5'>
              <Button
                variant='secondary'
                size='sm'
                disabled={!ready}
                onClick={saveDrawingOnly}
                title='store the strokes without producing a picture'
              >
                save the drawing only
              </Button>
              <Text size='nano' variant='label' component='span'>
                comes back tomorrow · no picture, no plate, nothing in the band
              </Text>
            </div>
          </div>
        </div>

        <div>
          <GroupLabel>out and back</GroupLabel>
          <div className='flex flex-wrap items-start gap-2.5'>
            <div className='min-w-[180px] flex-1 space-y-1'>
              <Text size='nano' variant='uppercase' tracking='label' component='p'>
                1 · download
              </Text>
              <Text size='micro' variant='label' component='p'>
                the vector, with the raster LINKED underneath so it opens looking right. The link is
                a URL, not embedded bytes — a vector editor that cannot reach it shows the strokes
                on white, which is what the round trip is about anyway.
              </Text>
              <Button variant='secondary' size='sm' disabled={!strokes.length} onClick={download}>
                download SVG
              </Button>
            </div>
            <div className='min-w-[180px] flex-1 space-y-1'>
              <Text size='nano' variant='uppercase' tracking='label' component='p'>
                2 · outside the admin
              </Text>
              <Text size='micro' variant='label' component='p'>
                fix it in Illustrator; keep a single artboard. The raster layer is a tracing sheet
                and is ignored on the way back.
              </Text>
            </div>
            <div className='min-w-[180px] flex-1 space-y-1'>
              <Text size='nano' variant='uppercase' tracking='label' component='p'>
                3 · upload back
              </Text>
              <Text size='micro' variant='label' component='p'>
                paths, shapes, groups and transforms come back as strokes with their curves intact.
                Anything the file states that a stroke cannot hold — text, a placed instance, a
                colour — is named and refused rather than dropped quietly. Nothing changes until you
                have read what came out.
              </Text>
              <SvgImportDoor
                disabled={frozen}
                frameRatio={ratio || DEFAULT_RATIO}
                existing={strokes}
                onApply={(incoming, mode) => {
                  record();
                  setStrokes((prev) => (mode === 'replace' ? incoming : [...prev, ...incoming]));
                  setSelected(null);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </ConfirmationModal>
  );
}

/**
 * Which stroke a click means, in STAGE PIXELS rather than frame fractions.
 *
 * A fraction is anisotropic on a frame that is not square — 0.02 across is a different number of
 * pixels from 0.02 down — so a fraction-space threshold would make strokes measurably harder to hit
 * in one axis than the other on every plate that is not square. Distance is measured against the
 * POLYLINE while a freehand stroke draws as a smoothed curve through the same points; the two
 * differ by well under the thinning epsilon, which is itself about two pixels.
 *
 * THE POLYLINE IS ASKED FOR RATHER THAN ASSUMED, and on a curve that is the whole difference. A
 * cubic leaves the chord between its anchors by design — that is what makes it a curve — so a click
 * on the visible bulge of an imported stroke measured against the anchors alone would find nothing
 * under a pointer that is plainly on the line. `strokePolyline` hands back the anchors themselves
 * for a stroke with no segments, so nothing about the legacy behaviour moved.
 */
function hitStroke(strokes: VectorStroke[], at: [number, number], rect: DOMRect): number | null {
  const w = rect.width || 1;
  const h = rect.height || 1;
  const p = { x: at[0] * w, y: at[1] * h };
  let index = -1;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < strokes.length; i++) {
    const near = nearestOnPolyline(p, strokePolyline(strokes[i], w, h));
    if (!near || near.dist >= best) continue;
    best = near.dist;
    index = i;
  }
  return index >= 0 && best <= HIT_PX ? index : null;
}

function LayerRow({
  on,
  onToggle,
  name,
  sub,
}: {
  on: boolean;
  onToggle: () => void;
  name: string;
  sub: string;
}) {
  return (
    <div className='flex items-center gap-2 border-b border-hairline py-1'>
      <button
        type='button'
        onClick={onToggle}
        aria-pressed={on}
        className='flex min-w-0 shrink-0 cursor-pointer items-center gap-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
      >
        <span
          className={cn(
            'flex h-3 w-3 shrink-0 items-center justify-center border border-textColor leading-none',
            on ? 'bg-textColor text-bgColor' : 'bg-bgColor',
          )}
        >
          <Text size='nano' component='span'>
            {on ? '✓' : ''}
          </Text>
        </span>
        <Text size='micro' variant='uppercase' tracking='label' component='span'>
          {name}
        </Text>
      </button>
      <Text size='nano' variant='label' component='span' className='ml-auto min-w-0 truncate'>
        {sub}
      </Text>
    </div>
  );
}

/**
 * WHICH MACHINE SEWS THIS LINE — picked by the sample, not by the name.
 *
 * The nine kinds are shown as their own drawing rather than as a dropdown of words, because that is
 * how the choice is actually made on a shop floor: a technologist recognises a coverstitch by its
 * two rows and cannot be expected to hold «406» in his head. The ISO class rides along for the
 * person who does.
 *
 * A BRUSH IS A MACHINE KIND, NOT A SEAM CLASS. The seam class lives on the operation; two different
 * seams are routinely sewn on the same machine, so nothing here may be read as one.
 */
function StitchEditor({
  stroke,
  index,
  disabled,
  onBrush,
  onWeight,
  onDashed,
  onRemove,
  onDone,
}: {
  stroke: VectorStroke | null;
  index: number | null;
  disabled?: boolean;
  onBrush: (brush: StitchKey) => void;
  onWeight: (weight: StrokeWeight) => void;
  onDashed: (dashed: boolean) => void;
  onRemove: () => void;
  onDone: () => void;
}) {
  if (!stroke || index === null) {
    return (
      <Text size='micro' variant='label' component='p'>
        draw with <b>line</b> or <b>freehand</b>, then click a stroke here to say which machine sews
        it.
      </Text>
    );
  }
  return (
    <div>
      <GroupLabel
        action={
          <span className='flex flex-wrap items-center gap-1.5'>
            <Button variant='secondary' size='xs' disabled={disabled} onClick={onRemove}>
              delete
            </Button>
            <Button
              variant='secondary'
              size='xs'
              disabled={disabled}
              onClick={() => onBrush('plain')}
            >
              make it a plain line
            </Button>
            <Button variant='secondary' size='xs' onClick={onDone}>
              done
            </Button>
          </span>
        }
      >
        {stitchName(stroke.brush)} · line {index + 1} · {stroke.pts.length} points
      </GroupLabel>

      <div className='grid grid-cols-2 gap-1 sm:grid-cols-3'>
        {STITCHES.map((s) => (
          <button
            key={s.key}
            type='button'
            disabled={disabled}
            onClick={() => onBrush(s.key)}
            className={cn(
              'flex cursor-pointer items-center gap-1.5 border px-1.5 py-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-textColor',
              stroke.brush === s.key
                ? 'border-textColor bg-textColor text-bgColor'
                : 'border-borderColor bg-bgColor text-textColor hover:border-textColor',
            )}
          >
            <StitchGlyph brush={s.key} />
            <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
              {s.name}
            </Text>
            <Text size='nano' component='span' className='shrink-0'>
              {s.iso}
            </Text>
          </button>
        ))}
      </div>

      <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
        <Text size='micro' variant='label' component='span'>
          weight
        </Text>
        {(['hairline', 'thin', 'bold'] as const).map((w) => (
          <Chip
            key={w}
            selected={stroke.weight === w}
            pressed={stroke.weight === w}
            disabled={disabled}
            onClick={() => onWeight(w)}
          >
            {w}
          </Chip>
        ))}
        <Chip
          dashed
          selected={stroke.dashed}
          pressed={stroke.dashed}
          disabled={disabled}
          onClick={() => onDashed(!stroke.dashed)}
        >
          construction line
        </Chip>
        <Text size='micro' variant='label' component='span'>
          dashed — a construction line; solid — what is sewn
        </Text>
      </div>
    </div>
  );
}

/**
 * The stitch's own sample, drawn by the SAME renderer that draws the stage and the paper.
 *
 * The fourth argument is the reason it is legible: weights and dash rhythms are fractions of the
 * drawing's width, and this strip is 44 units wide, where «thin» would come out a quarter of a
 * pixel. The sample asks for the weights of an ordinary 200-unit drawing inside its own small box.
 */
function StitchGlyph({ brush }: { brush: StitchKey }) {
  const g = strokeGeometry(
    {
      tool: 'line',
      brush,
      weight: 'thin',
      dashed: false,
      pts: [
        [0.04, 0.35],
        [0.96, 0.35],
      ],
    },
    44,
    12,
    200,
  );
  return (
    <svg width='44' height='12' viewBox='0 0 44 12' className='shrink-0'>
      {g.offsets.map((dy, k) => (
        <path
          key={k}
          d={g.d}
          transform={`translate(0 ${dy})`}
          fill='none'
          stroke='currentColor'
          strokeWidth={g.strokeWidth}
          strokeDasharray={g.dash || undefined}
        />
      ))}
    </svg>
  );
}
