// Whole-garment topology. The seam graph supplies the exact card-wide matching; this pass closes
// the garment-specific gaps that pair matching alone cannot express (plies, surface pockets and
// wrap bands), assigns every resulting seam to its forming operation, then lays the complete flat.
// Pure TypeScript: print and the editor read the same result.
import type { common_TechCard, common_TechCardOperation } from 'api/proto-http/admin';
import { nameTokens, readName } from 'lib/assembly-skeleton/skeleton/model';
import { ROLE_BOOK } from 'lib/assembly-skeleton/skeleton/template';
import type {
  Edge,
  EdgeId,
  PieceGeom,
  SeamCandidate,
  SeamGraph,
  SkeletonCategory,
  UnionLayout,
} from 'lib/assembly-skeleton/types';
import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import { legPanels, type LegPanel } from 'lib/assembly-skeleton/geometry/legs';
import { pieceKeyOf, unionLayout } from 'lib/assembly-skeleton/union';

import { inputGroups, isJoinStep, type FormOpLike } from './step-seams/step-seams-model';

type Operation = common_TechCardOperation & FormOpLike;

export type GarmentEdgeRange = {
  piece: string;
  edges: EdgeId[];
  /** Millimetres along the resolved run. Absent means the complete run. */
  range?: [number, number];
};

export type GarmentPairing = {
  seam: SeamCandidate;
  operationNumber: number | null;
  a: GarmentEdgeRange;
  b: GarmentEdgeRange;
  source: 'stored' | 'assignment' | 'ply' | 'surface' | 'wrap';
};

export type GarmentAssembly = {
  category: SkeletonCategory;
  graph: SeamGraph;
  pairings: GarmentPairing[];
  byOperation: ReadonlyMap<number, readonly SeamCandidate[]>;
  layout: UnionLayout;
};

export type GarmentAssemblyInput = {
  techCard: common_TechCard;
  graph: SeamGraph;
  category: SkeletonCategory;
};

const EVIDENCE: SeamCandidate['evidence'] = {
  dLenMm: 0,
  relLen: 0,
  notchScore: null,
  curvature: 'flat',
  hand: 'neutral',
  twin: 'none',
  self: false,
};

const edgePieces = (candidate: SeamCandidate, side: 'a' | 'b') =>
  (side === 'a' ? candidate.aParts ?? [candidate.a] : candidate.bParts ?? [candidate.b]).map(
    pieceKeyOf,
  );

const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);

const candidatePairKeys = (candidate: SeamCandidate) => {
  const out = new Set<string>();
  for (const a of edgePieces(candidate, 'a'))
    for (const b of edgePieces(candidate, 'b')) if (a !== b) out.add(pairKey(a, b));
  return out;
};

const bboxOf = (geom: PieceGeom) => {
  const xs = geom.rs.map((point) => point[0]);
  const ys = geom.rs.map((point) => point[1]);
  return {
    x0: Math.min(...xs, 0),
    y0: Math.min(...ys, 0),
    x1: Math.max(...xs, 0),
    y1: Math.max(...ys, 0),
  };
};

const edgeMid = (edge: Edge): [number, number] => [
  edge.pts.reduce((sum, point) => sum + point[0], 0) / Math.max(edge.pts.length, 1),
  edge.pts.reduce((sum, point) => sum + point[1], 0) / Math.max(edge.pts.length, 1),
];

const edgeLevel = (edge: Edge) => {
  const first = edge.pts[0];
  const last = edge.pts[edge.pts.length - 1];
  if (!first || !last) return 0;
  const dx = Math.abs(last[0] - first[0]);
  const dy = Math.abs(last[1] - first[1]);
  return dx / Math.max(Math.hypot(dx, dy), 1e-6);
};

const rolesOfName = (name: string) => {
  const tokens = new Set(
    nameTokens(name)
      .map((token) => token.replace(/^\d+|\d+$/g, ''))
      .filter(Boolean),
  );
  return new Set(
    ROLE_BOOK.roles
      .filter((role) => role.tokens.some((token) => tokens.has(token)))
      .map((role) => role.id),
  );
};
const rolesOf = (geom: PieceGeom) => rolesOfName(geom.name);
const roleOf = (geom: PieceGeom) => readName(geom.name).role;
const hasRole = (geom: PieceGeom, ...roles: string[]) => {
  const found = rolesOf(geom);
  return roles.some((role) => found.has(role));
};
const pocketLike = (geom: PieceGeom) => hasRole(geom, 'pocket');
const sidePocketLike = (geom: PieceGeom) =>
  pocketLike(geom) && !hasRole(geom, 'front', 'back', 'yoke');
