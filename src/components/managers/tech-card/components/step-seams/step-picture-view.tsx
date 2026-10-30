// THE STEP PICTURE, DRAWN (seam picker v2, owner OK 27.10) — one renderer and one data hook for the
// picker's canvas, its RESULT panel and the SEAMS row tile. Each input is one shape: its pieces as
// assembled, the outer outline bold (an ink stroke under every piece, the fills covering it inside),
// the inner seams hairline. Marked edges: proposal = ink dashed, own pick = blue, stored = ink bold.

import type { EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';
import type { EdgeAnchor, SeamPlacement, StoredSeam } from 'lib/seams';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
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
  pieceOfTarget,
  sewnBeforeStep,
  suggestStepPairs,
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
  focusPieces,
  insideRing,
  inputName,
  labelSpot,
  pathOf,
  seamOfSides,
  splitSeams,
  spotInside,
  spreadLabels,
  stepLayout,
  toPx,
  type SeamSides,
  type StepLayout,
} from './step-picture';

export type SceneOp = FormOpLike & {
  fullnessRatio?: string;
  outputUnitName?: string;
  // What names the step in its row (`stepWords`); the form holds them, the picker reads them.
  operationType?: string;
  machineType?: string;
  zone?: string;
  seamClass?: string;
  topstitchMode?: string;
  work?: string;
};

function sceneOpsSignature(ops: readonly SceneOp[], index: number): string {
  return JSON.stringify(
    ops.slice(0, index + 1).map((op) => ({
      inputKeys: op?.inputKeys,
      outputUnitKey: op?.outputUnitKey,
      seamKeys: op?.seamKeys,
      operationNumber: op?.operationNumber,
      assemblyBlockDetached: op?.assemblyBlockDetached,
      fullnessRatio: op?.fullnessRatio,
      operationType: op?.operationType,
      machineType: op?.machineType,
      zone: op?.zone,
      seamClass: op?.seamClass,
      topstitchMode: op?.topstitchMode,
      work: op?.work,
      outputUnitName: op?.outputUnitName,
    })),
  );
}

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
  /** The stored row resolved by the shared seam graph against today's geometry. */
  candidates: SeamCandidate[];
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

export type StepPictureOptions = {
  operations: readonly SceneOp[];
  index: number;
  pieceKeys: ReadonlySet<string>;
  innerLines?: ReadonlyMap<string, Pt2[][]>;
  byKey?: ReadonlyMap<string, StoredSeam>;
  nameOf?: (pieceKey: string) => string;
  ready?: boolean;
  explode?: number;
  rasterMm?: number;
};

/** The exact coarse reading used by the editor's compact SEAMS tile. */
export const STEP_TILE_EXPLODE = 0.12;
export const STEP_TILE_RASTER_MM = 4;

/** Pieces the editor's SEAMS tile keeps for the seam targets it is showing. */
export function focusedStepLeaves(
  leaves: readonly (readonly string[])[],
  targets: readonly TargetId[],
  innerSeams: readonly SeamCandidate[],
): string[][] {
  if (!targets.length) return leaves.map((leaf) => [...leaf]);
  const own = new Set(targets.map(pieceOfTarget));
  return leaves.map((leaf) => focusPieces(leaf, own, innerSeams)).filter((leaf) => leaf.length > 0);
}

const candidateSides = (candidate: SeamCandidate): SeamSides => ({
  a: candidate.aParts?.length ? [...candidate.aParts] : [candidate.a],
  b: candidate.bParts?.length ? [...candidate.bParts] : [candidate.b],
});

