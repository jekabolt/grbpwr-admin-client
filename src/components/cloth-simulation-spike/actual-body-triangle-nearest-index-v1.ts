import {
  ACTUAL_BODY_TRIANGLE_GEOMETRY_LIMITS_V1,
  buildActualBodyTriangleAabbTreeV1,
  captureActualBodyTriangleGeometryV1,
} from 'lib/cloth/body/actual-body-triangle-aabb-tree-v1';

export { captureActualBodyTriangleGeometryV1 };

/**
 * CPU-only, independent V42 nearest-point query on owned body bytes. The query box is an
 * explicit reusable domain, e.g. for one garment region over a bounded sequence of frames.
 * This index does not establish manifoldness, winding, penetration, body identity or GPU parity.
 */
export const ACTUAL_BODY_TRIANGLE_NEAREST_INDEX_V1 =
  'actual-body-triangle-nearest-index/1' as const;
export const ACTUAL_BODY_TRIANGLE_NEAREST_INDEX_LIMITS_V1 = Object.freeze({
  maximumBodyVertices: ACTUAL_BODY_TRIANGLE_GEOMETRY_LIMITS_V1.maximumBodyVertices,
  maximumBodyTriangles: ACTUAL_BODY_TRIANGLE_GEOMETRY_LIMITS_V1.maximumBodyTriangles,
  maximumNodes: 8191,
  maximumAbsoluteCoordinateM: ACTUAL_BODY_TRIANGLE_GEOMETRY_LIMITS_V1.maximumAbsoluteCoordinateM,
  leafTriangleCount: 8,
});

type Vec = readonly [number, number, number];
type Interval = readonly [number, number];
type Box = readonly [Interval, Interval, Interval];
type ClosestPointResult = Readonly<{
  triangleIndex: number;
  x: number;
  y: number;
  z: number;
  distanceSquared: number;
}>;
const L = ACTUAL_BODY_TRIANGLE_NEAREST_INDEX_LIMITS_V1;
const finiteCoordinate = (x: number) =>
  Number.isFinite(x) && Math.abs(x) <= L.maximumAbsoluteCoordinateM;