const waistbandLike = (geom: PieceGeom) => hasRole(geom, 'waistband');
const collarLike = (geom: PieceGeom) => hasRole(geom, 'collar', 'stand', 'rib');
const necklinePanel = (geom: PieceGeom) => hasRole(geom, 'front', 'back', 'yoke', 'side');
const legPanel = (geom: PieceGeom) => {
  const box = bboxOf(geom);
  return (
    hasRole(geom, 'front', 'back', 'side') && box.y1 - box.y0 > 1.7 * Math.max(box.x1 - box.x0, 1)
  );
};

const panelLike = (geom: PieceGeom) => {
  const roles = rolesOf(geom);
  const sub = ROLE_BOOK.roles.some((role) => role.level === 'sub' && roles.has(role.id));
  return !sub || hasRole(geom, 'front', 'back', 'side', 'yoke', 'sleeve', 'skirt');
};

function waistEdges(geom: PieceGeom): Edge[] {
  const box = bboxOf(geom);
  const height = Math.max(box.y1 - box.y0, 1);
  const candidates = geom.edges.filter((edge) => {
    const y = (edgeMid(edge)[1] - box.y0) / height;
    return y >= 0.72 && edgeLevel(edge) >= 0.45;
  });
  return (candidates.length ? candidates : geom.edges).sort((a, b) => {
    const ay = (edgeMid(a)[1] - box.y0) / height;
    const by = (edgeMid(b)[1] - box.y0) / height;
    return by - ay || b.lenMm - a.lenMm;
  });
}

function partialCandidate(
  a: Edge,
  b: Edge,
  operationId: string | undefined,
  rule: string,
  kind: SeamCandidate['kind'] = 'partial',
): SeamCandidate {
  const short = Math.min(a.lenMm, b.lenMm);
  return {
    a: a.id,
    b: b.id,
    score: 0.9,
    kind,
    sewn: true,
    ...(operationId ? { operationId } : {}),
    ...(short + 1e-6 < Math.max(a.lenMm, b.lenMm)
      ? { range: { a: [0, Math.min(short, a.lenMm)], b: [0, Math.min(short, b.lenMm)] } }
      : {}),
    evidence: {
      ...EVIDENCE,
      dLenMm: Math.abs(a.lenMm - b.lenMm),
      relLen: Math.abs(a.lenMm - b.lenMm) / Math.max(a.lenMm, b.lenMm, 1),
      notchScore: a.notchesMm.length === b.notchesMm.length ? 1 : null,
      aLenMm: a.lenMm,
      bLenMm: b.lenMm,
      rule,
    },
  };
}

/** The straight opening of a side-seam pocket, never its curved bag or level top. */
function sidePocketOpening(geom: PieceGeom): Edge | undefined {
  return [...geom.edges]
    .filter((edge) => edge.kind === 'edge')
    .sort((a, b) => {
      const score = (edge: Edge) =>
        edgeLevel(edge) + Math.abs(edge.turnDeg) / 360 + (edge.notchesMm.length >= 2 ? -0.1 : 0);
      return score(a) - score(b) || b.lenMm - a.lenMm;
    })[0];
}

/** Millimetres along an edge covering its waist end (the high-y end in the pattern's y-up frame). */
function topEdgeRange(edge: Edge, length: number): [number, number] {
  const first = edge.pts[0];
  const last = edge.pts[edge.pts.length - 1];
  const span = Math.min(length, edge.lenMm);
  return first && last && first[1] >= last[1] ? [0, span] : [edge.lenMm - span, edge.lenMm];
}

function sidePocketCandidate(
  pocket: PieceGeom,
  leg: LegPanel,
  operationId: string,
): SeamCandidate | null {
  const opening = sidePocketOpening(pocket);
  if (!opening) return null;
  return {
    ...partialCandidate(
      opening,
      leg.outseam,
      operationId,
      'side pocket at waist end of outseam · detail folded onto garment',
    ),
    range: {
      a: [0, opening.lenMm],
      b: topEdgeRange(leg.outseam, opening.lenMm),
    },
    assignment: { margin: 99, confidence: 'sure' },
  };
}