/** Pure operation scene shared by the editor hook and the PDF renderer. */
export function stepPictureOfOp(
  op: SceneOp | undefined,
  graph: { chosen: readonly SeamCandidate[] } | null | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
  options: StepPictureOptions,
) {
  const {
    operations: ops,
    index,
    pieceKeys,
    innerLines = new Map<string, Pt2[][]>(),
    byKey = new Map<string, StoredSeam>(),
    nameOf = (key: string) => key,
    ready = true,
    explode = STEP_TILE_EXPLODE,
    rasterMm = STEP_TILE_RASTER_MM,
  } = options;
  const active = op ?? ops[index];
  const groups = inputGroups(ops, index, pieceKeys).map((group) => ({
    ...group,
    name: inputName(group.key, index, ops, (key) => pieceKeys.has(key), nameOf),
  }));
  const leaves = groups.map((group) => group.pieces);
  const keys = [...(active?.seamKeys ?? [])];
  const ease = (() => {
    const ratio = Number.parseFloat(String(active?.fullnessRatio ?? '').replace(',', '.'));
    return Number.isFinite(ratio) && ratio > 0 ? ratio : null;
  })();
  const chosenByKey = new Map<string, SeamCandidate[]>();
  for (const candidate of graph?.chosen ?? []) {
    const key = candidate.provenance?.seamKey;
    if (!key || !keys.includes(key) || candidate.kind === 'closure-not-seam') continue;
    chosenByKey.set(key, [...(chosenByKey.get(key) ?? []), candidate]);
  }
  const stored: StoredOnStep[] = keys.map((key) => {
    const row = byKey.get(key);
    const candidates = chosenByKey.get(key) ?? [];
    const resolved = candidates.map(candidateSides);
    return {
      key,
      row,
      sides: resolved.length
        ? {
            a: resolved.flatMap((sides) => sides.a),
            b: resolved.flatMap((sides) => sides.b),
          }
        : {
            a: (row?.sideA ?? []).flatMap(targetsOfAnchor),
            b: (row?.sideB ?? []).flatMap(targetsOfAnchor),
          },
      candidates,
      placement: [...(row?.sideA ?? []), ...(row?.sideB ?? [])].find((anchor) => anchor.placement)
        ?.placement,
    };
  });
  const used = new Set<EdgeId>([
    ...stored.flatMap((seam) => [...seam.sides.a, ...seam.sides.b]).filter((id) => !parseInner(id)),
    ...usedEdgesBeforeStep(ops, index, byKey),
  ]);
  const suggestions = ready
    ? suggestStepPairs(ops, index, pieceKeys, geoms, used, ease, byKey)
    : [];
  const suggestion: Suggestion | null = suggestions[0] ?? null;
  const split = splitLaid(graph?.chosen ?? [], leaves, geoms, innerLines, byKey);
  const innerSeams = innerSeamsOf(split, ops, index, pieceKeys, leaves, geoms, innerLines, byKey);
  const storedSeams = stored
    .flatMap((seam) =>
      seam.candidates.length
        ? seam.candidates
        : [seamOfSides(seam.sides, geoms, innerLines, seam.placement)],
    )
    .filter((candidate): candidate is SeamCandidate => !!candidate);
  const crossSeams = stored.length
    ? []
    : split.cross.filter((candidate) => candidate.kind !== 'surface');
  // Missing stored rows use the card-wide garment reading. The local suggestion remains only the
  // editor's pick affordance when that reading has no seam between these operation inputs.
  const proposalSeams = crossSeams.length
    ? []
    : suggestions
        .map((candidate) => seamOfSides(candidate, geoms, innerLines))
        .filter((candidate): candidate is SeamCandidate => !!candidate);
  const frameSeams = frameSeamsOf(
    innerSeams,
    storedSeams,
    stored.length ? [] : proposalSeams,
    crossSeams,
  );
  const marks: EdgeMark[] = (
    stored.length
      ? stored.flatMap((seam) => [...seam.sides.a, ...seam.sides.b])
      : crossSeams.length
        ? crossSeams.flatMap((candidate) => {
            const sides = candidateSides(candidate);
            return [...sides.a, ...sides.b];
          })
        : suggestions.flatMap((candidate) => [...candidate.a, ...candidate.b])
  ).map((id) => ({ id, tone: stored.length ? 'stored' : 'proposal' }));
  const layoutLeaves = focusedStepLeaves(
    leaves,
    marks.map((mark) => mark.id),
    innerSeams,
  );
  return {
    op: active,
    geoms,
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
    proposalSeams,
    frameSeams,
    crossSeams,
    storedSeams,
    marks,
    layoutLeaves,
    layout: stepLayout(layoutLeaves, frameSeams, geoms, { explode, rasterMm }),
  };
}

export type StepPicture = ReturnType<typeof stepPictureOfOp>;

