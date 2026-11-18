import type { AuthoredInternalLabel, ManifestAuthoredInternalPath, PtMm } from '../types';

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
    Math.round(Number((x - offset.x).toFixed(6)) * 1_000_000),
    Math.round(Number((y - offset.y).toFixed(6)) * 1_000_000),
  ]);
}

export function parseManifestAuthoredInternal(
  value: unknown,
  internalCount: number,
): ManifestAuthoredInternalPath[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > internalCount) return null;
  const entries: ManifestAuthoredInternalPath[] = [];
  let previousIndex = -1;
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
    const { index, label, closed, vertices } = candidate as Partial<ManifestAuthoredInternalPath>;
    if (
      typeof index !== 'number' ||
      !Number.isSafeInteger(index) ||
      index <= previousIndex ||
      index >= internalCount ||
      !isAuthoredInternalLabel(label) ||
      typeof closed !== 'boolean' ||
      !Array.isArray(vertices) ||
      vertices.length < (closed ? 6 : 4) ||
      vertices.length > 8_000 ||
      vertices.length % 2 !== 0 ||
      (label === 'draft-cad:dart' && (closed || vertices.length !== 6)) ||
      (label === 'draft-cad:fish-eye' && (!closed || vertices.length !== 8)) ||
      !vertices.every((coordinate) => Number.isSafeInteger(coordinate))
    )
      return null;
    entries.push({ index, label, closed, vertices: [...vertices] });
    previousIndex = index;
  }
  return entries;
}
