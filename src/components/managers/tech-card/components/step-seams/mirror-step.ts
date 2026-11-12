import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import type { EdgeId, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { FOLDS, type StoredFold } from 'lib/folds';
import { fromUV } from 'lib/folds/geom';
import {
  anchorOfRunId,
  edgeMapOf,
  mirrorEdgeMapOf,
  newSeamKey,
  poseOf,
  poseRow,
  toWire,
  withSeamLayer,
  type EdgeAnchor,
  type EdgeMap,
  type StoredPose,
  type StoredRow,
  type StoredSeam,
} from 'lib/seams';
import {
  contourSig,
  frameOf,
  inFrame,
  reverses,
  rmsFit,
  runsOfPiece,
  sampleAt,
  toUV,
} from 'lib/seams/frame';

import { decodeHandPlace, encodeHandPlace, isHandSeamKind } from './step-hand';
import { mirrorPlacement } from './step-pose';
import {
  closedInner,
  inputGroups,
  SAME_MM,
  stepInputPieces,
  type FormOpLike,
} from './step-seams-model';

export type MirrorStepKind = 'no-twin' | 'edge-mismatch' | 'same' | 'create' | 'replace';

export type MirrorStepPlan = {
  kind: MirrorStepKind;
  sourceOp?: FormOpLike;
  upsert: StoredRow[];
  deleteKeys: string[];
  linkKeys: string[];
  foldKeys: string[];
  layerOrder: string[];
};

export type MirrorStepPlanInput = {
  step: FormOpLike;
  cardOps: readonly FormOpLike[];
  rows: readonly StoredSeam[];
  poses: readonly StoredPose[];
  folds?: readonly StoredFold[];
  geoms: ReadonlyMap<string, PieceGeom>;
  innerLines?: ReadonlyMap<string, readonly (readonly Pt2[])[]>;
  grainDeg?: ReadonlyMap<string, number>;
};

type TwinLink = { key: string; kind: 'mirror' | 'identical' };
type TwinCandidate = {
  op: FormOpLike;
  index: number;
  links: Map<string, TwinLink>;
  ambiguous: boolean;
};

const EMPTY_PLAN = (kind: 'no-twin' | 'edge-mismatch', sourceOp?: FormOpLike): MirrorStepPlan => ({
  kind,
  ...(sourceOp ? { sourceOp } : {}),
  upsert: [],
  deleteKeys: [],
  linkKeys: [],
  foldKeys: [],
  layerOrder: [],
});

const opKeys = (op: FormOpLike | undefined) => [
  ...new Set([...(op?.seamKeys ?? []), ...(op?.poseKeys ?? [])]),
];

const opFactKeys = (op: FormOpLike | undefined) => [
  ...new Set([...opKeys(op), ...(op?.foldKeys ?? [])]),
];

const stepIndexOf = (step: FormOpLike, cardOps: readonly FormOpLike[]) => {
  const exact = cardOps.indexOf(step);
  if (exact >= 0) return exact;
  const operationNumber = step.operationNumber;
  return operationNumber == null
    ? -1
    : cardOps.findIndex((candidate) => candidate.operationNumber === operationNumber);
};

const relationOf = (
  source: string,
  target: string,
  geoms: ReadonlyMap<string, PieceGeom>,
): TwinLink | null => {
  const from = geoms.get(source);
  const to = geoms.get(target);
  if (!from || !to) return null;
  if (source === target) {
    return mirrorEdgeMapOf(from, to) ? { key: target, kind: 'mirror' } : null;
  }
  const direct = from.twinOf.find((link) => link.key === target);
  const reverse = to.twinOf.find((link) => link.key === source);
  const kind = direct?.kind ?? reverse?.kind;
  return kind ? { key: target, kind } : null;
};

const mappingsOf = (
  source: readonly string[],
  target: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): Array<Map<string, TwinLink>> => {
  if (source.length !== target.length) return [];
  const out: Array<Map<string, TwinLink>> = [];
  const walk = (at: number, used: Set<string>, links: Map<string, TwinLink>) => {
    if (out.length > 1) return;
    if (at === source.length) {
      const leftToRight = [...links].some(
        ([sourceKey, link]) =>
          geoms.get(sourceKey)?.hand === 'L' && geoms.get(link.key)?.hand === 'R',
      );
      if (leftToRight) out.push(new Map(links));
      return;
    }
    for (const targetKey of target) {
      if (used.has(targetKey)) continue;
      const link = relationOf(source[at], targetKey, geoms);
      if (!link) continue;
      used.add(targetKey);
      links.set(source[at], link);
      walk(at + 1, used, links);
      links.delete(source[at]);
      used.delete(targetKey);
    }
  };
  walk(0, new Set(), new Map());
  return out;
};

const twinCandidateOf = (
  targetIndex: number,
  cardOps: readonly FormOpLike[],
  geoms: ReadonlyMap<string, PieceGeom>,
  liveKeys: ReadonlySet<string>,
): TwinCandidate | null => {
  const pieceKeys = new Set(geoms.keys());
  const targetPieces = stepInputPieces(cardOps, targetIndex, pieceKeys);
  for (let index = targetIndex - 1; index >= 0; index--) {
    const op = cardOps[index];
    if (!opFactKeys(op).some((key) => liveKeys.has(key))) continue;
    const pieces = stepInputPieces(cardOps, index, pieceKeys);
    const mappings = mappingsOf(pieces, targetPieces, geoms);
    if (!mappings.length) continue;
    return {
      op,
      index,
      links: mappings[0],
      ambiguous: mappings.length > 1,
    };
  }
  return null;
};

const edgeMapFor = (
  source: PieceGeom,
  target: PieceGeom,
  link: TwinLink,
  grainDeg: ReadonlyMap<string, number> | undefined,
): EdgeMap | null =>
  link.kind === 'mirror'
    ? mirrorEdgeMapOf(
        source,
        target,
        grainDeg?.get(source.pieceKey) ?? 0,
        grainDeg?.get(target.pieceKey) ?? 0,
      )
    : edgeMapOf(
        source,
        target,
        grainDeg?.get(source.pieceKey) ?? 0,
        grainDeg?.get(target.pieceKey) ?? 0,
      );

const rounded = (value: number) => Math.round(value * 1000) / 1000;
const roundedRange = (value: number) => Math.round(value * 10000) / 10000;

const innerAnchorOnTwin = (
  anchor: EdgeAnchor,
  target: PieceGeom,
  edgeMap: EdgeMap,
  grainDeg: ReadonlyMap<string, number> | undefined,
): EdgeAnchor => ({
  ...anchor,
  piece: target.pieceKey,
  samples: inFrame(anchor.samples, edgeMap.frame).map(([u, v]) => [rounded(u), rounded(v)]),
  contourSig: contourSig(target, frameOf(target, grainDeg?.get(target.pieceKey) ?? 0)),
});

const projectedShare = (line: readonly Pt2[], point: Pt2): number => {
  let best = 0;
  let bestGap = Infinity;
  let walked = 0;
  let total = 0;
  const lengths = line.slice(1).map((next, index) => {
    const length = Math.hypot(next[0] - line[index][0], next[1] - line[index][1]);
    total += length;
    return length;
  });
  lengths.forEach((length, index) => {
    const a = line[index];
    const b = line[index + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const share = length
      ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length ** 2))
      : 0;
    const gap = Math.hypot(point[0] - a[0] - dx * share, point[1] - a[1] - dy * share);
    if (gap < bestGap) {
      best = walked + share * length;
      bestGap = gap;
    }
    walked += length;
  });
  return total > 0 ? best / total : 0;
};