type EdgeRun = { edges: Edge[]; length: number };

function operationEdgeRuns(
  keys: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
  panelsOnly: boolean,
  allowComposite: boolean,
): EdgeRun[] {
  const pieces = keys
    .map((key) => geoms.get(key))
    .filter((geom): geom is PieceGeom => !!geom && (!panelsOnly || panelLike(geom)));
  const single = pieces.flatMap((geom) =>
    geom.edges.map((edge) => ({ edges: [edge], length: edge.lenMm })),
  );
  const pairs: EdgeRun[] = [];
  if (!allowComposite) return single;
  for (let a = 0; a < pieces.length; a++)
    for (let b = a + 1; b < pieces.length; b++)
      for (const left of pieces[a].edges)
        for (const right of pieces[b].edges)
          pairs.push({ edges: [left, right], length: left.lenMm + right.lenMm });
  return [...single, ...pairs];
}

function candidateCrossesGroups(
  candidate: SeamCandidate,
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
) {
  const a = edgePieces(candidate, 'a');
  const b = edgePieces(candidate, 'b');
  return (
    (a.some((key) => left.has(key)) && b.some((key) => right.has(key))) ||
    (b.some((key) => left.has(key)) && a.some((key) => right.has(key)))
  );
}

function matchedOperationCandidate(
  leftKeys: readonly string[],
  rightKeys: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
  operationId: string,
  folded: boolean,
): SeamCandidate | null {
  const leftPanels = leftKeys.some((key) => panelLike(geoms.get(key)!));
  const rightPanels = rightKeys.some((key) => panelLike(geoms.get(key)!));
  const panelsOnly = leftPanels && rightPanels;
  const leftRuns = operationEdgeRuns(leftKeys, geoms, panelsOnly, !folded);
  const rightRuns = operationEdgeRuns(rightKeys, geoms, panelsOnly, !folded);
  let best: { left: EdgeRun; right: EdgeRun; score: number } | null = null;
  for (const left of leftRuns)
    for (const right of rightRuns) {
      const delta = Math.abs(left.length - right.length);
      const rel = delta / Math.max(left.length, right.length, 1);
      if (rel > 0.1) continue;
      const direction = (run: EdgeRun) =>
        run.edges.reduce((sum, edge) => sum + edgeLevel(edge) * edge.lenMm, 0) / run.length;
      const directionDelta = Math.abs(direction(left) - direction(right));
      if (directionDelta > 0.3) continue;
      const compositePenalty = 0.025 * (left.edges.length + right.edges.length - 2);
      const score = rel + directionDelta * 0.05 + compositePenalty;
      if (!best || score < best.score) best = { left, right, score };
    }
  if (!best) return null;
  const left = [...best.left.edges].sort((a, b) => b.lenMm - a.lenMm);
  const right = [...best.right.edges].sort((a, b) => b.lenMm - a.lenMm);
  const delta = Math.abs(best.left.length - best.right.length);
  return {
    a: left[0].id,
    b: right[0].id,
    ...(left.length > 1 ? { aParts: left.map((edge) => edge.id) } : {}),
    ...(right.length > 1 ? { bParts: right.map((edge) => edge.id) } : {}),
    score: 0.99,
    kind: left.length > 1 || right.length > 1 ? 'composite' : 'edge',
    sewn: true,
    operationId,
    assignment: { margin: 99, confidence: 'sure' },
    evidence: {
      ...EVIDENCE,
      dLenMm: delta,
      relLen: delta / Math.max(best.left.length, best.right.length, 1),
      aLenMm: best.left.length,
      bLenMm: best.right.length,
      rule: folded
        ? 'operation match · detail folded onto garment'
        : 'operation match · complete input units joined by matching edge run',
    },
  };
}

