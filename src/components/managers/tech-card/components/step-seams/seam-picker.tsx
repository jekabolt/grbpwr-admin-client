// THE STEP'S SEAM PICKER (assembly-schema T8, mockup M1 «Opacity», owner OK 26.10). The step's input
// pieces large, with their codes; every edge and every inner line is a door. Clicks collect side A
// (highlight) and side B (ink) — with two or more inputs the side is the input's, with one it is the
// A / B switch — and nothing is stored until «pair» (or Enter): then the pair becomes ONE card seam
// (composite when a side holds several runs, surface when one side is an inner line) and its key
// goes onto the step, after the ones already there. A suggestion by length / notches is applied
// only by «accept». «place» drags the part onto its host for a surface seam.

import * as Dialog from '@radix-ui/react-dialog';
import type { EdgeId, PieceGeom } from 'lib/assembly-skeleton/types';
import { anchorOfRunId, type EdgeAnchor, type SeamPlacement, type StoredSeam } from 'lib/seams';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Chip, ChipRow, Close, Pill, Placeholder, Text, ViewSwitch } from 'ui';
import type { AsmPiece } from '../../techpack/derive-assembly';
import { rowFromHand, runsOfSide } from '../assembly-seams/seam-actions';
import { rowsOf, useSeamsStore } from '../assembly-seams/seams-store';
import { edgeOf, plainEdges } from '../assembly-seams/words';
import type { TechCardFormData } from '../schema';
import { PairNo } from './pair-no';
import { PAIR_INK, PIECE_INK, SIDE_INK } from './palette';
import { useAttachStepSeam, useStepSeams } from './step-seams-context';
import {
  deltaMm,
  fmtMm,
  innerId,
  inputGroups,
  longestEdge,
  parseInner,
  pieceOfTarget,
  rowWords,
  sideOf,
  suggestStepPair,
  suggestionWords,
  surfaceRow,
  targetWords,
  type FormOpLike,
  type Pt,
  type TargetId,
} from './step-seams-model';

type Side = 'a' | 'b';
type Sel = { a: TargetId[]; b: TargetId[] };
const EMPTY: Sel = { a: [], b: [] };
const SIDES = [
  { value: 'a', label: 'side A' },
  { value: 'b', label: 'side B' },
] as const;

/** Gaps of the layout, mm: between pieces of one input, between inputs. */
const GAP_PIECE = 40;
const GAP_INPUT = 120;

type Box = { x0: number; y0: number; x1: number; y1: number };
function boxOf(pts: readonly Pt[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 1, y1: 1 };
}
const d = (pts: readonly Pt[], closed = false) =>
  pts.length
    ? `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}${closed ? 'Z' : ''}`
    : '';
const polyLen = (pts: readonly Pt[]) =>
  pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : s), 0);

/** The edge ids and inner targets an anchor names on today's drawing (by its hint). */
function targetsOfAnchor(a: EdgeAnchor): TargetId[] {
  const inner = /^i(\d+)$/.exec(a.edgeHint);
  if (inner) return [innerId(a.piece, Number(inner[1]))];
  const at = a.edgeHint.lastIndexOf('#');
  if (at < 0) return [];
  return a.edgeHint
    .slice(at + 1)
    .split('+')
    .map((k) => `${a.piece}#${k}`);
}
const sideLenOf = (xs: readonly EdgeAnchor[]) => xs.reduce((s, a) => s + a.lenMm, 0);