const innerAnchorsOnTwin = (
  anchors: readonly EdgeAnchor[],
  source: PieceGeom,
  target: PieceGeom,
  edgeMap: EdgeMap,
  grainDeg: ReadonlyMap<string, number> | undefined,
  innerLines: ReadonlyMap<string, readonly (readonly Pt2[])[]> | undefined,
): EdgeAnchor[] | null => {
  const whole = anchors.find((anchor) => anchor.range[0] <= 0 && anchor.range[1] >= 1);
  const anchor = whole ?? anchors[0];
  if (!anchor) return null;
  const base = innerAnchorOnTwin(anchor, target, edgeMap, grainDeg);
  if (whole) return [base];
  const match = /^i(\d+)$/.exec(anchor.edgeHint);
  const index = match ? Number(match[1]) : -1;
  const sourceLine = index >= 0 ? innerLines?.get(source.pieceKey)?.[index] : undefined;
  const targetLine = index >= 0 ? innerLines?.get(target.pieceKey)?.[index] : undefined;
  const sourceContour = sourceLine && closedInner(sourceLine);
  const targetContour = targetLine && closedInner(targetLine);
  if (!sourceLine || !targetLine || !sourceContour || !targetContour) return null;
  const tolerance = SAME_MM / sourceContour.lenMm;
  const merged: [number, number][] = [];
  for (const range of anchors
    .map((item) => [Math.max(0, item.range[0]), Math.min(1, item.range[1])] as [number, number])
    .filter(([from, to]) => to > from)
    .sort((left, right) => left[0] - right[0])) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1] + tolerance) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  if (!merged.length) return [];
  let gapAfter = merged.length - 1;
  let largestGap = merged[0][0] + 1 - merged[merged.length - 1][1];
  for (let index = 0; index < merged.length - 1; index++) {
    const gap = merged[index + 1][0] - merged[index][1];
    if (gap > largestGap) {
      largestGap = gap;
      gapAfter = index;
    }
  }
  const startsAfter = (gapAfter + 1) % merged.length;
  const sourceFrom = merged[startsAfter][0];
  const sourceTo = merged[gapAfter][1] + (startsAfter ? 1 : 0);
  if ((sourceTo - sourceFrom) * sourceContour.lenMm <= SAME_MM) return [];
  const sourceFrame = frameOf(source, grainDeg?.get(source.pieceKey) ?? 0);
  const targetFrame = frameOf(target, grainDeg?.get(target.pieceKey) ?? 0);
  const wrapShare = (share: number) => ((share % 1) + 1) % 1;
  const shares = [sourceFrom, (sourceFrom + sourceTo) / 2, sourceTo].map(wrapShare);
  const projected = shares.map((share) => {
    const point = sampleAt(sourceLine, [share])[0];
    const mapped = inFrame([toUV(sourceFrame, point)], edgeMap.frame)[0];
    return projectedShare(targetLine, fromUV(targetFrame, mapped));
  });
  const from = Math.min(projected[0], projected[2]);
  const to = Math.max(projected[0], projected[2]);
  const ranges: [number, number][] =
    projected[1] >= from && projected[1] <= to
      ? [[from, to]]
      : [
          [to, 1],
          [0, from],
        ];
  return ranges
    .filter(([start, end]) => (end - start) * targetContour.lenMm > SAME_MM)
    .flatMap(([start, end]) => {
      const range: [number, number] = [roundedRange(start), roundedRange(end)];
      return range[1] > range[0] ? [{ ...base, range }] : [];
    });
};

