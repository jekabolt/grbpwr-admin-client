import type { ManifestAuthoredNotchGroup } from '../types';

export const AUTHORED_NOTCH_STROKES = { double: 2, triple: 3, v: 2 } as const;

export function parseManifestAuthoredNotches(
  value: unknown,
  notchCount: number,
): ManifestAuthoredNotchGroup[] | null {
  if (!Array.isArray(value) || !value.length || value.length * 2 > notchCount) return null;
  const result: ManifestAuthoredNotchGroup[] = [];
  const ids = new Set<string>();
  let previousEnd = 0;
  for (const group of value) {
    if (!group || typeof group !== 'object' || Array.isArray(group)) return null;
    const { groupId, shape, firstStroke, vertices } = group as Partial<ManifestAuthoredNotchGroup>;
    if (
      typeof groupId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,127}$/.test(groupId) ||
      ids.has(groupId) ||
      (shape !== 'double' && shape !== 'triple' && shape !== 'v') ||
      typeof firstStroke !== 'number' ||
      !Number.isSafeInteger(firstStroke) ||
      firstStroke < previousEnd ||
      !Array.isArray(vertices) ||
      !vertices.every(Number.isSafeInteger)
    )
      return null;
    const end = firstStroke + AUTHORED_NOTCH_STROKES[shape];
    if (end > notchCount || vertices.length !== 4 * (end - firstStroke)) return null;
    const twoStrokesShareTip = vertices[2] === vertices[6] && vertices[3] === vertices[7];
    if (twoStrokesShareTip !== (shape === 'v')) return null;
    result.push({ groupId, shape, firstStroke, vertices: [...vertices] });
    ids.add(groupId);
    previousEnd = end;
  }
  return result;
}
