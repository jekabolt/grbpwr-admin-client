import type { common_TechCard } from 'api/proto-http/admin';
import type { FoundPiece } from 'components/managers/tech-card/components/nesting/dxf-geometry';
import { seamPieceOf, segmentPiece, twins } from 'lib/assembly-skeleton/geometry';
import { readablePieceName } from 'lib/assembly-skeleton/names';
import type { ClothState } from 'lib/assembly-skeleton/types';
import type { PieceDTO } from 'lib/nesting/types';
import { grainRotation } from 'lib/pom/upright';

import { assemblyPieceCode } from './assembly-piece-code';
import type { AsmPiece, Pt } from './derive-assembly';

type AssemblyCardPiece = {
  lineKey?: string;
  name?: string;
  piecesPerGarment?: number;
  cutSymmetry?: string;
  materials: Array<{ bomLineKey?: string }>;
};

export type AssemblyCardInput = {
  pieces: AssemblyCardPiece[];
  bomItems: Array<{ lineKey?: string; purpose?: string }>;
};

export type BuiltAssemblyPieces = {
  pieces: Map<string, AsmPiece>;
  grainDeg: Map<string, number>;
};

const CLOTH: Record<string, ClothState> = {
  TECH_CARD_BOM_PURPOSE_MAIN: 'main',
  TECH_CARD_BOM_PURPOSE_LINING: 'lining',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'pocketing',
  TECH_CARD_BOM_PURPOSE_INTERFACING: 'interfacing',
  TECH_CARD_BOM_PURPOSE_INSULATION: 'insulation',
  TECH_CARD_BOM_PURPOSE_CONTRAST: 'contrast',
  TECH_CARD_BOM_PURPOSE_BINDING: 'contrast',
  TECH_CARD_BOM_PURPOSE_MESH: 'mesh',
  TECH_CARD_BOM_PURPOSE_OTHER: 'other',
};

const NOTCH_LAYER = '4';
const SIMPLIFY_MM = 0.3;
const ON_OUTLINE_MM = 2;

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Douglas-Peucker: the drawing does not need the DXF's every vertex. */
function simplify(pts: readonly Pt[], tol = SIMPLIFY_MM): Pt[] {
  if (pts.length < 3) return [...pts];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let worst = -1;
    let at = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e]);
      if (d > worst) {
        worst = d;
        at = i;
      }
    }
    if (worst > tol && at > 0) {
      keep[at] = 1;
      stack.push([s, at], [at, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

function area(pts: readonly Pt[]): number {
  let value = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++)
    value += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(value / 2);
}

/** Grid cell for the outline's segments, mm; cells per axis a key tells apart (±2^19 cells). */
const OUTLINE_CELL_MM = 10;
const CELL_SPAN = 1 << 20;
const cellKey = (gx: number, gy: number) => gx * CELL_SPAN + gy;

type OutlineGrid = {
  outline: readonly Pt[];
  /** Segment indices by cell; null when the outline is too wild to grid (brute force then). */
  cells: Map<number, number[]> | null;
};

/**
 * The outline's segments by the cells their box, widened by ON_OUTLINE_MM and a millimetre of
 * slack, touches. A point within ON_OUTLINE_MM of a segment lies in that widened box, so its own
 * cell lists the segment: `onOutline` tests exactly the segments the full scan could have matched
 * and decides with the same segDist. Built once per piece, when its first open line asks. Card 61
 * spent 1 % of buildAssemblyPieces here; the grid keeps a piece with many inner lines from going
 * quadratic rather than speeding that card up.
 */
function outlineGrid(outline: readonly Pt[]): OutlineGrid {
  const reach = ON_OUTLINE_MM + 1;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of outline) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const span = ((maxX - minX) / OUTLINE_CELL_MM + 2) * ((maxY - minY) / OUTLINE_CELL_MM + 2);
  if (!Number.isFinite(span) || span > 1e6) return { outline, cells: null };
  const cells = new Map<number, number[]>();
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const x0 = Math.floor((Math.min(a[0], b[0]) - reach) / OUTLINE_CELL_MM);
    const x1 = Math.floor((Math.max(a[0], b[0]) + reach) / OUTLINE_CELL_MM);
    const y0 = Math.floor((Math.min(a[1], b[1]) - reach) / OUTLINE_CELL_MM);
    const y1 = Math.floor((Math.max(a[1], b[1]) + reach) / OUTLINE_CELL_MM);
    for (let gx = x0; gx <= x1; gx++)
      for (let gy = y0; gy <= y1; gy++) {
        const key = cellKey(gx, gy);
        const bucket = cells.get(key);
        if (bucket) bucket.push(i);
        else cells.set(key, [i]);
      }
  }
  return { outline, cells };
}

