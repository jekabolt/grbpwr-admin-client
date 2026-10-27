// THE STEP'S SEAM PICKER v2 «step picture» (owner OK 27.10). The step's inputs drawn as units — each
// input one shape, its pieces as assembled, one human name — laid along the step's seam and pulled
// apart; RESULT shows them joined. The proposal is dashed with its mm, the user's own pick blue, a
// stored seam ink bold with its number. Clicking edges collects the sides (with two or more inputs
// the side is the input's, with one it is the A / B switch); one picked side gets its partner by
// length, dashed. Nothing is stored until «accept» (or Enter): then the pair becomes ONE card seam
// (composite when a side holds several runs, surface when one side is an inner line) and its key
// goes onto the step, after the ones already there. «place» drags the part onto its host for a
// surface seam.

import * as Dialog from '@radix-ui/react-dialog';
import type { EdgeId, SeamCandidate } from 'lib/assembly-skeleton/types';
import { anchorOfRunId, type EdgeAnchor, type SeamPlacement, type StoredSeam } from 'lib/seams';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Button, Close, Placeholder, Text, ViewSwitch } from 'ui';
import type { AsmPiece } from '../../techpack/derive-assembly';
import { rowFromHand, runsOfSide } from '../assembly-seams/seam-actions';
import { useSeamsStore } from '../assembly-seams/seams-store';
import { edgeOf, plainEdges } from '../assembly-seams/words';
import { useAttachStepSeam } from './step-seams-context';
import {
  deltaMm,
  fmtMm,
  longestEdge,
  parseInner,
  pieceOfTarget,
  sideOf,
  surfaceRow,
  type Pt,
  type TargetId,
} from './step-seams-model';
import { boxOf, candidateOf, partnerOf, pathOf, type SeamSides } from './step-picture';
import {
  StepPictureSvg,
  seamSig,
  useBoxSize,
  useStable,
  useStepLayout,
  useStepScene,
  type EdgeMark,
  type NoMark,
} from './step-picture-view';

type Side = 'a' | 'b';
type Sel = { a: TargetId[]; b: TargetId[] };
type Place = { x: number; y: number; rot: number };
const EMPTY: Sel = { a: [], b: [] };
const SIDES = [
  { value: 'a', label: 'side A' },
  { value: 'b', label: 'side B' },
] as const;

/** Share of the extent the inputs stand apart on the canvas. */
const EXPLODE = 0.08;

const polyLen = (pts: readonly Pt[]) =>
  pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : s), 0);
const mmText = (v: number) => `${fmtMm(v)} mm`;

