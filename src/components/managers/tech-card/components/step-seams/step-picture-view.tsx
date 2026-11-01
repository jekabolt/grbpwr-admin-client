// THE STEP PICTURE, DRAWN (seam picker v2, owner OK 27.10) — one renderer and one data hook for the
// picker's canvas, its RESULT panel and the SEAMS row tile. Each input is one shape: its pieces as
// assembled, the outer outline bold (an ink stroke under every piece, the fills covering it inside),
// the inner seams hairline. Marked edges: proposal = ink dashed, own pick = blue, stored = ink bold.

import { withSeamHints } from 'lib/seam-hints';
import type { EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import {
  LOWER_LAYER_FILL,
  LOWER_LAYER_STROKE,
  LOWER_LAYER_STROKE_SCALE,
  STACKED_TWIN_OFFSET_MM,
  orderedLayerKeys,
  resolveEdge,
} from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';
import type { EdgeAnchor, SeamPlacement, StoredPose, StoredSeam } from 'lib/seams';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { plainEdges } from '../assembly-seams/words';
import { posesOf, rowsOf, useSeamsStore } from '../assembly-seams/seams-store';
import { useCardSeamGraph } from '../card-unit-pictures';
import type { TechCardFormData } from '../schema';
import { nameSpot } from './name-spot';
import { buttonholePictureGlyphs, type ButtonholeOperation } from './buttonhole-glyph';
import { PAIR_INK, pairNo } from './palette';
import { stepHandsOf, type StepHands } from './step-hand';
import { withPoseHosts, type PosePin } from './step-pose';
import { useStepResults } from './step-result-context';
import { useStepSeams } from './step-seams-context';
import {
  innerId,
  inputGroups,
  parseInner,
  pieceOfTarget,
  sewnBeforeStep,
  suggestStepPairs,
  suggestStepSurfaces,
  usedEdgesBeforeStep,
  type FormOpLike,
  type StepSurface,
  type Suggestion,
  type TargetId,
} from './step-seams-model';
import {
  boxOf,
  centroidOf,
  earlierInner,
  fitBox,
  focusPieces,
  hideLabels as hideLabelSpots,
  insideRing,
  inputName,
  labelSpot,
  pathOf,
  seamOfSides,
  splitSeams,
  spotInside,
  surfaceSeam,
  spreadLabels,
  stepLayout,
  toPx,
  type Box,
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
  cutLengthMm?: string;
  buttonholeOrientation?: string;
  placementCount?: number;
};

function sceneOpsSignature(ops: readonly SceneOp[], index: number): string {
  return JSON.stringify(
    ops.slice(0, index + 1).map((op) => ({
      inputKeys: op?.inputKeys,
      outputUnitKey: op?.outputUnitKey,
      seamKeys: op?.seamKeys,
      poseKeys: op?.poseKeys,
      operationNumber: op?.operationNumber,
      assemblyBlockDetached: op?.assemblyBlockDetached,
      fullnessRatio: op?.fullnessRatio,
      operationType: op?.operationType,
      machineType: op?.machineType,
      zone: op?.zone,
      seamClass: op?.seamClass,
      topstitchMode: op?.topstitchMode,
      work: op?.work,
      cutLengthMm: op?.cutLengthMm,
      buttonholeOrientation: op?.buttonholeOrientation,
      placementCount: op?.placementCount,
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
  return [
    ...split.inner,
    ...earlierInner(sewn, leaves, geoms, innerLines, split.engine),
    ...earlierSurface(ops, index, leaves, geoms, innerLines, byKey, split.inner),
  ];
}

/**
 * The parts earlier steps placed on a host inside one input (a placket on its sleeve slit, a pocket
 * on the yoke), laid by their rows: the engine's edge state never carries them, yet without them the
 * part stands apart from its host and the picture drops the host.
 */
export function earlierSurface(
  ops: readonly FormOpLike[],
  index: number,
  leaves: readonly (readonly string[])[],
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, Pt2[][]>,
  byKey: ReadonlyMap<string, StoredSeam>,
  have: readonly SeamCandidate[],
): SeamCandidate[] {
  const inputOf = new Map<string, number>();
  leaves.forEach((ks, i) => ks.forEach((k) => inputOf.set(k, i)));
  const seen = new Set(have.flatMap((c) => (c.provenance ? [c.provenance.seamKey] : [])));
  const out: SeamCandidate[] = [];
  for (const op of ops.slice(0, Math.min(index, ops.length)))
    for (const key of op.seamKeys ?? []) {
      const row = byKey.get(key);
      if (
        !row ||
        seen.has(key) ||
        row.kind !== 'surface' ||
        row.status !== 'confirmed' ||
        row.stale
      )
        continue;
      seen.add(key);
      const sides = {
        a: row.sideA.flatMap(targetsOfAnchor),
        b: row.sideB.flatMap(targetsOfAnchor),
      };
      const at = [...row.sideA, ...row.sideB].find((x) => x.placement)?.placement;
      const c = seamOfSides(sides, geoms, innerLines, at);
      const s = c?.kind === 'surface' ? c.surface : undefined;
      if (!c || !s) continue;
      const i = inputOf.get(s.host);
      if (i != null && inputOf.get(s.part) === i) out.push(c);
    }
  return out;
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

/** The card's pose rows (P8, pieces placed by hand) by key, server and pending alike. */
export function usePoseRows(): ReadonlyMap<string, StoredPose> {
  const poses = useSeamsStore((s) => s.poses);
  const posePending = useSeamsStore((s) => s.posePending);
  return useMemo(
    () => new Map(posesOf({ poses, posePending }).map((r) => [r.seamKey, r])),
    [poses, posePending],
  );
}

export type StepPictureOptions = {
  operations: readonly SceneOp[];
  index: number;
  pieceKeys: ReadonlySet<string>;
  innerLines?: ReadonlyMap<string, Pt2[][]>;
  byKey?: ReadonlyMap<string, StoredSeam>;
  /** The pose rows by key (P8): the steps' `poseKeys` name them. */
  poses?: ReadonlyMap<string, StoredPose>;
  nameOf?: (pieceKey: string) => string;
  ready?: boolean;
  explode?: number;
  rasterMm?: number;
};

/** The exact coarse reading used by the editor's compact SEAMS tile. */
export const STEP_TILE_EXPLODE = 0.12;
export const STEP_TILE_RASTER_MM = 4;

/**
 * Pieces the editor's SEAMS tile keeps for the seam targets it is showing — a kept posed piece with
 * its host, so it is drawn in its pose.
 */
export function focusedStepLeaves(
  leaves: readonly (readonly string[])[],
  targets: readonly TargetId[],
  innerSeams: readonly SeamCandidate[],
  pose?: ReadonlyMap<string, PosePin>,
): string[][] {
  if (!targets.length) return leaves.map((leaf) => [...leaf]);
  const own = new Set(targets.map(pieceOfTarget));
  const cut = leaves.map((leaf) => focusPieces(leaf, own, innerSeams));
  const kept = new Set(cut.flat());
  const keep = withPoseHosts(kept, new Set(leaves.flat()), pose);
  const out = keep.size > kept.size ? leaves.map((leaf) => leaf.filter((k) => keep.has(k))) : cut;
  return out.filter((leaf) => leaf.length > 0);
}

const candidateSides = (candidate: SeamCandidate): SeamSides => ({
  a: candidate.aParts?.length ? [...candidate.aParts] : [candidate.a],
  b: candidate.bParts?.length ? [...candidate.bParts] : [candidate.b],
});

/**
 * The seams of one operation as the step picture reads them, without the layout: the rows stored
 * on the step, the card's reading across its inputs (`crossSeams`) and, when that says nothing,
 * the model's proposal (`proposalSeams`). The paper doll sews a rowless step from the same guess.
 */
export function stepSeamsOfOp(
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
    poses,
    nameOf = (key: string) => key,
    ready = true,
  } = options;
  const active = op ?? ops[index];
  const groups = inputGroups(ops, index, pieceKeys).map((group) => ({
    ...group,
    name: inputName(group.key, index, ops, (key) => pieceKeys.has(key), nameOf),
  }));
  const leaves = groups.map((group) => group.pieces);
  const keys = [...(active?.seamKeys ?? [])];
  // Hand placements stored on this step's seams and the earlier ones', and the pieces placed by
  // hand (poses): every view lays them.
  const hands = stepHandsOf(ops, index, byKey, poses);
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
  // No pair to propose: a lone part may go into the slit its twin was sewn on (the second placket);
  // two lone plackets each get their own sleeve, and one accepted leaves the other standing.
  const surfaceSuggestions: StepSurface[] = (
    ready && !suggestions.length ? suggestStepSurfaces(ops, index, pieceKeys, geoms, byKey) : []
  ).filter(
    (surface) =>
      !stored.some((seam) =>
        [...seam.sides.a, ...seam.sides.b].some((id) => pieceOfTarget(id) === surface.part),
      ),
  );
  const surfaceSuggestion: StepSurface | null = surfaceSuggestions[0] ?? null;
  const surfaceProposals = surfaceSuggestions
    .map((surface) =>
      surfaceSeam(
        surface.host,
        surface.part,
        innerLines.get(surface.host)?.[surface.inner] ?? [],
        geoms,
        surface.place,
      ),
    )
    .filter((candidate): candidate is SeamCandidate => !!candidate);
  const surfaceProposal = surfaceProposals[0] ?? null;
  const surfaceMarks = surfaceSuggestions.map((surface) => innerId(surface.host, surface.inner));
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
    : [
        ...suggestions.map((candidate) => seamOfSides(candidate, geoms, innerLines)),
        ...surfaceProposals,
      ].filter((candidate): candidate is SeamCandidate => !!candidate);
  return {
    active,
    innerLines,
    byKey,
    groups,
    leaves,
    keys,
    ease,
    hands,
    stored,
    used,
    suggestion,
    suggestions,
    surfaceSuggestion,
    surfaceSuggestions,
    surfaceProposal,
    surfaceProposals,
    surfaceMarks,
    innerSeams,
    storedSeams,
    crossSeams,
    proposalSeams,
  };
}

/** The edges a rowless step is drawn sewn by: the card's reading across its inputs, else the proposal. */
export function stepGuessOf(
  seams: Pick<ReturnType<typeof stepSeamsOfOp>, 'crossSeams' | 'proposalSeams'>,
) {
  return seams.crossSeams.length ? seams.crossSeams : seams.proposalSeams;
}

/** Pure operation scene shared by the editor hook and the PDF renderer. */
export function stepPictureOfOp(
  op: SceneOp | undefined,
  graph: { chosen: readonly SeamCandidate[] } | null | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
  options: StepPictureOptions,
) {
  const { explode = STEP_TILE_EXPLODE, rasterMm = STEP_TILE_RASTER_MM } = options;
  const {
    active,
    innerLines,
    byKey,
    groups,
    leaves,
    keys,
    ease,
    hands,
    stored,
    used,
    suggestion,
    suggestions,
    surfaceSuggestion,
    surfaceSuggestions,
    surfaceProposal,
    surfaceProposals,
    surfaceMarks,
    innerSeams,
    storedSeams,
    crossSeams,
    proposalSeams,
  } = stepSeamsOfOp(op, graph, geoms, options);
  const frameSeams = frameSeamsOf(
    innerSeams,
    storedSeams,
    stored.length ? surfaceProposals : proposalSeams,
    crossSeams,
  );
  const marks: EdgeMark[] = [
    ...(stored.length
      ? stored.flatMap((seam) => [...seam.sides.a, ...seam.sides.b])
      : crossSeams.length
        ? crossSeams.flatMap((candidate) => {
            const sides = candidateSides(candidate);
            return [...sides.a, ...sides.b];
          })
        : surfaceMarks.length
          ? []
          : suggestions.flatMap((candidate) => [...candidate.a, ...candidate.b])
    ).map((id): EdgeMark => ({ id, tone: stored.length ? 'stored' : 'proposal' })),
    ...(crossSeams.length ? [] : surfaceMarks).map((id): EdgeMark => ({ id, tone: 'proposal' })),
  ];
  const layoutLeaves = focusedStepLeaves(
    leaves,
    marks.map((mark) => mark.id),
    innerSeams,
    hands.pose,
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
    surfaceSuggestion,
    surfaceSuggestions,
    surfaceProposal,
    surfaceProposals,
    innerSeams,
    proposalSeams,
    frameSeams,
    crossSeams,
    storedSeams,
    marks,
    layoutLeaves,
    hands,
    layout: stepLayout(layoutLeaves, frameSeams, geoms, { explode, rasterMm, ...hands }),
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
  const { ctx, geo, geoms, innerLines } = useCardGeoms();
  // The card's AI hints (line F) ride on the steps they name, as `SignalOp.hints`; none → the
  // steps as they are, today's guess.
  const guessHints = ctx?.guessHints;
  // A fresh array per signature: setValue on a step mutates the form's array in place, so the raw
  // reference would keep every memo below on the old step facts.
  const ops = useMemo(
    () => [...withSeamHints((getValues('operations') ?? []) as SceneOp[], guessHints)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opsSig, getValues, guessHints],
  );
  const op = ops[index];
  const pieceKeys = useCardPieceKeys();

  const cardName = ctx?.nameOf;
  const pieceName = useCallback(
    (k: string) => geo?.pieces.get(k)?.name || cardName?.(k) || k,
    [geo?.pieces, cardName],
  );
  const byKey = useSeamRows();
  const poses = usePoseRows();
  const ready = !!geo && geo.dep.status !== 'pending';
  const picture = useMemo(
    () =>
      stepPictureOfOp(op, graph, geoms, {
        operations: ops,
        index,
        pieceKeys,
        innerLines,
        byKey,
        poses,
        nameOf: pieceName,
        ready,
      }),
    [op, graph, geoms, ops, index, pieceKeys, innerLines, byKey, poses, pieceName, ready],
  );

  return {
    ctx,
    ops,
    geo,
    pieceKeys,
    pieceName,
    poses,
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
  hands?: StepHands,
): StepLayout {
  return useMemo(
    () => stepLayout(leaves, seams, geoms, { explode, rasterMm, ...hands }),
    [leaves, seams, geoms, explode, rasterMm, hands],
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

/** `hint` — an edge the card's AI joins map names for this step (line F): blue dashed. */
export type Tone = 'proposal' | 'pick' | 'stored' | 'hint';
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
  kind: 'button' | 'buttonhole' | 'label' | 'press-arrow';
  /** Unit direction in the same piece frame; a buttonhole's run, a press arrow's pointing. */
  direction?: Pt2;
  /** A press arrow's small word beyond its tip («open», «to back»). */
  label?: string;
  /** A press side read on the picture: the arrow keeps the seam normal, signed up/down/in/out. */
  aim?: 'up' | 'down' | 'centre' | 'away';
  /** Physical slit length; buttonholes default to 12 mm. */
  lengthMm?: number;
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
const TWIN_NUMBER_PX = 10;

/**
 * A press arrow in screen px: shaft from just off the seam outward, an open chevron head, and the
 * word's spot beyond the tip. ≈ 10 mm long at the picture's scale, clamped so it reads in print.
 */
export function pressArrowPath(
  at: Pt2,
  direction: Pt2,
  mmPx: number,
  look: { outline: number; font: number },
) {
  const length = Math.max(10, Math.min(18, 10 * mmPx));
  const gap = Math.max(2, look.outline * 1.2);
  const head = Math.max(3.5, length * 0.38);
  const [dx, dy] = direction;
  const start: Pt2 = [at[0] + dx * gap, at[1] + dy * gap];
  const tip: Pt2 = [at[0] + dx * (gap + length), at[1] + dy * (gap + length)];
  const cos = Math.cos(Math.PI / 4.5);
  const sin = Math.sin(Math.PI / 4.5);
  const wing = (side: number): Pt2 => [
    tip[0] - head * (dx * cos - side * dy * sin),
    tip[1] - head * (dy * cos + side * dx * sin),
  ];
  const left = wing(1);
  const right = wing(-1);
  const f = (value: number) => +value.toFixed(2);
  const reach = look.font * 0.5 + 3;
  const word: Pt2 = [tip[0] + dx * reach, tip[1] + dy * reach];
  const anchor: 'start' | 'middle' | 'end' = dx > 0.45 ? 'start' : dx < -0.45 ? 'end' : 'middle';
  return {
    d: `M${f(start[0])} ${f(start[1])}L${f(tip[0])} ${f(tip[1])}M${f(left[0])} ${f(left[1])}L${f(tip[0])} ${f(tip[1])}L${f(right[0])} ${f(right[1])}`,
    width: look.outline,
    word,
    anchor,
  };
}

export function spreadGlyphFallbacks(ring: readonly Pt2[], count: number): Pt2[] {
  if (!count) return [];
  const box = boxOf(ring);
  const safe = spotInside(ring);
  const horizontal = box.x1 - box.x0 >= box.y1 - box.y0;
  const section = (value: number): Pt2 | null => {
    const cuts: number[] = [];
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index];
      const b = ring[(index + 1) % ring.length];
      const aAxis = horizontal ? a[0] : a[1];
      const bAxis = horizontal ? b[0] : b[1];
      if (aAxis === bAxis || value < Math.min(aAxis, bAxis) || value >= Math.max(aAxis, bAxis))
        continue;
      const share = (value - aAxis) / (bAxis - aAxis);
      cuts.push(
        (horizontal ? a[1] : a[0]) +
          share * ((horizontal ? b[1] : b[0]) - (horizontal ? a[1] : a[0])),
      );
    }
    cuts.sort((a, b) => a - b);
    let best: [number, number] | null = null;
    for (let index = 0; index + 1 < cuts.length; index += 2)
      if (!best || cuts[index + 1] - cuts[index] > best[1] - best[0])
        best = [cuts[index], cuts[index + 1]];
    if (!best) return null;
    const cross = (best[0] + best[1]) / 2;
    return horizontal ? [value, cross] : [cross, value];
  };
  return Array.from({ length: count }, (_, index) => {
    const share = (index + 1) / (count + 1);
    const value = horizontal
      ? box.x0 + (box.x1 - box.x0) * share
      : box.y0 + (box.y1 - box.y0) * share;
    return section(value) ?? safe;
  });
}

/** A fixed-pixel label near the offset twin's lower-right corner, pulled inward until it is safe. */
const twinNumberSpot = (ring: readonly Pt2[]): Pt2 => {
  const box = boxOf(ring);
  const safe = spotInside(ring);
  const wanted: Pt2 = [box.x1 - TWIN_NUMBER_PX * 0.6, box.y1 - TWIN_NUMBER_PX * 0.6];
  for (let step = 0; step <= 10; step++) {
    const share = step / 10;
    const candidate: Pt2 = [
      wanted[0] + (safe[0] - wanted[0]) * share,
      wanted[1] + (safe[1] - wanted[1]) * share,
    ];
    if (insideRing(candidate, ring)) return candidate;
  }
  return safe;
};
/**
 * An inner line is a door for a seam only when it spans a slit or a placement line: on 23 cards
 * button and buttonhole marks span under 50 mm (most under 20), the slits 80 mm and more (card 6:
 * marks 3–26 mm, slits 101 mm and up). Only picking reads it: every inner line is drawn.
 */
export const DOOR_SPAN_MM = 50;
export const spanMm = (line: readonly Pt2[]) => {
  if (!line.length) return 0;
  const xs = line.map((p) => p[0]);
  const ys = line.map((p) => p[1]);
  return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
};

/**
 * How far a drawn outline may leave the dense ring, in garment mm. A step picture is 0.3–0.5 px/mm
 * and `pathOf` rounds to 0.1 px, so 0.3 mm is under a sixth of a pixel (0.04 mm on paper, a fifth of
 * the 0.7 px line's own width) — the plotted line is the same; the markup is not. Measured on
 * cards 83 / 81 / 85: the 1 mm resample (`g.rs`, 300–2500 points a piece) is drawn 43 / 300 / 512
 * times per document, 59k / 324k / 586k path vertices and 1.3 / 6.9 / 12.7 MB of markup for the
 * print pipeline to lay out and encode; this pass keeps 1.0k / 7.5k / 11.2k of those points.
 */
export const DRAWN_RING_TOL_MM = 0.3;

const distToSegment = (p: Pt2, a: Pt2, b: Pt2): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
};

/**
 * Douglas–Peucker over a closed ring (first point not repeated), keeping the original point
 * objects. The ring is cut at its first point and the point farthest from it, so neither chord
 * degenerates; each half is then thinned on its own.
 */
function simplifyClosed(ring: readonly Pt2[], tol: number): Pt2[] {
  const n = ring.length;
  if (n < 4) return [...ring];
  const at = (i: number) => ring[i % n];
  let far = 1;
  let farD = 0;
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farD) {
      far = i;
      farD = d;
    }
  }
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[far] = 1;
  const stack: [number, number][] = [
    [0, far],
    [far, n],
  ];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let worst = -1;
    let worstAt = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegment(at(i), at(s), at(e));
      if (d > worst) {
        worst = d;
        worstAt = i;
      }
    }
    if (worst > tol) {
      keep[worstAt] = 1;
      stack.push([s, worstAt], [worstAt, e]);
    }
  }
  const out: Pt2[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(ring[i]);
  return out;
}

const drawnRings = new WeakMap<readonly Pt2[], readonly Pt2[]>();

/**
 * The outline a piece is drawn with: `g.rs` thinned to DRAWN_RING_TOL_MM. Only the drawn path uses
 * it — centres, name spots, doors, marks and hit tests keep the dense ring. Cached per ring, so a
 * piece is thinned once a session, not once per step it appears in.
 */
export function drawnRing(rs: readonly Pt2[]): readonly Pt2[] {
  const hit = drawnRings.get(rs);
  if (hit) return hit;
  const out = simplifyClosed(rs, DRAWN_RING_TOL_MM);
  drawnRings.set(rs, out);
  return out;
}

export type PictureView = { k: number; x: number; y: number };

/**
 * What a picture is fitted to: every drawn piece but a stacked follower and a layer laid in or on
 * another (their host carries them), and on the canvas its ghosts.
 */
export function pictureBounds(
  layout: StepLayout,
  geoms: ReadonlyMap<string, PieceGeom>,
  look: keyof typeof LOOK,
): Box {
  const layered = new Set(layout.layers.map(([layer]) => layer));
  const laidIn = new Set(layout.pieceLayers.map(([key]) => key));
  const stacked = new Set(layout.stacked.flatMap((group) => group.slice(1)));
  const points = [...layout.T].flatMap(([key, transform]) => {
    if (stacked.has(key) || layered.has(layout.input.get(key) ?? -1) || laidIn.has(key)) return [];
    return (geoms.get(key)?.rs ?? []).map((point) => apply(transform, point));
  });
  if (look === 'canvas') points.push(...layout.ghosts.flatMap((ghost) => ghost.ring));
  return points.length ? boxOf(points) : layout.bbox;
}

/**
 * The step picture fitted into w × h px. `marks` colour edges and inner lines by tone (with their mm
 * beside on the canvas); `nos` put a stored seam's number beside it; `names` (one per input) sit on
 * the input's centre, or under it with `namesBelow`. With `onPick` every plain edge and inner line
 * of every piece is a door — the base a patch was sewn on keeps its slit.
 */
export function StepPictureSvg({
  w,
  h,
  pad,
  look,
  layout,
  layers,
  lower,
  stacked,
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
  bounds,
  className,
}: {
  w: number;
  h: number;
  pad: number;
  look: keyof typeof LOOK;
  layout: StepLayout;
  /** Authoritative bottom-to-top owner order. Omitted pictures keep the legacy drawing byte-for-byte. */
  layers?: readonly string[];
  /** Pieces explicitly claimed below another piece by the shared result. */
  lower?: readonly string[];
  /** Explicit [under, over] claims from the shared result. */
  stacked?: readonly (readonly [string, string])[];
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
  /** Fit to this box instead of the picture's own (a piece dragged by hand keeps the frame). */
  bounds?: Box;
  className?: string;
}) {
  const L = LOOK[look];
  const form = useFormContext<TechCardFormData>();
  const contextResults = useStepResults();
  const contextResult = useMemo(
    () =>
      layers
        ? contextResults?.find(
            (result) =>
              result.layout === layout || result.layout.T === layout.T || result.layers === layers,
          )
        : undefined,
    [contextResults, layers, layout],
  );
  const operation = contextResult
    ? (form?.getValues(`operations.${contextResult.opIndex}`) as ButtonholeOperation | undefined)
    : undefined;
  const automaticButtonholes = useMemo(
    () =>
      actionGlyphs.length ? [] : buttonholePictureGlyphs(operation, [...layout.T.keys()], geoms),
    [actionGlyphs.length, operation, layout.T, geoms],
  );
  const drawnActionGlyphs: readonly PictureActionGlyph[] = actionGlyphs.length
    ? actionGlyphs
    : automaticButtonholes.map((glyph) => ({
        id: glyph.id,
        piece: glyph.piece,
        point: glyph.point,
        direction: glyph.direction,
        lengthMm: glyph.lengthMm,
        kind: 'buttonhole',
      }));
  const resultLower = lower ?? contextResult?.lower ?? [];
  void stacked;
  const twinNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    layout.stacked.forEach((stack) =>
      stack.slice(1).forEach((piece, index) => numbers.set(piece, index + 2)),
    );
    return numbers;
  }, [layout.stacked]);
  const ownBounds = useMemo(() => pictureBounds(layout, geoms, look), [layout, geoms, look]);
  const layeredBounds = useMemo(() => {
    if (!layers) return null;
    const points = [...layout.T].flatMap(([key, transform]) => {
      const twin = twinNumbers.get(key);
      const offset = twin ? STACKED_TWIN_OFFSET_MM * (twin - 1) : 0;
      return (geoms.get(key)?.rs ?? []).map((point) => {
        const [x, y] = apply(transform, point);
        return [x + offset, y - offset] as Pt2;
      });
    });
    if (look === 'canvas') points.push(...layout.ghosts.flatMap((ghost) => ghost.ring));
    return points.length ? boxOf(points) : layout.bbox;
  }, [geoms, layers, layout, look, twinNumbers]);
  const fitBounds = bounds ?? layeredBounds ?? ownBounds;
  const fitPad = drawnActionGlyphs.length ? Math.max(pad, 7) : pad;
  const vk = view?.k ?? 1;
  const vx = view?.x ?? 0;
  const vy = view?.y ?? 0;
  const fit = useMemo(() => {
    const f = fitBox(fitBounds, w, h, fitPad);
    return { s: f.s * vk, tx: f.tx * vk + vx, ty: f.ty * vk + vy };
  }, [fitBounds, w, h, fitPad, vk, vx, vy]);

  const pieces = useMemo(() => {
    const out: { key: string; ring: Pt2[]; drawn: Pt2[]; input: number; centre: Pt2 }[] = [];
    for (const [key, T] of layout.T) {
      const g = geoms.get(key);
      if (!g) continue;
      const twin = layers ? twinNumbers.get(key) : undefined;
      const offset = twin ? STACKED_TWIN_OFFSET_MM * (twin - 1) * fit.s : 0;
      const px = (p: Pt2): Pt2 => {
        const [x, y] = toPx(fit, apply(T, p));
        return [x + offset, y + offset];
      };
      // `ring` measures (centre, spots, hits); `drawn` is what the paths plot.
      const ring = g.rs.map(px);
      const drawn = drawnRing(g.rs).map(px);
      out.push({ key, ring, drawn, input: layout.input.get(key) ?? 0, centre: centroidOf(ring) });
    }
    return out;
  }, [layout, geoms, fit, layers, twinNumbers]);
  const ownedOrder = useMemo(
    () =>
      layers
        ? orderedLayerKeys(
            layers,
            layout.stacked,
            pieces.map((piece) => piece.key),
          )
        : [],
    [layers, layout.stacked, pieces],
  );
  const ownedLowerKeys = useMemo(() => new Set(resultLower), [resultLower]);
  const orderedOwnedPieces = useMemo(() => {
    const byKey = new Map(pieces.map((piece) => [piece.key, piece]));
    return ownedOrder.flatMap((key) => {
      const piece = byKey.get(key);
      return piece ? [piece] : [];
    });
  }, [ownedOrder, pieces]);
  const ownedLower = useMemo(
    () => orderedOwnedPieces.filter((piece) => ownedLowerKeys.has(piece.key)),
    [orderedOwnedPieces, ownedLowerKeys],
  );
  const ownedTop = useMemo(
    () => orderedOwnedPieces.filter((piece) => !ownedLowerKeys.has(piece.key)),
    [orderedOwnedPieces, ownedLowerKeys],
  );
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
  const visibleBase = layers ? ownedTop : base;
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

  // Every inner line of a drawn piece — a button, a buttonhole, a slit — as a hairline that takes no
  // click; on the canvas a door (a slit, a placement line) keeps its faint dash instead.
  const marksDrawn = useMemo(() => {
    if (look === 'print') return [];
    const out: { id: string; d: string }[] = [];
    for (const p of visibleBase) {
      const T = layout.T.get(p.key);
      if (!T) continue;
      (innerLines?.get(p.key) ?? []).forEach((l, k) => {
        if (l.length < 2 || (look === 'canvas' && spanMm(l) >= DOOR_SPAN_MM)) return;
        const lineBox = boxOf(l);
        const replaced = automaticButtonholes.some(
          (glyph) =>
            glyph.piece === p.key &&
            Math.abs((lineBox.x0 + lineBox.x1) / 2 - glyph.markBox.cx) <= 2 &&
            Math.abs((lineBox.y0 + lineBox.y1) / 2 - glyph.markBox.cy) <= 2,
        );
        if (replaced) return;
        out.push({ id: innerId(p.key, k), d: pathOf(l.map((q) => toPx(fit, apply(T, q)))) });
      });
    }
    return out;
  }, [look, visibleBase, layout, innerLines, fit, automaticButtonholes]);

  const doors = useMemo(() => {
    if (!onPick && look !== 'canvas') return [];
    const out: { id: TargetId; d: string; inner: boolean }[] = [];
    // Owned pictures: bottom → top, so the top layer's edges sit last in the DOM and take the click;
    // a stacked twin's edges follow its drawn offset.
    const keys = layers ? ownedOrder : [...layout.T.keys()];
    for (const key of keys) {
      const T = layout.T.get(key);
      const g = geoms.get(key);
      if (!T || !g) continue;
      const twin = layers ? twinNumbers.get(key) : undefined;
      const offset = twin ? STACKED_TWIN_OFFSET_MM * (twin - 1) * fit.s : 0;
      const px = (p: Pt2): Pt2 => {
        const [x, y] = toPx(fit, apply(T, p));
        return [x + offset, y + offset];
      };
      for (const e of plainEdges(g)) out.push({ id: e.id, d: pathOf(e.pts.map(px)), inner: false });
      (innerLines?.get(key) ?? []).forEach((l, k) => {
        if (spanMm(l) < DOOR_SPAN_MM) return;
        out.push({ id: innerId(key, k), d: pathOf(l.map(px)), inner: true });
      });
    }
    return out;
  }, [onPick, look, layout, geoms, innerLines, fit, layers, ownedOrder, twinNumbers]);
  // A second click on the same spot takes the edge of the layer below (owned pictures only).
  const lastPick = useRef<{ x: number; y: number; id: TargetId } | null>(null);
  const pickAt = (event: ReactMouseEvent<SVGPathElement>, id: TargetId): TargetId => {
    if (!layers) return id;
    const { clientX: x, clientY: y } = event;
    const hits = document
      .elementsFromPoint(x, y)
      .map((el) => el.getAttribute('data-seam-target'))
      .filter((hit): hit is TargetId => !!hit);
    const last = lastPick.current;
    const again = last && Math.hypot(last.x - x, last.y - y) <= 4 ? hits.indexOf(last.id) : -1;
    const chosen = again >= 0 && hits.length > 1 ? hits[(again + 1) % hits.length] : id;
    lastPick.current = { x, y, id: chosen };
    return chosen;
  };

  const directPartner = new Map(layout.pieceLayers);
  const inputPartner = new Map(layout.layers);
  const stackLeader = new Map(
    layout.stacked.flatMap((stack) => stack.slice(1).map((key) => [key, stack[0]] as const)),
  );
  const actionHost = (key: string) => {
    // Every owned piece is drawn in layers mode — a lower one hosts its own marks.
    const own = layers ? orderedOwnedPieces.find((piece) => piece.key === key) : undefined;
    if (own) return own;
    const direct = directPartner.get(key) ?? stackLeader.get(key);
    if (direct) return visibleBase.find((piece) => piece.key === direct);
    const partnerInput = inputPartner.get(layout.input.get(key) ?? -1);
    return (
      visibleBase.find((piece) => piece.key === key) ??
      visibleBase.find((piece) => partnerInput != null && piece.input === partnerInput)
    );
  };
  const nearestOnRing = (point: Pt2, ring: readonly Pt2[]) => {
    let best = ring[0] ?? point;
    let distance = Infinity;
    let segment = 0;
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
        segment = index;
      }
    });
    return { point: best, distance, segment };
  };
  const pointsOnDrawnPiece = (key: string, points: readonly Pt2[]) => {
    const host = actionHost(key);
    if (!host) return null;
    const hidden = host.key !== key;
    if (hidden && points.length > 1 && host.ring.length > 2) {
      const start = nearestOnRing(points[0], host.ring);
      const end = nearestOnRing(points[points.length - 1], host.ring);
      const count = host.ring.length;
      const forward: Pt2[] = [];
      for (let index = (start.segment + 1) % count; index !== (end.segment + 1) % count; ) {
        forward.push(host.ring[index]);
        index = (index + 1) % count;
      }
      const backward: Pt2[] = [];
      for (let index = start.segment; index !== end.segment; ) {
        backward.push(host.ring[index]);
        index = (index - 1 + count) % count;
      }
      const arc = forward.length <= backward.length ? forward : backward;
      return [start.point, ...arc, end.point];
    }
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
  const pictureCentre: Pt2 = (() => {
    if (!pieces.length) return [w / 2, h / 2];
    const box = boxOf(pieces.flatMap((piece) => piece.ring));
    return [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  })();
  const glyphCandidates = drawnActionGlyphs.flatMap((glyph) => {
    const T = layout.T.get(glyph.piece);
    const host = actionHost(glyph.piece);
    if (!T || !host) return [];
    const wanted = toPx(fit, apply(T, glyph.point));
    const direction = glyph.direction ?? ([1, 0] as Pt2);
    const toward = toPx(
      fit,
      apply(T, [glyph.point[0] + direction[0], glyph.point[1] + direction[1]]),
    );
    const dx = toward[0] - wanted[0];
    const dy = toward[1] - wanted[1];
    const length = Math.hypot(dx, dy) || 1;
    if (glyph.kind === 'press-arrow') {
      // A press arrow stands on its seam as drawn, never moved into a free spot of the piece.
      const at = pointsOnDrawnPiece(glyph.piece, [wanted])?.[0] ?? wanted;
      let unit: Pt2 = [dx / length, dy / length];
      const aim = glyph.aim;
      if (aim) {
        const sign =
          aim === 'up'
            ? -unit[1]
            : aim === 'down'
              ? unit[1]
              : (pictureCentre[0] - at[0]) * unit[0] + (pictureCentre[1] - at[1]) * unit[1];
        if ((aim === 'away' ? -sign : sign) < 0) unit = [-unit[0], -unit[1]];
      }
      return [{ glyph, host, wanted: at, fallback: false, direction: unit, mmPx: length }];
    }
    const onDrawing = pieces.some((piece) => insideRing(wanted, piece.ring));
    return [
      {
        glyph,
        host,
        wanted,
        fallback: !onDrawing,
        direction: [dx / length, dy / length] as Pt2,
        mmPx: length,
      },
    ];
  });
  const fallbackById = new Map<string, Pt2>();
  const fallbacksByHost = new Map<string, typeof glyphCandidates>();
  for (const candidate of glyphCandidates) {
    if (!candidate.fallback) continue;
    const group = fallbacksByHost.get(candidate.host.key) ?? [];
    group.push(candidate);
    fallbacksByHost.set(candidate.host.key, group);
  }
  for (const group of fallbacksByHost.values()) {
    const spots = spreadGlyphFallbacks(group[0].host.ring, group.length);
    group.forEach((candidate, index) => fallbackById.set(candidate.glyph.id, spots[index]));
  }
  const actionGlyphSpots = glyphCandidates
    .map((candidate) => ({
      glyph: candidate.glyph,
      at: fallbackById.get(candidate.glyph.id) ?? candidate.wanted,
      direction: candidate.direction,
      mmPx: candidate.mmPx,
    }))
    // Both sides of one seam carry the same arrow: one drawn arrow per spot and way.
    .filter(
      (spot, index, all) =>
        spot.glyph.kind !== 'press-arrow' ||
        !all
          .slice(0, index)
          .some(
            (other) =>
              other.glyph.kind === 'press-arrow' &&
              Math.hypot(other.at[0] - spot.at[0], other.at[1] - spot.at[1]) < 8 &&
              other.direction[0] * spot.direction[0] + other.direction[1] * spot.direction[1] > 0.8,
          ),
    );
  // One press step says its word once, beside its first arrow.
  const pressWordIds = new Set(
    actionGlyphSpots
      .filter((spot) => spot.glyph.kind === 'press-arrow' && spot.glyph.label)
      .filter(
        (spot, index, all) =>
          all.findIndex((other) => other.glyph.label === spot.glyph.label) === index,
      )
      .map((spot) => spot.glyph.id),
  );
  const hideCrowdedLabels = look === 'canvas' || look === 'result';
  const pieceSize = new Map(
    pieces.map((piece) => {
      const box = boxOf(piece.ring);
      return [piece.key, Math.min(box.x1 - box.x0, box.y1 - box.y0)] as const;
    }),
  );
  const offsetOf = (id: TargetId, extra = 0) => {
    if (!hideCrowdedLabels) return 16 + extra;
    const size = pieceSize.get(pieceOfId(id)) ?? 0;
    return Math.max(3, Math.min(16, size * 0.09)) + extra;
  };
  const labels = markLines
    .filter(({ m }) => m.label)
    .map(({ m, pts }) => ({
      m,
      s: labelSpot(pts, centreOf.get(pieceOfId(m.id)) ?? pts[0], offsetOf(m.id)),
    }));
  const noSpots = nos.flatMap(({ id, i }) => {
    const pts = ptsOf(id);
    return pts
      ? [{ i, id, s: labelSpot(pts, centreOf.get(pieceOfId(id)) ?? pts[0], offsetOf(id, 2)) }]
      : [];
  });
  // A unit's name sits inside its own shape — in its biggest piece, on the widest run across it —
  // never across the gap between pieces that only stand together.
  const nameBoxOf = (text: string) => ({ w: text.length * L.font * 0.66 + 16, h: L.font + 8 });
  const nameSpots = (names ?? []).flatMap((text, gi) => {
    const own = pieces.filter((p) => p.input === gi);
    const ring = [
      ...own.flatMap((p) => p.ring),
      ...ghosts.filter((g) => g.input === gi).flatMap((g) => g.ring),
    ];
    if (!ring.length || !text) return [];
    const b = boxOf(ring);
    const avoid = pieces.filter((p) => p.input !== gi).map((p) => boxOf(p.ring));
    const biggest = own.reduce<{ ring: Pt2[]; area: number } | null>((m, p) => {
      const pb = boxOf(p.ring);
      const area = (pb.x1 - pb.x0) * (pb.y1 - pb.y0);
      return !m || area > m.area ? { ring: p.ring, area } : m;
    }, null);
    const at: Pt2 = namesBelow
      ? [(b.x0 + b.x1) / 2, b.y1 + L.font + 2]
      : biggest
        ? nameSpot(
            biggest.ring,
            pieces.filter((p) => p.ring !== biggest.ring).map((p) => p.ring),
            text.length * L.font * 0.62,
            L.font + 4,
            ring,
            { frame: { x0: 0, y0: 0, x1: w, y1: h }, avoid, ...nameBoxOf(text) },
          )
        : [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
    return [{ text, s: { at, anchor: 'middle' as const, t: [0, 1] as Pt2, avoid } }];
  });
  const nameBoxes = nameSpots.map(({ text, s }) => ({ ...s, ...nameBoxOf(text) }));
  const labelBoxes = labels.map(({ m, s }) => ({
    ...s,
    w: (m.label ?? '').length * L.font * 0.62,
    h: L.font + 2,
  }));
  const noBoxes = noSpots.map(({ s }) => ({
    ...s,
    anchor: 'middle' as const,
    w: 20,
    h: 20,
    required: true,
  }));
  // Print and tiles retain the established sliding order. Canvas/result keep every number at its
  // own edge, then admit mm labels and names only while they fit without a collision.
  const spots = hideCrowdedLabels
    ? hideLabelSpots([...noBoxes, ...labelBoxes, ...nameBoxes], {
        x0: 0,
        y0: 0,
        x1: w,
        y1: h,
      })
    : spreadLabels([...nameBoxes, ...labelBoxes, ...noBoxes]);
  const nameAt = (i: number) =>
    hideCrowdedLabels ? spots[noSpots.length + labels.length + i] : spots[i];
  const labelAt = (i: number) =>
    hideCrowdedLabels ? spots[noSpots.length + i] : spots[nameSpots.length + i];
  const noAt = (i: number) =>
    hideCrowdedLabels ? spots[i] : spots[nameSpots.length + labels.length + i];

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
      {layers ? (
        <>
          <g fill={FILL} stroke='none'>
            {ownedLower.map((piece) => (
              <path
                key={piece.key}
                d={pathOf(piece.drawn, true)}
                data-lower-layer-base={piece.key}
              />
            ))}
          </g>
          <g fill={FILL} stroke={INK} strokeWidth={L.outline} strokeLinejoin='round'>
            {ownedTop.map((piece) => (
              <path key={piece.key} d={pathOf(piece.drawn, true)} data-piece-outline={piece.key} />
            ))}
          </g>
          <g fill='none' stroke={GREY} strokeWidth={L.hair} strokeLinejoin='round'>
            {ownedTop.map((piece) => (
              <path key={piece.key} d={pathOf(piece.drawn, true)} />
            ))}
          </g>
        </>
      ) : (
        <>
          <g fill='none' stroke={INK} strokeWidth={L.outline} strokeLinejoin='round'>
            {base.map((p) => (
              <path key={p.key} d={pathOf(p.drawn, true)} data-piece-outline={p.key} />
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
                  <path
                    key={`${piece.key}:${index}`}
                    d={pathOf(run)}
                    data-piece-layer={piece.key}
                  />
                )),
              )}
            </g>
          )}
          <g fill='none' stroke={GREY} strokeWidth={L.hair} strokeLinejoin='round'>
            {base.map((p) => (
              <path key={p.key} d={pathOf(p.drawn, true)} />
            ))}
          </g>
        </>
      )}
      {marksDrawn.length > 0 && (
        <g
          fill='none'
          stroke={INK}
          strokeWidth={L.hair}
          strokeLinecap='round'
          strokeLinejoin='round'
          pointerEvents='none'
          data-inner-marks=''
        >
          {marksDrawn.map((x) => (
            <path key={x.id} d={x.d} />
          ))}
        </g>
      )}
      {layers &&
        ownedLower.map((piece) => (
          <path
            key={`lower:${piece.key}`}
            d={pathOf(piece.drawn, true)}
            fill={LOWER_LAYER_FILL}
            stroke={LOWER_LAYER_STROKE}
            strokeWidth={L.outline * LOWER_LAYER_STROKE_SCALE}
            strokeLinejoin='round'
            vectorEffect='non-scaling-stroke'
            pointerEvents='none'
            data-lower-layer={piece.key}
          />
        ))}
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
          stroke={
            m.tone === 'pick' || m.tone === 'hint' ? PICK : m.tone === 'stored' ? PAIR_INK : INK
          }
          strokeWidth={m.tone === 'stored' ? L.stored : L.mark}
          strokeDasharray={m.tone === 'proposal' || m.tone === 'hint' ? L.dash : undefined}
          strokeLinecap={m.tone === 'proposal' || m.tone === 'hint' ? 'butt' : 'round'}
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
      {actionGlyphSpots.map(({ glyph, at, direction, mmPx }) => {
        if (glyph.kind === 'press-arrow') {
          const arrow = pressArrowPath(at, direction, mmPx, L);
          return (
            <g
              key={`action-glyph:${glyph.id}`}
              pointerEvents='none'
              data-asm-mark='press-arrow'
              data-asm-piece={glyph.piece}
              data-asm-x={at[0]}
              data-asm-y={at[1]}
              data-asm-dx={direction[0]}
              data-asm-dy={direction[1]}
            >
              <path
                d={arrow.d}
                fill='none'
                stroke={INK}
                strokeWidth={arrow.width}
                strokeLinecap='round'
                strokeLinejoin='round'
              />
              {glyph.label && pressWordIds.has(glyph.id) ? (
                <text
                  x={arrow.word[0]}
                  y={arrow.word[1]}
                  textAnchor={arrow.anchor}
                  dominantBaseline='central'
                  fill={INK}
                  stroke={FILL}
                  strokeWidth={3}
                  paintOrder='stroke'
                  data-asm-word='press'
                >
                  {glyph.label}
                </text>
              ) : null}
            </g>
          );
        }
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
          const lengthMm = glyph.lengthMm && glyph.lengthMm > 0 ? glyph.lengthMm : 12;
          const half = (lengthMm * mmPx) / 2;
          return (
            <path
              key={`action-glyph:${glyph.id}`}
              d={`M${at[0] - direction[0] * half} ${at[1] - direction[1] * half}L${at[0] + direction[0] * half} ${at[1] + direction[1] * half}`}
              fill='none'
              stroke={INK}
              strokeWidth={L.hair}
              strokeLinecap='round'
              pointerEvents='none'
              data-asm-mark='buttonhole'
              data-asm-piece={glyph.piece}
              data-asm-x={at[0]}
              data-asm-y={at[1]}
              data-asm-dx={direction[0]}
              data-asm-dy={direction[1]}
              data-asm-length-mm={lengthMm}
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
        labels.map(({ m, s }, i) => {
          const at = labelAt(i);
          return at ? (
            <text
              key={`l:${m.id}`}
              x={at[0]}
              y={at[1]}
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
          ) : null;
        })}
      {look !== 'tile' &&
        noSpots.map(({ id, i }, n) => {
          const at = noAt(n);
          return at ? (
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
          ) : null;
        })}
      {look !== 'tile' &&
        nameSpots.map((s, i) => {
          const at = nameAt(i);
          return at ? (
            <text
              key={`u:${i}`}
              x={at[0]}
              y={at[1]}
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
          ) : null;
        })}
      {layers &&
        orderedOwnedPieces.flatMap((piece) => {
          const number = twinNumbers.get(piece.key);
          if (!number) return [];
          const at = twinNumberSpot(piece.ring);
          return [
            <text
              key={`twin:${piece.key}`}
              x={at[0]}
              y={at[1]}
              textAnchor='middle'
              dominantBaseline='central'
              fill={INK}
              stroke={FILL}
              strokeWidth={3}
              paintOrder='stroke'
              fontSize={TWIN_NUMBER_PX}
              pointerEvents='none'
              data-twin-number={number}
            >
              {number}
            </text>,
          ];
        })}
      {onPick &&
        // Lines first: where an edge runs beside a line, the edge takes the click.
        [...doors.filter((x) => x.inner), ...doors.filter((x) => !x.inner)].map((x) => (
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
            onClick={(event) => onPick(pickAt(event, x.id))}
            data-seam-target={x.id}
          />
        ))}
    </svg>
  );
}