function twinFamilies(geoms: ReadonlyMap<string, PieceGeom>) {
  const parent = new Map([...geoms.keys()].map((key) => [key, key]));
  const find = (key: string): string => {
    const current = parent.get(key) ?? key;
    if (current === key) return key;
    const root = find(current);
    parent.set(key, root);
    return root;
  };
  const join = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const geom of geoms.values())
    for (const twin of geom.twinOf)
      if (twin.kind === 'identical' && geoms.has(twin.key)) join(geom.pieceKey, twin.key);
  const families = new Map<string, string[]>();
  for (const key of geoms.keys()) {
    const root = find(key);
    families.set(root, [...(families.get(root) ?? []), key]);
  }
  return new Map([...geoms.keys()].map((key) => [key, families.get(find(key)) ?? [key]]));
}

function mappedEdge(id: EdgeId, target: PieceGeom, geoms: ReadonlyMap<string, PieceGeom>) {
  const source = geoms.get(pieceKeyOf(id));
  if (!source) return undefined;
  const parts = edgeIdsOf(id).map((part) => source.edges.find((edge) => edge.id === part));
  if (parts.some((edge) => !edge)) return undefined;
  const targetIds = parts.map((sourceEdge) => {
    const sameIndex = target.edges.find((edge) => edge.k === sourceEdge!.k);
    if (sameIndex && Math.abs(sameIndex.lenMm - sourceEdge!.lenMm) <= 0.08 * sourceEdge!.lenMm)
      return sameIndex.id;
    return [...target.edges].sort((a, b) => {
      const score = (edge: Edge) =>
        Math.abs(edge.lenMm - sourceEdge!.lenMm) / Math.max(sourceEdge!.lenMm, 1) +
        Math.abs(edge.turnDeg - sourceEdge!.turnDeg) / 360 +
        Math.abs(edge.notchesMm.length - sourceEdge!.notchesMm.length) * 0.1;
      return score(a) - score(b);
    })[0]?.id;
  });
  if (targetIds.some((edge) => !edge)) return undefined;
  return targetIds.length === 1
    ? targetIds[0]
    : `${target.pieceKey}#${targetIds.map((edge) => edge!.slice(edge!.lastIndexOf('#') + 1)).join('+')}`;
}

function plyComplements(
  chosen: readonly SeamCandidate[],
  geoms: ReadonlyMap<string, PieceGeom>,
): SeamCandidate[] {
  const families = twinFamilies(geoms);
  const known = new Set(chosen.flatMap((candidate) => [...candidatePairKeys(candidate)]));
  const out: SeamCandidate[] = [];
  for (const candidate of chosen) {
    if (
      /operation match|waistband follows|side pocket at waist end|^partial:/.test(
        candidate.evidence.rule ?? '',
      )
    )
      continue;
    if (candidate.kind === 'surface' || candidate.kind === 'closure-not-seam') continue;
    const aIds = candidate.aParts ?? [candidate.a];
    const bIds = candidate.bParts ?? [candidate.b];
    for (const aId of aIds)
      for (const bId of bIds) {
        const matchingPly = /collar follows/.test(candidate.evidence.rule ?? '');
        const plies = (key: string) => {
          const family = families.get(key) ?? [key];
          if (!matchingPly) return family;
          const mate = family.find((candidateKey) => candidateKey !== key);
          return mate ? [key, mate] : [key];
        };
        const aFamily = plies(pieceKeyOf(aId));
        const bFamily = plies(pieceKeyOf(bId));
        if (aFamily.length === 1 && bFamily.length === 1) continue;
        for (const aKey of aFamily)
          for (const bKey of bFamily) {
            if (aKey === bKey || known.has(pairKey(aKey, bKey))) continue;
            const a = mappedEdge(aId, geoms.get(aKey)!, geoms);
            const b = mappedEdge(bId, geoms.get(bKey)!, geoms);
            if (!a || !b) continue;
            const complement: SeamCandidate = {
              ...candidate,
              a,
              b,
              aParts: undefined,
              bParts: undefined,
              kind: candidate.kind === 'edge' ? 'edge' : 'composite',
              evidence: {
                ...candidate.evidence,
                rule: `${candidate.evidence.rule ? `${candidate.evidence.rule} · ` : ''}matching ply follows the same garment seam`,
              },
            };
            known.add(pairKey(aKey, bKey));
            out.push(complement);
          }
      }
  }
  return out;
}

const operationIdOf = (index: number) => `garment:${index}`;

function operationNumberForAssigned(
  candidate: SeamCandidate,
  assignedOperations: readonly number[],
) {
  const match = /^op:(\d+)$/.exec(candidate.operationId ?? '');
  return match ? assignedOperations[Number(match[1])] ?? null : null;
}