const constant = (a: number): Interval => [a, a];
const add = (a: Interval, b: Interval): Interval => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Interval, b: Interval): Interval => [a[0] - b[1], a[1] - b[0]];
function mul(a: Interval, b: Interval): Interval {
  const x = a[0] * b[0],
    y = a[0] * b[1],
    z = a[1] * b[0],
    w = a[1] * b[1];
  return [Math.min(x, y, z, w), Math.max(x, y, z, w)];
}
function div(a: Interval, b: Interval): Interval | null {
  if (b[0] <= 0 && b[1] >= 0) return null;
  const x = a[0] / b[0],
    y = a[0] / b[1],
    z = a[1] / b[0],
    w = a[1] / b[1];
  const low = Math.min(x, y, z, w),
    high = Math.max(x, y, z, w);
  return Number.isFinite(low) && Number.isFinite(high) ? [low, high] : null;
}
const axes = [0, 1, 2] as const;
function box(fn: (axis: 0 | 1 | 2) => Interval): Box {
  return [fn(0), fn(1), fn(2)];
}
function union(a: Box, b: Box): Box {
  return box((i) => [Math.min(a[i][0], b[i][0]), Math.max(a[i][1], b[i][1])]);
}
function difference(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dotWithQuery(edge: Vec, domain: Box, origin: Vec): Interval {
  const terms = box((i) => mul(constant(edge[i]), sub(domain[i], constant(origin[i]))));
  return add(add(terms[0], terms[1]), terms[2]);
}

/**
 * Enclose the *computed binary64 point*, including any rounding outside a geometrical
 * triangle AABB. Interval endpoints evaluate the same rounded JS operators in V42 order.
 * +, -, *, / on one sign of divisor attain their extrema at interval corners under
 * monotone IEEE rounding. These are enclosures of machine values, not real arithmetic.
 * A possible singular/overflowing calculation is always searched by the exact leaf.
 */
function reachableBox(a: Vec, b: Vec, c: Vec, domain: Box): Box | null {
  const ab = difference(b, a),
    ac = difference(c, a),
    bc = difference(c, b);
  const d1 = dotWithQuery(ab, domain, a),
    d2 = dotWithQuery(ac, domain, a);
  let result = box((i) => constant(a[i]));
  if (d1[1] <= 0 && d2[1] <= 0) return result;
  const d3 = dotWithQuery(ab, domain, b),
    d4 = dotWithQuery(ac, domain, b);
  result = union(
    result,
    box((i) => constant(b[i])),
  );
  if (d3[0] >= 0 && d4[1] <= d3[0]) return result;
  const vc = sub(mul(d1, d4), mul(d3, d2));
  if (vc[0] <= 0 && d1[1] >= 0 && d3[0] <= 0) {
    // In this branch d1 >= 0, d3 <= 0. When their sum-of-magnitudes
    // denominator is positive the rounded quotient is between zero and one.
    if (d1[0] <= 0 && d3[1] >= 0) return null;
    result = union(
      result,
      box((i) => add(constant(a[i]), mul([0, 1], constant(ab[i])))),
    );
    if (vc[1] <= 0 && d1[0] >= 0 && d3[1] <= 0) return result;
  }
  const d5 = dotWithQuery(ab, domain, c),
    d6 = dotWithQuery(ac, domain, c);
  result = union(
    result,
    box((i) => constant(c[i])),
  );
  if (d6[0] >= 0 && d5[1] <= d6[0]) return result;
  const vb = sub(mul(d5, d2), mul(d1, d6));
  if (vb[0] <= 0 && d2[1] >= 0 && d6[0] <= 0) {
    if (d2[0] <= 0 && d6[1] >= 0) return null;
    result = union(
      result,
      box((i) => add(constant(a[i]), mul([0, 1], constant(ac[i])))),
    );
    if (vb[1] <= 0 && d2[0] >= 0 && d6[1] <= 0) return result;
  }
  const va = sub(mul(d3, d6), mul(d5, d4));
  const d43 = sub(d4, d3),
    d56 = sub(d5, d6);
  if (va[0] <= 0 && d43[1] >= 0 && d56[1] >= 0) {
    // Preserve V42's left-associative denominator, including its cancellation behavior.
    const w = div(d43, sub(add(d43, d5), d6));
    if (!w) return null;
    result = union(
      result,
      box((i) => add(constant(b[i]), mul(w, constant(bc[i])))),
    );
    if (va[1] <= 0 && d43[0] >= 0 && d56[0] >= 0) return result;
  }
  const reciprocal = div(constant(1), add(add(va, vb), vc));
  if (!reciprocal) return null;
  const v = mul(vb, reciprocal),
    w = mul(vc, reciprocal);
  result = union(
    result,
    box((i) => add(add(constant(a[i]), mul(constant(ab[i]), v)), mul(constant(ac[i]), w))),
  );
  return result.every((e) => e.every(Number.isFinite)) ? result : null;
}

// Keep the scalar expression order of the independent signed refresh V42 narrow phase.
function closestPointOnTriangle(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
): Omit<ClosestPointResult, 'triangleIndex'> {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0)
    return { x: ax, y: ay, z: az, distanceSquared: apx * apx + apy * apy + apz * apz };
  const bpx = px - bx;
  const bpy = py - by;
  const bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3)
    return { x: bx, y: by, z: bz, distanceSquared: bpx * bpx + bpy * bpy + bpz * bpz };
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const x = ax + v * abx;
    const y = ay + v * aby;
    const z = az + v * abz;
    return { x, y, z, distanceSquared: (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 };
  }
  const cpx = px - cx;
  const cpy = py - cy;
  const cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6)
    return { x: cx, y: cy, z: cz, distanceSquared: cpx * cpx + cpy * cpy + cpz * cpz };
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const x = ax + w * acx;
    const y = ay + w * acy;
    const z = az + w * acz;
    return { x, y, z, distanceSquared: (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 };
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + d5 - d6);
    const x = bx + w * (cx - bx);
    const y = by + w * (cy - by);
    const z = bz + w * (cz - bz);
    return { x, y, z, distanceSquared: (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 };
  }
  const denominator = 1 / (va + vb + vc);
  const v = vb * denominator;
  const w = vc * denominator;
  const x = ax + abx * v + acx * w;
  const y = ay + aby * v + acy * w;
  const z = az + abz * v + acz * w;
  return { x, y, z, distanceSquared: (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 };
}