export default function SeamPicker({
  index,
  open,
  onClose,
}: {
  index: number;
  open: boolean;
  onClose: () => void;
}) {
  const scene = useStepScene(index);
  const {
    op,
    geo,
    geoms,
    innerLines,
    groups,
    leaves,
    ease,
    stored,
    used,
    suggestion,
    innerSeams,
    frameSeams,
    storedSeams,
    pieceName: nameOf,
  } = scene;
  const frozen = scene.ctx?.frozen ?? true;
  const cardId = scene.ctx?.cardId;
  const attach = useAttachStepSeam(index);
  const errors = useSeamsStore((s) => s.errors);

  const [sel, setSel] = useState<Sel>(EMPTY);
  const [chosen, setChosen] = useState<Side>('a');
  const [hover, setHover] = useState<TargetId | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');

  const pieces = geo?.pieces;
  const lenOf = useCallback(
    (id: TargetId) => {
      const inner = parseInner(id);
      return inner
        ? polyLen(pieces?.get(inner.piece)?.inner[inner.k] ?? [])
        : edgeOf(id, geoms)?.lenMm ?? 0;
    },
    [pieces, geoms],
  );
  const sideLen = (ids: readonly TargetId[]) => ids.reduce((s, id) => s + lenOf(id), 0);

  // ── the partner of a lone picked side: the other side's edge closest in length ──
  const sewnInside = useMemo(() => {
    const s = new Set<EdgeId>();
    for (const c of innerSeams)
      for (const id of [c.a, c.b, ...(c.aParts ?? []), ...(c.bParts ?? [])]) s.add(id);
    return s;
  }, [innerSeams]);
  const lone: Side | null =
    sel.a.length > 0 && sel.b.length === 0
      ? 'a'
      : sel.b.length > 0 && sel.a.length === 0
        ? 'b'
        : null;
  const partner = useMemo(() => {
    if (!lone || sel[lone].some((t) => parseInner(t))) return null;
    const mine = new Set(sel[lone].map(pieceOfTarget));
    const other =
      groups.length >= 2
        ? lone === 'a'
          ? groups.slice(1).flatMap((g) => g.pieces)
          : groups[0].pieces
        : groups[0]?.pieces ?? [];
    const cands = other.flatMap((p) => {
      const g = geoms.get(p);
      if (!g || mine.has(p)) return [];
      return plainEdges(g)
        .filter((e) => !used.has(e.id) && !sewnInside.has(e.id))
        .map((e) => ({ id: e.id, lenMm: e.lenMm }));
    });
    const len = sel[lone].reduce((s, id) => s + lenOf(id), 0);
    return partnerOf(len, cands, (a, b) => deltaMm(a, b, ease));
  }, [lone, sel, groups, geoms, used, sewnInside, ease, lenOf]);

  // ── what «accept» would write ──
  const inners = [...sel.a, ...sel.b].filter((t) => parseInner(t));
  const surface = inners.length === 1;
  const hostSide: Side | null = surface ? (sel.a.includes(inners[0]) ? 'a' : 'b') : null;
  const host = surface ? parseInner(inners[0]) : null;
  const hostGroup = host ? groups.findIndex((g) => g.pieces.includes(host.piece)) : -1;
  const partKey = useMemo(() => {
    if (!host || !hostSide) return null;
    const other = sel[hostSide === 'a' ? 'b' : 'a'];
    if (other.length) return pieceOfTarget(other[0]);
    const g = groups.find((_, gi) => gi !== hostGroup);
    return g?.pieces.find((p) => pieces?.has(p)) ?? null;
  }, [host, hostSide, sel, groups, hostGroup, pieces]);

  /** The pair on the table: the user's own (both sides, or one side + its partner), else the proposal. */
  const pair: (SeamSides & { own: boolean }) | null = (() => {
    if (inners.length) return null;
    if (sel.a.length && sel.b.length) return { a: sel.a, b: sel.b, own: true };
    if (lone && partner)
      return lone === 'a'
        ? { a: sel.a, b: [partner], own: true }
        : { a: [partner], b: sel.b, own: true };
    if (!sel.a.length && !sel.b.length && suggestion)
      return { a: suggestion.a, b: suggestion.b, own: false };
    return null;
  })();
  const canAccept =
    !frozen &&
    !busy &&
    !!cardId &&
    (surface ? !!partKey && sel[hostSide!].length === 1 : inners.length === 0 && !!pair);

  const anchorCtx = useMemo(
    () => ({ pieces: [...geoms.values()], grainDeg: geo?.grainDeg ?? new Map(), nameOf }),
    [geoms, geo?.grainDeg, nameOf],
  );

  const placement = useCallback((): SeamPlacement | undefined => {
    if (!place || !host) return undefined;
    return {
      xMm: Math.round(place.x * 10) / 10,
      yMm: Math.round(place.y * 10) / 10,
      rotDeg: place.rot,
      flip: false,
    };
  }, [place, host]);

  const buildRow = useCallback(
    (s: Sel): StoredSeam | null => {
      const ins = [...s.a, ...s.b].filter((t) => parseInner(t));
      if (ins.length === 0)
        return rowFromHand(s.a, s.b, geoms, anchorCtx, { direction: 'reversed' });
      const h = parseInner(ins[0]);
      const g = h ? geoms.get(h.piece) : undefined;
      const line = h ? pieces?.get(h.piece)?.inner[h.k] : undefined;
      if (!h || !g || !line || !partKey || !geo) return null;
      const hs: Side = s.a.includes(ins[0]) ? 'a' : 'b';
      const picked = s[hs === 'a' ? 'b' : 'a'];
      const runs = picked.length ? runsOfSide(picked, geoms) : [longestEdge(geoms.get(partKey))];
      const parts = runs
        .map((id) => (id ? anchorOfRunId(anchorCtx.pieces, id, geo.grainDeg) : null))
        .filter((a): a is EdgeAnchor => !!a);
      return surfaceRow(
        { geom: g, k: h.k, line, grainDeg: geo.grainDeg.get(h.piece) ?? 0 },
        parts,
        placement(),
      );
    },
    [geoms, anchorCtx, pieces, geo, partKey, placement],
  );

  const reset = () => {
    setSel(EMPTY);
    setPlace(null);
    setChosen('a');
    setRefused('');
  };

  const commit = async () => {
    if (!canAccept) return;
    const row = buildRow(surface || !pair ? sel : { a: [...pair.a], b: [...pair.b] });
    if (!row) {
      setRefused('cannot pair');
      return;
    }
    setBusy(true);
    setRefused('');
    const ok = await attach(row);
    setBusy(false);
    if (!ok) {
      setRefused(useSeamsStore.getState().errors[row.seamKey] ?? 'not saved');
      return;
    }
    reset();
  };

  const toggle = (id: TargetId) => {
    if (frozen || place) return;
    const side = sideOf(pieceOfTarget(id), groups, chosen);
    setRefused('');
    const has = sel[side].includes(id);
    setSel({ ...sel, [side]: has ? sel[side].filter((x) => x !== id) : [...sel[side], id] });
    // One input: the first pick on A moves the switch to B.
    if (!has && groups.length < 2 && side === 'a' && sel.a.length === 0) setChosen('b');
  };

  // ── the canvas: inputs along the step's seam, apart; RESULT: joined along the pair ──
  const layout = useStepLayout(leaves, frameSeams, geoms, EXPLODE);
  const pairSeam = pair ? candidateOf(pair, geoms) : null;
  const resultRaw = [...innerSeams, ...storedSeams, ...(pairSeam ? [pairSeam] : [])];
  const resultSeams = useStable<SeamCandidate[]>(resultRaw, seamSig(resultRaw));
  const joined = useStepLayout(leaves, resultSeams, geoms, 0);
  const hasResult = storedSeams.length > 0 || !!pairSeam;

  const marks: EdgeMark[] = [];
  const nos: NoMark[] = [];
  stored.forEach((s, i) => {
    for (const id of [...s.sides.a, ...s.sides.b]) marks.push({ id, tone: 'stored' });
    const first = s.sides.a[0] ?? s.sides.b[0];
    if (first) nos.push({ id: first, i });
  });
  const sideMarks = (ids: readonly TargetId[], tone: EdgeMark['tone']) =>
    ids.forEach((id, k) =>
      marks.push({ id, tone, label: k === 0 ? mmText(sideLen(ids)) : undefined }),
    );
  if (sel.a.length || sel.b.length) {
    sideMarks(sel.a, 'pick');
    sideMarks(sel.b, 'pick');
    if (partner) sideMarks([partner], 'proposal');
  } else if (pair) {
    sideMarks(pair.a, 'proposal');
    sideMarks(pair.b, 'proposal');
  }
  const resultMarks: EdgeMark[] = marks.map(({ id, tone }) => ({ id, tone }));

  const delta = pair ? deltaMm(sideLen(pair.a), sideLen(pair.b), ease) : null;
  const empty = !pair && !surface && stored.length === 0 && !sel.a.length && !sel.b.length;

  const [canvasEl, canvas] = useBoxSize();
  const [resultEl, result] = useBoxSize();
  const phone = canvas.w > 0 && canvas.w < 600;

  // ── «place»: the part follows the pointer over its host (mm in the drawing frame) ──
  const hostPiece = host ? pieces?.get(host.piece) : undefined;
  const partPiece = partKey ? pieces?.get(partKey) : undefined;
  const startPlace = () => {
    if (place) return setPlace(null);
    if (!hostPiece || !partPiece || !host) return;
    const hb = boxOf(hostPiece.cut);
    const lb = boxOf(hostPiece.inner[host.k] ?? hostPiece.cut);
    const pb = boxOf(partPiece.cut);
    // Start with the part centred on the mark, relative to the host's bbox corner.
    setPlace({
      x: (lb.x0 + lb.x1) / 2 - (pb.x1 - pb.x0) / 2 - hb.x0,
      y: (lb.y0 + lb.y1) / 2 - (pb.y1 - pb.y0) / 2 - hb.y0,
      rot: 0,
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea')) return;
    if (e.key === 'Enter' && canAccept) {
      e.preventDefault();
      void commit();
    }
  };

  const loading = geo?.dep.status === 'pending';
  const drawn = layout.T.size > 0;
  const error = refused || stored.map((s) => (errors[s.key] ? 'refused' : '')).find(Boolean) || '';

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] bg-overlay' />
        <Dialog.Content
          data-seam-picker=''
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col bg-pageBg px-3 text-textColor focus:outline-none md:px-4 md:pb-4'
          onEscapeKeyDown={(e) => {
            if (place) {
              e.preventDefault();
              setPlace(null);
            } else if (sel.a.length || sel.b.length) {
              e.preventDefault();
              reset();
            }
          }}
          onKeyDown={onKeyDown}
        >
          <Dialog.Title className='sr-only'>{`op ${op?.operationNumber ?? ''} seams`}</Dialog.Title>
          <Dialog.Description className='sr-only'>pick edges</Dialog.Description>

          <div className='flex h-13 flex-none items-center gap-3'>
            <Text size='small' tracking='section' className='uppercase'>
              {`op ${op?.operationNumber ?? ''}`}
            </Text>
            {groups.length < 2 && !frozen && (
              <ViewSwitch value={chosen} options={SIDES} onChange={setChosen} label='side' />
            )}
            <div className='ml-auto'>
              <Close onClick={onClose} aria-label='close' />
            </div>
          </div>

          <div className='flex min-h-0 flex-1 flex-col border border-borderColor bg-bgColor'>
            <div className='flex min-h-0 flex-1 flex-col md:flex-row'>
              <div
                ref={canvasEl}
                className='relative min-h-0 min-w-0 flex-1 touch-none select-none'
                data-seam-picker-canvas=''
              >
                {loading && !drawn ? (
                  <div className='absolute inset-0 grid place-items-center'>
                    <Placeholder label='loading' />
                  </div>
                ) : !drawn ? (
                  <div className='absolute inset-0 grid place-items-center'>
                    <Placeholder label={groups.length ? 'no pattern' : 'no pieces'} dashed />
                  </div>
                ) : place && hostPiece && partPiece && host ? (
                  <PlaceView
                    w={canvas.w}
                    h={canvas.h}
                    host={hostPiece}
                    line={hostPiece.inner[host.k] ?? []}
                    part={partPiece}
                    place={place}
                    onPlace={setPlace}
                  />
                ) : (
                  <StepPictureSvg
                    w={canvas.w}
                    h={canvas.h}
                    pad={phone ? 28 : 64}
                    look='canvas'
                    layout={layout}
                    geoms={geoms}
                    innerLines={innerLines}
                    marks={marks}
                    nos={nos}
                    names={groups.map((g) => g.name)}
                    namesBelow={phone}
                    hover={hover}
                    onHover={setHover}
                    onPick={frozen ? undefined : toggle}
                    className='absolute inset-0'
                  />
                )}
              </div>
              <div
                className='relative h-1/3 flex-none border-t border-hairline md:h-auto md:w-75 md:border-t-0 md:border-l'
                data-seam-result=''
              >
                <Text
                  size='micro'
                  variant='label'
                  tracking='label'
                  className='absolute top-2.5 left-3 uppercase'
                >
                  result
                </Text>
                <div ref={resultEl} className='absolute inset-x-0 top-6 bottom-0'>
                  {hasResult && (
                    <StepPictureSvg
                      w={result.w}
                      h={result.h}
                      pad={18}
                      look='result'
                      layout={joined}
                      geoms={geoms}
                      marks={resultMarks}
                      className='absolute inset-0'
                    />
                  )}
                </div>
              </div>
            </div>

            <div
              className='sticky bottom-0 flex h-21 flex-none items-center gap-3 border-t border-hairline bg-bgColor px-3 md:gap-4.5 md:px-5'
              data-seam-bar=''
            >
              {error && (
                <Text size='micro' variant='error' className='min-w-0 truncate'>
                  {error}
                </Text>
              )}
              <span className='flex-1' />
              {delta != null ? (
                <Text size='control' className='whitespace-nowrap tabular-nums' data-seam-delta=''>
                  {`Δ ${fmtMm(delta)} mm`}
                </Text>
              ) : empty && !loading ? (
                <Text size='micro' variant='error' data-step-seams-status=''>
                  no seam
                </Text>
              ) : null}
              {surface && !frozen && (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={startPlace}
                  disabled={!hostPiece || !partPiece}
                >
                  {place ? 'done' : 'place'}
                </Button>
              )}
              {place && (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={() => setPlace({ ...place, rot: (place.rot + 90) % 360 })}
                >
                  turn
                </Button>
              )}
              {(sel.a.length > 0 || sel.b.length > 0) && (
                <Button type='button' variant='underline' size='xs' onClick={reset}>
                  clear
                </Button>
              )}
              {!frozen && (
                <Button
                  type='button'
                  variant='main'
                  size='sm'
                  onClick={() => void commit()}
                  disabled={!canAccept}
                  loading={busy}
                  data-seam-accept=''
                >
                  accept
                </Button>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * «place»: the host in its drawing frame (mm, y down) with its mark in the pick blue, the part on
 * top following the pointer. The stored placement is the part's bbox corner relative to the host's,
 * then turned — the same numbers the surface seam has always stored.
 */
function PlaceView({
  w,
  h,
  host,
  line,
  part,
  place,
  onPlace,
}: {
  w: number;
  h: number;
  host: AsmPiece;
  line: Pt[];
  part: AsmPiece;
  place: Place;
  onPlace: (p: Place) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const hb = boxOf(host.cut);
  const pb = boxOf(part.cut);
  const m = Math.max(pb.x1 - pb.x0, pb.y1 - pb.y0);
  const vb = [hb.x0 - m, hb.y0 - m, hb.x1 - hb.x0 + 2 * m, hb.y1 - hb.y0 + 2 * m];
  const toMm = (e: PointerEvent) => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const ox = hb.x0 + place.x;
  const oy = hb.y0 + place.y;
  if (w < 2 || h < 2) return null;
  return (
    <svg
      ref={svgRef}
      width={w}
      height={h}
      viewBox={vb.map((v) => v.toFixed(1)).join(' ')}
      preserveAspectRatio='xMidYMid meet'
      className='absolute inset-0'
      onPointerMove={(e) => {
        const g = drag.current;
        if (!g) return;
        const p = toMm(e);
        if (p) onPlace({ ...place, x: g.px + p.x - g.x, y: g.py + p.y - g.y });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      data-seam-place=''
    >
      <path
        d={pathOf(host.cut, true)}
        fill='var(--color-bgColor)'
        stroke='var(--color-textColor)'
        strokeWidth={2}
        vectorEffect='non-scaling-stroke'
      />
      <path
        d={pathOf(line)}
        fill='none'
        stroke='var(--color-warning)'
        strokeWidth={3}
        vectorEffect='non-scaling-stroke'
      />
      <g
        transform={`translate(${ox.toFixed(1)} ${oy.toFixed(1)}) rotate(${place.rot}) translate(${(-pb.x0).toFixed(1)} ${(-pb.y0).toFixed(1)})`}
        className='cursor-move'
        onPointerDown={(e) => {
          const p = toMm(e);
          if (!p) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { x: p.x, y: p.y, px: place.x, py: place.y };
        }}
      >
        <path
          d={pathOf(part.cut, true)}
          fill='var(--color-bgColor)'
          fillOpacity={0.85}
          stroke='var(--color-textColor)'
          strokeWidth={1.2}
          strokeDasharray='6 4'
          vectorEffect='non-scaling-stroke'
        />
      </g>
    </svg>
  );
}