function operationContext(techCard: common_TechCard, geoms: ReadonlyMap<string, PieceGeom>) {
  const operations = (techCard.techCard?.operations ?? []) as Operation[];
  const pieceKeys = new Set(geoms.keys());
  const assignedOperations: number[] = [];
  operations.forEach((operation, index) => {
    const machine = (operation.operationType ?? '').endsWith('MACHINE');
    if (machine && operation.outputUnitKey && inputGroups(operations, index, pieceKeys).length >= 2)
      assignedOperations.push(operation.operationNumber ?? 0);
  });
  return { operations, pieceKeys, assignedOperations };
}

function necklineRepairs(
  techCard: common_TechCard,
  geoms: ReadonlyMap<string, PieceGeom>,
): Map<number, SeamCandidate[]> {
  const { operations, pieceKeys } = operationContext(techCard, geoms);
  const add = new Map<number, SeamCandidate[]>();
  operations.forEach((operation, index) => {
    if (!isJoinStep(operations, index, pieceKeys, geoms)) return;
    const groups = inputGroups(operations, index, pieceKeys);
    const collarGroup = groups.find((group) =>
      group.pieces.some((key) => collarLike(geoms.get(key)!)),
    );
    const bodyGroup = groups.find(
      (group) =>
        group !== collarGroup && group.pieces.some((key) => necklinePanel(geoms.get(key)!)),
    );
    if (!collarGroup || !bodyGroup) return;

    const collars = collarGroup.pieces
      .map((key) => geoms.get(key))
      .filter((geom): geom is PieceGeom => !!geom && collarLike(geom))
      .sort((a, b) => a.name.localeCompare(b.name));
    const band = collars[0];
    const bandEdge = band
      ? [...band.edges].sort(
          (a, b) =>
            b.notchesMm.length - a.notchesMm.length || a.turnDeg - b.turnDeg || b.lenMm - a.lenMm,
        )[0]
      : undefined;
    const bodyGeoms = bodyGroup.pieces
      .map((key) => geoms.get(key))
      .filter((geom): geom is PieceGeom => !!geom);
    const explicitPanels = new Set(
      bodyGeoms.filter((geom) => necklinePanel(geom)).map((geom) => geom.pieceKey),
    );
    // Short maker codes can be ambiguous across products (for example a code may also be a role
    // token). A mirrored/twinned mate of a known body panel has the same neckline role by shape.
    const isPanelMate = (geom: PieceGeom) =>
      geom.twinOf.some((twin) => explicitPanels.has(twin.key)) ||
      bodyGeoms.some(
        (other) =>
          explicitPanels.has(other.pieceKey) &&
          other.twinOf.some((twin) => twin.key === geom.pieceKey),
      );
    const neck = bodyGeoms
      .filter((geom) => necklinePanel(geom) || isPanelMate(geom))
      .sort((a, b) => {
        const rank = (geom: PieceGeom) =>
          hasRole(geom, 'back') ? 0 : hasRole(geom, 'front') ? 1 : hasRole(geom, 'yoke') ? 2 : 3;
        const hand = (geom: PieceGeom) => (geom.hand === 'L' ? 0 : geom.hand === 'R' ? 1 : 2);
        return rank(a) - rank(b) || hand(a) - hand(b) || a.name.localeCompare(b.name);
      })
      .flatMap((geom) => {
        const edge = [...geom.edges].sort(
          (a, b) =>
            b.notchesMm.length - a.notchesMm.length || a.turnDeg - b.turnDeg || a.lenMm - b.lenMm,
        )[0];
        return edge ? [edge] : [];
      });
    if (!bandEdge || !neck.length) return;
    const seam: SeamCandidate = {
      ...partialCandidate(
        bandEdge,
        neck[0],
        operationIdOf(index),
        'collar follows the complete garment neckline',
        'composite',
      ),
      bParts: neck.map((edge) => edge.id),
      range: undefined,
    };
    add.set(operation.operationNumber ?? 0, [seam]);
  });
  return add;
}

