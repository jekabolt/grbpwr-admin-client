// THE STEP PICTURE, DRAWN (seam picker v2, owner OK 27.10) — one renderer and one data hook for the
// picker's canvas, its RESULT panel and the SEAMS row tile. Each input is one shape: its pieces as
// assembled, the outer outline bold (an ink stroke under every piece, the fills covering it inside),
// the inner seams hairline. Marked edges: proposal = ink dashed, own pick = blue, stored = ink bold.

import { withSeamHints } from 'lib/seam-hints';
import {
  normalIntoPiece,
  pressMode,
  pressScreenAim,
  pressTowardPiece,
  pressWord,
  seamMidNormal,
} from 'components/managers/tech-card/techpack/press-arrows';
import type { EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import {
  STACKED_TWIN_OFFSET_MM,
  levelFill,
  orderedLayerKeys,
  resolveEdge,
} from 'lib/assembly-skeleton/union';
import { apply } from 'lib/assembly-skeleton/union/affine';
import {
  candidateSideParts,
  type EdgeAnchor,
  type SeamPlacement,
  type SidePart,
  type StoredPose,
  type StoredSeam,
} from 'lib/seams';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { plainEdges } from '../assembly-seams/words';
import { posesOf, rowsOf, useSeamsStore } from '../assembly-seams/seams-store';
import { useCardSeamGraph } from '../card-unit-pictures';
import { stripKeysOf, stripKeysOfCard, type CutStripLike } from '../cut-strips/strip-pieces';
import { GarmentLabelOverlay } from '../garment-label-picture';
import { isTopstitchStep } from '../operation-kinds';
import {
  ownStripKeys,
  StripOverlay,
  stripPadPx,
  type StripWords,
} from '../cut-strips/strip-picture';
import type { TechCardFormData } from '../schema';
import { topstitchLineParts, type TopstitchLine } from '../topstitch-lines';
import { nameSpot } from './name-spot';
import { mmOnPoints, repeatClickTarget, targetLenMm } from './span-pick';
import { fmtMm, innerStretches, seamlessLabelStep, unsewnLabel } from './step-seams-model';
import { placementPictureGlyphsForStep, type ButtonholeOperation } from './buttonhole-glyph';
import { PAIR_INK, pairNo } from './palette';
import { layerStyle } from './layer-style';
import { foldSection, type FoldPleat } from 'lib/folds';
import { PleatSectionSvg, pleatSectionHeight } from '../assembly-folds/fold-picture';
import { foldedActionGlyphs, foldedActionLines, foldedDrawing } from './step-folds';
import { NO_SEAM_TEXT, stepHighlightOf } from './step-highlight';
import { stepHandsOf, type StepHands } from './step-hand';
import { withPoseHosts, type PosePin } from './step-pose';
import { storedSeamSides } from './step-rows';
import { useStepResults } from './step-result-context';
import { useStepSeams } from './step-seams-context';
import {
  innerId,
  inputGroups,
  fullyUsedEdges,
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
  EMPTY_LAYOUT,
  fitBox,
  focusPieces,
  hideLabels as hideLabelSpots,
  insideRing,
  inputName,
  labelSpot,
  pathOf,
  seamOfSides,
  seamsOfSides,
  splitSeams,
  spotInside,
  surfaceSeam,
  spreadLabels,
  stepLayout,
  toPx,
  type Box,
  type Fit,
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
  pressAction?: string;
  pressToward?: string;
  topstitchWidthMm?: string;
  topstitchLines?: TopstitchLine[];
};

function sceneOpsSignature(ops: readonly SceneOp[], index: number): string {
  return JSON.stringify(
    ops.slice(0, index + 1).map((op) => ({
      inputKeys: op?.inputKeys,
      labelKeys: op?.labelKeys,
      outputUnitKey: op?.outputUnitKey,
      seamKeys: op?.seamKeys,
      poseKeys: op?.poseKeys,
      foldKeys: op?.foldKeys,
      ...(op?.layerOrder?.length ? { layerOrder: op.layerOrder } : {}),
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
      pressAction: op?.pressAction,
      pressToward: op?.pressToward,
      topstitchWidthMm: op?.topstitchWidthMm,
      topstitchLines: op?.topstitchLines,
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
  parts: { a: SidePart[]; b: SidePart[] };
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
  const liveStrips = useWatch({ name: 'cutStrips' }) as readonly CutStripLike[] | undefined;
  return useMemo(() => {
    const s = new Set<string>(geo?.pieces.keys() ?? []);
    for (const p of ctx?.techCard?.techCard?.pieces ?? []) if (p.lineKey) s.add(p.lineKey);
    for (const key of stripKeysOfCard(ctx?.techCard)) s.add(key);
    for (const key of stripKeysOf(liveStrips ?? [])) s.add(key);
    for (const label of ctx?.techCard?.techCard?.garmentLabels ?? [])
      if (label.lineKey) s.add(label.lineKey);
    return s;
  }, [geo?.pieces, ctx?.techCard, liveStrips]);
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
  /**
   * Leave `layout` empty. The tech pack lays every scene again itself (owner result, joined
   * layout, cumulative garment layout) and never reads the scene's own; laying it anyway was
   * 9.5 s of the 15.8 s cards 81 + 85 spent on their pictures (node profile, 2026-11-01).
   */
  skipLayout?: boolean;
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
  const structuralGroups = inputGroups(ops, index, pieceKeys).map((group) => ({
    ...group,
    name: inputName(group.key, index, ops, (key) => pieceKeys.has(key), nameOf),
  }));
  const structuralPieces = new Set(structuralGroups.flatMap((group) => group.pieces));
  const labelGroups = [...new Set(active?.labelKeys ?? [])].flatMap((key) => {
    const mark = geoms.get(key)?.garmentLabel;
    return mark && !structuralPieces.has(key) ? [{ key, pieces: [key], name: mark.label }] : [];
  });
  const groups = [...structuralGroups, ...labelGroups];
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
    const fallback = row ? storedSeamSides(row, geoms, innerLines) : null;
    return {
      key,
      row,
      sides: resolved.length
        ? {
            a: resolved.flatMap((sides) => sides.a),
            b: resolved.flatMap((sides) => sides.b),
          }
        : {
            a: fallback?.a ?? [],
            b: fallback?.b ?? [],
          },
      parts: candidates.length
        ? {
            a: candidates.flatMap((candidate) => candidateSideParts(candidate, 'a', geoms)),
            b: candidates.flatMap((candidate) => candidateSideParts(candidate, 'b', geoms)),
          }
        : fallback?.parts ?? { a: [], b: [] },
      candidates,
      placement: [...(row?.sideA ?? []), ...(row?.sideB ?? [])].find((anchor) => anchor.placement)
        ?.placement,
    };
  });
  const used = new Set<EdgeId>([
    ...stored
      .flatMap((seam) => [...seam.parts.a, ...seam.parts.b])
      .filter((part) => !part.range && !parseInner(part.target))
      .map((part) => part.target),
    ...fullyUsedEdges(usedEdgesBeforeStep(ops, index + 1, byKey, geoms), geoms),
  ]);
  // A hung or stuck-on label is placed by its pose: nothing to propose, nothing missing.
  const seamless = seamlessLabelStep(active, geoms);
  const suggestions =
    ready && !seamless ? suggestStepPairs(ops, index, pieceKeys, geoms, used, ease, byKey) : [];
  const suggestion: Suggestion | null = suggestions[0] ?? null;
  // No pair to propose: a lone part may go into the slit its twin was sewn on (the second placket);
  // two lone plackets each get their own sleeve, and one accepted leaves the other standing.
  const surfaceSuggestions: StepSurface[] = (
    ready && !seamless && !suggestions.length
      ? suggestStepSurfaces(ops, index, pieceKeys, geoms, byKey)
      : []
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
    .flatMap((seam) => {
      if (seam.candidates.length) return seam.candidates;
      const surfaceInner =
        seam.row?.kind === 'surface' &&
        [...seam.parts.a, ...seam.parts.b].some((part) => !!parseInner(part.target));
      return surfaceInner
        ? seamsOfSides(seam.parts, geoms, innerLines, seam.placement)
        : [seamOfSides(seam.sides, geoms, innerLines, seam.placement)];
    })
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
    seamless,
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
  const {
    explode = STEP_TILE_EXPLODE,
    rasterMm = STEP_TILE_RASTER_MM,
    skipLayout = false,
  } = options;
  const {
    active,
    seamless,
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
      ? stored.flatMap((seam) => [...seam.parts.a, ...seam.parts.b])
      : crossSeams.length
        ? crossSeams.flatMap((candidate) => {
            const sides = candidateSides(candidate);
            return [...sides.a, ...sides.b].map((target): SidePart => ({ target }));
          })
        : surfaceMarks.length
          ? []
          : suggestions.flatMap((candidate) =>
              [...candidate.a, ...candidate.b].map((target): SidePart => ({ target })),
            )
    ).map(
      (part): EdgeMark => ({
        id: part.target,
        ...(part.range ? { range: part.range } : {}),
        tone: stored.length ? 'stored' : 'proposal',
      }),
    ),
    ...(crossSeams.length ? [] : surfaceMarks).map((id): EdgeMark => ({ id, tone: 'proposal' })),
  ];
  const layoutLeaves = focusedStepLeaves(
    leaves,
    marks.map((mark) => mark.id),
    innerSeams,
    hands.pose,
  );
  const highlight = stepHighlightOf(options.operations, options.index, byKey, innerLines);
  return {
    op: active,
    seamless,
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
    stepEdges: highlight.targets,
    ...(highlight.parts.some((part) => !!part.range) ? { stepParts: highlight.parts } : {}),
    layoutLeaves,
    hands,
    layout: skipLayout
      ? EMPTY_LAYOUT
      : stepLayout(layoutLeaves, frameSeams, geoms, { explode, rasterMm, ...hands }),
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

export type StepSeamPreviewInput = {
  leaves: readonly (readonly string[])[];
  innerSeams: readonly SeamCandidate[];
  storedSeams: readonly SeamCandidate[];
  crossSeams: readonly SeamCandidate[];
  geoms: ReadonlyMap<string, PieceGeom>;
  innerLines: ReadonlyMap<string, readonly (readonly Pt2[])[]>;
  hands?: StepHands;
};

/** One resolved multi-piece input: a seam inside a unit, its edges picked on the unit's picture. */
export const isUnitStep = (groups: readonly { pieces: readonly string[] }[]) =>
  groups.length === 1 && groups[0].pieces.length > 1;

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

/**
 * `hint` — an edge the card's AI joins map names for this step (line F): blue dashed.
 * `pickFirst` — side 1 of a seam being picked (what is sewn): black, thicker, its piece shaded.
 * `pick` — side 2 (where it goes): blue.
 */
export type Tone = 'proposal' | 'pickFirst' | 'pick' | 'stored' | 'hint';
export type EdgeMark = {
  id: TargetId;
  tone: Tone;
  label?: string;
  range?: readonly [number, number];
  /** The stored seam the owner selected: drawn heavier. */
  active?: boolean;
};
export type NoMark = { id: TargetId; i: number; range?: readonly [number, number] };
/** A break point shown on an edge in hand: a notch is a square, an end or a turn a circle. */
/** The width of an edge's hit stroke, in px. */
const DOOR_HIT = 14;

/**
 * A narrow piece (a 30 mm label) is all edge at the full hit width: its body could not be taken to
 * move it. Its edges get a hit stroke of a quarter of its short side, never under 4 px.
 */
export function doorHitWidths(
  doors: readonly { id: TargetId; points: readonly Pt2[]; inner?: unknown }[],
): Map<string, number> {
  const boxes = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  for (const door of doors) {
    if (door.inner) continue;
    const piece = pieceOfTarget(door.id);
    const box = boxes.get(piece) ?? { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const [x, y] of door.points) {
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x);
      box.y1 = Math.max(box.y1, y);
    }
    boxes.set(piece, box);
  }
  const widths = new Map<string, number>();
  for (const [piece, box] of boxes) {
    const short = Math.min(box.x1 - box.x0, box.y1 - box.y0);
    if (Number.isFinite(short) && short < DOOR_HIT * 4)
      widths.set(piece, Math.max(4, Math.min(DOOR_HIT, short / 4)));
  }
  return widths;
}

export type EdgeTick = { id: TargetId; atMm: number; notch: boolean };
export type PictureActionLine = {
  id: string;
  piece: string;
  /** Persisted owner target represented by this action line. */
  target?: TargetId;
  /** Piece geometry frame (mm, y up), before the picture layout affine. */
  points: readonly Pt2[];
  weight: 'ink' | 'heavy';
  dashed?: boolean;
  kind: string;
};
/** A number beside a worked edge, inside the piece (a hem's depth). */
export type PictureActionDim = {
  id: string;
  piece: string;
  /** Piece geometry frame (mm, y up), before the picture layout affine. */
  points: readonly Pt2[];
  text: string;
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
  pattern?: 'cross_x' | 'parallel' | 'square' | 'u_shape' | 'other';
  holes?: 2 | 3 | 4;
  sizeMm?: number;
  /** Physical slit length; buttonholes default to 12 mm. */
  lengthMm?: number;
};

const targetPoints = (
  target: TargetId,
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, Pt2[][]>,
): readonly Pt2[] => {
  const inner = parseInner(target);
  return inner
    ? innerLines.get(inner.piece)?.[inner.k] ?? []
    : resolveEdge(target, geoms)?.pts ?? [];
};

const offsetTowardPiece = (
  points: readonly Pt2[],
  ring: readonly Pt2[],
  distance: number,
): Pt2[] => {
  const box = boxOf(ring);
  const centre: Pt2 = [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  return points.map((point) => {
    const dx = centre[0] - point[0];
    const dy = centre[1] - point[1];
    const length = Math.hypot(dx, dy) || 1;
    return [point[0] + (dx / length) * distance, point[1] + (dy / length) * distance];
  });
};

/** Action geometry for screen tiles that do not receive the PDF action model. */
export function stepActionMarks(
  op: SceneOp | undefined,
  stepParts: readonly SidePart[],
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, Pt2[][]>,
): { lines: PictureActionLine[]; glyphs: PictureActionGlyph[] } {
  if (!op) return { lines: [], glyphs: [] };
  const pressRaw = {
    operationType: op.operationType,
    work: op.work,
    press: { action: op.pressAction, toward: op.pressToward },
  } as Parameters<typeof pressMode>[0];
  const press = pressMode(pressRaw);
  const topstitch =
    isTopstitchStep(op) || /topstitch/i.test(`${op.work ?? ''} ${op.operationType ?? ''}`);
  if (!press && !topstitch) return { lines: [], glyphs: [] };

  const storedTopstitch = op.topstitchLines ?? [];
  if (!stepParts.length && !storedTopstitch.length) return { lines: [], glyphs: [] };

  if (topstitch) {
    const parsed = Number.parseFloat(String(op.topstitchWidthMm ?? '').replace(',', '.'));
    const distance = Number.isFinite(parsed) && parsed > 0 ? parsed : 1.5;
    const sources = storedTopstitch.length
      ? storedTopstitch.flatMap((line) =>
          topstitchLineParts(line, geoms).map((part) => ({
            part,
            lineKey: line.lineKey,
            rows: Math.max(1, Math.min(4, line.rows || 1)),
          })),
        )
      : stepParts.map((part) => ({ part, lineKey: String(op.operationNumber ?? 'step'), rows: 1 }));
    const parts = sources.flatMap(({ part, lineKey, rows }) => {
      const points = rangedPicturePoints(
        targetPoints(part.target, geoms, innerLines),
        part.range,
        targetLenMm(part.target, geoms, innerLines),
      );
      const piece = pieceOfTarget(part.target);
      return points.length > 1 && geoms.has(piece)
        ? [{ target: part.target, piece, points, lineKey, rows }]
        : [];
    });
    return {
      lines: parts.flatMap((part, partIndex) =>
        Array.from({ length: part.rows }, (_, rowIndex) => ({
          id: `${part.lineKey}:${partIndex}:${rowIndex}:topstitch`,
          piece: part.piece,
          target: part.target,
          points: offsetTowardPiece(
            part.points,
            geoms.get(part.piece)?.rs ?? [],
            distance * (rowIndex + 1),
          ),
          weight: 'ink' as const,
          dashed: true,
          kind: 'topstitch' as const,
        })),
      ),
      glyphs: [],
    };
  }

  const parts = stepParts.flatMap(({ target, range }) => {
    const points = rangedPicturePoints(
      targetPoints(target, geoms, innerLines),
      range,
      targetLenMm(target, geoms, innerLines),
    );
    const piece = pieceOfTarget(target);
    return points.length > 1 && geoms.has(piece) ? [{ target, piece, points }] : [];
  });
  const toward = op.pressToward;
  const label = pressWord(press, toward);
  const aim = press === 'side' ? pressScreenAim(toward) : undefined;
  const seamPieces = [...new Set(parts.map((part) => part.piece))].flatMap((key) => {
    const geom = geoms.get(key);
    return geom ? [{ key, name: geom.name ?? key, code: key }] : [];
  });
  const target = press === 'side' && !aim ? pressTowardPiece(toward, seamPieces) : undefined;
  const arrowParts =
    target && parts.some((part) => part.piece === target)
      ? parts.filter((part) => part.piece === target)
      : parts;
  const glyphs =
    press === 'flat'
      ? []
      : arrowParts.flatMap((part, index): PictureActionGlyph[] => {
          const middle = seamMidNormal(part.points);
          const ring = geoms.get(part.piece)?.rs;
          if (!middle || !ring) return [];
          const inward = normalIntoPiece(middle.at, middle.normal, ring);
          const id = `${op.operationNumber ?? 'step'}:${index}:press-arrow`;
          if (press === 'open')
            return [
              {
                id: `${id}:a`,
                piece: part.piece,
                kind: 'press-arrow',
                point: middle.at,
                direction: inward,
                label,
              },
              {
                id: `${id}:b`,
                piece: part.piece,
                kind: 'press-arrow',
                point: middle.at,
                direction: [-inward[0], -inward[1]],
              },
            ];
          const across = target && target !== part.piece;
          return [
            {
              id,
              piece: part.piece,
              kind: 'press-arrow',
              point: middle.at,
              direction: across ? [-inward[0], -inward[1]] : inward,
              label,
              aim,
            },
          ];
        });
  return {
    lines: parts.map((part, index) => ({
      id: `${op.operationNumber ?? 'step'}:${index}:press-edge`,
      piece: part.piece,
      target: part.target,
      points: part.points,
      weight: 'ink',
      kind: `press-${press}`,
    })),
    glyphs,
  };
}

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
/** A hidden contour is the thinner line (mockup: 1 under 1.6, and 1 under 1 on a tile). */
const hiddenOutline = (outline: number) => Math.min(outline, Math.max(1, outline * 0.625));

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
const isPick = (tone: Tone) => tone === 'pick' || tone === 'pickFirst';
const PICK_FIRST_STROKE_SCALE = 1.5;
const PICK_FIRST_FILL_OPACITY = 0.08;
const FAINT = 'var(--color-borderColor)';
/** A hidden contour must read on every level's colour, where FAINT would not. */
const HIDDEN_CONTOUR = 'var(--color-labelColor)';
const TWIN_NUMBER_PX = 10;

/** The box a unit's name needs at this font. */
const nameBoxOf = (text: string, font: number) => ({
  w: text.length * font * 0.66 + 16,
  h: font + 8,
});
// One shared empty per optional list prop. A `= []` default is a new array every render, and it
// sits in the keys of `ownedStyle` (layerStyle) and the doors: the seam picker's hover
// re-ran all of them per pointer event. With these, the memoised doors and name spots and a stable
// `onPick`, a hover on a 23-piece step went 31 → 7 ms (node, production React, median of 40).
const NO_MARKS: readonly EdgeMark[] = [];
const NO_TICKS: readonly EdgeTick[] = [];
const SPAN_DRAG_PX = 6;
const STORED_ACTIVE_SCALE = 1.5;
const TICK_NOTCH_PX = 5;
const TICK_POINT_R_PX = 2.5;
const NO_ACTION_LINES: readonly PictureActionLine[] = [];
const NO_ACTION_GLYPHS: readonly PictureActionGlyph[] = [];
const NO_ACTION_DIMS: readonly PictureActionDim[] = [];
const NO_NOS: readonly NoMark[] = [];
const NO_STACKED: readonly (readonly [string, string])[] = [];

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

export function buttonGlyphGeometry(
  at: Pt2,
  radius: number,
  holes: 2 | 3 | 4,
  pattern: NonNullable<PictureActionGlyph['pattern']>,
): { holes: Pt2[]; thread: string } {
  const offset = radius * 0.32;
  if (holes === 2) {
    const points: Pt2[] = [
      [at[0] - offset, at[1]],
      [at[0] + offset, at[1]],
    ];
    return { holes: points, thread: pathOf(points) };
  }
  if (holes === 3) {
    // Vertex up, the same triangle as the icon sheet. Square = closed thread, U = open (V).
    const reach = radius * 0.49;
    const side = reach * Math.cos(Math.PI / 6);
    const low = reach * Math.sin(Math.PI / 6);
    const points: Pt2[] = [
      [at[0], at[1] - reach],
      [at[0] + side, at[1] + low],
      [at[0] - side, at[1] + low],
    ];
    const thread =
      pattern === 'square'
        ? pathOf([...points, points[0]])
        : pattern === 'u_shape'
          ? pathOf([points[1], points[0], points[2]])
          : '';
    return { holes: points, thread };
  }
  const points: Pt2[] = [
    [at[0] - offset, at[1] - offset],
    [at[0] + offset, at[1] - offset],
    [at[0] + offset, at[1] + offset],
    [at[0] - offset, at[1] + offset],
  ];
  const thread =
    pattern === 'cross_x'
      ? `${pathOf([points[0], points[2]])}${pathOf([points[1], points[3]])}`
      : pattern === 'parallel'
        ? `${pathOf([points[0], points[3]])}${pathOf([points[1], points[2]])}`
        : pattern === 'square'
          ? pathOf([...points, points[0]])
          : pattern === 'u_shape'
            ? pathOf([points[0], points[3], points[2], points[1]])
            : '';
  return { holes: points, thread };
}

/** The interior host chord through a drill mark, used only to cap the glyph's width. */
export function buttonHostChord(
  mark: Pt2,
  direction: Pt2,
  ring: readonly Pt2[],
): { at: Pt2; width: number } | null {
  const directionLength = Math.hypot(direction[0], direction[1]);
  if (ring.length < 3 || directionLength < 1e-6) return null;
  const axis: Pt2 = [direction[0] / directionLength, direction[1] / directionLength];
  const cross = (a: Pt2, b: Pt2) => a[0] * b[1] - a[1] * b[0];
  const cuts: number[] = [];
  for (let index = 0; index < ring.length; index++) {
    const start = ring[index];
    const end = ring[(index + 1) % ring.length];
    const edge: Pt2 = [end[0] - start[0], end[1] - start[1]];
    const denominator = cross(axis, edge);
    if (Math.abs(denominator) < 1e-6) continue;
    const fromMark: Pt2 = [start[0] - mark[0], start[1] - mark[1]];
    const edgeShare = cross(fromMark, axis) / denominator;
    if (edgeShare < -1e-6 || edgeShare > 1 + 1e-6) continue;
    cuts.push(cross(fromMark, edge) / denominator);
  }
  cuts.sort((a, b) => a - b);
  const unique = cuts.filter((cut, index) => !index || Math.abs(cut - cuts[index - 1]) > 1e-6);
  for (let index = 0; index + 1 < unique.length; index++) {
    const low = unique[index];
    const high = unique[index + 1];
    const width = high - low;
    if (width < 1e-6 || low > 1e-6 || high < -1e-6) continue;
    const middle = (low + high) / 2;
    const inside: Pt2 = [mark[0] + axis[0] * middle, mark[1] + axis[1] * middle];
    if (insideRing(inside, ring)) return { at: [mark[0], mark[1]], width };
  }
  return null;
}

export const buttonRadiusPx = (sizeMm: number | undefined, scale: number, hostWidth?: number) => {
  const radius = Math.max(8, ((sizeMm ?? 15) * scale) / 2);
  return hostWidth != null && Number.isFinite(hostWidth) && hostWidth > 1e-6
    ? Math.min(radius, hostWidth * 0.45)
    : radius;
};

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

function coincidentNameLeader(
  at: Pt2,
  ring: readonly Pt2[],
  pictureWidth: number,
): { at: Pt2; anchor: 'start' | 'end'; line: Pt2[] } {
  const box = boxOf(ring);
  const right = pictureWidth - box.x1 >= box.x0;
  const direction = right ? 1 : -1;
  const y = Math.max(box.y0, Math.min(box.y1, at[1]));
  const edge: Pt2 = [right ? box.x1 : box.x0, y];
  const end: Pt2 = [edge[0] + direction * 14, y];
  return {
    at: [end[0] + direction * 4, end[1]],
    anchor: right ? 'start' : 'end',
    line: [edge, end],
  };
}
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
 * One React key per drawn stretch. Two stretches of one edge share its id; with a shared key React
 * loses track of the first and leaves its path in the picture after the step changes.
 */
export const stepLineKey = (part: SidePart, index: number) =>
  `step-edge:${part.target}:${part.range?.join('-') ?? ''}:${index}`;

export function rangedPicturePoints(
  points: readonly Pt2[],
  range: readonly [number, number] | undefined,
  targetLength: number,
): Pt2[] {
  if (!range || points.length < 2 || !(targetLength > 0)) return [...points];
  const total = points.reduce(
    (sum, point, index) =>
      index === 0
        ? 0
        : sum + Math.hypot(point[0] - points[index - 1][0], point[1] - points[index - 1][1]),
    0,
  );
  const fromMm = Math.max(0, Math.min(targetLength, range[0]));
  const start = (fromMm / targetLength) * total;
  const end = (Math.max(fromMm, Math.min(targetLength, range[1])) / targetLength) * total;
  const out: Pt2[] = [];
  let at = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const next = at + length;
    if (length > 0 && next >= start && at <= end) {
      const pointAt = (distance: number): Pt2 => {
        const share = Math.max(0, Math.min(1, (distance - at) / length));
        return [a[0] + share * (b[0] - a[0]), a[1] + share * (b[1] - a[1])];
      };
      const from = pointAt(Math.max(start, at));
      const to = pointAt(Math.min(end, next));
      if (!out.length) out.push(from);
      out.push(to);
    }
    at = next;
    if (at >= end) break;
  }
  return out.length >= 2 ? out : [...points];
}

export type PicturePickTarget = {
  id: TargetId;
  points: Pt2[];
  inner: boolean;
  box: Box;
};

const COVER_EDGE_PX = 2;

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

const pointsOnDrawnRing = (
  points: readonly Pt2[],
  hostRing: readonly Pt2[],
  hidden: boolean,
): Pt2[] => {
  if (hidden && points.length > 1 && hostRing.length > 2) {
    const start = nearestOnRing(points[0], hostRing);
    const end = nearestOnRing(points[points.length - 1], hostRing);
    const count = hostRing.length;
    const forward: Pt2[] = [];
    for (let index = (start.segment + 1) % count; index !== (end.segment + 1) % count; ) {
      forward.push(hostRing[index]);
      index = (index + 1) % count;
    }
    const backward: Pt2[] = [];
    for (let index = start.segment; index !== end.segment; ) {
      backward.push(hostRing[index]);
      index = (index - 1 + count) % count;
    }
    const arc = forward.length <= backward.length ? forward : backward;
    return [start.point, ...arc, end.point];
  }
  return points.map((point) => {
    const nearest = nearestOnRing(point, hostRing);
    return hidden || (!insideRing(point, hostRing) && nearest.distance > 4) ? nearest.point : point;
  });
};

/** Edges of a piece sewn under another in an earlier step sit inside the unit: no door for them. */
export function withoutCoveredDoors<T extends { id: TargetId; points: readonly Pt2[] }>(
  doors: readonly T[],
  pieces: readonly { key: string; ring: readonly Pt2[]; input: number }[],
  coveredBy: (key: string) => readonly string[],
  keep?: ReadonlySet<TargetId>,
): T[] {
  const byKey = new Map(pieces.map((piece) => [piece.key, piece]));
  return doors.filter(({ id, points }) => {
    if (keep?.has(id)) return true;
    const piece = byKey.get(pieceOfTarget(id));
    if (!piece) return true;
    const covers = coveredBy(piece.key).flatMap((key) => {
      const cover = byKey.get(key);
      return cover && cover.input === piece.input ? [cover.ring] : [];
    });
    if (!covers.length) return true;
    const hidden = (point: Pt2) =>
      covers.some(
        (ring) => insideRing(point, ring) || nearestOnRing(point, ring).distance <= COVER_EDGE_PX,
      );
    return !points.every(hidden);
  });
}

/**
 * Pick doors in the exact fitted frame the picture draws. Without an owner layer order, folded-in
 * pieces project onto the same visible host contour as their marks, so no raw invisible outline can
 * intercept another piece.
 */
export function picturePickTargets(
  layout: StepLayout,
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines: ReadonlyMap<string, readonly (readonly Pt2[])[]> | undefined,
  fit: Fit,
  options: {
    keys?: readonly string[];
    offsetPx?: (key: string) => number;
    projectHidden?: boolean;
    hiddenTargets?: ReadonlySet<TargetId>;
  } = {},
): PicturePickTarget[] {
  const layered = new Set(layout.layers.map(([input]) => input));
  const laidIn = new Set(layout.pieceLayers.map(([piece]) => piece));
  const stacked = new Set(layout.stacked.flatMap((group) => group.slice(1)));
  const baseKeys = new Set(
    [...layout.T.keys()].filter(
      (key) => !stacked.has(key) && !layered.has(layout.input.get(key) ?? -1) && !laidIn.has(key),
    ),
  );
  const bases = [...baseKeys].flatMap((key) => {
    const transform = layout.T.get(key);
    const geom = geoms.get(key);
    if (!transform || !geom) return [];
    const offset = options.offsetPx?.(key) ?? 0;
    return [
      {
        key,
        input: layout.input.get(key) ?? 0,
        ring: geom.rs.map((point) => {
          const [x, y] = toPx(fit, apply(transform, point));
          return [x + offset, y + offset] as Pt2;
        }),
      },
    ];
  });
  const projectHidden = options.projectHidden ?? options.keys == null;
  const directPartner = new Map(layout.pieceLayers);
  const inputPartner = new Map(layout.layers);
  const stackLeader = new Map(
    layout.stacked.flatMap((group) => group.slice(1).map((key) => [key, group[0]] as const)),
  );
  const hostOf = (key: string) => {
    const own = bases.find((piece) => piece.key === key);
    if (own) return own;
    const direct = directPartner.get(key) ?? stackLeader.get(key);
    if (direct) return bases.find((piece) => piece.key === direct);
    const partnerInput = inputPartner.get(layout.input.get(key) ?? -1);
    return bases.find((piece) => partnerInput != null && piece.input === partnerInput);
  };
  const keys = options.keys ?? [...layout.T.keys()];
  const out: PicturePickTarget[] = [];
  const add = (id: TargetId, points: Pt2[], inner: boolean) => {
    if (points.length > 1) out.push({ id, points, inner, box: boxOf(points) });
  };
  for (const key of keys) {
    const transform = layout.T.get(key);
    const geom = geoms.get(key);
    if (!transform || !geom) continue;
    const offset = options.offsetPx?.(key) ?? 0;
    const px = (point: Pt2): Pt2 => {
      const [x, y] = toPx(fit, apply(transform, point));
      return [x + offset, y + offset];
    };
    const shown = (points: Pt2[]) => {
      if (!projectHidden) return points;
      const host = hostOf(key);
      if (!host) return null;
      return host.key === key ? points : pointsOnDrawnRing(points, host.ring, true);
    };
    for (const edge of plainEdges(geom)) {
      if (
        projectHidden &&
        !baseKeys.has(key) &&
        options.hiddenTargets &&
        !options.hiddenTargets.has(edge.id)
      )
        continue;
      const points = shown(edge.pts.map(px));
      if (points) add(edge.id, points, false);
    }
    (innerLines?.get(key) ?? []).forEach((line, index) => {
      if (spanMm(line) < DOOR_SPAN_MM) return;
      const id = innerId(key, index);
      if (
        projectHidden &&
        !baseKeys.has(key) &&
        options.hiddenTargets &&
        !options.hiddenTargets.has(id)
      )
        return;
      const points = shown(line.map(px));
      if (points) add(id, points, true);
    });
  }
  return out;
}

/** The nearest fitted door to a point, used after the SVG's broad stroke catches the click. */
export function nearestPictureTarget(
  point: Pt2,
  targets: readonly PicturePickTarget[],
): PicturePickTarget | null {
  let nearest: PicturePickTarget | null = null;
  let distance = Infinity;
  const boxDistance = (box: Box) =>
    Math.hypot(
      point[0] < box.x0 ? box.x0 - point[0] : point[0] > box.x1 ? point[0] - box.x1 : 0,
      point[1] < box.y0 ? box.y0 - point[1] : point[1] > box.y1 ? point[1] - box.y1 : 0,
    );
  const candidates = targets
    .map((target) => ({ target, distance: boxDistance(target.box) }))
    .sort((a, b) => a.distance - b.distance);
  for (const candidate of candidates) {
    if (candidate.distance > distance) break;
    const target = candidate.target;
    for (let index = 1; index < target.points.length; index++) {
      const next = pointSegmentDistance(point, target.points[index - 1], target.points[index]);
      if (next < distance) {
        nearest = target;
        distance = next;
      }
    }
  }
  return nearest;
}

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
 * Douglas–Peucker over the index ranges on `stack`: a range keeps the point farthest from its chord
 * when that is more than `tol` away, then splits there. `at` reads a point (modulo n for a ring, so
 * a range may end at n); the ends of every range are kept by the caller.
 */
function thinRanges(
  at: (i: number) => Pt2,
  keep: Uint8Array,
  stack: [number, number][],
  tol: number,
) {
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
}

/**
 * Douglas–Peucker over a closed ring (first point not repeated), keeping the original point
 * objects. The ring is cut at its first point and the point farthest from it, so neither chord
 * degenerates; each half is then thinned on its own.
 */
function simplifyClosed(ring: readonly Pt2[], tol: number): Pt2[] {
  const n = ring.length;
  if (n < 4) return [...ring];
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
  thinRanges(
    (i) => ring[i % n],
    keep,
    [
      [0, far],
      [far, n],
    ],
    tol,
  );
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
 * The step picture fitted into w × h px. `marks` identify edges and inner lines; `nos` put a stored
 * seam's number beside it; `names` (one per input) sit on
 * the input's centre, or under it with `namesBelow`. With `onPick` every visible plain edge and
 * inner line is a door; active hidden targets project onto the contour that represents them.
 */
const PLEAT_NOTE_GAP = 4;
const PLEAT_NOTE_MAX_SHARE = 0.3;

/** The kind as it reads in this drawing: the hidden wedge on screen, not the piece's own view. */
const screenPleatKind = (pleat: FoldPleat, px: (p: Pt2) => Pt2): FoldPleat['kind'] => {
  if (pleat.kind === 'pleat') return 'pleat';
  return px(pleat.wedge[1])[0] < px(pleat.wedge[2])[0] ? 'pleat_r' : 'pleat_l';
};

export function StepPictureSvg({
  w,
  h,
  pad,
  look,
  layout,
  layers,
  stacked,
  onPainted,
  geoms: flatGeoms,
  innerLines: flatInnerLines,
  marks = NO_MARKS,
  stepEdges: suppliedStepEdges,
  stepParts: suppliedStepParts,
  actionLines = NO_ACTION_LINES,
  actionGlyphs = NO_ACTION_GLYPHS,
  actionDims = NO_ACTION_DIMS,
  noSeamText,
  seamless: suppliedSeamless,
  stripWords,
  nos = NO_NOS,
  names: givenNames,
  namesBelow,
  ghostName,
  hover,
  hoverRange,
  ticks = NO_TICKS,
  activeNo,
  onClearNo,
  onHoverAt,
  onSpanDrag,
  onHover,
  onPick,
  pickTargets,
  view,
  bounds,
  foldGhost,
  pleatNote,
  className,
}: {
  w: number;
  h: number;
  pad: number;
  look: keyof typeof LOOK;
  layout: StepLayout;
  /** Authoritative bottom-to-top owner order. Omitted pictures keep the legacy drawing byte-for-byte. */
  layers?: readonly string[];
  /** Explicit [under, over] claims from the shared result. */
  stacked?: readonly (readonly [string, string])[];
  /** Told the pieces as their fills are painted, bottom to top, whenever that changes. */
  onPainted?: (bottomToTop: readonly string[]) => void;
  geoms: ReadonlyMap<string, PieceGeom>;
  innerLines?: ReadonlyMap<string, Pt2[][]>;
  marks?: readonly EdgeMark[];
  /** Exact owner targets worked by this step; an empty array means a known rowless step. */
  stepEdges?: readonly TargetId[];
  /** The same owner targets with real sewn windows. */
  stepParts?: readonly SidePart[];
  actionLines?: readonly PictureActionLine[];
  actionGlyphs?: readonly PictureActionGlyph[];
  actionDims?: readonly PictureActionDim[];
  /** Localized print wording. Screen pictures reuse the existing editor status. */
  noSeamText?: string;
  /** The step only poses labels that go on without a seam: no «no seam» for it. */
  seamless?: boolean;
  stripWords?: StripWords;
  nos?: readonly NoMark[];
  names?: readonly string[];
  namesBelow?: boolean;
  /** A shapeless piece's name, written in its empty square (not on a tile). */
  ghostName?: (key: string) => string;
  hover?: TargetId | null;
  /** The hovered segment of `hover`, mm from the edge's start. */
  hoverRange?: readonly [number, number] | null;
  ticks?: readonly EdgeTick[];
  /** The selected stored seam's number: drawn inverted, with × beside it. */
  activeNo?: number | null;
  onClearNo?: () => void;
  onHoverAt?: (id: TargetId | null, atMm: number | null) => void;
  /** A drag that began on an edge, in mm along it; `done` on release. */
  onSpanDrag?: (id: TargetId, fromMm: number, toMm: number, done: boolean) => void;
  onHover?: (id: TargetId | null) => void;
  onPick?: (id: TargetId, atMm?: number) => void;
  /** Hidden/folded targets that remain pickable on their projected visible host contour. */
  pickTargets?: readonly TargetId[];
  /** A zoom over the fitted picture: screen = fitted × k + (x, y). Lines and text keep their size. */
  view?: PictureView;
  /** Fit to this box instead of the picture's own (a piece dragged by hand keeps the frame). */
  bounds?: Box;
  /** A piece whose fold closes on this step also shows flat, dashed (the assembly map). */
  foldGhost?: boolean;
  /** Print and map: the size the sheet is on. Set, a pleat shows its section and opening on the step that closes it. */
  pleatNote?: string;
  className?: string;
}) {
  const L = LOOK[look];
  // `geoms` and `innerLines` below are what is drawn (`T ∘ foldMap`); action marks are read on the
  // flat pieces and carried across. With no fold these are the very maps the caller gave.
  const stepFolds = layout.folds?.flat;
  const { geoms, innerLines, turned, pleats } = useMemo(
    () => foldedDrawing(flatGeoms, flatInnerLines, stepFolds),
    [flatGeoms, flatInnerLines, stepFolds],
  );
  const form = useFormContext<TechCardFormData>();
  const byKey = useSeamRows();
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
  const operations = (form?.getValues('operations') ?? []) as SceneOp[];
  const operation = contextResult ? operations[contextResult.opIndex] : undefined;
  const automaticHighlight = useMemo(
    () =>
      contextResult
        ? stepHighlightOf(operations, contextResult.opIndex, byKey, innerLines)
        : undefined,
    [contextResult, operations, byKey, innerLines],
  );
  const stepEdges = suppliedStepEdges ?? automaticHighlight?.targets;
  const stepParts: readonly SidePart[] | undefined =
    suppliedStepParts ??
    automaticHighlight?.parts ??
    stepEdges?.map((target): SidePart => ({ target }));
  const stepEdgeSet = useMemo(
    () => new Set([...(stepEdges ?? []), ...(stepParts ?? []).map((part) => part.target)]),
    [stepEdges, stepParts],
  );
  const automaticActions = useMemo(
    () => stepActionMarks(operation, stepParts ?? [], flatGeoms, flatInnerLines ?? new Map()),
    [operation, stepParts, flatGeoms, flatInnerLines],
  );
  const drawnActionLines = foldedActionLines(
    actionLines.length ? actionLines : automaticActions.lines,
    stepFolds,
    flatGeoms,
  );
  const givenGlyphs = useMemo(
    () => foldedActionGlyphs(actionGlyphs, stepFolds, flatGeoms),
    [actionGlyphs, stepFolds, flatGeoms],
  );
  const automaticFastenings = useMemo(() => {
    if (actionGlyphs.length || !contextResult || !contextResults) return [];
    const steps = operations.slice(0, contextResult.opIndex + 1).map((candidate, index) => ({
      operation: candidate as ButtonholeOperation,
      hosts: [...(contextResults[index]?.layout.T.keys() ?? [])].flatMap((key) => {
        const geom = flatGeoms.get(key);
        return geom ? [{ key, name: geom.name, geom }] : [];
      }),
    }));
    return foldedActionGlyphs(
      placementPictureGlyphsForStep(steps, contextResult.opIndex),
      stepFolds,
      flatGeoms,
    );
  }, [
    actionGlyphs.length,
    contextResult,
    contextResults,
    operations,
    operation,
    flatGeoms,
    stepFolds,
  ]);
  const drawnActionGlyphs: readonly PictureActionGlyph[] = actionGlyphs.length
    ? givenGlyphs
    : [
        ...foldedActionGlyphs(automaticActions.glyphs, stepFolds, flatGeoms),
        ...automaticFastenings.map((glyph) => ({
          id: glyph.id,
          piece: glyph.piece,
          point: glyph.point,
          direction: glyph.direction,
          lengthMm: glyph.lengthMm,
          kind: glyph.kind,
        })),
      ];
  const resultStacked = stacked ?? contextResult?.stacked ?? NO_STACKED;
  const claimedStackedKeys = useMemo(
    () => new Set(resultStacked.flatMap(([under, over]) => [under, over])),
    [resultStacked],
  );
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
      const offset = twin && !claimedStackedKeys.has(key) ? STACKED_TWIN_OFFSET_MM * (twin - 1) : 0;
      return (geoms.get(key)?.rs ?? []).map((point) => {
        const [x, y] = apply(transform, point);
        return [x + offset, y - offset] as Pt2;
      });
    });
    if (look === 'canvas') points.push(...layout.ghosts.flatMap((ghost) => ghost.ring));
    return points.length ? boxOf(points) : layout.bbox;
  }, [claimedStackedKeys, geoms, layers, layout, look, twinNumbers]);
  const ghostPoints = useMemo(() => {
    if (!foldGhost) return [];
    return (layout.folds?.closing ?? []).flatMap((key) => {
      const transform = layout.T.get(key);
      return transform ? (flatGeoms.get(key)?.rs ?? []).map((p) => apply(transform, p)) : [];
    });
  }, [flatGeoms, foldGhost, layout.T, layout.folds]);
  const ownFit = layeredBounds ?? ownBounds;
  const fitBounds = useMemo(
    () =>
      bounds ??
      (ghostPoints.length
        ? boxOf([...ghostPoints, [ownFit.x0, ownFit.y0] as Pt2, [ownFit.x1, ownFit.y1] as Pt2])
        : ownFit),
    [bounds, ghostPoints, ownFit],
  );
  // A strip that is this step's own input carries its words itself, its host's name among them, so
  // neither input's name is written twice, and the frame leaves room for those words.
  const ownStrips = useMemo(() => ownStripKeys(layout.input, flatGeoms), [layout.input, flatGeoms]);
  const names = useMemo(
    () =>
      ownStrips.size === 0 || !givenNames
        ? givenNames
        : givenNames.map((text, index) =>
            [...ownStrips].some((key) => {
              if (layout.input.get(key) === index) return true;
              const host = layout.stripHosts?.get(key);
              return (
                !!host &&
                layout.input.get(host) === index &&
                flatGeoms.get(host)?.name.trim() === text.trim()
              );
            })
              ? ''
              : text,
          ),
    [flatGeoms, givenNames, layout.input, layout.stripHosts, ownStrips],
  );
  // A third piece keeps its name under the cloth: the strip's dimension goes one line lower.
  const stripNameRoom = ownStrips.size > 0 && names?.some(Boolean) ? LOOK[look].font + 2 : 0;
  const stripRoom =
    ownStrips.size > 0 && look !== 'tile' ? stripPadPx(LOOK[look].font) + stripNameRoom : 0;
  const fitPad = Math.max(drawnActionGlyphs.length ? Math.max(pad, 7) : pad, stripRoom);
  const vk = view?.k ?? 1;
  const vx = view?.x ?? 0;
  const vy = view?.y ?? 0;
  // The pleats this very step closes, for the section and the opening above the piece.
  const closingPleats = useMemo(() => {
    if (pleatNote === undefined) return [];
    return [...(layout.folds?.closingAt ?? [])].flatMap(([key, places]) =>
      (pleats.get(key) ?? [])
        .filter((pleat) => [0, 1, 2].some((offset) => places.has(pleat.by + offset)))
        .map((pleat) => ({ key, pleat })),
    );
  }, [layout.folds, pleatNote, pleats]);
  const pleatRoom = useMemo(() => {
    if (!closingPleats.length) return 0;
    const provisional = fitBox(fitBounds, w, h, fitPad).s;
    const widest = Math.max(
      ...closingPleats.map(({ key, pleat }) => {
        const T = layout.T.get(key);
        const ring = (flatGeoms.get(key)?.rs ?? []).map((p) => (T ? apply(T, p) : p));
        const xs = ring.map((p) => p[0]);
        return (
          pleatSectionHeight(
            pleat.kind,
            Math.min(w - 2 * pad, (Math.max(...xs) - Math.min(...xs)) * provisional),
          ) +
          LOOK[look].font +
          PLEAT_NOTE_GAP * 3
        );
      }),
    );
    return Math.min(widest, h * PLEAT_NOTE_MAX_SHARE);
  }, [closingPleats, fitBounds, fitPad, flatGeoms, h, layout.T, look, pad, w]);
  const fit = useMemo(() => {
    const f = fitBox(fitBounds, w, Math.max(h - pleatRoom, 1), fitPad);
    return { s: f.s * vk, tx: f.tx * vk + vx, ty: (f.ty + pleatRoom) * vk + vy };
  }, [fitBounds, w, h, fitPad, pleatRoom, vk, vx, vy]);

  const pieces = useMemo(() => {
    const out: {
      key: string;
      ring: Pt2[];
      drawn: Pt2[];
      input: number;
      centre: Pt2;
      plies?: { d: string; under: boolean }[];
      pleats?: { wedge: string; edges: string[]; centre: string }[];
      flatGhost?: string;
    }[] = [];
    const ghostKeys = foldGhost ? layout.folds?.closing : undefined;
    for (const [key, T] of layout.T) {
      const g = geoms.get(key);
      if (!g) continue;
      const twin = layers ? twinNumbers.get(key) : undefined;
      const offset =
        twin && !claimedStackedKeys.has(key) ? STACKED_TWIN_OFFSET_MM * (twin - 1) * fit.s : 0;
      const px = (p: Pt2): Pt2 => {
        const [x, y] = toPx(fit, apply(T, p));
        return [x + offset, y + offset];
      };
      // `ring` measures (centre, spots, hits); `drawn` is what the paths plot.
      const ring = g.rs.map(px);
      const drawn = drawnRing(g.rs).map(px);
      const plies = turned.get(key);
      const piecePleats = pleats.get(key);
      const flat = ghostKeys?.includes(key) ? flatGeoms.get(key) : undefined;
      out.push({
        key,
        ring,
        drawn,
        input: layout.input.get(key) ?? 0,
        centre: centroidOf(ring),
        ...(plies?.length
          ? { plies: plies.map((ply) => ({ d: pathOf(ply.ring.map(px), true), under: ply.under })) }
          : {}),
        ...(piecePleats?.length
          ? {
              pleats: piecePleats.map((pleat) => ({
                wedge: pathOf(pleat.wedge.map(px), true),
                edges: pleat.edges.map((edge) => pathOf(edge.map(px))),
                centre: pathOf(pleat.centre.map(px)),
              })),
            }
          : {}),
        ...(flat ? { flatGhost: pathOf(drawnRing(flat.rs).map(px), true) } : {}),
      });
    }
    return out;
  }, [
    claimedStackedKeys,
    layout,
    geoms,
    flatGeoms,
    turned,
    pleats,
    foldGhost,
    fit,
    layers,
    twinNumbers,
  ]);
  const ownedOrder = useMemo(
    () =>
      layers
        ? orderedLayerKeys(
            layers,
            layout.stacked,
            [...layout.T.keys()].filter((key) => geoms.has(key)),
          )
        : [],
    [geoms, layers, layout.stacked, layout.T],
  );
  // A twin is drawn at its offset, so it covers and is covered from there. Kept off `fit`: a zoom
  // moves no piece, and the cover test is the dear part of a whole-garment step.
  const ownedT = useMemo(() => {
    const out = new Map(layout.T);
    for (const [key, twin] of twinNumbers) {
      const T = layout.T.get(key);
      if (!T || claimedStackedKeys.has(key)) continue;
      const offset = STACKED_TWIN_OFFSET_MM * (twin - 1);
      out.set(key, [T[0], T[1], T[2], T[3], T[4] + offset, T[5] - offset]);
    }
    return out;
  }, [claimedStackedKeys, layout.T, twinNumbers]);
  const ownedStyle = useMemo(
    () =>
      layers
        ? layerStyle({
            layers: ownedOrder,
            T: ownedT,
            geoms,
            marks: actionGlyphs,
            innerLines,
            ringOf: (geom) => drawnRing(geom.rs),
            colliding: layout.colliding,
          })
        : null,
    [actionGlyphs, geoms, innerLines, layers, layout.colliding, ownedOrder, ownedT],
  );
  const orderedOwnedPieces = useMemo(() => {
    const byKey = new Map(pieces.map((piece) => [piece.key, piece]));
    return ownedOrder.flatMap((key) => {
      const piece = byKey.get(key);
      return piece ? [piece] : [];
    });
  }, [ownedOrder, pieces]);
  // The fills lie in the outlines' order; the colours read the levels alone.
  const ownedSurfaces = useMemo(
    () =>
      orderedOwnedPieces.map((piece) => ({
        piece,
        level: ownedStyle?.pieces.get(piece.key)?.level ?? 0,
      })),
    [orderedOwnedPieces, ownedStyle],
  );
  useEffect(
    () => onPainted?.(ownedSurfaces.map(({ piece }) => piece.key)),
    [onPainted, ownedSurfaces],
  );
  // Every owned piece's outline paths. Memoised: their `d` strings were 74 % of what a picker
  // hover still rendered, and nothing here moves on hover.
  const ownedOutlinePaths = useMemo(
    () =>
      orderedOwnedPieces.flatMap((piece) => {
        const style = ownedStyle?.pieces.get(piece.key);
        const runs = (lines: readonly Pt2[][] = []) =>
          lines.map((line) => line.map((point) => toPx(fit, point)));
        // A whole outline is the ring the surface is filled with (`drawnRing`, thinned once per
        // geometry), closed by its first point again as `layerStyle` closes it.
        const solid =
          style?.whole && style.visible.length && piece.drawn.length > 1
            ? [[...piece.drawn, piece.drawn[0]]]
            : runs(style?.visible);
        return [
          ...solid.map((line, index) => (
            <path
              key={`${piece.key}:${index}`}
              d={pathOf(line)}
              stroke={FAINT}
              strokeWidth={L.outline}
              data-piece-outline={piece.key}
            />
          )),
          ...runs(style?.covered).map((line, index) => (
            <path
              key={`${piece.key}:hidden:${index}`}
              d={pathOf(line)}
              stroke={HIDDEN_CONTOUR}
              strokeWidth={hiddenOutline(L.outline)}
              strokeDasharray={L.dash}
              data-piece-hidden={piece.key}
            />
          )),
        ];
      }),
    [L, fit, orderedOwnedPieces, ownedStyle],
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
  const visibleBase = layers ? orderedOwnedPieces : base;
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
    const out: { id: string; d: string }[] = [];
    for (const p of visibleBase) {
      const T = layout.T.get(p.key);
      if (!T) continue;
      (innerLines?.get(p.key) ?? []).forEach((l, k) => {
        if (l.length < 2 || (look === 'canvas' && spanMm(l) >= DOOR_SPAN_MM)) return;
        const lineBox = boxOf(l);
        const replaced = automaticFastenings.some(
          (glyph) =>
            glyph.piece === p.key &&
            Math.abs((lineBox.x0 + lineBox.x1) / 2 - glyph.markBox.cx) <= 2 &&
            Math.abs((lineBox.y0 + lineBox.y1) / 2 - glyph.markBox.cy) <= 2,
        );
        if (replaced) return;
        // An owned piece shows a line only where no piece above covers it.
        const owned = ownedStyle?.pieces.get(p.key)?.lines[k];
        const d = owned
          ? owned.map((run) => pathOf(run.map((point) => toPx(fit, point)))).join('')
          : pathOf(l.map((q) => toPx(fit, apply(T, q))));
        if (d) out.push({ id: innerId(p.key, k), d });
      });
    }
    return out;
  }, [look, visibleBase, layout, innerLines, fit, automaticFastenings, ownedStyle]);

  // The doors depend on whether the picture is pickable, not on which closure picks: a caller's
  // `onPick` changes with its selection (or every render), and keying on it rebuilt every door.
  const pickable = !!onPick;
  const doors = useMemo(() => {
    if (!pickable && look !== 'canvas') return [];
    // Owned pictures: bottom → top, so the top layer's edges sit last in the DOM and take the click;
    // a stacked twin's edges follow its drawn offset. An edge the caller names stays pickable even
    // under a piece of its own unit: a seam inside a unit joins exactly such an edge.
    const named = pickable && pickTargets ? new Set(pickTargets) : undefined;
    const doorTargets = picturePickTargets(
      layout,
      geoms,
      innerLines,
      fit,
      layers
        ? {
            keys: ownedOrder,
            projectHidden: false,
            offsetPx: (key) => {
              const twin = twinNumbers.get(key);
              return twin && !claimedStackedKeys.has(key)
                ? STACKED_TWIN_OFFSET_MM * (twin - 1) * fit.s
                : 0;
            },
          }
        : {
            hiddenTargets: named,
          },
    );
    // A hung or stuck-on label takes no seam: no door on it, so its whole body drags.
    const targets = doorTargets.filter(
      (target) => !unsewnLabel(flatGeoms.get(pieceOfTarget(target.id))),
    );
    return layers
      ? withoutCoveredDoors(
          targets,
          pieces,
          (key) => resultStacked.flatMap(([under, over]) => (under === key ? [over] : [])),
          named,
        )
      : targets;
  }, [
    pieces,
    resultStacked,
    pickable,
    look,
    layout,
    geoms,
    flatGeoms,
    innerLines,
    fit,
    layers,
    ownedOrder,
    twinNumbers,
    claimedStackedKeys,
    pickTargets,
  ]);
  // A second click on the same spot takes the edge of the layer below (owned pictures only).
  const lastPick = useRef<{ x: number; y: number; id: TargetId } | null>(null);
  // A ref: the hit layer stays put while the hand changes.
  const inHand = useRef<ReadonlySet<TargetId>>(new Set());
  inHand.current = new Set(marks.filter((mark) => isPick(mark.tone)).map((mark) => mark.id));
  const pickAt = useCallback(
    (event: ReactMouseEvent<SVGPathElement>, id: TargetId): TargetId => {
      const { clientX: x, clientY: y } = event;
      if (!layers) {
        const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
        if (!rect) return id;
        const point: Pt2 = [
          ((x - rect.left) * w) / Math.max(rect.width, 1),
          ((y - rect.top) * h) / Math.max(rect.height, 1),
        ];
        const hits = new Set(
          document
            .elementsFromPoint(x, y)
            .map((element) => element.getAttribute('data-seam-target'))
            .filter((hit): hit is TargetId => !!hit),
        );
        return (
          nearestPictureTarget(
            point,
            doors.filter((target) => hits.has(target.id)),
          )?.id ?? id
        );
      }
      const hits = document
        .elementsFromPoint(x, y)
        .map((el) => el.getAttribute('data-seam-target'))
        .filter((hit): hit is TargetId => !!hit);
      const chosen = repeatClickTarget(hits, id, lastPick.current, [x, y], inHand.current);
      lastPick.current = { x, y, id: chosen };
      return chosen;
    },
    [layers, doors, w, h],
  );
  const pointerAt = useCallback(
    (svg: SVGSVGElement | null, x: number, y: number): Pt2 | null => {
      const rect = svg?.getBoundingClientRect();
      return rect
        ? [
            ((x - rect.left) * w) / Math.max(rect.width, 1),
            ((y - rect.top) * h) / Math.max(rect.height, 1),
          ]
        : null;
    },
    [w, h],
  );
  const mmOfDoor = useCallback(
    (id: TargetId, at: Pt2 | null): number | null => {
      const door = doors.find((candidate) => candidate.id === id);
      const inner = parseInner(id);
      const line = inner ? innerLines?.get(inner.piece)?.[inner.k] ?? [] : [];
      const length = targetLenMm(id, geoms, innerLines);
      return door && at && (!door.inner || !!innerStretches(line)) && length > 0
        ? mmOnPoints(door.points, at, length)
        : null;
    },
    [doors, geoms, innerLines],
  );
  // The click that ends a drag is not a pick. A drag holds no capture: the click keeps its target.
  const dragEnded = useRef(false);
  const startSpanDrag = useCallback(
    (event: ReactPointerEvent<SVGPathElement>, id: TargetId) => {
      if (!onSpanDrag || event.button !== 0) return;
      const svg = event.currentTarget.ownerSVGElement;
      const from = mmOfDoor(id, pointerAt(svg, event.clientX, event.clientY));
      if (from == null) return;
      // An edge's drag is the edge's, not the zoom's pan.
      event.stopPropagation();
      const { clientX: startX, clientY: startY, pointerId } = event;
      let dragging = false;
      let to = from;
      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        if (!dragging && Math.hypot(move.clientX - startX, move.clientY - startY) < SPAN_DRAG_PX)
          return;
        dragging = true;
        to = mmOfDoor(id, pointerAt(svg, move.clientX, move.clientY)) ?? to;
        onSpanDrag(id, from, to, false);
      };
      const finish = (end: PointerEvent) => {
        if (end.pointerId !== pointerId) return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        if (!dragging) return;
        onSpanDrag(id, from, to, end.type === 'pointerup');
        dragEnded.current = true;
        window.setTimeout(() => {
          dragEnded.current = false;
        }, 0);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
    },
    [onSpanDrag, mmOfDoor, pointerAt],
  );

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
  const pointsOnDrawnPiece = (key: string, points: readonly Pt2[]) => {
    const host = actionHost(key);
    if (!host) return null;
    return pointsOnDrawnRing(points, host.ring, host.key !== key);
  };
  const pieceOfId = (id: TargetId) => parseInner(id)?.piece ?? id.slice(0, id.lastIndexOf('#'));
  const markLines = marks.flatMap((m) => {
    const points = ptsOf(m.id);
    const ranged =
      points && rangedPicturePoints(points, m.range, targetLenMm(m.id, geoms, innerLines));
    const shown = ranged && pointsOnDrawnPiece(pieceOfId(m.id), ranged);
    return shown ? [{ m, pts: shown }] : [];
  });
  const pickFirstKeys = new Set(
    marks.flatMap((m) => (m.tone === 'pickFirst' ? [pieceOfId(m.id)] : [])),
  );
  const pickFirstPieces = pieces.filter((piece) => pickFirstKeys.has(piece.key));
  const stepLines = (stepParts ?? []).flatMap((part, index) => {
    if (marks.some((m) => m.id === part.target && isPick(m.tone))) return [];
    const points = ptsOf(part.target);
    const ranged =
      points &&
      rangedPicturePoints(points, part.range, targetLenMm(part.target, geoms, innerLines));
    const shown = ranged && pointsOnDrawnPiece(pieceOfId(part.target), ranged);
    return shown ? [{ id: part.target, key: stepLineKey(part, index), points: shown }] : [];
  });
  const actionLinePaths = drawnActionLines.flatMap((line) => {
    if (stepEdges && line.target && line.kind !== 'topstitch' && !stepEdgeSet.has(line.target))
      return [];
    // Bind/hem action geometry is the exact worked edge already drawn by stepLines. Keeping a
    // second path here would make the print stroke heavier than the specified 1.26× outline.
    if (line.target && stepEdgeSet.has(line.target) && /^(?:bind|hem|tape)$/.test(line.kind))
      return [];
    const T = layout.T.get(line.piece);
    const raw =
      T && line.points.length ? line.points.map((point) => toPx(fit, apply(T, point))) : [];
    const points = pointsOnDrawnPiece(line.piece, raw);
    return points?.length ? [{ line, points }] : [];
  });
  const actionDimSpots = foldedActionLines(actionDims, stepFolds, flatGeoms).flatMap((dim) => {
    const T = layout.T.get(dim.piece);
    const host = actionHost(dim.piece);
    const raw = T && dim.points.length ? dim.points.map((point) => toPx(fit, apply(T, point))) : [];
    const points = pointsOnDrawnPiece(dim.piece, raw);
    if (!host || !points || points.length < 2) return [];
    // Halfway along the run, one text height into the piece.
    const lengths = points
      .slice(1)
      .map((point, i) => Math.hypot(point[0] - points[i][0], point[1] - points[i][1]));
    let left = lengths.reduce((sum, value) => sum + value, 0) / 2;
    const i = lengths.findIndex((value) => (left -= value) <= 0);
    const segment = Math.max(i, 0);
    const [a, b] = [points[segment], points[segment + 1]];
    const span = lengths[segment] || 1;
    const along = (span + left) / span;
    const mid: Pt2 = [a[0] + (b[0] - a[0]) * along, a[1] + (b[1] - a[1]) * along];
    const normal: Pt2 = [(a[1] - b[1]) / span, (b[0] - a[0]) / span];
    const lift = L.font * 1.1;
    const up: Pt2 = [mid[0] + normal[0] * lift, mid[1] + normal[1] * lift];
    const down: Pt2 = [mid[0] - normal[0] * lift, mid[1] - normal[1] * lift];
    return [{ dim, at: insideRing(up, host.ring) ? up : down }];
  });
  const pictureCentre = useMemo((): Pt2 => {
    if (!pieces.length) return [w / 2, h / 2];
    const box = boxOf(pieces.flatMap((piece) => piece.ring));
    return [(box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2];
  }, [pieces, w, h]);
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
    const screenDirection: Pt2 = [dx / length, dy / length];
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
    const buttonChord =
      glyph.kind === 'button' ? buttonHostChord(wanted, screenDirection, host.ring) : null;
    return [
      {
        glyph,
        host,
        wanted,
        fallback: !onDrawing && !buttonChord,
        direction: screenDirection,
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
    .map((candidate) => {
      const mark = fallbackById.get(candidate.glyph.id) ?? candidate.wanted;
      const chord =
        candidate.glyph.kind === 'button'
          ? buttonHostChord(mark, candidate.direction, candidate.host.ring)
          : null;
      return {
        glyph: candidate.glyph,
        at: mark,
        direction: candidate.direction,
        mmPx: candidate.mmPx,
        hostWidth: chord?.width,
        draw: ownedStyle?.marks.get(candidate.glyph.id)?.draw ?? ('solid' as const),
      };
    })
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
  const pieceSize = useMemo(
    () =>
      new Map(
        pieces.map((piece) => {
          const box = boxOf(piece.ring);
          return [piece.key, Math.min(box.x1 - box.x0, box.y1 - box.y0)] as const;
        }),
      ),
    [pieces],
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
  const noSpots = nos.flatMap(({ id, i, range }) => {
    const whole = ptsOf(id);
    const pts = whole && rangedPicturePoints(whole, range, targetLenMm(id, geoms, innerLines));
    return pts
      ? [{ i, id, s: labelSpot(pts, centreOf.get(pieceOfId(id)) ?? pts[0], offsetOf(id, 2)) }]
      : [];
  });
  // A unit's name sits inside its own shape — in its biggest piece, on the widest run across it —
  // never across the gap between pieces that only stand together.
  // The name search walks every ring of the step (≈ 5 ms on a whole-garment step); a hover or a
  // pick changes none of its inputs, so it is kept until the pieces or the frame move.
  const nameSpots = useMemo(
    () =>
      (names ?? []).flatMap((text, gi) => {
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
                { frame: { x0: 0, y0: 0, x1: w, y1: h }, avoid, ...nameBoxOf(text, L.font) },
              )
            : [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
        return [{ text, s: { at, anchor: 'middle' as const, t: [0, 1] as Pt2, avoid } }];
      }),
    [names, pieces, ghosts, namesBelow, L, w, h],
  );
  const namedInputs = (names ?? []).flatMap((text, input) => (text ? [input] : []));
  const coincidentNamePieces = new Map(
    orderedOwnedPieces.flatMap((piece) =>
      ownedStyle?.pieces.get(piece.key)?.fullyCovered ? [[piece.input, piece] as const] : [],
    ),
  );
  const pieceInput = new Map(orderedOwnedPieces.map((piece) => [piece.key, piece.input]));
  const coincidentNameInputs = new Set<number>();
  for (const [input, piece] of coincidentNamePieces) {
    coincidentNameInputs.add(input);
    for (const cover of ownedStyle?.pieces.get(piece.key)?.coveredBy ?? []) {
      const coverInput = pieceInput.get(cover);
      if (coverInput != null) coincidentNameInputs.add(coverInput);
    }
  }
  const nameBoxes = nameSpots.map(({ text, s }, index) => ({
    ...s,
    ...nameBoxOf(text, L.font),
    required: coincidentNameInputs.has(namedInputs[index]) || undefined,
  }));
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
  // own edge, then admit the remaining short labels and names while they fit without a collision.
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
  const stepColor = look === 'print' ? INK : 'var(--color-highlightColor)';
  const stepWidth = L.outline * 1.26;
  const seamless = suppliedSeamless ?? seamlessLabelStep(operation, flatGeoms);
  const noStepSeams =
    !seamless &&
    stepEdges !== undefined &&
    stepEdges.length === 0 &&
    !marks.some((m) => isPick(m.tone));
  const noStepSeamLabel = noSeamText ?? (look === 'print' ? '' : NO_SEAM_TEXT);

  // The door strokes are the densest paths of the picture (every edge and inner line, twice: the
  // faint dash and the wide transparent hit stroke). Their `d` strings and elements are kept across
  // hovers — only the highlight path above them changes per pointer event.
  const innerDoorPaths = useMemo(
    () => doors.filter((x) => x.inner).map((x) => <path key={x.id} d={pathOf(x.points)} />),
    [doors],
  );
  const hitWidths = useMemo(() => doorHitWidths(doors), [doors]);
  const doorHits = useMemo(
    () =>
      onPick
        ? // Lines first: where an edge runs beside a line, the edge takes the click.
          [...doors.filter((x) => x.inner), ...doors.filter((x) => !x.inner)].map((x) => (
            <path
              key={`h:${x.id}`}
              d={pathOf(x.points)}
              fill='none'
              stroke='transparent'
              strokeWidth={hitWidths.get(pieceOfTarget(x.id)) ?? DOOR_HIT}
              pointerEvents='stroke'
              className='cursor-pointer'
              onPointerEnter={() => onHover?.(x.id)}
              onPointerMove={
                onHoverAt
                  ? (event) =>
                      onHoverAt(
                        x.id,
                        mmOfDoor(
                          x.id,
                          pointerAt(
                            event.currentTarget.ownerSVGElement,
                            event.clientX,
                            event.clientY,
                          ),
                        ),
                      )
                  : undefined
              }
              onPointerLeave={() => {
                onHover?.(null);
                onHoverAt?.(null, null);
              }}
              onPointerDown={onSpanDrag ? (event) => startSpanDrag(event, x.id) : undefined}
              onClick={(event) => {
                if (dragEnded.current) return;
                const id = pickAt(event, x.id);
                const atMm = mmOfDoor(
                  id,
                  pointerAt(event.currentTarget.ownerSVGElement, event.clientX, event.clientY),
                );
                onPick(id, atMm ?? undefined);
              }}
              data-seam-target={x.id}
            />
          ))
        : null,
    [
      doors,
      hitWidths,
      onPick,
      onHover,
      onHoverAt,
      onSpanDrag,
      startSpanDrag,
      mmOfDoor,
      pointerAt,
      pickAt,
    ],
  );

  // The flat ghost of a closing step always lies under the folded outline.
  const foldGhostPaths = pieces.some((piece) => piece.flatGhost) ? (
    <g
      fill='none'
      stroke={GREY}
      strokeWidth={L.hair * 1.5}
      strokeDasharray={L.dash}
      strokeLinejoin='round'
      pointerEvents='none'
    >
      {pieces.map((piece) =>
        piece.flatGhost ? (
          <path key={piece.key} d={piece.flatGhost} data-fold-ghost={piece.key} />
        ) : null,
      )}
    </g>
  ) : null;
  // The turned-under part reads dashed over the outline on the canvas. A tile and the print keep the
  // folded outline solid: their plies go under it, so only what the outline does not cover shows.
  const onCanvas = look === 'canvas';
  const foldPlies = pieces.some((piece) => piece.plies) ? (
    <g fill='none' strokeLinejoin='round' pointerEvents='none'>
      {pieces.flatMap((piece) =>
        (piece.plies ?? []).map((ply, index) =>
          ply.under ? (
            <path
              key={`${piece.key}:${index}`}
              d={ply.d}
              stroke={onCanvas ? GREY : FAINT}
              strokeWidth={onCanvas ? L.hair * 1.5 : L.hair}
              strokeDasharray={L.dash}
              data-fold-under={piece.key}
            />
          ) : (
            <path
              key={`${piece.key}:${index}`}
              d={ply.d}
              stroke={FAINT}
              strokeWidth={L.hair}
              data-fold-over={piece.key}
            />
          ),
        ),
      )}
    </g>
  ) : null;
  const foldPleats = pieces.some((piece) => piece.pleats) ? (
    <g pointerEvents='none' data-fold-pleats=''>
      {pieces.flatMap((piece) =>
        (piece.pleats ?? []).map((pleat, index) => (
          <g key={`${piece.key}:${index}`} data-fold-pleat={piece.key}>
            <path d={pleat.wedge} fill={FAINT} stroke='none' />
            {pleat.edges.map((edge, edgeIndex) => (
              <path
                key={edgeIndex}
                d={edge}
                fill='none'
                stroke={GREY}
                strokeWidth={L.hair * 1.5}
                strokeDasharray={L.dash}
                strokeLinejoin='round'
                data-fold-pleat-edge={piece.key}
              />
            ))}
            <path
              d={pleat.centre}
              fill='none'
              stroke={INK}
              strokeWidth={L.outline}
              strokeLinejoin='round'
              data-fold-pleat-centre={piece.key}
            />
          </g>
        )),
      )}
    </g>
  ) : null;

  const pleatNotes = closingPleats.length ? (
    <g pointerEvents='none' data-fold-pleat-notes=''>
      {closingPleats.map(({ key, pleat }) => {
        const T = layout.T.get(key);
        const flatPiece = flatGeoms.get(key);
        const folds = stepFolds?.get(key);
        if (!T || !flatPiece || !folds) return null;
        const section = foldSection(flatPiece.rs, folds.slice(pleat.by - 1, pleat.by + 2));
        if (!section?.pleat) return null;
        const px = (p: Pt2): Pt2 => toPx(fit, apply(T, p));
        const flatPx = flatPiece.rs.map(px);
        const xs = flatPx.map((p) => p[0]);
        const top = Math.min(
          ...flatPx.map((p) => p[1]),
          ...(geoms.get(key)?.rs ?? []).map((p) => px(p)[1]),
        );
        const [fromX, fromY] = px(pleat.opening[0]);
        const [toX, toY] = px(pleat.opening[1]);
        const middle = (fromX + toX) / 2;
        const half = Math.hypot(toX - fromX, toY - fromY) / 2;
        const lineY = top - PLEAT_NOTE_GAP;
        const textY = lineY - PLEAT_NOTE_GAP;
        const width = Math.min(w - 2 * pad, Math.max(...xs) - Math.min(...xs));
        // Upright, a → pleat hides to the left. The picture may lay the piece any way: the section
        // goes with what is drawn beside it, the word on the sheet stays with the piece.
        const kind = screenPleatKind(pleat, px);
        const sectionY = textY - L.font - pleatSectionHeight(kind, width);
        const sectionX = Math.max(pad, Math.min(w - pad - width, middle - width / 2));
        return (
          <g key={`${key}:${pleat.by}`} data-fold-pleat-note={key}>
            <PleatSectionSvg kind={kind} x={sectionX} y={sectionY} width={width} />
            <line
              x1={middle - half}
              y1={lineY}
              x2={middle + half}
              y2={lineY}
              stroke={GREY}
              strokeWidth={L.hair}
              data-fold-pleat-opening={key}
            />
            <text
              x={middle}
              y={textY}
              textAnchor='middle'
              fill={GREY}
              fontSize={L.font}
              className='tabular-nums'
            >
              {[pleatNote, Math.round(section.pleat.openingMm)].filter(Boolean).join(' · ')}
            </text>
          </g>
        );
      })}
    </g>
  ) : null;

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
          <g stroke='none'>
            {ownedSurfaces.map(({ piece, level }) => (
              <path
                key={piece.key}
                d={pathOf(piece.drawn, true)}
                fill={levelFill(level)}
                data-piece-surface={piece.key}
                data-piece-level={level || undefined}
                data-lower-layer-base={
                  ownedStyle?.pieces.get(piece.key)?.coveredBy.length ||
                  !ownedStyle?.pieces.get(piece.key)?.whole
                    ? piece.key
                    : undefined
                }
              />
            ))}
          </g>
          {foldGhostPaths}
          {!onCanvas && foldPlies}
          <g fill='none' strokeLinejoin='round'>
            {ownedOutlinePaths}
          </g>
        </>
      ) : (
        <>
          {foldGhostPaths}
          {!onCanvas && foldPlies}
          <g fill='none' stroke={FAINT} strokeWidth={L.outline} strokeLinejoin='round'>
            {base.map((p) => (
              <path key={p.key} d={pathOf(p.drawn, true)} data-piece-outline={p.key} />
            ))}
          </g>
          {under.length > 0 && (
            <g
              fill='none'
              stroke={FAINT}
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
        </>
      )}
      {look === 'canvas' && foldPlies}
      {foldPleats}
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
          {innerDoorPaths}
        </g>
      )}
      <StripOverlay
        pieces={pieces}
        geoms={flatGeoms}
        hosts={layout.stripHosts}
        own={ownStrips}
        font={L.font}
        hair={L.hair}
        height={h}
        words={stripWords}
        plain={look === 'tile'}
        nameRoom={stripNameRoom}
      />
      <GarmentLabelOverlay
        pieces={pieces}
        geoms={flatGeoms}
        hair={L.hair}
        stroke={FAINT}
        outlineWidth={L.outline}
      />
      {hover && (hoverRange || !marks.some((m) => m.id === hover)) && ptsOf(hover) && (
        <path
          d={pathOf(
            rangedPicturePoints(
              ptsOf(hover)!,
              hoverRange ?? undefined,
              targetLenMm(hover, geoms, innerLines),
            ),
          )}
          fill='none'
          stroke={INK}
          strokeWidth={L.mark}
          strokeLinecap='round'
          pointerEvents='none'
        />
      )}
      {pickFirstPieces.map((piece) => (
        <path
          key={`pick-first:${piece.key}`}
          d={pathOf(piece.drawn, true)}
          fill={INK}
          fillOpacity={PICK_FIRST_FILL_OPACITY}
          stroke='none'
          pointerEvents='none'
          data-seam-side-fill={piece.key}
        />
      ))}
      {markLines.map(({ m, pts }) => (
        <path
          key={`${m.tone}:${m.id}:${m.range?.join('-') ?? ''}`}
          d={pathOf(pts)}
          fill='none'
          stroke={
            m.tone === 'pickFirst'
              ? INK
              : m.tone === 'pick' || m.tone === 'hint'
                ? PICK
                : stepEdges !== undefined
                  ? FAINT
                  : m.tone === 'stored'
                    ? PAIR_INK
                    : INK
          }
          strokeWidth={
            m.tone === 'stored'
              ? m.active
                ? L.stored * STORED_ACTIVE_SCALE
                : L.stored
              : m.tone === 'pickFirst'
                ? L.mark * PICK_FIRST_STROKE_SCALE
                : L.mark
          }
          strokeDasharray={m.tone === 'proposal' || m.tone === 'hint' ? L.dash : undefined}
          strokeLinecap={m.tone === 'proposal' || m.tone === 'hint' ? 'butt' : 'round'}
          pointerEvents='none'
          data-seam-mark={m.tone}
        />
      ))}
      {stepLines.map(({ id, key, points }) => (
        <path
          key={key}
          d={pathOf(points)}
          fill='none'
          stroke={stepColor}
          strokeWidth={stepWidth}
          strokeLinecap='round'
          strokeLinejoin='round'
          pointerEvents='none'
          data-step-seam-edge={id}
        />
      ))}
      {actionLinePaths.map(({ line, points }) => (
        <path
          key={`action-line:${line.id}`}
          d={pathOf(points)}
          fill='none'
          stroke={stepColor}
          strokeWidth={line.weight === 'heavy' ? L.mark : L.outline}
          strokeDasharray={line.dashed ? '5 3' : undefined}
          strokeLinecap='round'
          strokeLinejoin='round'
          pointerEvents='none'
          data-asm-mark={line.kind}
          data-asm-piece={line.piece}
          data-step-seam-edge={line.target}
        />
      ))}
      {actionDimSpots.map(({ dim, at }) => (
        <text
          key={`action-dim:${dim.id}`}
          x={at[0]}
          y={at[1]}
          textAnchor='middle'
          dominantBaseline='central'
          fontSize={L.font}
          fill={stepColor}
          stroke={FILL}
          strokeWidth={3}
          paintOrder='stroke'
          pointerEvents='none'
          data-asm-dim={dim.piece}
        >
          {dim.text}
        </text>
      ))}
      {marksDrawn.length > 0 && (
        <g
          fill='none'
          stroke={FAINT}
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
      {actionGlyphSpots.map(({ glyph, at, direction, mmPx, hostWidth, draw }) => {
        if (draw === 'hidden') return null;
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
                stroke={stepColor}
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
                  fill={stepColor}
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
          const radius = buttonRadiusPx(glyph.sizeMm, mmPx, hostWidth);
          const geometry = buttonGlyphGeometry(
            at,
            radius,
            glyph.holes ?? 4,
            glyph.pattern ?? 'other',
          );
          return (
            <g
              key={`action-glyph:${glyph.id}`}
              fill={FILL}
              stroke={stepColor}
              pointerEvents='none'
              data-asm-mark='button'
              data-asm-piece={glyph.piece}
              data-asm-x={at[0]}
              data-asm-y={at[1]}
              data-asm-radius={radius}
              data-asm-holes={glyph.holes ?? 4}
              data-asm-pattern={glyph.pattern ?? 'other'}
            >
              <circle cx={at[0]} cy={at[1]} r={radius} strokeWidth={L.hair} />
              {geometry.thread && (
                <path d={geometry.thread} fill='none' strokeWidth={L.hair} data-button-thread='' />
              )}
              {geometry.holes.map((point, index) => (
                <circle
                  key={index}
                  cx={point[0]}
                  cy={point[1]}
                  r={Math.max(0.8, radius * 0.1)}
                  fill={stepColor}
                  stroke='none'
                  data-button-hole=''
                />
              ))}
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
              stroke={stepColor}
              strokeWidth={look === 'tile' ? L.outline : L.mark}
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
            stroke={stepColor}
            strokeWidth={L.mark}
            pointerEvents='none'
            data-asm-mark='label'
            data-asm-piece={glyph.piece}
          />
        );
      })}
      {pleatNotes}
      {noStepSeams && noStepSeamLabel && (
        <text
          x={w / 2}
          y={h - Math.max(3, L.font * 0.35)}
          textAnchor='middle'
          fill={GREY}
          fontSize={L.font}
          pointerEvents='none'
          data-step-no-seams=''
        >
          {noStepSeamLabel}
        </text>
      )}
      {look !== 'tile' &&
        labels.map(({ m, s }, i) => {
          const at = labelAt(i);
          return at ? (
            <text
              key={`l:${m.id}:${i}`}
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
          const on = activeNo === i;
          return at ? (
            <g key={`n:${id}:${i}`} data-pair-no={i + 1}>
              <rect
                x={at[0] - 9}
                y={at[1] - 9}
                width={18}
                height={18}
                fill={on ? PAIR_INK : FILL}
                stroke={PAIR_INK}
                strokeWidth={1}
                pointerEvents='none'
              />
              <text
                x={at[0]}
                y={at[1]}
                textAnchor='middle'
                dominantBaseline='central'
                fill={on ? FILL : PAIR_INK}
                fontSize={10}
                pointerEvents='none'
              >
                {pairNo(i)}
              </text>
            </g>
          ) : null;
        })}
      {look !== 'tile' &&
        nameSpots.map((s, i) => {
          const at = nameAt(i);
          const coincident = coincidentNamePieces.get(namedInputs[i]);
          const leader = at && coincident ? coincidentNameLeader(at, coincident.ring, w) : null;
          return at ? (
            <g key={`u:${i}`} pointerEvents='none'>
              {leader && (
                <path
                  d={pathOf(leader.line)}
                  fill='none'
                  stroke={GREY}
                  strokeWidth={L.hair}
                  data-stacked-name-leader={coincident?.key}
                />
              )}
              <text
                x={leader?.at[0] ?? at[0]}
                y={leader?.at[1] ?? at[1]}
                textAnchor={leader?.anchor ?? 'middle'}
                dominantBaseline='central'
                fill={GREY}
                stroke={FILL}
                strokeWidth={4}
                paintOrder='stroke'
                letterSpacing='0.04em'
                data-unit-name=''
              >
                {s.text}
              </text>
            </g>
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
      {doorHits}
      {look !== 'tile' &&
        onClearNo &&
        noSpots.map(({ id, i }, n) => {
          const at = activeNo === i ? noAt(n) : null;
          return at ? (
            <g
              key={`x:${id}:${i}`}
              className='cursor-pointer'
              pointerEvents='all'
              role='button'
              aria-label='remove seam'
              onClick={onClearNo}
              data-seam-remove-no=''
            >
              <rect
                x={at[0] + 11}
                y={at[1] - 9}
                width={18}
                height={18}
                fill={FILL}
                stroke={PAIR_INK}
                strokeWidth={1}
              />
              <text
                x={at[0] + 20}
                y={at[1]}
                textAnchor='middle'
                dominantBaseline='central'
                fill={PAIR_INK}
                fontSize={12}
                pointerEvents='none'
              >
                ×
              </text>
            </g>
          ) : null;
        })}
      {ticks.map(({ id, atMm, notch }) => {
        const whole = ptsOf(id);
        const length = targetLenMm(id, geoms, innerLines);
        const at = whole && rangedPicturePoints(whole, [0, atMm], length).at(-1);
        if (!at) return null;
        return notch ? (
          <rect
            key={`tick:${id}:${atMm}`}
            x={at[0] - TICK_NOTCH_PX / 2}
            y={at[1] - TICK_NOTCH_PX / 2}
            width={TICK_NOTCH_PX}
            height={TICK_NOTCH_PX}
            fill={INK}
            pointerEvents='none'
            data-seam-tick='notch'
          />
        ) : (
          <circle
            key={`tick:${id}:${atMm}`}
            cx={at[0]}
            cy={at[1]}
            r={TICK_POINT_R_PX}
            fill={FILL}
            stroke={INK}
            strokeWidth={1}
            pointerEvents='none'
            data-seam-tick='point'
          />
        );
      })}
      {hover &&
        hoverRange &&
        (() => {
          const whole = ptsOf(hover);
          const length = targetLenMm(hover, geoms, innerLines);
          const at =
            whole &&
            rangedPicturePoints(whole, [0, (hoverRange[0] + hoverRange[1]) / 2], length).at(-1);
          if (!at) return null;
          const text = fmtMm(Math.abs(hoverRange[1] - hoverRange[0]));
          return (
            <g pointerEvents='none' data-seam-span-length=''>
              <rect
                x={at[0] + 10}
                y={at[1] - 26}
                width={text.length * 6.6 + 10}
                height={15}
                fill={FILL}
                stroke={FAINT}
                strokeWidth={1}
              />
              <text
                x={at[0] + 15}
                y={at[1] - 18.5}
                dominantBaseline='central'
                fill={INK}
                fontSize={10}
              >
                {text}
              </text>
            </g>
          );
        })()}
    </svg>
  );
}