export function useStepScene(index: number) {
  const { graph } = useCardSeamGraph();
  const { control, getValues } = useFormContext<TechCardFormData>();
  // A 48-step quiz mounts one scene per strip tile. Subscribe each one only to the operation
  // facts its drawing uses; notes, media and other form typing must not redraw the whole strip.
  const opsSig = useWatch({
    control,
    name: 'operations',
    compute: (value) => sceneOpsSignature((value ?? []) as SceneOp[], index),
  });
  // A fresh array per signature: setValue on a step mutates the form's array in place, so the raw
  // reference would keep every memo below on the old step facts.
  const ops = useMemo(
    () => [...((getValues('operations') ?? []) as SceneOp[])],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opsSig, getValues],
  );
  const op = ops[index];
  const { ctx, geo, geoms, innerLines } = useCardGeoms();
  const pieceKeys = useCardPieceKeys();

  const cardName = ctx?.nameOf;
  const pieceName = useCallback(
    (k: string) => geo?.pieces.get(k)?.name || cardName?.(k) || k,
    [geo?.pieces, cardName],
  );
  const byKey = useSeamRows();
  const ready = !!geo && geo.dep.status !== 'pending';
  const picture = useMemo(
    () =>
      stepPictureOfOp(op, graph, geoms, {
        operations: ops,
        index,
        pieceKeys,
        innerLines,
        byKey,
        nameOf: pieceName,
        ready,
      }),
    [op, graph, geoms, ops, index, pieceKeys, innerLines, byKey, pieceName, ready],
  );

  return {
    ctx,
    ops,
    geo,
    pieceKeys,
    pieceName,
    ...picture,
  };
}

export type StepScene = ReturnType<typeof useStepScene>;

/**
 * What a canvas or a tile lays the inputs along: the seams inside them, then the step's own seams
 * (stored, and its proposals — all of them, one seam per pair of inputs, so a third input hangs
 * on its own seam; never the live pick, so a click moves nothing), else what the card's graph
 * reads between the inputs. A surface seam is left out (the part stands beside its host, its
 * line clear to pick): it is laid on the host in RESULT only.
 */
export function frameSeamsOf(
  inner: readonly SeamCandidate[],
  stored: readonly SeamCandidate[],
  proposals: readonly SeamCandidate[],
  cross: readonly SeamCandidate[],
): SeamCandidate[] {
  const flat = (xs: readonly SeamCandidate[]) => xs.filter((c) => c.kind !== 'surface');
  const own = [...stored, ...proposals];
  return [...inner, ...(own.length ? flat(own) : cross)];
}

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
export type PictureActionLine = {
  id: string;
  piece: string;
  /** Piece geometry frame (mm, y up), before the picture layout affine. */
  points: readonly Pt2[];
  weight: 'ink' | 'heavy';
  dashed?: boolean;
  kind: string;
};
export type PictureActionGlyph = {
  id: string;
  piece: string;
  /** Piece geometry frame (mm, y up), before the picture layout affine. */
  point: Pt2;
  kind: 'button' | 'buttonhole' | 'label';
  /** Unit direction in the same piece frame; only a buttonhole reads it. */
  direction?: Pt2;
};

type Look = {
  outline: number;
  hair: number;
  mark: number;
  stored: number;
  dash: string;
  font: number;
};
const LOOK: Record<'canvas' | 'result' | 'tile' | 'print', Look> = {
  canvas: { outline: 3.2, hair: 0.8, mark: 3, stored: 3.5, dash: '9 6', font: 12 },
  result: { outline: 2.6, hair: 0.7, mark: 2.5, stored: 2.5, dash: '9 6', font: 11 },
  // A row tile marks a seam by colour only, never by weight (owner): marks at the outline width.
  tile: { outline: 1.3, hair: 0.35, mark: 1.3, stored: 1.3, dash: '3 2', font: 9 },
  // The existing PDF weights: ordinary ink 1.75 px, active seam 3 px, monochrome hairlines.
  print: { outline: 1.75, hair: 0.7, mark: 3, stored: 3, dash: '5 3', font: 9 },
};

const pointSegmentDistance = (point: Pt2, a: Pt2, b: Pt2) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length2 = dx * dx + dy * dy;
  const share = length2
    ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length2))
    : 0;
  return Math.hypot(point[0] - a[0] - share * dx, point[1] - a[1] - share * dy);
};

