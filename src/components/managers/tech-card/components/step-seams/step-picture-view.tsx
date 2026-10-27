// THE STEP PICTURE, DRAWN (seam picker v2, owner OK 27.10) — one renderer and one data hook for the
// picker's canvas, its RESULT panel and the SEAMS row tile. Each input is one shape: its pieces as
// assembled, the outer outline bold (an ink stroke under every piece, the fills covering it inside),
// the inner seams hairline. Marked edges: proposal = ink dashed, own pick = blue, stored = ink bold.

import type { EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';
import type { EdgeAnchor, StoredSeam } from 'lib/seams';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { plainEdges } from '../assembly-seams/words';
import { rowsOf, useSeamsStore } from '../assembly-seams/seams-store';
import { useCardSeamGraph } from '../card-unit-pictures';
import type { TechCardFormData } from '../schema';
import { PAIR_INK, pairNo } from './palette';
import { useStepSeams } from './step-seams-context';
import {
  innerId,
  inputGroups,
  parseInner,
  suggestStepPair,
  type FormOpLike,
  type Suggestion,
  type TargetId,
} from './step-seams-model';
import {
  boxOf,
  candidateOf,
  centroidOf,
  fitBox,
  inputName,
  labelSpot,
  pathOf,
  splitSeams,
  spreadLabels,
  stepLayout,
  toPx,
  type SeamSides,
  type StepLayout,
} from './step-picture';

export type SceneOp = FormOpLike & { fullnessRatio?: string; outputUnitName?: string };

/** The edge ids and inner targets an anchor names on today's drawing (by its hint). */
export function targetsOfAnchor(a: EdgeAnchor): TargetId[] {
  const inner = /^i(\d+)$/.exec(a.edgeHint);
  if (inner) return [innerId(a.piece, Number(inner[1]))];
  const at = a.edgeHint.lastIndexOf('#');
  if (at < 0) return [];
  return a.edgeHint
    .slice(at + 1)
    .split('+')
    .map((k) => `${a.piece}#${k}`);
}

/** A value kept by identity while its signature holds (the form re-renders on every keystroke). */
export function useStable<T>(value: T, sig: string): T {
  const ref = useRef<{ sig: string; value: T } | null>(null);
  if (!ref.current || ref.current.sig !== sig) ref.current = { sig, value };
  return ref.current.value;
}

export const seamSig = (xs: readonly SeamCandidate[]) =>
  xs.map((c) => `${c.a}|${c.b}|${c.kind}`).join(',');

export type StoredOnStep = { key: string; row: StoredSeam | undefined; sides: SeamSides };

/**
 * Everything the step picture of step `index` is made of: the inputs (leaf pieces, one human name
 * each), the piece geometry, the card's seams split by this step, the step's stored seams and the
 * length proposal. Null outside the step-seams provider.
 */
export function useStepScene(index: number) {
  const ctx = useStepSeams();
  const { graph } = useCardSeamGraph();
  const ops = (useWatch<TechCardFormData>({ name: 'operations' }) ?? []) as SceneOp[];
  const op = ops[index];
  const geo = ctx?.geometry;

  const geoms = useMemo(() => {
    const m = new Map<string, PieceGeom>();
    for (const [k, p] of geo?.pieces ?? []) m.set(k, p.geom);
    return m;
  }, [geo?.pieces]);
  const pieceKeys = useMemo(() => {
    const s = new Set<string>(geo?.pieces.keys() ?? []);
    for (const p of ctx?.techCard?.techCard?.pieces ?? []) if (p.lineKey) s.add(p.lineKey);
    return s;
  }, [geo?.pieces, ctx?.techCard?.techCard?.pieces]);
  /** Inner lines (placement, fold) in the segmentation frame (y up). */
  const innerLines = useMemo(() => {
    const m = new Map<string, Pt2[][]>();
    for (const [k, p] of geo?.pieces ?? [])
      m.set(
        k,
        p.inner.map((l) => l.map(([x, y]) => [x, -y] as Pt2)),
      );
    return m;
  }, [geo?.pieces]);

  const cardName = ctx?.nameOf;
  const pieceName = useCallback(
    (k: string) => geo?.pieces.get(k)?.name || cardName?.(k) || k,
    [geo?.pieces, cardName],
  );
  const rawGroups = inputGroups(ops, index, pieceKeys).map((g) => ({
    ...g,
    name: inputName(g.key, index, ops, (k) => pieceKeys.has(k), pieceName),
  }));
  const groups = useStable(rawGroups, JSON.stringify(rawGroups));
  const leaves = useMemo(() => groups.map((g) => g.pieces), [groups]);

  const keysRaw = [...(op?.seamKeys ?? [])];
  const keys = useStable(keysRaw, keysRaw.join(','));
  const ease = (() => {
    const r = Number.parseFloat(String(op?.fullnessRatio ?? '').replace(',', '.'));
    return Number.isFinite(r) && r > 0 ? r : null;
  })();

  const server = useSeamsStore((s) => s.server);
  const pending = useSeamsStore((s) => s.pending);
  const byKey = useMemo(
    () => new Map(rowsOf({ server, pending }).map((r) => [r.seamKey, r])),
    [server, pending],
  );
  const stored = useMemo<StoredOnStep[]>(
    () =>
      keys.map((key) => {
        const row = byKey.get(key);
        return {
          key,
          row,
          sides: {
            a: (row?.sideA ?? []).flatMap(targetsOfAnchor),
            b: (row?.sideB ?? []).flatMap(targetsOfAnchor),
          },
        };
      }),
    [keys, byKey],
  );
  const usedRaw = stored.flatMap((s) => [...s.sides.a, ...s.sides.b]).filter((t) => !parseInner(t));
  const used = useStable(new Set<EdgeId>(usedRaw), usedRaw.join(','));

  const sugRaw: Suggestion | null =
    geo && geo.dep.status !== 'pending' && !ctx?.frozen
      ? suggestStepPair(ops, index, pieceKeys, geoms, used, ease)
      : null;
  const suggestion = useStable(
    sugRaw,
    sugRaw ? `${sugRaw.a.join('+')}|${sugRaw.b.join('+')}|${sugRaw.aLen}|${sugRaw.bLen}` : '',
  );

  const split = useMemo(
    () => splitSeams(graph?.chosen ?? [], leaves, geoms),
    [graph?.chosen, leaves, geoms],
  );
  const innerSeams = useStable(split.inner, seamSig(split.inner));

  // The canvas lays the inputs along the step's own seams (stored, else the proposal), else along
  // what the card's graph reads between them — never along the live pick, so a click moves nothing.
  const own = [
    ...stored.map((s) => candidateOf(s.sides, geoms)),
    suggestion ? candidateOf(suggestion, geoms) : null,
  ].filter((c): c is SeamCandidate => !!c);
  const frameRaw = [...split.inner, ...(own.length ? own : split.cross)];
  const frameSeams = useStable(frameRaw, seamSig(frameRaw));
  const storedRaw = stored
    .map((s) => candidateOf(s.sides, geoms))
    .filter((c): c is SeamCandidate => !!c);
  const storedSeams = useStable(storedRaw, seamSig(storedRaw));

  return {
    ctx,
    op,
    ops,
    geo,
    geoms,
    pieceKeys,
    innerLines,
    groups,
    leaves,
    keys,
    ease,
    byKey,
    stored,
    used,
    suggestion,
    innerSeams,
    frameSeams,
    storedSeams,
    pieceName,
  };
}

export type StepScene = ReturnType<typeof useStepScene>;

/** `stepLayout`, memoised on the seams' identity. */
export function useStepLayout(
  leaves: readonly (readonly string[])[],
  seams: readonly SeamCandidate[],
  geoms: ReadonlyMap<string, PieceGeom>,
  explode: number,
  rasterMm?: number,
): StepLayout {
  return useMemo(
    () => stepLayout(leaves, seams, geoms, { explode, rasterMm }),
    [leaves, seams, geoms, explode, rasterMm],
  );
}

/**
 * The content box of an element, px, kept live — a callback ref, so a remounted element is observed
 * too. Layout box (`contentRect`), so the dialog's open scale animation is not read as a size.
 */
export function useBoxSize(): [(el: HTMLElement | null) => void, { w: number; h: number }] {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize((s) =>
        Math.abs(s.w - width) < 0.5 && Math.abs(s.h - height) < 0.5 ? s : { w: width, h: height },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
}

// ─── the svg ──────────────────────────────────────────────────────────────────────────────────────

export type Tone = 'proposal' | 'pick' | 'stored';
export type EdgeMark = { id: TargetId; tone: Tone; label?: string };
export type NoMark = { id: TargetId; i: number };

type Look = {
  outline: number;
  hair: number;
  mark: number;
  stored: number;
  dash: string;
  font: number;
};
const LOOK: Record<'canvas' | 'result' | 'tile', Look> = {
  canvas: { outline: 3.2, hair: 0.8, mark: 3, stored: 3.5, dash: '9 6', font: 12 },
  result: { outline: 2.6, hair: 0.7, mark: 2.5, stored: 2.5, dash: '9 6', font: 11 },
  tile: { outline: 1.3, hair: 0.35, mark: 1.6, stored: 2.2, dash: '3 2', font: 9 },
};

const INK = 'var(--color-textColor)';
const GREY = 'var(--color-labelColor)';
const FILL = 'var(--color-bgColor)';
const PICK = 'var(--color-warning)';
const FAINT = 'var(--color-borderColor)';

/**
 * The step picture fitted into w × h px. `marks` colour edges and inner lines by tone (with their mm
 * beside on the canvas); `nos` put a stored seam's number beside it; `names` (one per input) sit on
 * the input's centre, or under it with `namesBelow`. With `onPick` every edge and inner line is a
 * door.
 */
export function StepPictureSvg({
  w,
  h,
  pad,
  look,
  layout,
  geoms,
  innerLines,
  marks = [],
  nos = [],
  names,
  namesBelow,
  hover,
  onHover,
  onPick,
  className,
}: {
  w: number;
  h: number;
  pad: number;
  look: keyof typeof LOOK;
  layout: StepLayout;
  geoms: ReadonlyMap<string, PieceGeom>;
  innerLines?: ReadonlyMap<string, Pt2[][]>;
  marks?: readonly EdgeMark[];
  nos?: readonly NoMark[];
  names?: readonly string[];
  namesBelow?: boolean;
  hover?: TargetId | null;
  onHover?: (id: TargetId | null) => void;
  onPick?: (id: TargetId) => void;
  className?: string;
}) {
  const L = LOOK[look];
  const fit = useMemo(() => fitBox(layout.bbox, w, h, pad), [layout.bbox, w, h, pad]);

  const pieces = useMemo(() => {
    const out: { key: string; ring: Pt2[]; input: number; centre: Pt2 }[] = [];
    for (const [key, T] of layout.T) {
      const g = geoms.get(key);
      if (!g) continue;
      const ring = g.rs.map((p) => toPx(fit, apply(T, p)));
      out.push({ key, ring, input: layout.input.get(key) ?? 0, centre: centroidOf(ring) });
    }
    return out;
  }, [layout, geoms, fit]);
  const centreOf = useMemo(() => new Map(pieces.map((p) => [p.key, p.centre])), [pieces]);

  /** A target's polyline on screen (an edge, a chain, an inner line). */
  const ptsOf = (id: TargetId): Pt2[] | null => {
    const inner = parseInner(id);
    const piece = inner?.piece ?? id.slice(0, id.lastIndexOf('#'));
    const T = layout.T.get(piece);
    if (!T) return null;
    const raw = inner ? innerLines?.get(inner.piece)?.[inner.k] : resolveEdge(id, geoms)?.pts;
    return raw?.length ? raw.map((p) => toPx(fit, apply(T, p))) : null;
  };

  const doors = useMemo(() => {
    if (!onPick && look !== 'canvas') return [];
    const out: { id: TargetId; d: string; inner: boolean }[] = [];
    for (const [key, T] of layout.T) {
      const g = geoms.get(key);
      if (!g) continue;
      for (const e of plainEdges(g))
        out.push({ id: e.id, d: pathOf(e.pts.map((p) => toPx(fit, apply(T, p)))), inner: false });
      (innerLines?.get(key) ?? []).forEach((l, k) =>
        out.push({
          id: innerId(key, k),
          d: pathOf(l.map((p) => toPx(fit, apply(T, p)))),
          inner: true,
        }),
      );
    }
    return out;
  }, [onPick, look, layout, geoms, innerLines, fit]);

  const markLines = marks
    .map((m) => ({ m, pts: ptsOf(m.id) }))
    .filter((x): x is { m: EdgeMark; pts: Pt2[] } => !!x.pts);
  const pieceOfId = (id: TargetId) => parseInner(id)?.piece ?? id.slice(0, id.lastIndexOf('#'));
  const labels = markLines
    .filter(({ m }) => m.label)
    .map(({ m, pts }) => ({
      m,
      s: labelSpot(pts, centreOf.get(pieceOfId(m.id)) ?? pts[0], 16),
    }));
  // Mono type: ~0.6 em a character.
  const spots = spreadLabels(
    labels.map(({ m, s }) => ({ ...s, w: (m.label ?? '').length * L.font * 0.62, h: L.font + 2 })),
  );

  const nameSpots = (names ?? []).map((text, gi) => {
    const ring = pieces.filter((p) => p.input === gi).flatMap((p) => p.ring);
    if (!ring.length || !text) return null;
    const b = boxOf(ring);
    return {
      text,
      at: (namesBelow
        ? [(b.x0 + b.x1) / 2, b.y1 + L.font + 2]
        : [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]) as Pt2,
    };
  });

  if (w < 2 || h < 2) return null;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      style={{ overflow: 'visible', fontSize: L.font }}
      aria-hidden={onPick ? undefined : true}
    >
      <g fill='none' stroke={INK} strokeWidth={L.outline} strokeLinejoin='round'>
        {pieces.map((p) => (
          <path key={p.key} d={pathOf(p.ring, true)} />
        ))}
      </g>
      <g fill={FILL} stroke={GREY} strokeWidth={L.hair} strokeLinejoin='round'>
        {pieces.map((p) => (
          <path key={p.key} d={pathOf(p.ring, true)} />
        ))}
      </g>
      {look === 'canvas' && (
        <g fill='none' stroke={FAINT} strokeWidth={1} strokeDasharray='4 3'>
          {doors
            .filter((x) => x.inner)
            .map((x) => (
              <path key={x.id} d={x.d} />
            ))}
        </g>
      )}
      {hover && !marks.some((m) => m.id === hover) && ptsOf(hover) && (
        <path
          d={pathOf(ptsOf(hover)!)}
          fill='none'
          stroke={INK}
          strokeWidth={L.mark}
          strokeLinecap='round'
          pointerEvents='none'
        />
      )}
      {markLines.map(({ m, pts }) => (
        <path
          key={`${m.tone}:${m.id}`}
          d={pathOf(pts)}
          fill='none'
          stroke={m.tone === 'pick' ? PICK : m.tone === 'stored' ? PAIR_INK : INK}
          strokeWidth={m.tone === 'stored' ? L.stored : L.mark}
          strokeDasharray={m.tone === 'proposal' ? L.dash : undefined}
          strokeLinecap={m.tone === 'proposal' ? 'butt' : 'round'}
          pointerEvents='none'
          data-seam-mark={m.tone}
        />
      ))}
      {look !== 'tile' &&
        labels.map(({ m, s }, i) => (
          <text
            key={`l:${m.id}`}
            x={spots[i][0]}
            y={spots[i][1]}
            textAnchor={s.anchor}
            dominantBaseline='central'
            fill={m.tone === 'pick' ? PICK : INK}
            stroke={FILL}
            strokeWidth={4}
            paintOrder='stroke'
            className='tabular-nums'
            pointerEvents='none'
          >
            {m.label}
          </text>
        ))}
      {look !== 'tile' &&
        nos.map(({ id, i }) => {
          const pts = ptsOf(id);
          if (!pts) return null;
          const s = labelSpot(pts, centreOf.get(pieceOfId(id)) ?? pts[0], 18);
          return (
            <g key={`n:${id}`} pointerEvents='none' data-pair-no={i + 1}>
              <rect
                x={s.at[0] - 9}
                y={s.at[1] - 9}
                width={18}
                height={18}
                fill={FILL}
                stroke={PAIR_INK}
                strokeWidth={1}
              />
              <text
                x={s.at[0]}
                y={s.at[1]}
                textAnchor='middle'
                dominantBaseline='central'
                fill={PAIR_INK}
                fontSize={10}
              >
                {pairNo(i)}
              </text>
            </g>
          );
        })}
      {look !== 'tile' &&
        nameSpots.map((s, i) =>
          s ? (
            <text
              key={`u:${i}`}
              x={s.at[0]}
              y={s.at[1]}
              textAnchor='middle'
              dominantBaseline='central'
              fill={GREY}
              stroke={FILL}
              strokeWidth={4}
              paintOrder='stroke'
              letterSpacing='0.04em'
              pointerEvents='none'
              data-unit-name=''
            >
              {s.text}
            </text>
          ) : null,
        )}
      {onPick &&
        doors.map((x) => (
          <path
            key={`h:${x.id}`}
            d={x.d}
            fill='none'
            stroke='transparent'
            strokeWidth={14}
            pointerEvents='stroke'
            className='cursor-pointer'
            onPointerEnter={() => onHover?.(x.id)}
            onPointerLeave={() => onHover?.(null)}
            onClick={() => onPick(x.id)}
            data-seam-target={x.id}
          />
        ))}
    </svg>
  );
}
