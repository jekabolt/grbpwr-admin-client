// THE STEP PICTURE, DRAWN (seam picker v2, owner OK 27.10) — one renderer and one data hook for the
// picker's canvas, its RESULT panel and the SEAMS row tile. Each input is one shape: its pieces as
// assembled, the outer outline bold (an ink stroke under every piece, the fills covering it inside),
// the inner seams hairline. Marked edges: proposal = ink dashed, own pick = blue, stored = ink bold.

import type { EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';
import type { EdgeAnchor, SeamPlacement, StoredSeam } from 'lib/seams';
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
  sewnBeforeStep,
  suggestStepPairs,
  type StepProposal,
  usedEdgesBeforeStep,
  type FormOpLike,
  type Suggestion,
  type TargetId,
} from './step-seams-model';
import {
  boxOf,
  centroidOf,
  earlierInner,
  fitBox,
  inputName,
  labelSpot,
  pathOf,
  seamOfSides,
  seamSig,
  splitSeams,
  spotInside,
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

export type StoredOnStep = {
  key: string;
  row: StoredSeam | undefined;
  sides: SeamSides;
  /** A surface seam's hand placement (on its anchors). */
  placement?: SeamPlacement;
};

/**
 * Everything the step picture of step `index` is made of: the inputs (leaf pieces, one human name
 * each), the piece geometry, the card's seams split by this step, the step's stored seams and the
 * length proposal. Null outside the step-seams provider.
 */
/**
 * The card's piece geometry as the placer reads it (rs frame, y up) and each piece's inner lines
 * (placement, fold) in that frame. Empty outside the step-seams provider or before the DXF is read.
 */
export function useCardGeoms() {
  const ctx = useStepSeams();
  const geo = ctx?.geometry;
  const geoms = useMemo(() => {
    const m = new Map<string, PieceGeom>();
    for (const [k, p] of geo?.pieces ?? []) m.set(k, p.geom);
    return m;
  }, [geo?.pieces]);
  const innerLines = useMemo(() => {
    const m = new Map<string, Pt2[][]>();
    for (const [k, p] of geo?.pieces ?? [])
      m.set(
        k,
        p.inner.map((l) => l.map(([x, y]) => [x, -y] as Pt2)),
      );
    return m;
  }, [geo?.pieces]);
  return { ctx, geo, geoms, innerLines };
}

/**
 * The card's seams split by the inputs, every one laid as the placer needs it: a stored surface seam
 * reaches the graph with no mark (T = identity), so it is laid by its row's placement, else on its
 * host's line; one the rows do not hold is not drawn as laid.
 */
export function splitLaid(
  chosen: readonly SeamCandidate[],
  leaves: readonly (readonly string[])[],
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, Pt2[][]>,
  byKey: ReadonlyMap<string, StoredSeam>,
): { inner: SeamCandidate[]; cross: SeamCandidate[]; engine: SeamCandidate[] } {
  const raw = splitSeams(chosen, leaves, geoms);
  const laid = (c: SeamCandidate): SeamCandidate | null => {
    if (c.kind !== 'surface' || c.surface?.mark) return c;
    const row = c.provenance ? byKey.get(c.provenance.seamKey) : undefined;
    if (!row) return null;
    const sides = {
      a: row.sideA.flatMap(targetsOfAnchor),
      b: row.sideB.flatMap(targetsOfAnchor),
    };
    const at = [...row.sideA, ...row.sideB].find((x) => x.placement)?.placement;
    return seamOfSides(sides, geoms, innerLines, at);
  };
  const keep = (xs: SeamCandidate[]) => xs.map(laid).filter((c): c is SeamCandidate => !!c);
  // `engine`: what the engine reads inside the inputs, sure or not — the edges it has spoken for.
  return { inner: keep(raw.inner), cross: keep(raw.cross), engine: raw.inner };
}

/**
 * The seams inside this step's inputs: the engine's own (laid), plus the ones the steps before
 * `index` sewed there — stored rows and the model's implied proposals — where the engine has not
 * spoken for the edge. `index` = the step count reads the whole card (a unit on a WITH row).
 */
export function innerSeamsOf(
  split: ReturnType<typeof splitLaid>,
  ops: readonly FormOpLike[],
  index: number,
  pieceKeys: ReadonlySet<string>,
  leaves: readonly (readonly string[])[],
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, Pt2[][]>,
  byKey: ReadonlyMap<string, StoredSeam>,
): SeamCandidate[] {
  const sewn = sewnBeforeStep(ops, index, pieceKeys, geoms, byKey);
  return [...split.inner, ...earlierInner(sewn, leaves, geoms, innerLines, split.engine)];
}

/** Every piece the card knows: by geometry, and by line key on the card's piece rows. */
export function useCardPieceKeys(): ReadonlySet<string> {
  const { ctx, geo } = useCardGeoms();
  return useMemo(() => {
    const s = new Set<string>(geo?.pieces.keys() ?? []);
    for (const p of ctx?.techCard?.techCard?.pieces ?? []) if (p.lineKey) s.add(p.lineKey);
    return s;
  }, [geo?.pieces, ctx?.techCard?.techCard?.pieces]);
}

/** The card's stored seam rows by key, server and pending alike. */
export function useSeamRows(): ReadonlyMap<string, StoredSeam> {
  const server = useSeamsStore((s) => s.server);
  const pending = useSeamsStore((s) => s.pending);
  return useMemo(
    () => new Map(rowsOf({ server, pending }).map((r) => [r.seamKey, r])),
    [server, pending],
  );
}

export function useStepScene(index: number) {
  const { graph } = useCardSeamGraph();
  const ops = (useWatch<TechCardFormData>({ name: 'operations' }) ?? []) as SceneOp[];
  const op = ops[index];
  const { ctx, geo, geoms, innerLines } = useCardGeoms();
  const pieceKeys = useCardPieceKeys();

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

  const byKey = useSeamRows();
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
          placement: [...(row?.sideA ?? []), ...(row?.sideB ?? [])].find((x) => x.placement)
            ?.placement,
        };
      }),
    [keys, byKey],
  );
  // The edges a proposal and a partner must not take again: this step's stored seams and
  // every edge earlier steps already sewed.
  const usedRaw = [
    ...new Set([
      ...stored.flatMap((s) => [...s.sides.a, ...s.sides.b]).filter((t) => !parseInner(t)),
      ...usedEdgesBeforeStep(ops, index, byKey),
    ]),
  ].sort();
  const used = useStable(new Set<EdgeId>(usedRaw), usedRaw.join(','));

  // Shown on a frozen card too (it only cannot be accepted there).
  const ready = !!geo && geo.dep.status !== 'pending';
  const sugsRaw = useMemo<StepProposal[]>(
    () => (ready ? suggestStepPairs(ops, index, pieceKeys, geoms, used, ease, byKey) : []),
    [ready, ops, index, pieceKeys, geoms, used, ease, byKey],
  );
  const suggestions = useStable(
    sugsRaw,
    sugsRaw.map((p) => `${p.a.join('+')}|${p.b.join('+')}|${p.aLen}|${p.bLen}|${p.hand}`).join(';'),
  );
  const suggestion: Suggestion | null = suggestions[0] ?? null;

  // Inside each input: the engine's seams, and what earlier steps sewed there (stored or implied).
  const split = useMemo(() => {
    const s = splitLaid(graph?.chosen ?? [], leaves, geoms, innerLines, byKey);
    return {
      ...s,
      inner: innerSeamsOf(s, ops, index, pieceKeys, leaves, geoms, innerLines, byKey),
    };
  }, [graph?.chosen, leaves, geoms, byKey, innerLines, ops, index, pieceKeys]);
  const innerSeams = useStable(split.inner, seamSig(split.inner));

  const storedRaw = stored
    .map((s) => seamOfSides(s.sides, geoms, innerLines, s.placement))
    .filter((c): c is SeamCandidate => !!c);
  const storedSeams = useStable(storedRaw, seamSig(storedRaw));

  // The canvas lays the inputs along the step's own seams (stored, else the proposal), else along
  // what the card's graph reads between them — never along the live pick, so a click moves nothing.
  // A surface seam is left out here (the part stands beside its host, its line clear to pick): it
  // is laid on the host in RESULT only.
  const own = [
    ...storedRaw,
    ...(suggestion ? [seamOfSides(suggestion, geoms, innerLines)] : []),
  ].filter((c): c is SeamCandidate => !!c);
  const flat = (xs: readonly SeamCandidate[]) => xs.filter((c) => c.kind !== 'surface');
  const frameRaw = [
    ...split.inner,
    ...(own.length || stored.length ? flat(own) : flat(split.cross)),
  ];
  const frameSeams = useStable(frameRaw, seamSig(frameRaw));

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
    suggestions,
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
  // A row tile marks a seam by colour only, never by weight (owner): marks at the outline width.
  tile: { outline: 1.3, hair: 0.35, mark: 1.3, stored: 1.3, dash: '3 2', font: 9 },
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
  ghostName,
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
  /** A shapeless piece's name, written in its empty square (not on a tile). */
  ghostName?: (key: string) => string;
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
  const ghosts = useMemo(
    () => layout.ghosts.map((g) => ({ ...g, ring: g.ring.map((p) => toPx(fit, p)) })),
    [layout.ghosts, fit],
  );

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
  const noSpots = nos.flatMap(({ id, i }) => {
    const pts = ptsOf(id);
    return pts ? [{ i, id, s: labelSpot(pts, centreOf.get(pieceOfId(id)) ?? pts[0], 18) }] : [];
  });
  // A unit's name sits inside its own shape — in its biggest piece, on the widest run across it —
  // never across the gap between pieces that only stand together.
  const nameSpots = (names ?? []).flatMap((text, gi) => {
    const own = pieces.filter((p) => p.input === gi);
    const ring = [
      ...own.flatMap((p) => p.ring),
      ...ghosts.filter((g) => g.input === gi).flatMap((g) => g.ring),
    ];
    if (!ring.length || !text) return [];
    const b = boxOf(ring);
    const biggest = own.reduce<{ ring: Pt2[]; area: number } | null>((m, p) => {
      const pb = boxOf(p.ring);
      const area = (pb.x1 - pb.x0) * (pb.y1 - pb.y0);
      return !m || area > m.area ? { ring: p.ring, area } : m;
    }, null);
    const at: Pt2 = namesBelow
      ? [(b.x0 + b.x1) / 2, b.y1 + L.font + 2]
      : biggest
        ? spotInside(biggest.ring)
        : [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    const avoid = pieces.filter((p) => p.input !== gi).map((p) => boxOf(p.ring));
    return [{ text, s: { at, anchor: 'middle' as const, t: [0, 1] as Pt2, avoid } }];
  });
  // One collision pass: the mm by its edge first, then the numbers, then the unit names (mono type,
  // ~0.62 em a character; the names' letter spacing on top).
  const spots = spreadLabels([
    ...labels.map(({ m, s }) => ({
      ...s,
      w: (m.label ?? '').length * L.font * 0.62,
      h: L.font + 2,
    })),
    ...noSpots.map(({ s }) => ({ ...s, anchor: 'middle' as const, w: 20, h: 20 })),
    ...nameSpots.map(({ text, s }) => ({ ...s, w: text.length * L.font * 0.66, h: L.font + 2 })),
  ]);
  const labelAt = (i: number) => spots[i];
  const noAt = (i: number) => spots[labels.length + i];
  const nameAt = (i: number) => spots[labels.length + noSpots.length + i];

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
      {ghosts.length > 0 && (
        <g
          fill={FILL}
          stroke={GREY}
          strokeWidth={L.hair * 1.5}
          strokeDasharray={L.dash}
          data-step-ghost=''
        >
          {ghosts.map((g) => (
            <path key={`g:${g.key}`} d={pathOf(g.ring, true)} />
          ))}
        </g>
      )}
      {look !== 'tile' &&
        ghostName &&
        ghosts.map((g) => {
          const c = centroidOf(g.ring);
          return (
            <text
              key={`gn:${g.key}`}
              x={c[0]}
              y={c[1]}
              textAnchor='middle'
              dominantBaseline='central'
              fill={GREY}
              fontSize={L.font - 2}
              pointerEvents='none'
            >
              {ghostName(g.key)}
            </text>
          );
        })}
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
            x={labelAt(i)[0]}
            y={labelAt(i)[1]}
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
        noSpots.map(({ id, i }, n) => {
          const at = noAt(n);
          return (
            <g key={`n:${id}`} pointerEvents='none' data-pair-no={i + 1}>
              <rect
                x={at[0] - 9}
                y={at[1] - 9}
                width={18}
                height={18}
                fill={FILL}
                stroke={PAIR_INK}
                strokeWidth={1}
              />
              <text
                x={at[0]}
                y={at[1]}
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
        nameSpots.map((s, i) => (
          <text
            key={`u:${i}`}
            x={nameAt(i)[0]}
            y={nameAt(i)[1]}
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
        ))}
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