/** Only the contour beside its host stays visible when a piece is folded behind that host. */
function layerRuns(ring: readonly Pt2[], host: readonly Pt2[], distance: number): Pt2[][] {
  if (ring.length < 2 || host.length < 2) return [];
  const stride = Math.max(1, Math.ceil(host.length / 64));
  const contour = host.filter((_, index) => index % stride === 0);
  const near = ring.map((point) =>
    contour.some(
      (start, index) =>
        pointSegmentDistance(point, start, contour[(index + 1) % contour.length]) <= distance,
    ),
  );
  if (near.every(Boolean)) return [[...ring]];
  const firstGap = near.findIndex((value) => !value);
  const runs: Pt2[][] = [];
  let run: Pt2[] = [];
  for (let offset = 1; offset <= ring.length; offset++) {
    const index = (firstGap + offset) % ring.length;
    if (near[index]) run.push(ring[index]);
    else if (run.length) {
      if (run.length > 1) runs.push(run);
      run = [];
    }
  }
  if (run.length > 1) runs.push(run);
  return runs;
}

const INK = 'var(--color-textColor)';
const GREY = 'var(--color-labelColor)';
const FILL = 'var(--color-bgColor)';
const PICK = 'var(--color-warning)';
const FAINT = 'var(--color-borderColor)';
export type PictureView = { k: number; x: number; y: number };

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
  actionLines = [],
  actionGlyphs = [],
  nos = [],
  names,
  namesBelow,
  ghostName,
  hover,
  onHover,
  onPick,
  view,
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
  actionLines?: readonly PictureActionLine[];
  actionGlyphs?: readonly PictureActionGlyph[];
  nos?: readonly NoMark[];
  names?: readonly string[];
  namesBelow?: boolean;
  /** A shapeless piece's name, written in its empty square (not on a tile). */
  ghostName?: (key: string) => string;
  hover?: TargetId | null;
  onHover?: (id: TargetId | null) => void;
  onPick?: (id: TargetId) => void;
  /** A zoom over the fitted picture: screen = fitted × k + (x, y). Lines and text keep their size. */
  view?: PictureView;
  className?: string;
}) {
  const L = LOOK[look];
  const fitBounds = useMemo(() => {
    const layered = new Set(layout.layers.map(([layer]) => layer));
    const laidIn = new Set(layout.pieceLayers.map(([key]) => key));
    const stacked = new Set(layout.stacked.flatMap((group) => group.slice(1)));
    const points = [...layout.T].flatMap(([key, transform]) => {
      if (stacked.has(key) || layered.has(layout.input.get(key) ?? -1) || laidIn.has(key))
        return [];
      return (geoms.get(key)?.rs ?? []).map((point) => apply(transform, point));
    });
    if (look === 'canvas') points.push(...layout.ghosts.flatMap((ghost) => ghost.ring));
    return points.length ? boxOf(points) : layout.bbox;
  }, [layout, geoms, look]);
  const fitPad = actionGlyphs.length ? Math.max(pad, 7) : pad;
  const vk = view?.k ?? 1;
  const vx = view?.x ?? 0;
  const vy = view?.y ?? 0;
  const fit = useMemo(() => {
    const f = fitBox(fitBounds, w, h, fitPad);
    return { s: f.s * vk, tx: f.tx * vk + vx, ty: f.ty * vk + vy };
  }, [fitBounds, w, h, fitPad, vk, vx, vy]);

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
  // A folded-on layer is a thin contour over its host. Identical plies share one outline.
  const { base, under } = useMemo(() => {
    const layered = new Set(layout.layers.map(([l]) => l));
    const laidIn = new Set(layout.pieceLayers.map(([k]) => k));
    const directPartner = new Map(layout.pieceLayers);
    const inputPartner = new Map(layout.layers);
    const stackedFollowers = new Set(layout.stacked.flatMap((stack) => stack.slice(1)));
    const isUnder = (p: { key: string; input: number }) =>
      layered.has(p.input) || laidIn.has(p.key);
    const visible = pieces.filter((piece) => !stackedFollowers.has(piece.key));
    const bases = visible.filter((piece) => !isUnder(piece));
    return {
      base: bases,
      under: visible.filter(isUnder).map((piece) => {
        const direct = directPartner.get(piece.key);
        const partnerInput = inputPartner.get(piece.input);
        const candidates = direct
          ? bases.filter((candidate) => candidate.key === direct)
          : bases.filter((candidate) => candidate.input === partnerInput);
        const partner = candidates.reduce<(typeof bases)[number] | undefined>((best, candidate) => {
          if (!best) return candidate;
          const distance = Math.hypot(
            candidate.centre[0] - piece.centre[0],
            candidate.centre[1] - piece.centre[1],
          );
          const bestDistance = Math.hypot(
            best.centre[0] - piece.centre[0],
            best.centre[1] - piece.centre[1],
          );
          return distance < bestDistance ? candidate : best;
        }, undefined);
        return { ...piece, runs: partner ? layerRuns(piece.ring, partner.ring, 6) : [] };
      }),
    };
  }, [pieces, layout.layers, layout.pieceLayers]);
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

  const directPartner = new Map(layout.pieceLayers);
  const inputPartner = new Map(layout.layers);
  const stackLeader = new Map(
    layout.stacked.flatMap((stack) => stack.slice(1).map((key) => [key, stack[0]] as const)),
  );
  const actionHost = (key: string) => {
    const direct = directPartner.get(key) ?? stackLeader.get(key);
    if (direct) return base.find((piece) => piece.key === direct);
    const partnerInput = inputPartner.get(layout.input.get(key) ?? -1);
    return (
      base.find((piece) => piece.key === key) ??
      base.find((piece) => partnerInput != null && piece.input === partnerInput)
    );
  };
  const nearestOnRing = (point: Pt2, ring: readonly Pt2[]) => {
    let best = ring[0] ?? point;
    let distance = Infinity;
    ring.forEach((start, index) => {
      const end = ring[(index + 1) % ring.length];
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length2 = dx * dx + dy * dy;
      const share = length2
        ? Math.max(
            0,
            Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / length2),
          )
        : 0;
      const candidate: Pt2 = [start[0] + share * dx, start[1] + share * dy];
      const candidateDistance = Math.hypot(point[0] - candidate[0], point[1] - candidate[1]);
      if (candidateDistance < distance) {
        best = candidate;
        distance = candidateDistance;
      }
    });
    return { point: best, distance };
  };
  const pointsOnDrawnPiece = (key: string, points: readonly Pt2[]) => {
    const host = actionHost(key);
    if (!host) return null;
    const hidden = host.key !== key;
    return points.map((point) => {
      const nearest = nearestOnRing(point, host.ring);
      return hidden || (!insideRing(point, host.ring) && nearest.distance > 4)
        ? nearest.point
        : point;
    });
  };
  const pieceOfId = (id: TargetId) => parseInner(id)?.piece ?? id.slice(0, id.lastIndexOf('#'));
  const markLines = marks.flatMap((m) => {
    const points = ptsOf(m.id);
    const shown = points && pointsOnDrawnPiece(pieceOfId(m.id), points);
    return shown ? [{ m, pts: shown }] : [];
  });
  const actionLinePaths = actionLines.flatMap((line) => {
    const T = layout.T.get(line.piece);
    const raw =
      T && line.points.length ? line.points.map((point) => toPx(fit, apply(T, point))) : [];
    const points = pointsOnDrawnPiece(line.piece, raw);
    return points?.length ? [{ line, points }] : [];
  });
  const actionGlyphSpots = actionGlyphs.flatMap((glyph) => {
    const T = layout.T.get(glyph.piece);
    const host = actionHost(glyph.piece);
    if (!T || !host) return [];
    const wanted = toPx(fit, apply(T, glyph.point));
    const hostBox = boxOf(host.ring);
    const margin = glyph.kind === 'label' ? 9 : glyph.kind === 'buttonhole' ? 7 : 4.2;
    const fits = (point: Pt2) =>
      insideRing(point, host.ring) &&
      point[0] >= hostBox.x0 + margin &&
      point[0] <= hostBox.x1 - margin &&
      point[1] >= hostBox.y0 + margin &&
      point[1] <= hostBox.y1 - margin;
    const safe = spotInside(host.ring);
    let at = wanted;
    if (host.key !== glyph.piece || !fits(at)) {
      at = safe;
      for (let step = 1; step <= 10; step++) {
        const share = step / 10;
        const candidate: Pt2 = [
          wanted[0] + (safe[0] - wanted[0]) * share,
          wanted[1] + (safe[1] - wanted[1]) * share,
        ];
        if (fits(candidate)) {
          at = candidate;
          break;
        }
      }
    }
    const direction = glyph.direction ?? ([1, 0] as Pt2);
    const toward = toPx(
      fit,
      apply(T, [glyph.point[0] + direction[0], glyph.point[1] + direction[1]]),
    );
    const dx = toward[0] - at[0];
    const dy = toward[1] - at[1];
    const length = Math.hypot(dx, dy) || 1;
    return [{ glyph, at, direction: [dx / length, dy / length] as Pt2 }];
  });
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
  // One collision pass: the unit names stand first, where they are (a name is what a shape IS);
  // the mm then slide along their own edges clear of them, a breath apart (the name's box is read
  // a little wider than the type), then the numbers. Mono type, ~0.62 em a character; the names'
  // letter spacing on top.
  const spots = spreadLabels([
    ...nameSpots.map(({ text, s }) => ({
      ...s,
      w: text.length * L.font * 0.66 + 16,
      h: L.font + 8,
    })),
    ...labels.map(({ m, s }) => ({
      ...s,
      w: (m.label ?? '').length * L.font * 0.62,
      h: L.font + 2,
    })),
    ...noSpots.map(({ s }) => ({ ...s, anchor: 'middle' as const, w: 20, h: 20 })),
  ]);
  const nameAt = (i: number) => spots[i];
  const labelAt = (i: number) => spots[nameSpots.length + i];
  const noAt = (i: number) => spots[nameSpots.length + labels.length + i];

  if (w < 2 || h < 2) return null;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      style={{ overflow: 'hidden', fontSize: L.font }}
      aria-hidden={onPick ? undefined : true}
    >
      <g fill='none' stroke={INK} strokeWidth={L.outline} strokeLinejoin='round'>
        {base.map((p) => (
          <path key={p.key} d={pathOf(p.ring, true)} data-piece-outline={p.key} />
        ))}
      </g>
      {under.length > 0 && (
        <g
          fill='none'
          stroke={GREY}
          strokeWidth={L.hair}
          strokeDasharray={L.dash}
          strokeLinejoin='round'
        >
          {under.flatMap((piece) =>
            piece.runs.map((run, index) => (
              <path key={`${piece.key}:${index}`} d={pathOf(run)} data-piece-layer={piece.key} />
            )),
          )}
        </g>
      )}
      <g fill='none' stroke={GREY} strokeWidth={L.hair} strokeLinejoin='round'>
        {base.map((p) => (
          <path key={p.key} d={pathOf(p.ring, true)} />
        ))}
      </g>
      {look === 'canvas' && ghosts.length > 0 && (
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
      {look === 'canvas' &&
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
      {actionLinePaths.map(({ line, points }) => (
        <path
          key={`action-line:${line.id}`}
          d={pathOf(points)}
          fill='none'
          stroke={INK}
          strokeWidth={line.weight === 'heavy' ? L.mark : L.outline}
          strokeDasharray={line.dashed ? '5 3' : undefined}
          strokeLinecap='round'
          strokeLinejoin='round'
          pointerEvents='none'
          data-asm-mark={line.kind}
          data-asm-piece={line.piece}
        />
      ))}
      {actionGlyphSpots.map(({ glyph, at, direction }) => {
        if (glyph.kind === 'button') {
          const radius = 4.2;
          return (
            <g
              key={`action-glyph:${glyph.id}`}
              fill={FILL}
              stroke={INK}
              pointerEvents='none'
              data-asm-mark='button'
              data-asm-piece={glyph.piece}
              data-asm-x={at[0]}
              data-asm-y={at[1]}
            >
              <circle cx={at[0]} cy={at[1]} r={radius} strokeWidth={L.mark} />
              <path
                d={`M${at[0] - radius * 0.55} ${at[1]}H${at[0] + radius * 0.55}M${at[0]} ${at[1] - radius * 0.55}V${at[1] + radius * 0.55}`}
                fill='none'
                strokeWidth={L.mark * 0.8}
              />
            </g>
          );
        }
        if (glyph.kind === 'buttonhole') {
          const half = 7;
          return (
            <path
              key={`action-glyph:${glyph.id}`}
              d={`M${at[0] - direction[0] * half} ${at[1] - direction[1] * half}L${at[0] + direction[0] * half} ${at[1] + direction[1] * half}`}
              fill='none'
              stroke={INK}
              strokeWidth={L.mark}
              strokeLinecap='round'
              pointerEvents='none'
              data-asm-mark='buttonhole'
              data-asm-piece={glyph.piece}
              data-asm-x={at[0]}
              data-asm-y={at[1]}
            />
          );
        }
        return (
          <rect
            key={`action-glyph:${glyph.id}`}
            x={at[0] - 9}
            y={at[1] - 5.5}
            width={18}
            height={11}
            fill={FILL}
            stroke={INK}
            strokeWidth={L.mark}
            pointerEvents='none'
            data-asm-mark='label'
            data-asm-piece={glyph.piece}
          />
        );
      })}
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
