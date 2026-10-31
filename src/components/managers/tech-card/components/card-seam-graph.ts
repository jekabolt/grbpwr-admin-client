// One card seam graph for the editor and print. The editor supplies its live PieceShapeMap; print
// supplies the already-segmented assembly geometry. Both paths build the same card facts here and
// run the same readSeamGraph call. Stored proto seams are the default decisions, while the editor
// may inject its zustand-backed decisions so optimistic rows remain visible before save.
import type { common_TechCard } from 'api/proto-http/admin';
import { readSeamGraph } from 'lib/assembly-skeleton/pipeline';
import type {
  PieceGeom,
  SeamDecisionsInput,
  SeamGraph,
  SkeletonFacts,
  SkeletonPieceInput,
} from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { decisionsFor, fromWire, splitWire, type StoredPose, type StoredSeam } from 'lib/seams';

import { seamAssignmentInputOf } from './assembly-seams/seam-assignment-input';
import {
  buildSkeletonFacts,
  liningOnlyCard,
  liningScopedPieces,
  skeletonBomFacts,
  skeletonCategoryRead,
  skeletonLined,
} from './assembly-skeleton-source';
import { pieceRefKey } from './piece-block-refs';
import type { PieceCloth } from './piece-cloth';
import { toPurposeEnum } from './schema';
import type { PieceShapeMap } from './use-piece-shapes';
import { assembleGarment, type GarmentAssembly } from './garment-assembly';

type CardInsert = NonNullable<common_TechCard['techCard']>;
type GeomValue = PieceGeom | { geom: PieceGeom };

export type FormCardGeometry = {
  shapes: PieceShapeMap;
  cloth: ReadonlyMap<string, PieceCloth> | null;
  categoryNames?: readonly string[];
};

export type CardSeamGeometry = ReadonlyMap<string, GeomValue> | FormCardGeometry;

export type SeamGraphOfCardOptions = {
  /** Editor adapter: updates/reads its seam store. Print omits this and reads techCard.seams. */
  decisions?: (facts: SkeletonFacts) => SeamDecisionsInput | undefined;
};

const isFormGeometry = (source: CardSeamGeometry): source is FormCardGeometry => 'shapes' in source;

const geomOf = (value: GeomValue | undefined): PieceGeom | undefined =>
  value && 'geom' in value ? value.geom : value;

const grainAngle = (a: readonly number[], b: readonly number[]) => {
  const raw = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
  return ((raw % 180) + 180) % 180;
};

/** Minimal PieceDTO retained in facts; the graph itself consumes the supplied PieceGeom. */
function dtoOfGeom(geom: PieceGeom, id: number): PieceDTO {
  const xs = geom.rs.map((point) => point[0]);
  const ys = geom.rs.map((point) => point[1]);
  const x0 = Math.min(...xs, 0);
  const y0 = Math.min(...ys, 0);
  const x1 = Math.max(...xs, 0);
  const y1 = Math.max(...ys, 0);
  return {
    id,
    name: geom.name,
    blockName: geom.name,
    source: 'assembly geometry',
    poly: geom.rs.map(([x, y]) => ({ x: x / 10, y: y / 10 })),
    bboxW: (x1 - x0) / 10,
    bboxH: (y1 - y0) / 10,
    areaCm2: geom.areaMm2 / 100,
    originX: 0,
    originY: 0,
    grain: geom.grain?.map((line) => ({
      layer: line.layer,
      angleDeg: grainAngle(line.a, line.b),
      lengthCm: Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]) / 10,
      a: { x: line.a[0] / 10, y: line.a[1] / 10 },
      b: { x: line.b[0] / 10, y: line.b[1] / 10 },
    })),
  };
}