function onOutline(line: readonly Pt[], grid: OutlineGrid): boolean {
  const { outline, cells } = grid;
  const near = (point: Pt, i: number) =>
    segDist(point, outline[i], outline[(i + 1) % outline.length]) <= ON_OUTLINE_MM;
  return line.every((point) => {
    if (!cells) {
      for (let i = 0; i < outline.length; i++) if (near(point, i)) return true;
      return false;
    }
    const bucket = cells.get(
      cellKey(Math.floor(point[0] / OUTLINE_CELL_MM), Math.floor(point[1] / OUTLINE_CELL_MM)),
    );
    if (!bucket) return false;
    for (const i of bucket) if (near(point, i)) return true;
    return false;
  });
}

/** PieceDTO (cm, y up) to the drawing frame (mm, y down). */
const draw = (pts: readonly { x: number; y: number }[]): Pt[] =>
  pts.map((point) => [point.x * 10, -point.y * 10]);

function cloth(input: AssemblyCardInput, piece: AssemblyCardPiece): ClothState | null {
  const line = piece.materials?.[0]?.bomLineKey;
  const bom = line ? input.bomItems?.find((item) => item.lineKey === line) : undefined;
  return bom?.purpose ? CLOTH[bom.purpose] ?? null : null;
}

export function assemblyCardInput(techCard: common_TechCard): AssemblyCardInput {
  return {
    pieces: (techCard.techCard?.pieces ?? []).map((piece) => ({
      lineKey: piece.lineKey,
      name: piece.name,
      piecesPerGarment: piece.piecesPerGarment,
      cutSymmetry: piece.cutSymmetry,
      materials: piece.materials?.[0]?.bomLineKey
        ? [{ bomLineKey: piece.materials[0].bomLineKey }]
        : [],
    })),
    bomItems: (techCard.techCard?.bomItems ?? []).map((item) => ({
      lineKey: item.lineKey,
      purpose: item.purpose,
    })),
  };
}

/** Card pieces and their DXF matches to the drawings' pieces. Pure and worker-safe. */
export function buildAssemblyPiecesFromInput(
  input: AssemblyCardInput,
  found: ReadonlyMap<string, FoundPiece>,
  grainLayer = '',
): BuiltAssemblyPieces {
  const pieces = new Map<string, AsmPiece>();
  const grainDeg = new Map<string, number>();
  const geoms = [];
  const drawn = new Map<string, Omit<AsmPiece, 'geom'>>();
  for (const piece of input.pieces ?? []) {
    const key = piece.lineKey ?? '';
    const hit = key ? found.get(key) : undefined;
    if (!hit) continue;
    const dto: PieceDTO = seamPieceOf(hit.layers?.length ? hit.layers : [hit.piece]) ?? hit.piece;
    const name = readablePieceName(piece.name ?? '') || piece.name || key;
    const pieceCloth = cloth(input, piece);
    geoms.push(
      segmentPiece({
        pieceKey: key,
        name,
        piece: dto,
        piecesPerGarment: piece.piecesPerGarment || 1,
        cutSymmetry: piece.cutSymmetry ?? null,
        cloth: pieceCloth,
        fused: false,
      }),
    );
    grainDeg.set(key, grainRotation(hit.piece));
    const loops = [
      draw(dto.poly),
      ...(dto.inner ?? []).filter((line) => line.closed).map((line) => draw(line.pts)),
    ]
      .filter((line) => line.length >= 3)
      .map((pts) => ({ pts, area: area(pts) }))
      .sort((a, b) => b.area - a.area);
    const cut = loops[0]?.pts ?? [];
    const cutArea = loops[0]?.area ?? 0;
    const inner: Pt[][] = [];
    const notch: Pt[][] = [];
    const grainLayers = new Set(
      grainLayer ? [grainLayer] : (dto.grain ?? []).map((line) => line.layer).filter(Boolean),
    );
    let cutGrid: OutlineGrid | null = null;
    for (const line of dto.inner ?? []) {
      if (line.pts.length < 2 || grainLayers.has(line.layer)) continue;
      const pts = draw(line.pts);
      if (line.layer === NOTCH_LAYER) {
        notch.push(pts);
        continue;
      }
      if (line.closed) {
        if (area(pts) < cutArea * 0.5) inner.push(simplify([...pts, pts[0]]));
        continue;
      }
      if (dist(pts[0], pts[pts.length - 1]) < 1e-6 && pts.length < 3) continue;
      if (!onOutline(pts, (cutGrid ??= outlineGrid(cut)))) inner.push(simplify(pts));
    }
    drawn.set(key, {
      key,
      name: piece.name || name,
      code: assemblyPieceCode(piece.name, hit.block),
      cut: simplify(cut),
      inner,
      notch,
      pocketing: pieceCloth === 'pocketing',
      area: cutArea,
    });
  }
  for (const geom of twins(geoms)) {
    const drawing = drawn.get(geom.pieceKey);
    if (drawing) pieces.set(geom.pieceKey, { ...drawing, geom });
  }
  return { pieces, grainDeg };
}

/** Synchronous reference used by tests and the fixture equality harness. */
export function buildAssemblyPieces(
  techCard: common_TechCard,
  found: ReadonlyMap<string, FoundPiece>,
  grainLayer = '',
): BuiltAssemblyPieces {
  return buildAssemblyPiecesFromInput(assemblyCardInput(techCard), found, grainLayer);
}
