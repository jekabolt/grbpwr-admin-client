import type { ManifestProtectedLineSplit } from '../types';

const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const index = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const pair = (value: unknown): value is [number, number] =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === 'number' && Number.isFinite(n) && n === Number(n.toFixed(6)));

export function parseProtectedLineSplit(value: unknown): ManifestProtectedLineSplit | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const s = value as Record<string, unknown>;
  if (
    s.v !== 1 ||
    typeof s.entityId !== 'string' ||
    !s.entityId.trim() ||
    s.entityId.length > 256 ||
    (s.role !== 'cut' && s.role !== 'seam') ||
    !hash(s.sourceSha256) ||
    !hash(s.ringSha256) ||
    !index(s.sourcePathId) ||
    !index(s.sourceStartPointIndex) ||
    !index(s.pointIndex) ||
    !index(s.ringPointCount) ||
    s.ringPointCount < 4 ||
    s.pointIndex >= s.ringPointCount ||
    s.sourceStartPointIndex >= s.ringPointCount - 1 ||
    !pair(s.fromMm) ||
    !pair(s.pointMm) ||
    !pair(s.toMm) ||
    typeof s.progress !== 'number' ||
    !(s.progress > 0 && s.progress < 1)
  )
    return null;
  const [a, m, b] = [s.fromMm, s.pointMm, s.toMm];
  if ((a[0] === m[0] && a[1] === m[1]) || (b[0] === m[0] && b[1] === m[1])) return null;
  for (const k of [0, 1]) if (a[k] + (b[k] - a[k]) * s.progress !== m[k]) return null;
  return {
    v: 1,
    entityId: s.entityId,
    role: s.role,
    sourceSha256: s.sourceSha256,
    sourcePathId: s.sourcePathId,
    sourceStartPointIndex: s.sourceStartPointIndex,
    pointIndex: s.pointIndex,
    ringPointCount: s.ringPointCount,
    ringSha256: s.ringSha256,
    fromMm: [...a],
    pointMm: [...m],
    toMm: [...b],
    progress: s.progress,
  };
}