const runOnTwin = (anchor: EdgeAnchor, target: PieceGeom, edgeMap: EdgeMap): EdgeId | null => {
  const mapped = edgeIdsOf(anchor.edgeHint).map((edge) => edgeMap.map.get(edge));
  if (mapped.some((edge) => !edge)) return null;
  const wanted = new Set(mapped as EdgeId[]);
  const matches = runsOfPiece(target).filter(
    (run) => run.edges.length === wanted.size && run.edges.every((edge) => wanted.has(edge.id)),
  );
  return matches.length === 1 ? matches[0].id : null;
};

type MappedAnchor = { anchor: EdgeAnchor; link: TwinLink; placed: boolean };

const mapAnchor = (
  sourceAnchors: readonly EdgeAnchor[],
  kind: StoredSeam['kind'],
  links: ReadonlyMap<string, TwinLink>,
  geoms: ReadonlyMap<string, PieceGeom>,
  grainDeg: ReadonlyMap<string, number> | undefined,
  innerLines: ReadonlyMap<string, readonly (readonly Pt2[])[]> | undefined,
): MappedAnchor[] | null => {
  const sourceAnchor = sourceAnchors[0];
  if (!sourceAnchor) return null;
  const link = links.get(sourceAnchor.piece);
  const source = geoms.get(sourceAnchor.piece);
  const target = link ? geoms.get(link.key) : undefined;
  if (!link || !source || !target) return null;
  const edgeMap = edgeMapFor(source, target, link, grainDeg);
  if (!edgeMap) return null;
  let anchors: EdgeAnchor[] | null;
  if (/^i\d+$/.test(sourceAnchor.edgeHint)) {
    anchors = innerAnchorsOnTwin(sourceAnchors, source, target, edgeMap, grainDeg, innerLines);
  } else {
    const run = runOnTwin(sourceAnchor, target, edgeMap);
    const ranged = kind === 'partial' || kind === 'composite';
    const sourceRange = ranged ? sourceAnchor.range : ([0, 1] as [number, number]);
    const range: [number, number] = reverses(edgeMap.frame)
      ? [1 - sourceRange[1], 1 - sourceRange[0]]
      : [...sourceRange];
    const anchor = run ? anchorOfRunId([...geoms.values()], run, grainDeg, range) : null;
    anchors = anchor ? [anchor] : null;
  }
  if (!anchors) return null;
  const hand = isHandSeamKind(kind) ? decodeHandPlace(sourceAnchor.placement) : undefined;
  return anchors.map((anchor) => {
    const placed = hand
      ? {
          ...anchor,
          placement: encodeHandPlace({
            ...hand,
            slideMm: link.kind === 'mirror' ? -hand.slideMm : hand.slideMm,
          }),
        }
      : anchor;
    return {
      anchor: withSeamLayer(placed, sourceAnchor.layer),
      link,
      placed: !!sourceAnchor.placement,
    };
  });
};

