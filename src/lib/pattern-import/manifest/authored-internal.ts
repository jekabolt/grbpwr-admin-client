import { parseAuthoredTurnAllowance } from './authored-turn-allowance';
import type {
  AuthoredInternalLabel,
  AuthoredQuadraticControls,
  AuthoredQuadraticGrid,
  ManifestAuthoredInternalPath,
  PtMm,
} from '../types';

const GRID_UNITS_PER_MM = 1_000_000;
const MAX_AUTHORED_INTERNAL_VERTICES = 4_000;
const QUADRATIC_FLATNESS_MM = 0.05;
const QUADRATIC_SUBDIVISION_LIMIT = 16;

const LABELS = new Set<string>([
  'draft-cad:internal-line',
  'draft-cad:pattern-line',
  'draft-cad:french-curve',
  'draft-cad:guideline',
  'draft-cad:dart',
  'draft-cad:fish-eye',
  'draft-cad:cross',
]);

export function isAuthoredInternalLabel(value: unknown): value is AuthoredInternalLabel {
  return typeof value === 'string' && LABELS.has(value);
}

export function authoredInternalVertices(
  points: readonly PtMm[],
  offset: PtMm = { x: 0, y: 0 },
): number[] {
  return points.flatMap(({ x, y }) => [
    Math.round(Number((x - offset.x).toFixed(6)) * GRID_UNITS_PER_MM),
    Math.round(Number((y - offset.y).toFixed(6)) * GRID_UNITS_PER_MM),
  ]);
}

export function parseManifestAuthoredInternal(
  value: unknown,
  internalCount: number,
): ManifestAuthoredInternalPath[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > internalCount) return null;
  const entries: ManifestAuthoredInternalPath[] = [];
  let previousIndex = -1;
  let sawTurn = false;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const { index, label, closed, vertices, quadratic, turnAllowance } =
      candidate as Partial<ManifestAuthoredInternalPath>;
    const turn = turnAllowance === undefined ? null : parseAuthoredTurnAllowance(turnAllowance);
    if (
      turnAllowance !== undefined &&
      (!turn || sawTurn || label !== 'draft-cad:pattern-line' || closed)
    )
      return null;
    sawTurn ||= !!turn;
    if (
      typeof index !== 'number' ||
      !Number.isSafeInteger(index) ||
      index <= previousIndex ||
      index >= internalCount ||
      !isAuthoredInternalLabel(label) ||
      typeof closed !== 'boolean' ||
      !Array.isArray(vertices) ||
      vertices.length < (closed ? 6 : 4) ||
      vertices.length > 2 * MAX_AUTHORED_INTERNAL_VERTICES ||
      vertices.length % 2 !== 0 ||
      (label === 'draft-cad:dart' && (closed || vertices.length !== 6)) ||
      (label === 'draft-cad:fish-eye' && (!closed || vertices.length !== 8)) ||
      !vertices.every((coordinate) => Number.isSafeInteger(coordinate)) ||
      (quadratic !== undefined &&
        (label !== 'draft-cad:french-curve' || closed || !isQuadraticGrid(quadratic)))
    )
      return null;
    entries.push({
      index,
      label,
      closed,
      vertices: [...vertices],
      ...(quadratic ? { quadratic: [...quadratic] } : {}),
      ...(turn ? { turnAllowance: turn } : {}),
    });
    previousIndex = index;
  }
  return entries;
}

function isQuadraticGrid(value: unknown): value is AuthoredQuadraticGrid {
  return Array.isArray(value) && value.length === 6 && value.every(Number.isSafeInteger);
}

export function authoredQuadraticGrid(
  points: AuthoredQuadraticControls,
): AuthoredQuadraticGrid | null {
  const grid = authoredInternalVertices(points);
  return isQuadraticGrid(grid) ? grid : null;
}

export function decodeAuthoredQuadratic(
  [sx, sy, cx, cy, ex, ey]: AuthoredQuadraticGrid,
  offset: PtMm = { x: 0, y: 0 },
): AuthoredQuadraticControls {
  return [
    { x: sx / GRID_UNITS_PER_MM + offset.x, y: sy / GRID_UNITS_PER_MM + offset.y },
    { x: cx / GRID_UNITS_PER_MM + offset.x, y: cy / GRID_UNITS_PER_MM + offset.y },
    { x: ex / GRID_UNITS_PER_MM + offset.x, y: ey / GRID_UNITS_PER_MM + offset.y },
  ];
}

export function mapAuthoredQuadratic(
  [start, control, end]: AuthoredQuadraticControls,
  transform: (point: PtMm) => PtMm,
): AuthoredQuadraticControls {
  return [transform(start), transform(control), transform(end)];
}

function midpoint(a: PtMm, b: PtMm): PtMm {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distanceToSegment(point: PtMm, from: PtMm, to: PtMm): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - from.x, point.y - from.y);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
  );
  return Math.hypot(point.x - from.x - t * dx, point.y - from.y - t * dy);
}

/** The wire contract for new exact records. Old typed polylines do not use this sampler. */
export function sampleAuthoredQuadratic(grid: AuthoredQuadraticGrid): PtMm[] | null {
  if (!isQuadraticGrid(grid) || (grid[0] === grid[4] && grid[1] === grid[5])) return null;
  const [start, control, end] = decodeAuthoredQuadratic(grid);
  const encoded = authoredQuadraticGrid([start, control, end]);
  if (!encoded || encoded.some((value, i) => value !== grid[i])) return null;
  const points: PtMm[] = [];
  const append = (point: PtMm): boolean => {
    const [x, y] = authoredInternalVertices([point]);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return false;
    const next = { x: x! / GRID_UNITS_PER_MM, y: y! / GRID_UNITS_PER_MM };
    const previous = points.at(-1);
    if (previous?.x === next.x && previous.y === next.y) return true;
    points.push(next);
    return points.length <= MAX_AUTHORED_INTERNAL_VERTICES;
  };
  const visit = (a: PtMm, b: PtMm, c: PtMm, depth: number): boolean => {
    const ab = midpoint(a, b),
      bc = midpoint(b, c);
    const split = midpoint(ab, bc);
    if (distanceToSegment(b, a, c) <= QUADRATIC_FLATNESS_MM) {
      // Keep a true interior curve point even for a flat curve. Two vertices can be read as grain.
      return (depth !== 0 || append(split)) && append(c);
    }
    return (
      depth < QUADRATIC_SUBDIVISION_LIMIT &&
      visit(a, ab, split, depth + 1) &&
      visit(split, bc, c, depth + 1)
    );
  };
  return append(start) && visit(start, control, end, 0) && points.length >= 3 ? points : null;
}