export default function SeamPicker({
  index,
  open,
  onClose,
}: {
  index: number;
  open: boolean;
  onClose: () => void;
}) {
  const ctx = useStepSeams()!;
  const { techCard, frozen, geometry: geo, nameOf: cardName } = ctx;
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const attach = useAttachStepSeam(index);
  const ops = (useWatch<TechCardFormData>({ name: 'operations' }) ?? []) as FormOpLike[];
  const op = ops[index] as (FormOpLike & { fullnessRatio?: string }) | undefined;
  const keys = useMemo(() => [...(op?.seamKeys ?? [])], [op?.seamKeys]);
  const ease = useMemo(() => {
    const r = Number.parseFloat(String(op?.fullnessRatio ?? '').replace(',', '.'));
    return Number.isFinite(r) && r > 0 ? r : null;
  }, [op?.fullnessRatio]);

  const server = useSeamsStore((s) => s.server);
  const pending = useSeamsStore((s) => s.pending);
  const errors = useSeamsStore((s) => s.errors);
  const byKey = useMemo(
    () => new Map(rowsOf({ server, pending }).map((r) => [r.seamKey, r])),
    [server, pending],
  );

  const nameOf = useCallback(
    (k: string) => geo.pieces.get(k)?.name || cardName(k),
    [geo.pieces, cardName],
  );
  const geoms = useMemo(() => {
    const m = new Map<string, PieceGeom>();
    for (const [k, p] of geo.pieces) m.set(k, p.geom);
    return m;
  }, [geo.pieces]);
  const pieceKeys = useMemo(() => {
    const s = new Set<string>(geo.pieces.keys());
    for (const p of techCard?.techCard?.pieces ?? []) if (p.lineKey) s.add(p.lineKey);
    return s;
  }, [geo.pieces, techCard?.techCard?.pieces]);
  const groups = useMemo(() => inputGroups(ops, index, pieceKeys), [ops, index, pieceKeys]);

  // ── layout: inputs left to right, pieces of one input side by side, tops aligned ──
  const layout = useMemo(() => {
    const at = new Map<string, { dx: number; dy: number; box: Box; piece: AsmPiece }>();
    let x = 0;
    let h = 0;
    groups.forEach((g, gi) => {
      if (gi) x += GAP_INPUT - GAP_PIECE;
      for (const k of g.pieces) {
        const piece = geo.pieces.get(k);
        if (!piece || at.has(k)) continue;
        const box = boxOf(piece.cut);
        at.set(k, { dx: x - box.x0, dy: -box.y0, box, piece });
        x += box.x1 - box.x0 + GAP_PIECE;
        h = Math.max(h, box.y1 - box.y0);
      }
    });
    return { at, w: Math.max(1, x - GAP_PIECE), h: Math.max(1, h) };
  }, [groups, geo.pieces]);

  const [sel, setSel] = useState<Sel>(EMPTY);
  const [chosen, setChosen] = useState<Side>('a');
  const [hover, setHover] = useState<TargetId | null>(null);
  const [place, setPlace] = useState<{ x: number; y: number; rot: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState('');

  const innerLen = useCallback(
    (piece: string, k: number) => polyLen(geo.pieces.get(piece)?.inner[k] ?? []),
    [geo.pieces],
  );
  const lenOf = useCallback(
    (id: TargetId) => {
      const inner = parseInner(id);
      return inner ? innerLen(inner.piece, inner.k) : edgeOf(id, geoms)?.lenMm ?? 0;
    },
    [innerLen, geoms],
  );
  const lenA = sel.a.reduce((s, id) => s + lenOf(id), 0);
  const lenB = sel.b.reduce((s, id) => s + lenOf(id), 0);

  // Stored pairs of this step → colour of every target they name.
  const pairs = useMemo(() => keys.map((key) => ({ key, row: byKey.get(key) })), [keys, byKey]);
  const inkOf = useMemo(() => {
    const m = new Map<TargetId, string>();
    pairs.forEach(({ row }) => {
      if (!row) return;
      for (const a of [...row.sideA, ...row.sideB])
        for (const t of targetsOfAnchor(a)) if (!m.has(t)) m.set(t, PAIR_INK);
    });
    return m;
  }, [pairs]);
  const used = useMemo(
    () => new Set<EdgeId>([...inkOf.keys()].filter((t) => !parseInner(t))),
    [inkOf],
  );
  const suggestion = useMemo(
    () => (frozen ? null : suggestStepPair(ops, index, pieceKeys, geoms, used, ease, byKey)),
    [frozen, ops, index, pieceKeys, geoms, used, ease, byKey],
  );

  // ── what «pair» would write ──
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
    return g?.pieces.find((p) => geo.pieces.has(p)) ?? null;
  }, [host, hostSide, sel, groups, hostGroup, geo.pieces]);
  const canPair =
    !frozen &&
    !busy &&
    (surface
      ? !!partKey && inners.length === 1 && sel[hostSide!].length === 1
      : inners.length === 0 && sel.a.length > 0 && sel.b.length > 0);

  const anchorCtx = useMemo(
    () => ({ pieces: [...geoms.values()], grainDeg: geo.grainDeg, nameOf }),
    [geoms, geo.grainDeg, nameOf],
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
      const line = h ? geo.pieces.get(h.piece)?.inner[h.k] : undefined;
      if (!h || !g || !line || !partKey) return null;
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
    [geoms, anchorCtx, geo.pieces, geo.grainDeg, partKey, placement],
  );

  const commit = useCallback(
    async (s: Sel) => {
      if (frozen || busy) return;
      const row = buildRow(s);
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
      setSel(EMPTY);
      setPlace(null);
      setChosen('a');
    },
    [frozen, busy, buildRow, attach],
  );

  const dropKey = (key: string) => {
    const cur = (getValues(`operations.${index}.seamKeys`) ?? []) as string[];
    setValue(
      `operations.${index}.seamKeys`,
      cur.filter((k) => k !== key),
      { shouldDirty: true },
    );
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

  // ── «place»: the part follows the pointer over its host (mm in the drawing frame) ──
  const svgRef = useRef<SVGSVGElement>(null);
  // The drawing's on-screen width (meet: the narrower of width and height-scaled width). Client
  // box, not the bounding rect — the dialog's open animation scales the latter. A callback ref, so
  // a remounted <svg> is observed too.
  const [svgPx, setSvgPx] = useState(0);
  const sizeObs = useRef<ResizeObserver | null>(null);
  const svgEl = useCallback((svg: SVGSVGElement | null) => {
    svgRef.current = svg;
    sizeObs.current?.disconnect();
    sizeObs.current = null;
    if (!svg || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      const vb = svg.viewBox.baseVal;
      if (!vb?.width || !vb.height) return;
      setSvgPx(Math.min(svg.clientWidth / vb.width, svg.clientHeight / vb.height) * vb.width);
    });
    ro.observe(svg);
    sizeObs.current = ro;
  }, []);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const toMm = (e: PointerEvent) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const hostAt = host ? layout.at.get(host.piece) : undefined;
  const partAt = partKey ? layout.at.get(partKey) : undefined;
  const startPlace = () => {
    if (!hostAt || !partAt) return;
    if (place) return setPlace(null);
    // Start where the part is drawn now, relative to the host's bbox corner.
    setPlace({
      x: partAt.box.x0 + partAt.dx - (hostAt.box.x0 + hostAt.dx),
      y: partAt.box.y0 + partAt.dy - (hostAt.box.y0 + hostAt.dy),
      rot: 0,
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea')) return;
    if (e.key === 'Enter' && canPair) {
      e.preventDefault();
      void commit(sel);
    }
  };

  const status = keys.length ? `${keys.length} seam${keys.length === 1 ? '' : 's'}` : 'no seam';
  const loading = geo.dep.status === 'pending';
  const drawn = layout.at.size > 0;
  const pad = Math.max(layout.w, layout.h) * 0.02 + 8;
  const vbW = layout.w + 2 * pad;
  const vbH = layout.h + 2 * pad;
  // Piece codes stay ≥ 12 screen px whatever the zoom: viewBox units per screen px × 12.
  const fontMin = svgPx > 40 ? (12 * vbW) / svgPx : 0;
  const font = Math.max(Math.max(layout.w, layout.h) / 45, fontMin);

  const readout = (() => {
    if (hover && !sel.a.length && !sel.b.length)
      return `${targetWords(hover, nameOf)} · ${fmtMm(lenOf(hover))} mm`;
    if (!sel.a.length && !sel.b.length) return '';
    const parts = [`A ${fmtMm(lenA)} mm`, `B ${fmtMm(lenB)} mm`];
    const delta = sel.a.length && sel.b.length ? ` · Δ ${fmtMm(deltaMm(lenA, lenB, ease))}` : '';
    return `${parts.join(' ↔ ')}${delta}${ease ? ` · ease ${ease}` : ''}`;
  })();

  const edgeColour = (id: TargetId) =>
    sel.a.includes(id)
      ? SIDE_INK.a
      : sel.b.includes(id)
        ? SIDE_INK.b
        : inkOf.get(id) ?? PIECE_INK.line;
  const picked = (id: TargetId) => sel.a.includes(id) || sel.b.includes(id) || inkOf.has(id);

  const pieceSvg = (k: string, moving: boolean) => {
    const at = layout.at.get(k);
    if (!at) return null;
    const { piece } = at;
    let transform = `translate(${at.dx.toFixed(1)} ${at.dy.toFixed(1)})`;
    if (moving && place && hostAt) {
      const ox = hostAt.box.x0 + hostAt.dx + place.x;
      const oy = hostAt.box.y0 + hostAt.dy + place.y;
      transform = `translate(${ox.toFixed(1)} ${oy.toFixed(1)}) rotate(${place.rot}) translate(${(-at.box.x0).toFixed(1)} ${(-at.box.y0).toFixed(1)})`;
    }
    const edges = plainEdges(piece.geom);
    const cx = (at.box.x0 + at.box.x1) / 2;
    const cy = (at.box.y0 + at.box.y1) / 2;
    return (
      <g
        key={k}
        transform={transform}
        opacity={place && !moving && k !== host?.piece ? 0.35 : 1}
        onPointerDown={
          moving && place
            ? (e) => {
                const p = toMm(e);
                if (!p) return;
                (e.target as Element).setPointerCapture?.(e.pointerId);
                drag.current = { x: p.x, y: p.y, px: place.x, py: place.y };
              }
            : undefined
        }
        className={moving && place ? 'cursor-move' : undefined}
      >
        <path
          d={d(piece.cut, true)}
          style={{ fill: PIECE_INK.fill, stroke: PIECE_INK.line }}
          fillOpacity={0.75}
          strokeWidth={1}
          vectorEffect='non-scaling-stroke'
        />
        {piece.inner.map((line, i) => {
          const id = innerId(k, i);
          const on = picked(id);
          return (
            <g key={id}>
              <path
                d={d(line)}
                fill='none'
                style={{ stroke: on ? edgeColour(id) : PIECE_INK.inner }}
                strokeWidth={on || hover === id ? 3 : 1}
                strokeDasharray={on ? undefined : '4 3'}
                vectorEffect='non-scaling-stroke'
              />
              {!place && (
                <path
                  d={d(line)}
                  fill='none'
                  stroke='transparent'
                  strokeWidth={14}
                  vectorEffect='non-scaling-stroke'
                  className={frozen ? undefined : 'cursor-pointer'}
                  onPointerEnter={() => setHover(id)}
                  onPointerLeave={() => setHover((h) => (h === id ? null : h))}
                  onClick={() => toggle(id)}
                  data-seam-target={id}
                />
              )}
            </g>
          );
        })}
        {edges.map((e) => {
          const pts = e.pts.map(([x, y]) => [x, -y] as Pt);
          const on = picked(e.id);
          return (
            <g key={e.id}>
              <path
                d={d(pts)}
                fill='none'
                style={{ stroke: edgeColour(e.id) }}
                strokeWidth={on ? 3.5 : hover === e.id ? 3 : 1.2}
                strokeLinecap='round'
                vectorEffect='non-scaling-stroke'
              />
              {!place && (
                <path
                  d={d(pts)}
                  fill='none'
                  stroke='transparent'
                  strokeWidth={14}
                  vectorEffect='non-scaling-stroke'
                  className={frozen ? undefined : 'cursor-pointer'}
                  onPointerEnter={() => setHover(e.id)}
                  onPointerLeave={() => setHover((h) => (h === e.id ? null : h))}
                  onClick={() => toggle(e.id)}
                  data-seam-target={e.id}
                />
              )}
            </g>
          );
        })}
        <text
          x={cx}
          y={cy}
          fontSize={font}
          style={{ fill: PIECE_INK.code }}
          textAnchor='middle'
          dominantBaseline='central'
          pointerEvents='none'
        >
          {nameOf(k)}
        </text>
      </g>
    );
  };

  const movingKeys = new Set<string>(
    place && hostGroup >= 0
      ? groups.filter((_, gi) => gi !== hostGroup).flatMap((g) => g.pieces)
      : [],
  );

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
          className='fixed inset-0 z-[var(--z-modal)] flex flex-col gap-3 overflow-y-auto bg-pageBg p-4 text-textColor focus:outline-none'
          onEscapeKeyDown={(e) => {
            if (place) {
              e.preventDefault();
              setPlace(null);
            } else if (sel.a.length || sel.b.length) {
              e.preventDefault();
              setSel(EMPTY);
              setChosen('a');
            }
          }}
          onKeyDown={onKeyDown}
        >
          <Dialog.Title className='sr-only'>{`op ${op?.operationNumber ?? ''} seams`}</Dialog.Title>
          <Dialog.Description className='sr-only'>pick edges</Dialog.Description>

          <div className='flex flex-wrap items-center gap-2'>
            <Text size='small' tracking='section' className='uppercase'>
              {`op ${op?.operationNumber ?? ''}`}
            </Text>
            <Pill tone={keys.length ? 'ok' : 'warn'} data-step-seams-status=''>
              {status}
            </Pill>
            <div className='ml-auto'>
              <Close onClick={onClose} aria-label='close' />
            </div>
          </div>

          <div className='flex min-h-0 flex-col gap-3 border border-borderColor bg-bgColor p-3'>
            {groups.length < 2 && (
              <ViewSwitch
                value={chosen}
                options={SIDES}
                onChange={setChosen}
                label='side'
                disabled={frozen}
              />
            )}
            {loading && !drawn ? (
              <Placeholder label='loading' />
            ) : !drawn ? (
              <Placeholder label={groups.length ? 'no pattern' : 'no pieces'} dashed />
            ) : (
              <svg
                ref={svgEl}
                viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`}
                className='block max-h-[60vh] w-full shrink-0 touch-none select-none'
                style={{ aspectRatio: `${vbW} / ${vbH}` }}
                preserveAspectRatio='xMidYMid meet'
                onPointerMove={(e) => {
                  const g = drag.current;
                  if (!g || !place) return;
                  const p = toMm(e);
                  if (!p) return;
                  setPlace({ ...place, x: g.px + p.x - g.x, y: g.py + p.y - g.y });
                }}
                onPointerUp={() => {
                  drag.current = null;
                }}
                data-seam-picker-canvas=''
              >
                {[...layout.at.keys()]
                  .filter((k) => !movingKeys.has(k))
                  .map((k) => pieceSvg(k, false))}
                {[...layout.at.keys()]
                  .filter((k) => movingKeys.has(k))
                  .map((k) => pieceSvg(k, true))}
              </svg>
            )}

            <Text size='control' className='min-h-4 tabular-nums' data-seam-readout=''>
              {readout}
            </Text>

            <ChipRow>
              <Chip
                selected={canPair}
                onClick={() => void commit(sel)}
                disabled={!canPair}
                data-seam-pair=''
              >
                pair
              </Chip>
              {surface && (
                <Chip
                  selected={!!place}
                  onClick={startPlace}
                  disabled={frozen || !hostAt || !partAt}
                >
                  place by hand
                </Chip>
              )}
              {place && (
                <Chip onClick={() => setPlace({ ...place, rot: (place.rot + 90) % 360 })}>
                  turn
                </Chip>
              )}
              <Chip
                onClick={() => {
                  setSel(EMPTY);
                  setPlace(null);
                  setChosen('a');
                }}
                disabled={!sel.a.length && !sel.b.length}
              >
                clear
              </Chip>
              {refused && (
                <Text size='control' variant='errorLabel'>
                  {refused}
                </Text>
              )}
            </ChipRow>

            {suggestion && !sel.a.length && !sel.b.length && (
              <ChipRow>
                <Text size='control' variant='label'>
                  {`${suggestionWords(suggestion, nameOf)} · Δ ${fmtMm(
                    deltaMm(suggestion.aLen, suggestion.bLen, ease),
                  )}`}
                </Text>
                <Chip
                  dashed
                  onClick={() => void commit({ a: suggestion.a, b: suggestion.b })}
                  disabled={busy}
                  data-seam-accept=''
                >
                  accept
                </Chip>
              </ChipRow>
            )}

            {pairs.length > 0 && (
              <div className='flex flex-col border-t border-hairline' data-seam-pairs=''>
                {pairs.map(({ key, row }, i) => {
                  const a = row ? sideLenOf(row.sideA) : 0;
                  const b = row ? sideLenOf(row.sideB) : 0;
                  return (
                    <div
                      key={key}
                      className='flex items-center gap-2 border-b border-hairline py-1'
                      data-seam-pair-row={key}
                    >
                      <PairNo i={i} />
                      <Text size='control' className='min-w-0 flex-1 truncate'>
                        {row ? rowWords(row, nameOf) : `#${key.slice(-6)}`}
                      </Text>
                      {row && b > 0 && (
                        <Text size='control' variant='label' className='tabular-nums'>
                          {`${fmtMm(a)} / ${fmtMm(b)} mm · Δ ${fmtMm(deltaMm(a, b, ease))}`}
                        </Text>
                      )}
                      {errors[key] && (
                        <Text size='control' variant='errorLabel'>
                          refused
                        </Text>
                      )}
                      {!frozen && (
                        <Close size='sm' onClick={() => dropKey(key)} aria-label='remove' />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