const placeSurface = (
  source: StoredSeam,
  mappedA: readonly MappedAnchor[],
  mappedB: readonly MappedAnchor[],
  geoms: ReadonlyMap<string, PieceGeom>,
): { sideA: EdgeAnchor[]; sideB: EdgeAnchor[] } | null => {
  const at = [...source.sideA, ...source.sideB].find((anchor) => anchor.placement)?.placement;
  if (!at)
    return { sideA: mappedA.map((item) => item.anchor), sideB: mappedB.map((item) => item.anchor) };
  const sourceHost = source.sideA[0]?.piece;
  const sourcePart = source.sideB[0]?.piece;
  const targetHost = mappedA[0]?.anchor.piece;
  const targetPart = mappedB[0]?.anchor.piece;
  const hostLink = mappedA[0]?.link;
  const partLink = mappedB[0]?.link;
  const [sourceHostGeom, sourcePartGeom, targetHostGeom, targetPartGeom] = [
    sourceHost,
    sourcePart,
    targetHost,
    targetPart,
  ].map((key) => (key ? geoms.get(key) : undefined));
  if (
    !sourceHostGeom ||
    !sourcePartGeom ||
    !targetHostGeom ||
    !targetPartGeom ||
    !hostLink ||
    !partLink
  )
    return null;
  const placement = mirrorPlacement(
    sourceHostGeom,
    sourcePartGeom,
    at,
    targetHostGeom,
    targetPartGeom,
    hostLink.kind,
    partLink.kind,
  );
  const place = (mapped: readonly MappedAnchor[]) =>
    mapped.map((item) => (item.placed ? { ...item.anchor, placement } : item.anchor));
  return { sideA: place(mappedA), sideB: place(mappedB) };
};

