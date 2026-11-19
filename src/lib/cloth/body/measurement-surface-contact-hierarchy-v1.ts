type Point3 = [number, number, number];

interface TriangleBoundsNode {
  readonly min: Point3;
  readonly max: Point3;
  readonly epsilonM: number;
  readonly count: number;
  readonly children?: readonly [TriangleBoundsNode, TriangleBoundsNode];
  readonly triangles?: readonly number[];
}

export interface MeasurementSurfaceContactHierarchyBudgetV1 {
  readonly maxHierarchyNodes: number;
  readonly maxPairVisits: number;
  readonly maxCandidatePairs: number;
}

/** Enumerates each overlapping expanded triangle pair once, in canonical triangle order. */
export function findMeasurementSurfaceContactCandidatesV1(
  aabbs: Float64Array,
  triangleEpsilonsM: Float64Array,
  partitionTriangleCounts: readonly number[],
  budget: MeasurementSurfaceContactHierarchyBudgetV1,
  firstPartitionAgainstRest = false,
  clearanceM = 0,
) {
  const triangleCount = triangleEpsilonsM.length;
  let hierarchyNodeCount = 0;
  let nodePairVisitCount = 0;
  let trianglePairVisitCount = 0;
  const candidatePairKeys: number[] = [];

  function build(triangles: number[]): TriangleBoundsNode {
    if (++hierarchyNodeCount > budget.maxHierarchyNodes)
      throw new RangeError('Contact hierarchy node budget exceeded.');
    const min: Point3 = [Infinity, Infinity, Infinity];
    const max: Point3 = [-Infinity, -Infinity, -Infinity];
    const centroidMin: Point3 = [...min];
    const centroidMax: Point3 = [...max];
    let epsilonM = 0;
    for (const triangle of triangles) {
      const offset = triangle * 6;
      epsilonM = Math.max(epsilonM, triangleEpsilonsM[triangle]);
      for (let axis = 0; axis < 3; axis++) {
        const low = aabbs[offset + axis];
        const high = aabbs[offset + 3 + axis];
        min[axis] = Math.min(min[axis], low);
        max[axis] = Math.max(max[axis], high);
        centroidMin[axis] = Math.min(centroidMin[axis], (low + high) / 2);
        centroidMax[axis] = Math.max(centroidMax[axis], (low + high) / 2);
      }
    }
    const count = triangles.length;
    if (count <= 4) return { min, max, epsilonM, count, triangles };
    let axis = 0;
    for (let next = 1; next < 3; next++) {
      if (centroidMax[next] - centroidMin[next] > centroidMax[axis] - centroidMin[axis])
        axis = next;
    }
    const centroid = (triangle: number) =>
      aabbs[triangle * 6 + axis] + aabbs[triangle * 6 + 3 + axis];
    triangles.sort((a, b) => centroid(a) - centroid(b) || a - b);
    const middle = Math.floor(count / 2);
    return {
      min,
      max,
      epsilonM,
      count,
      children: [build(triangles.slice(0, middle)), build(triangles.slice(middle))],
    };
  }

  function checkPairBudget() {
    if (nodePairVisitCount + trianglePairVisitCount > budget.maxPairVisits)
      throw new RangeError('Contact hierarchy pair visit budget exceeded.');
  }

  function testTriangles(first: number, second: number) {
    trianglePairVisitCount++;
    checkPairBudget();
    const a = first * 6;
    const b = second * 6;
    const epsilonM = clearanceM + Math.max(triangleEpsilonsM[first], triangleEpsilonsM[second]);
    for (let axis = 0; axis < 3; axis++) {
      if (
        aabbs[a + axis] > aabbs[b + 3 + axis] + epsilonM ||
        aabbs[b + axis] > aabbs[a + 3 + axis] + epsilonM
      )
        return;
    }
    if (candidatePairKeys.length >= budget.maxCandidatePairs)
      throw new RangeError('Contact candidate pair budget exceeded.');
    candidatePairKeys.push(Math.min(first, second) * triangleCount + Math.max(first, second));
  }

  function visit(left: TriangleBoundsNode, right: TriangleBoundsNode) {
    nodePairVisitCount++;
    checkPairBudget();
    const epsilonM = clearanceM + Math.max(left.epsilonM, right.epsilonM);
    for (let axis = 0; axis < 3; axis++) {
      if (
        left.min[axis] > right.max[axis] + epsilonM ||
        right.min[axis] > left.max[axis] + epsilonM
      )
        return;
    }
    if (left === right) {
      if (left.children) {
        const [a, b] = left.children;
        visit(a, a);
        visit(a, b);
        visit(b, b);
      } else {
        const triangles = left.triangles!;
        for (let a = 0; a < triangles.length; a++) {
          for (let b = a + 1; b < triangles.length; b++) testTriangles(triangles[a], triangles[b]);
        }
      }
    } else if (left.triangles && right.triangles) {
      for (const a of left.triangles) {
        for (const b of right.triangles) testTriangles(a, b);
      }
    } else if (left.children && (!right.children || left.count >= right.count)) {
      for (const child of left.children) visit(child, right);
    } else {
      for (const child of right.children!) visit(left, child);
    }
  }

  let triangleOffset = 0;
  const roots = partitionTriangleCounts.map((count) => {
    const root = build(Array.from({ length: count }, (_, i) => triangleOffset + i));
    triangleOffset += count;
    return root;
  });
  if (firstPartitionAgainstRest) {
    for (let b = 1; b < roots.length; b++) visit(roots[0], roots[b]);
  } else {
    for (let a = 0; a < roots.length; a++) {
      for (let b = a; b < roots.length; b++) visit(roots[a], roots[b]);
    }
  }
  candidatePairKeys.sort((a, b) => a - b);
  return { candidatePairKeys, hierarchyNodeCount, nodePairVisitCount, trianglePairVisitCount };
}