function trouserRepairs(
  techCard: common_TechCard,
  geoms: ReadonlyMap<string, PieceGeom>,
  category: SkeletonCategory,
  chosen: readonly SeamCandidate[],
) {
  const { operations, pieceKeys, assignedOperations } = operationContext(techCard, geoms);
  const add = new Map<number, SeamCandidate[]>();
  const riseOps = new Set<number>();
  if (category !== 'trousers' && category !== 'jumpsuit' && category !== 'bottom')
    return { add, riseOps };
  const legs = legPanels([...geoms.values()]);

  operations.forEach((operation, index) => {
    if (!isJoinStep(operations, index, pieceKeys, geoms)) return;
    const number = operation.operationNumber ?? 0;
    const groups = inputGroups(operations, index, pieceKeys);
    const surfaces = groups.filter(
      (group) =>
        group.pieces.length > 0 && group.pieces.every((key) => pocketLike(geoms.get(key)!)),
    );
    const bodies = groups.filter((group) => group.pieces.some((key) => panelLike(geoms.get(key)!)));

    for (const surface of surfaces) {
      const body = bodies.find((candidate) => candidate !== surface);
      if (!body) continue;
      const sidePockets = surface.pieces
        .map((key) => geoms.get(key))
        .filter((geom): geom is PieceGeom => !!geom && sidePocketLike(geom));
      const bodyLegs = body.pieces
        .map((key) => legs.get(key))
        .filter((leg): leg is LegPanel => !!leg);
      if (sidePockets.length && bodyLegs.length) {
        for (const pocket of sidePockets) {
          const leg =
            bodyLegs.find(
              (candidate) =>
                !pocket.hand || !candidate.piece.hand || pocket.hand === candidate.piece.hand,
            ) ?? bodyLegs[0];
          const seam = sidePocketCandidate(pocket, leg, operationIdOf(index));
          if (seam) add.set(number, [...(add.get(number) ?? []), seam]);
        }
        continue;
      }
      const surfacePieces = new Set(surface.pieces);
      const bodyPieces = new Set(body.pieces);
      const alreadyPaired = chosen.some(
        (candidate) =>
          formingOperation(candidate, operations, pieceKeys, assignedOperations) === number &&
          candidateCrossesGroups(candidate, surfacePieces, bodyPieces),
      );
      if (alreadyPaired) continue;
      const seam = matchedOperationCandidate(
        surface.pieces,
        body.pieces,
        geoms,
        operationIdOf(index),
        body.pieces.some((key) => legPanel(geoms.get(key)!)),
      );
      if (seam) add.set(number, [...(add.get(number) ?? []), seam]);
    }

    const bandGroups = groups.filter((group) =>
      group.pieces.some((key) => waistbandLike(geoms.get(key)!)),
    );
    const body = groups.find((group) => group.pieces.some((key) => legPanel(geoms.get(key)!)));
    if (bandGroups.length && body) {
      for (const group of bandGroups) {
        const bands = group.pieces
          .map((key) => geoms.get(key))
          .filter((geom): geom is PieceGeom => !!geom && waistbandLike(geom));
        const band = [...bands].sort(
          (a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name),
        )[0];
        if (!band) continue;
        const longEdges = [...band.edges].sort((a, b) => b.lenMm - a.lenMm);
        // The assignment has already joined the two waistband plies on their other long edge.
        const attach = longEdges[0] ?? longEdges[1];
        const panels = body.pieces
          .map((key) => geoms.get(key))
          .filter((geom): geom is PieceGeom => !!geom && legPanel(geom))
          .filter((geom) => !band.hand || !geom.hand || geom.hand === band.hand)
          .sort((a, b) => Math.abs(b.areaMm2) - Math.abs(a.areaMm2));
        const roles = new Map<string, PieceGeom>();
        for (const panel of panels) {
          const role = roleOf(panel) ?? panel.pieceKey;
          if (!roles.has(role)) roles.set(role, panel);
        }
        const waist = [...roles.values()].flatMap((panel) => waistEdges(panel).slice(0, 1));
        if (!attach || !waist.length) continue;
        const seam: SeamCandidate = {
          ...partialCandidate(
            attach,
            waist[0],
            operationIdOf(index),
            'waistband follows the complete waist edge',
            'composite',
          ),
          bParts: waist.map((edge) => edge.id),
          range: undefined,
        };
        add.set(number, [...(add.get(number) ?? []), seam]);
      }
    }

    for (let leftIndex = 0; leftIndex < groups.length; leftIndex++)
      for (let rightIndex = leftIndex + 1; rightIndex < groups.length; rightIndex++) {
        const left = groups[leftIndex];
        const right = groups[rightIndex];
        if (
          left.pieces.every((key) => waistbandLike(geoms.get(key)!)) &&
          right.pieces.every((key) => waistbandLike(geoms.get(key)!))
        )
          continue;
        const leftPieces = new Set(left.pieces);
        const rightPieces = new Set(right.pieces);
        const existing = [...chosen, ...(add.get(number) ?? [])].some(
          (candidate) =>
            candidateCrossesGroups(candidate, leftPieces, rightPieces) &&
            (add.get(number)?.includes(candidate) ||
              formingOperation(candidate, operations, pieceKeys, assignedOperations) === number),
        );
        if (existing) continue;
        const seam = matchedOperationCandidate(
          left.pieces,
          right.pieces,
          geoms,
          operationIdOf(index),
          false,
        );
        if (seam) add.set(number, [...(add.get(number) ?? []), seam]);
      }

    if (
      groups.length === 2 &&
      groups.every((group) => group.pieces.some((key) => legPanel(geoms.get(key)!)))
    )
      riseOps.add(number);
  });
  return { add, riseOps };
}