const mapSeam = (
  source: StoredSeam,
  links: ReadonlyMap<string, TwinLink>,
  geoms: ReadonlyMap<string, PieceGeom>,
  grainDeg: ReadonlyMap<string, number> | undefined,
  innerLines: ReadonlyMap<string, readonly (readonly Pt2[])[]> | undefined,
): StoredSeam | null => {
  const groups = (side: readonly EdgeAnchor[]) => {
    const seen = new Set<string>();
    return side.flatMap((anchor): EdgeAnchor[][] => {
      if (!/^i\d+$/.test(anchor.edgeHint)) return [[anchor]];
      const key = `${anchor.piece}\u0000${anchor.edgeHint}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [side.filter((item) => `${item.piece}\u0000${item.edgeHint}` === key)];
    });
  };
  const sideA = groups(source.sideA).map((anchors) =>
    mapAnchor(anchors, source.kind, links, geoms, grainDeg, innerLines),
  );
  const sideB = groups(source.sideB).map((anchors) =>
    mapAnchor(anchors, source.kind, links, geoms, grainDeg, innerLines),
  );
  if (sideA.some((anchor) => !anchor) || sideB.some((anchor) => !anchor)) return null;
  const mappedA = sideA.flat() as MappedAnchor[];
  const mappedB = sideB.flat() as MappedAnchor[];
  if ((source.sideA.length && !mappedA.length) || (source.sideB.length && !mappedB.length))
    return null;
  const placed =
    source.kind === 'surface'
      ? placeSurface(source, mappedA, mappedB, geoms)
      : {
          sideA: mappedA.map((item) => item.anchor),
          sideB: mappedB.map((item) => item.anchor),
        };
  if (!placed) return null;
  return {
    seamKey: newSeamKey(),
    status: source.status,
    kind: source.kind,
    direction: source.direction,
    source: source.source,
    sideA: placed.sideA,
    sideB: placed.sideB,
    anchoredSize: source.anchoredSize,
    note: source.note,
  };
};

const mapPose = (
  source: StoredPose,
  links: ReadonlyMap<string, TwinLink>,
  geoms: ReadonlyMap<string, PieceGeom>,
  grainDeg: ReadonlyMap<string, number> | undefined,
): StoredPose | null => {
  const pose = poseOf(source);
  const pieceLink = pose ? links.get(pose.piece) : undefined;
  const hostLink = pose ? links.get(pose.host) : undefined;
  const sourcePiece = pose ? geoms.get(pose.piece) : undefined;
  const sourceHost = pose ? geoms.get(pose.host) : undefined;
  const targetPiece = pieceLink ? geoms.get(pieceLink.key) : undefined;
  const targetHost = hostLink ? geoms.get(hostLink.key) : undefined;
  if (
    !pose ||
    !pieceLink ||
    !hostLink ||
    !sourcePiece ||
    !sourceHost ||
    !targetPiece ||
    !targetHost
  )
    return null;
  const placement = mirrorPlacement(
    sourceHost,
    sourcePiece,
    pose.placement,
    targetHost,
    targetPiece,
    hostLink.kind,
    pieceLink.kind,
  );
  return poseRow({
    seamKey: newSeamKey(),
    piece: targetPiece,
    host: targetHost,
    placement,
    grainDeg,
    layer: source.sideA[0]?.layer,
  });
};

const foldLineFit = (left: readonly [number, number][], right: readonly [number, number][]) =>
  Math.min(rmsFit(left, right), rmsFit(left, [...right].reverse()));

const foldSide = (line: readonly [number, number][], point: readonly [number, number]) => {
  const [a, b] = line;
  return Math.sign((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]));
};

const foldFit = (
  source: StoredFold,
  target: StoredFold,
  frame: EdgeMap['frame'],
): number | null => {
  if (source.kind !== target.kind || source.seq !== target.seq || source.stale || target.stale)
    return null;
  if (!!source.edge !== !!target.edge) return null;
  const line = inFrame(source.line, frame);
  const direct = rmsFit(line, target.line);
  const reverse = rmsFit(line, [...target.line].reverse());
  const targetLine = direct <= reverse ? target.line : [...target.line].reverse();
  const lineScore = Math.min(direct, reverse);
  if (lineScore > FOLDS.fitMax) return null;
  const flipAt = inFrame([source.flipAt], frame)[0];
  if (foldSide(line, flipAt) !== foldSide(targetLine, target.flipAt)) return null;
  if (!source.edge || !target.edge) return lineScore;
  if (Math.abs(source.edge.offsetMm - target.edge.offsetMm) > 0.5) return null;
  const edgeScore = foldLineFit(inFrame(source.edge.samples, frame), target.edge.samples);
  return edgeScore <= FOLDS.fitMax ? Math.max(lineScore, edgeScore) : null;
};

/** Fold rows already exist on both pieces; MIRROR only links the geometrically matching right rows. */
const mapFoldKeys = (
  source: readonly StoredFold[],
  all: readonly StoredFold[],
  links: ReadonlyMap<string, TwinLink>,
  geoms: ReadonlyMap<string, PieceGeom>,
  grainDeg: ReadonlyMap<string, number> | undefined,
  cardOps: readonly FormOpLike[],
  targetIndex: number,
): string[] | null => {
  const stepOf = (foldKey: string) => cardOps.findIndex((op) => op.foldKeys?.includes(foldKey));
  const used = new Set<string>();
  const keys: string[] = [];
  for (const row of source) {
    const link = links.get(row.pieceKey);
    const sourceGeom = geoms.get(row.pieceKey);
    const targetGeom = link ? geoms.get(link.key) : undefined;
    if (!link || !sourceGeom || !targetGeom) return null;
    const edgeMap = edgeMapFor(sourceGeom, targetGeom, link, grainDeg);
    if (!edgeMap) return null;
    const fits = all
      .filter(
        (candidate) =>
          !used.has(candidate.foldKey) &&
          candidate.pieceKey.toUpperCase() === targetGeom.pieceKey.toUpperCase(),
      )
      .flatMap((candidate) => {
        const fit = foldFit(row, candidate, edgeMap.frame);
        return fit == null ? [] : [{ candidate, fit }];
      })
      .sort((left, right) => left.fit - right.fit);
    const best = fits[0];
    if (!best || (fits[1] && fits[1].fit < best.fit + FOLDS.tieMargin)) return null;
    // The server refuses a fold on two steps, or folds of a piece out of their order.
    const bestStep = stepOf(best.candidate.foldKey);
    if (bestStep >= 0 && bestStep !== targetIndex) return null;
    const outOfOrder = all.some((other) => {
      if (other.pieceKey.toUpperCase() !== best.candidate.pieceKey.toUpperCase()) return false;
      if (other.foldKey === best.candidate.foldKey || other.seq === best.candidate.seq)
        return false;
      const otherStep = stepOf(other.foldKey);
      if (otherStep < 0) return false;
      return other.seq < best.candidate.seq ? otherStep > targetIndex : otherStep < targetIndex;
    });
    if (outOfOrder) return null;
    used.add(best.candidate.foldKey);
    keys.push(best.candidate.foldKey);
  }
  return keys;
};

/** The left step's order of blocks on the right step, each block by the twin of its first piece. */
const mapLayerOrder = (
  source: number,
  target: number,
  links: ReadonlyMap<string, TwinLink>,
  cardOps: readonly FormOpLike[],
  pieceKeys: ReadonlySet<string>,
): string[] => {
  const order = cardOps[source]?.layerOrder ?? [];
  if (!order.length) return [];
  const sourceGroups = inputGroups(cardOps, source, pieceKeys);
  const targetGroups = inputGroups(cardOps, target, pieceKeys);
  const mapped = order.flatMap((key) => {
    const piece = sourceGroups.find((group) => group.key === key)?.pieces[0];
    const twin = piece ? links.get(piece)?.key : undefined;
    return targetGroups.find((group) => twin && group.pieces.includes(twin))?.key ?? [];
  });
  return [...new Set(mapped)];
};

const anchorSig = (anchor: EdgeAnchor) =>
  `${anchor.piece}:${anchor.edgeHint}:${anchor.range[0]}-${anchor.range[1]}`;

/** A row's mapped pair and ranges, excluding its key and mutable placement/layer facts. */
export const mirrorRowPairSig = (row: StoredRow): string => {
  const side = (anchors: readonly EdgeAnchor[]) => anchors.map(anchorSig).sort().join('+');
  const a = side(row.sideA);
  const b = side(row.sideB);
  return row.kind === 'pose' ? `${row.kind}|${a}>${b}` : `${row.kind}|${[a, b].sort().join('~')}`;
};

/** Full persisted row equality for mirror fixed points, excluding only the seam key. */
export const mirrorRowSig = (row: StoredRow): string => {
  const wire = toWire(row);
  return JSON.stringify({ ...wire, seamKey: '_' });
};

const attachStableKeys = (
  expected: readonly StoredRow[],
  linked: readonly StoredRow[],
  all: readonly StoredRow[],
  shared: ReadonlySet<string>,
  linkedElsewhere: ReadonlySet<string>,
): StoredRow[] => {
  const used = new Set<string>();
  return expected.map((row) => {
    const pair = mirrorRowPairSig(row);
    const exact = mirrorRowSig(row);
    const current = linked.find(
      (candidate) =>
        !used.has(candidate.seamKey) &&
        mirrorRowPairSig(candidate) === pair &&
        (!shared.has(candidate.seamKey) || mirrorRowSig(candidate) === exact),
    );
    const retry = all.find(
      (candidate) =>
        !used.has(candidate.seamKey) &&
        !linkedElsewhere.has(candidate.seamKey) &&
        mirrorRowSig(candidate) === exact,
    );
    const key = current?.seamKey ?? retry?.seamKey ?? row.seamKey;
    used.add(key);
    return key === row.seamKey ? row : { ...row, seamKey: key };
  });
};

const sameRows = (left: readonly StoredRow[], right: readonly StoredRow[]) => {
  if (left.length !== right.length) return false;
  const a = left.map(mirrorRowSig).sort();
  const b = right.map(mirrorRowSig).sort();
  return a.every((sig, index) => sig === b[index]);
};

/**
 * Plan one owner-triggered left-to-right step mirror. It is pure: no store, form, autosave or RPC
 * changes occur until the caller executes a create/replace plan.
 */
export function mirrorStepPlan({
  step,
  cardOps,
  rows,
  poses,
  folds = [],
  geoms,
  innerLines,
  grainDeg,
}: MirrorStepPlanInput): MirrorStepPlan {
  const targetIndex = stepIndexOf(step, cardOps);
  if (targetIndex < 0) return EMPTY_PLAN('no-twin');
  const rowByKey = new Map(rows.map((row) => [row.seamKey, row]));
  const poseByKey = new Map(poses.map((row) => [row.seamKey, row]));
  const foldByKey = new Map(folds.map((row) => [row.foldKey, row]));
  const liveKeys = new Set([...rowByKey.keys(), ...poseByKey.keys(), ...foldByKey.keys()]);
  const candidate = twinCandidateOf(targetIndex, cardOps, geoms, liveKeys);
  if (!candidate) return EMPTY_PLAN('no-twin');
  if (candidate.ambiguous) return EMPTY_PLAN('edge-mismatch', candidate.op);

  const sourceKeys = opKeys(candidate.op);
  const sourceSeams = sourceKeys.flatMap((key) => rowByKey.get(key) ?? []);
  const sourcePoses = sourceKeys.flatMap((key) => poseByKey.get(key) ?? []);
  // A source the server marked stale is not a decision to copy; it is fixed on the left first.
  if ([...sourceSeams, ...sourcePoses].some((row) => row.stale))
    return EMPTY_PLAN('edge-mismatch', candidate.op);
  const mappedSeams = sourceSeams.map((row) =>
    mapSeam(row, candidate.links, geoms, grainDeg, innerLines),
  );
  const mappedPoseRows = sourcePoses.map((row) => mapPose(row, candidate.links, geoms, grainDeg));
  if (mappedSeams.some((row) => !row) || mappedPoseRows.some((row) => !row))
    return EMPTY_PLAN('edge-mismatch', candidate.op);
  const sourceFoldKeys = candidate.op.foldKeys ?? [];
  const sourceFolds = sourceFoldKeys.flatMap((key) => foldByKey.get(key) ?? []);
  if (sourceFolds.length !== sourceFoldKeys.length)
    return EMPTY_PLAN('edge-mismatch', candidate.op);
  const mappedFoldKeys = sourceFolds.length
    ? mapFoldKeys(sourceFolds, folds, candidate.links, geoms, grainDeg, cardOps, targetIndex)
    : [...(step.foldKeys ?? [])];
  if (!mappedFoldKeys) return EMPTY_PLAN('edge-mismatch', candidate.op);
  const mappedPoses = new Map<string, StoredPose>();
  for (const row of mappedPoseRows as StoredPose[]) {
    const piece = poseOf(row)?.piece;
    if (piece) mappedPoses.set(piece, row);
  }

  const expected0: StoredRow[] = [...(mappedSeams as StoredSeam[]), ...mappedPoses.values()];
  const targetKeys = opKeys(step);
  const linked: StoredRow[] = targetKeys.flatMap(
    (key) => rowByKey.get(key) ?? poseByKey.get(key) ?? [],
  );
  const shared = new Set(
    targetKeys.filter((key) =>
      cardOps.some((op, index) => index !== targetIndex && opKeys(op).includes(key)),
    ),
  );
  const linkedElsewhere = new Set(
    cardOps.flatMap((op, index) => (index === targetIndex ? [] : opKeys(op))),
  );
  const all: StoredRow[] = [...rows, ...poses];
  const expected = attachStableKeys(expected0, linked, all, shared, linkedElsewhere);
  const linkKeys = expected.map((row) => row.seamKey);
  const sameFolds =
    mappedFoldKeys.length === (step.foldKeys?.length ?? 0) &&
    mappedFoldKeys.every((key, index) => key === step.foldKeys?.[index]);
  const layerOrder = mapLayerOrder(
    candidate.index,
    targetIndex,
    candidate.links,
    cardOps,
    new Set(geoms.keys()),
  );
  const sameOrder =
    layerOrder.length === (step.layerOrder?.length ?? 0) &&
    layerOrder.every((key, index) => key === step.layerOrder?.[index]);
  if (sameRows(expected, linked) && sameFolds && sameOrder) {
    return {
      kind: 'same',
      sourceOp: candidate.op,
      upsert: [],
      deleteKeys: [],
      linkKeys,
      foldKeys: mappedFoldKeys,
      layerOrder,
    };
  }
  const keep = new Set(linkKeys);
  const deleteKeys = linked
    .map((row) => row.seamKey)
    .filter((key) => !keep.has(key) && !shared.has(key));
  return {
    kind: linked.length || step.foldKeys?.length || step.layerOrder?.length ? 'replace' : 'create',
    sourceOp: candidate.op,
    upsert: expected,
    deleteKeys,
    linkKeys,
    foldKeys: mappedFoldKeys,
    layerOrder,
  };
}

/** Only right pieces: nothing to mirror from is worth saying. A step with a left piece stays quiet. */
export function isRightMirrorStep(
  step: FormOpLike,
  cardOps: readonly FormOpLike[],
  geoms: ReadonlyMap<string, PieceGeom>,
): boolean {
  const index = stepIndexOf(step, cardOps);
  if (index < 0) return false;
  const hands = stepInputPieces(cardOps, index, new Set(geoms.keys())).map(
    (key) => geoms.get(key)?.hand,
  );
  return hands.includes('R') && !hands.includes('L');
}