function factsOfSegmentedCard(
  techCard: common_TechCard,
  source: ReadonlyMap<string, GeomValue>,
): { facts: SkeletonFacts; segmented: PieceGeom[] } {
  const ins = techCard.techCard;
  const pieces = ins?.pieces ?? [];
  const bomLines = ins?.bomItems ?? [];
  const aliases = ins?.pieceDxfAliases?.items ?? [];
  const patterns = ins?.patterns ?? [];
  const segmented: PieceGeom[] = [];
  const cloth = new Map<string, PieceCloth>();
  for (const piece of pieces) {
    const key = (piece.lineKey ?? '').trim();
    const geom = key ? geomOf(source.get(key)) : undefined;
    if (!geom) continue;
    segmented.push(geom);
    if (geom.cloth) cloth.set(key, { state: geom.cloth });
  }
  const liningLines = new Set(
    bomLines
      .filter((line) => line.purpose === 'TECH_CARD_BOM_PURPOSE_LINING')
      .map((line) => (line.lineKey ?? '').trim()),
  );
  const scoped = liningOnlyCard(bomLines)
    ? new Set<string>()
    : liningScopedPieces(aliases, liningLines);
  const inputs: SkeletonPieceInput[] = pieces.flatMap((piece, index) => {
    const key = (piece.lineKey ?? '').trim();
    const geom = key ? geomOf(source.get(key)) : undefined;
    if (!key || !geom) return [];
    const state = geom.cloth ?? (scoped.has(pieceRefKey(key)) ? 'lining' : null);
    return [
      {
        pieceKey: key,
        name: (piece.name ?? '').trim() || geom.name || key,
        piece: dtoOfGeom(geom, index + 1),
        piecesPerGarment: piece.piecesPerGarment || 1,
        cutSymmetry: piece.cutSymmetry || null,
        cloth: state,
        fused: piece.fused ?? /fus/i.test(geom.name),
      },
    ];
  });
  const hasLining = skeletonLined({
    cloth,
    pieces,
    aliases,
    patterns,
    bomLines,
  });
  return {
    facts: {
      pieces: inputs,
      category: skeletonCategoryRead({
        categoryNames: [],
        hasLining,
        pieceNames: pieces.map((piece) => piece.name ?? ''),
        purpose: toPurposeEnum(ins?.purpose),
      }).category,
      bom: skeletonBomFacts(bomLines),
      defaultMachineType: null,
    },
    segmented,
  };
}

function factsOfFormCard(
  techCard: common_TechCard,
  source: FormCardGeometry,
): { facts: SkeletonFacts; segmented?: undefined } {
  const ins = techCard.techCard ?? ({} as CardInsert);
  const pieces = ins.pieces ?? [];
  const bomLines = ins.bomItems ?? [];
  const aliases = ins.pieceDxfAliases?.items ?? [];
  const patterns = ins.patterns ?? [];
  const hasLining = skeletonLined({
    cloth: source.cloth,
    pieces,
    aliases,
    patterns,
    bomLines,
  });
  return {
    facts: buildSkeletonFacts({
      pieces,
      shapes: source.shapes,
      cloth: source.cloth,
      bomLines,
      category: skeletonCategoryRead({
        categoryNames: source.categoryNames ?? [],
        hasLining,
        pieceNames: pieces.map((piece) => piece.name ?? ''),
        purpose: toPurposeEnum(ins.purpose),
      }).category,
      defaultMachineType: null,
      aliases,
    }).facts,
  };
}

/** Stored proto seams that this client understands, by their stable key. */
export function seamRowsOfCard(techCard: common_TechCard): ReadonlyMap<string, StoredSeam> {
  const rows = (techCard.seams ?? []).flatMap((wire) => {
    const row = fromWire(wire);
    return row ? [row] : [];
  });
  return new Map(rows.map((row) => [row.seamKey, row]));
}

/** The card's pose rows (P8, pieces placed by hand in a step) by key — never seams. */
export function poseRowsOfCard(techCard: common_TechCard): ReadonlyMap<string, StoredPose> {
  return new Map(splitWire(techCard.seams).poses.map((row) => [row.seamKey, row]));
}

/**
 * Form-free card graph. Print calls this with common_TechCard + assembly pieces; the live editor
 * calls the same entry with form-derived card fields + PieceShapeMap.
 */
export function garmentAssemblyOfCard(
  techCard: common_TechCard,
  geometry: CardSeamGeometry,
  options: SeamGraphOfCardOptions = {},
): GarmentAssembly {
  const built = isFormGeometry(geometry)
    ? factsOfFormCard(techCard, geometry)
    : factsOfSegmentedCard(techCard, geometry);
  const rows = [...seamRowsOfCard(techCard).values()];
  const decisions = options.decisions?.(built.facts) ?? decisionsFor(rows, built.facts);
  const operations = techCard.techCard?.operations ?? [];
  const graph = readSeamGraph(
    built.facts,
    undefined,
    {},
    decisions,
    undefined,
    seamAssignmentInputOf(operations, new Set(built.facts.pieces.map((piece) => piece.pieceKey))),
    built.segmented,
  );
  return assembleGarment({ techCard, graph, category: built.facts.category });
}

export function seamGraphOfCard(
  techCard: common_TechCard,
  geometry: CardSeamGeometry,
  options: SeamGraphOfCardOptions = {},
): SeamGraph {
  return garmentAssemblyOfCard(techCard, geometry, options).graph;
}