function formingOperation(
  candidate: SeamCandidate,
  operations: readonly Operation[],
  pieceKeys: ReadonlySet<string>,
  assignedOperations: readonly number[],
): number | null {
  if (candidate.provenance) {
    const owner = operations.find((operation) =>
      operation.seamKeys?.includes(candidate.provenance!.seamKey),
    );
    if (owner) return owner.operationNumber ?? 0;
  }
  const assigned = operationNumberForAssigned(candidate, assignedOperations);
  if (assigned != null) return assigned;
  const garment = /^garment:(\d+)$/.exec(candidate.operationId ?? '');
  if (garment) return operations[Number(garment[1])]?.operationNumber ?? null;
  const a = new Set(edgePieces(candidate, 'a'));
  const b = new Set(edgePieces(candidate, 'b'));
  for (let index = 0; index < operations.length; index++) {
    if (!isJoinStep(operations, index, pieceKeys)) continue;
    const groups = inputGroups(operations, index, pieceKeys);
    const ga = groups.findIndex((group) => group.pieces.some((key) => a.has(key)));
    const gb = groups.findIndex((group) => group.pieces.some((key) => b.has(key)));
    if (ga >= 0 && gb >= 0 && ga !== gb) return operations[index].operationNumber ?? 0;
  }
  return null;
}

function crossesOperation(
  candidate: SeamCandidate,
  operationNumber: number,
  operations: readonly Operation[],
  pieceKeys: ReadonlySet<string>,
) {
  const index = operations.findIndex(
    (operation) => (operation.operationNumber ?? 0) === operationNumber,
  );
  if (index < 0) return false;
  const groups = inputGroups(operations, index, pieceKeys);
  if (groups.length < 2) return false;
  const a = new Set(edgePieces(candidate, 'a'));
  const b = new Set(edgePieces(candidate, 'b'));
  return groups.some(
    (left, leftIndex) =>
      left.pieces.some((key) => a.has(key)) &&
      groups.some(
        (right, rightIndex) => rightIndex !== leftIndex && right.pieces.some((key) => b.has(key)),
      ),
  );
}

function edgeRange(candidate: SeamCandidate, side: 'a' | 'b'): GarmentEdgeRange {
  const ids = side === 'a' ? candidate.aParts ?? [candidate.a] : candidate.bParts ?? [candidate.b];
  return {
    piece: pieceKeyOf(ids[0]),
    edges: ids.flatMap(edgeIdsOf),
    ...(candidate.range ? { range: candidate.range[side] } : {}),
  };
}

