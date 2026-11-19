import type {
  AuthoredTurnAllowance,
  AuthoredTurnAllowanceVariant,
  ManifestAuthoredTurnAllowance,
  PtMm,
} from '../types';

const gridCoordinates = (points: readonly PtMm[]) =>
  points.flatMap(({ x, y }) => [x, y].map((v) => Math.round(Number(v.toFixed(6)) * 1e6)));

type Edge = ManifestAuthoredTurnAllowance['cut'];

export function isAuthoredTurnAllowanceVariant(
  value: unknown,
): value is AuthoredTurnAllowanceVariant {
  return value === 'single-turn-hem' || value === 'cut-on-facing';
}

function edgeGrid(value: unknown): Edge | null {
  if (!Array.isArray(value) || value.length !== 4 || !value.every(Number.isSafeInteger))
    return null;
  const [ax, ay, bx, by] = value;
  return (ax === bx) !== (ay === by) ? [ax, ay, bx, by] : null;
}

export function parseAuthoredTurnAllowance(value: unknown): ManifestAuthoredTurnAllowance | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const wire = value as Partial<ManifestAuthoredTurnAllowance>;
  const cut = edgeGrid(wire.cut),
    sewing = edgeGrid(wire.sewing);
  if (!isAuthoredTurnAllowanceVariant(wire.variant) || !cut || !sewing) return null;
  const axis = cut[0] === cut[2] ? 0 : 1;
  const along = axis === 0 ? 1 : 0;
  const direction = Math.sign(cut[along + 2]! - cut[along]!);
  const depth = Math.abs(cut[axis]! - sewing[axis]!);
  if (
    sewing[axis] !== sewing[axis + 2] ||
    !Number.isSafeInteger(depth) ||
    depth === 0 ||
    direction * (sewing[along]! - cut[along]!) <= 0 ||
    direction * (sewing[along + 2]! - sewing[along]!) <= 0 ||
    direction * (cut[along + 2]! - sewing[along + 2]!) <= 0
  )
    return null;
  return { variant: wire.variant, cut, sewing };
}

export function turnAllowanceMarker(
  value: AuthoredTurnAllowance,
): ManifestAuthoredTurnAllowance | null {
  return parseAuthoredTurnAllowance({
    variant: value.variant,
    cut: gridCoordinates(value.cut),
    sewing: gridCoordinates(value.sewing),
  });
}

export function decodeTurnAllowance(
  marker: ManifestAuthoredTurnAllowance,
  offset: PtMm = { x: 0, y: 0 },
): AuthoredTurnAllowance {
  const edge = ([ax, ay, bx, by]: Edge): [PtMm, PtMm] => [
    { x: ax / 1e6 + offset.x, y: ay / 1e6 + offset.y },
    { x: bx / 1e6 + offset.x, y: by / 1e6 + offset.y },
  ];
  return { variant: marker.variant, cut: edge(marker.cut), sewing: edge(marker.sewing) };
}

export function mapAuthoredTurnAllowance(
  turn: AuthoredTurnAllowance,
  map: (p: PtMm) => PtMm,
): AuthoredTurnAllowance {
  return {
    variant: turn.variant,
    cut: [map(turn.cut[0]), map(turn.cut[1])],
    sewing: [map(turn.sewing[0]), map(turn.sewing[1])],
  };
}

function wirePoints(points: readonly PtMm[], exact: boolean) {
  const grid = gridCoordinates(points);
  if (
    !grid.every(Number.isSafeInteger) ||
    (exact &&
      points.some(({ x, y }, i) => x !== grid[2 * i]! / 1e6 || y !== grid[2 * i + 1]! / 1e6))
  )
    return null;
  return points.map((_, i): [number, number] => [grid[2 * i]!, grid[2 * i + 1]!]);
}

/** The authored crease is the ordered straight span of the preserved finite sewing edge. */
export function verifyTurnAllowanceGeometry(
  marker: ManifestAuthoredTurnAllowance,
  cut: readonly PtMm[],
  sewing: readonly PtMm[],
  crease: readonly PtMm[],
  exact: boolean,
) {
  if (
    !parseAuthoredTurnAllowance(marker) ||
    cut.length !== 4 ||
    sewing.length !== 4 ||
    crease.length < 2
  )
    return false;
  const [c, s, l] = [wirePoints(cut, exact), wirePoints(sewing, exact), wirePoints(crease, exact)];
  if (!c || !s || !l) return false;
  const edgeIndex = (path: [number, number][], edge: Edge) =>
    path.findIndex((a, i) => {
      const b = path[(i + 1) % path.length]!;
      return a[0] === edge[0] && a[1] === edge[1] && b[0] === edge[2] && b[1] === edge[3];
    });
  const cutIndex = edgeIndex(c, marker.cut);
  const seamIndex = edgeIndex(s, marker.sewing);
  if (cutIndex === -1 || seamIndex === -1) return false;
  const axis = marker.sewing[0] === marker.sewing[2] ? 0 : 1;
  const along = axis === 0 ? 1 : 0;
  if (
    c[(cutIndex + 3) % 4]![along] !== c[cutIndex]![along] ||
    c[(cutIndex + 2) % 4]![along] !== c[(cutIndex + 1) % 4]![along]
  )
    return false;
  const cross = (a: [number, number], b: [number, number], p: [number, number]) =>
    (BigInt(b[0]) - BigInt(a[0])) * (BigInt(p[1]) - BigInt(a[1])) -
    (BigInt(b[1]) - BigInt(a[1])) * (BigInt(p[0]) - BigInt(a[0]));
  const inside = (path: [number, number][], other?: [number, number][]) => {
    const direction = cross(path[0]!, path[1]!, path[2]!) > 0n ? 1n : -1n;
    return path.every((a, i) => {
      const next = (i + 1) % path.length,
        b = path[next]!;
      return (
        path.every((p, j) => i === j || next === j || direction * cross(a, b, p) > 0n) &&
        (!other || other.every((p) => direction * cross(a, b, p) > 0n))
      );
    });
  };
  if (!inside(c, s) || !inside(s)) return false;
  // The ends of the reflected support lie on the unchanged joins. Keep the folded
  // material strictly within the opposite cut edge along both joins.
  const reflected = 2n * BigInt(marker.sewing[axis]!) - BigInt(marker.cut[axis]!);
  if (!Number.isSafeInteger(Number(reflected))) return false;
  const winding = cross(c[0]!, c[1]!, c[2]!) > 0n ? 1n : -1n;
  const farStart = c[(cutIndex + 2) % 4]!,
    farEnd = c[(cutIndex + 3) % 4]!;
  if (
    [c[cutIndex]!, c[(cutIndex + 1) % 4]!].some(([x, y]) => {
      const point: [number, number] = [x, y];
      point[axis] = Number(reflected);
      return winding * cross(farStart, farEnd, point) <= 0n;
    })
  )
    return false;
  const first = l[0]!,
    last = l.at(-1)!;
  const walk = Math.sign(marker.sewing[along + 2]! - marker.sewing[along]!);
  return (
    first[along] === marker.sewing[along] &&
    last[along] === marker.sewing[along + 2] &&
    l.every(
      (p, i) =>
        p[axis] === marker.sewing[axis] && (i === 0 || walk * (p[along] - l[i - 1]![along]) > 0),
    )
  );
}