type Entry = { ordinal: number; centroid: Vec; bounds: Box };
function readVec(v: Vec): Vec {
  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length !== 3)
    throw new TypeError('A finite 3D coordinate is required.');
  const values = axes.map((i) => Object.getOwnPropertyDescriptor(v, i)?.value);
  if (!values.every(finiteCoordinate))
    throw new RangeError('Coordinate outside the finite body domain.');
  return [values[0], values[1], values[2]];
}
function checkBudget(value: number, max: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > max)
    throw new RangeError('Invalid nearest-query budget.');
}
function lowerDistanceSquared(p: Vec, b: Box): number {
  const distance = (i: 0 | 1 | 2) =>
    p[i] < b[i][0] ? b[i][0] - p[i] : p[i] > b[i][1] ? p[i] - b[i][1] : 0;
  const x = distance(0),
    y = distance(1),
    z = distance(2);
  return x * x + y * y + z * z;
}
export function createActualBodyTriangleNearestIndexV1(
  inputPositionsM: Float32Array,
  inputTriangles: Uint32Array,
  queryMinimumM: Vec,
  queryMaximumM: Vec,
) {
  const min = readVec(queryMinimumM),
    max = readVec(queryMaximumM);
  const domain = box((i) => [min[i], max[i]]);
  if (axes.some((i) => min[i] > max[i])) throw new RangeError('Inverted query domain.');
  const { positions, triangles } = captureActualBodyTriangleGeometryV1(
    inputPositionsM,
    inputTriangles,
  );
  const pLength = positions.length;
  const tLength = triangles.length;
  const entries: Entry[] = [],
    always: number[] = [];
  const at = (ordinal: number, corner: number): Vec => {
    const o = triangles[3 * ordinal + corner] * 3;
    return [positions[o], positions[o + 1], positions[o + 2]];
  };
  for (let i = 0; i < tLength / 3; i++) {
    const a = at(i, 0),
      b = at(i, 1),
      c = at(i, 2);
    const ab = difference(b, a),
      ac = difference(c, a);
    if (
      ab[1] * ac[2] === ab[2] * ac[1] &&
      ab[2] * ac[0] === ab[0] * ac[2] &&
      ab[0] * ac[1] === ab[1] * ac[0]
    )
      throw new RangeError('Degenerate body triangle.');
    const bounds = reachableBox(a, b, c, domain);
    // Bound squared-distance arithmetic too: a skipped leaf must never conceal a
    // nonfinite V42 result that an exhaustive query would encounter.
    const maximumSquaredDistance =
      bounds &&
      axes.reduce<number>((sum, k) => {
        const farthest = Math.max(
          Math.abs(domain[k][0] - bounds[k][1]),
          Math.abs(domain[k][1] - bounds[k][0]),
        );
        return sum + farthest * farthest;
      }, 0);
    if (!bounds || !Number.isFinite(maximumSquaredDistance)) {
      always.push(i);
      continue;
    }
    entries.push({
      ordinal: i,
      centroid: [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3],
      bounds,
    });
  }
  const { nodes } = buildActualBodyTriangleAabbTreeV1(entries, L.leafTriangleCount, L.maximumNodes);
  return Object.freeze({
    version: ACTUAL_BODY_TRIANGLE_NEAREST_INDEX_V1,
    vertexCount: pLength / 3,
    triangleCount: tLength / 3,
    nodeCount: nodes.length,
    alwaysTestTriangleCount: always.length,
    nearest(
      pointM: Vec,
      maxNodeVisits: number = L.maximumNodes,
      maxTriangleTests: number = L.maximumBodyTriangles,
    ) {
      checkBudget(maxNodeVisits, L.maximumNodes);
      checkBudget(maxTriangleTests, L.maximumBodyTriangles);
      const q = readVec(pointM);
      if (axes.some((i) => q[i] < min[i] || q[i] > max[i]))
        throw new RangeError('Point outside indexed query domain.');
      let best: ClosestPointResult | undefined,
        bestDistance = Infinity,
        nodeVisits = 0,
        triangleTests = 0;
      const test = (ordinal: number) => {
        if (triangleTests >= maxTriangleTests)
          throw new RangeError('Nearest triangle-test budget exhausted.');
        triangleTests++;
        const offset = ordinal * 3;
        const a = triangles[offset] * 3,
          b = triangles[offset + 1] * 3,
          c = triangles[offset + 2] * 3;
        const p = closestPointOnTriangle(
          q[0],
          q[1],
          q[2],
          positions[a],
          positions[a + 1],
          positions[a + 2],
          positions[b],
          positions[b + 1],
          positions[b + 2],
          positions[c],
          positions[c + 1],
          positions[c + 2],
        );

        if (!Number.isFinite(p.distanceSquared))
          throw new RangeError('Unsupported closest-point arithmetic.');
        if (
          !best ||
          p.distanceSquared < bestDistance ||
          (p.distanceSquared === bestDistance && ordinal < best.triangleIndex)
        ) {
          bestDistance = p.distanceSquared;
          best = { ...p, triangleIndex: ordinal };
        }
      };
      for (const i of always) test(i);
      const pending = nodes.length ? [0] : [];
      while (pending.length) {
        if (nodeVisits >= maxNodeVisits)
          throw new RangeError('Nearest node-visit budget exhausted.');
        nodeVisits++;
        const n = nodes[pending.pop()!];
        // Distances use the same monotone x*x+y*y+z*z operations as V42. Strict
        // separation leaves exact ties reachable even when a later ordinal was visited first.
        if (lowerDistanceSquared(q, n.bounds) > bestDistance) continue;
        if (n.count) {
          for (let k = n.start; k < n.start + n.count; k++) test(entries[k].ordinal);
        } else {
          const ld = lowerDistanceSquared(q, nodes[n.left].bounds),
            rd = lowerDistanceSquared(q, nodes[n.right].bounds);
          if (ld < rd) pending.push(n.right, n.left);
          else pending.push(n.left, n.right);
        }
      }
      if (!best) throw new Error('No closest triangle found.');
      return Object.freeze({ ...(best as ClosestPointResult), nodeVisits, triangleTests });
    },
  });
}