/** One globally consistent garment reading, shared by editor and print fallbacks. */
export function assembleGarment(input: GarmentAssemblyInput): GarmentAssembly {
  const geoms = new Map(input.graph.pieces.map((piece) => [piece.pieceKey, piece]));
  const { operations, pieceKeys, assignedOperations } = operationContext(input.techCard, geoms);
  let chosen = [...input.graph.chosen];
  const repairs = trouserRepairs(input.techCard, geoms, input.category, chosen);
  for (const [operation, seams] of necklineRepairs(input.techCard, geoms))
    repairs.add.set(operation, [...(repairs.add.get(operation) ?? []), ...seams]);

  const sidePocketKeys = new Set(
    [...repairs.add.values()]
      .flat()
      .filter((candidate) => /side pocket at waist end/.test(candidate.evidence.rule ?? ''))
      .flatMap((candidate) => [pieceKeyOf(candidate.a), pieceKeyOf(candidate.b)])
      .filter((key) => sidePocketLike(geoms.get(key)!)),
  );
  const legs = legPanels([...geoms.values()]);
  chosen = chosen.filter((candidate) => {
    const candidatePieces = new Set([...edgePieces(candidate, 'a'), ...edgePieces(candidate, 'b')]);
    if (
      [...candidatePieces].some((key) => sidePocketKeys.has(key)) &&
      [...candidatePieces].some((key) => legs.has(key))
    )
      return false;
    if (candidate.provenance) return true;
    const operation = formingOperation(candidate, operations, pieceKeys, assignedOperations);
    if (operation == null || !repairs.riseOps.has(operation)) return true;
    return ![...candidatePairKeys(candidate)].every((key) => {
      const [a, b] = key.split('\u0000');
      return pocketLike(geoms.get(a)!) && pocketLike(geoms.get(b)!);
    });
  });

  const repaired = [...repairs.add.values()].flat();
  const complements = plyComplements([...chosen, ...repaired], geoms);
  const storedOperations = new Set(
    chosen
      .filter((candidate) => candidate.provenance)
      .map((candidate) => formingOperation(candidate, operations, pieceKeys, assignedOperations))
      .filter((operation): operation is number => operation != null),
  );
  const known = new Set(chosen.flatMap((candidate) => [...candidatePairKeys(candidate)]));
  for (const candidate of [...repaired, ...complements]) {
    const operation = formingOperation(candidate, operations, pieceKeys, assignedOperations);
    if (operation != null && storedOperations.has(operation)) continue;
    const pairs = candidatePairKeys(candidate);
    if ([...pairs].every((key) => known.has(key))) continue;
    chosen.push(candidate);
    for (const key of pairs) known.add(key);
  }

  const byOperation = new Map<number, SeamCandidate[]>();
  for (const candidate of chosen) {
    const operation = formingOperation(candidate, operations, pieceKeys, assignedOperations);
    if (operation == null || !crossesOperation(candidate, operation, operations, pieceKeys))
      continue;
    byOperation.set(operation, [...(byOperation.get(operation) ?? []), candidate]);
  }
  for (const [operation, seams] of repairs.add)
    for (const seam of seams)
      if (!(byOperation.get(operation) ?? []).includes(seam))
        byOperation.set(operation, [...(byOperation.get(operation) ?? []), seam]);
  for (const [operation, seams] of byOperation) {
    const aggregate = seams.find(
      (seam) =>
        seam.kind === 'composite' &&
        ((seam.aParts?.length ?? 0) > 1 || (seam.bParts?.length ?? 0) > 1) &&
        !/matching ply follows/.test(seam.evidence.rule ?? ''),
    );
    if (aggregate)
      byOperation.set(
        operation,
        seams.filter(
          (seam) => seam === aggregate || !/matching ply follows/.test(seam.evidence.rule ?? ''),
        ),
      );
  }

  const graph: SeamGraph = { ...input.graph, chosen };
  const pairings: GarmentPairing[] = chosen.map((seam) => {
    const operationNumber = formingOperation(seam, operations, pieceKeys, assignedOperations);
    const source: GarmentPairing['source'] = seam.provenance
      ? 'stored'
      : repaired.includes(seam)
        ? seam.kind === 'composite'
          ? 'wrap'
          : 'surface'
        : complements.includes(seam)
          ? 'ply'
          : 'assignment';
    return {
      seam,
      operationNumber,
      a: edgeRange(seam, 'a'),
      b: edgeRange(seam, 'b'),
      source,
    };
  });
  const layout = unionLayout([...geoms.keys()], chosen, geoms, {
    rasterMm: 4,
    uprightMax: Math.PI / 3,
    pushOffMax: 0.24,
  });
  return { category: input.category, graph, pairings, byOperation, layout };
}
