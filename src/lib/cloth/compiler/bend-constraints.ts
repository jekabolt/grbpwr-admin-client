import type { ClothMeshIR } from '../mesh/cloth-mesh-ir';

export type BendConstraintDiagnosticCode =
  | 'boundary-edge'
  | 'degenerate-rest-triangle'
  | 'duplicate-triangle'
  | 'inconsistent-winding'
  | 'invalid-index-buffer'
  | 'no-interior-edge'
  | 'non-manifold-edge'
  | 'out-of-range-index'
  | 'repeated-triangle-index';

export type BendConstraintDiagnostic = {
  readonly severity: 'warning' | 'error';
  readonly code: BendConstraintDiagnosticCode;
  readonly message: string;
  readonly edge?: readonly [number, number];
  readonly triangleIndex?: number;
};

/**
 * GPU-owned bend buffers prepared for a later SimulationPackage revision. Every constraint writes
 * all four vertices in `vertexQuads`, so graph colors are conflict-free across the complete quad.
 */
export type CompiledBendConstraints = {
  readonly model: 'xpbd-signed-dihedral-v0';
  readonly constraintCount: number;
  readonly colorCount: number;
  /** Consecutive [edgeA, edgeB, oppositeA, oppositeB] quads, grouped by graph color. */
  readonly vertexQuads: Uint32Array;
  /** Signed rest angle in radians for each grouped quad. Planar ClothMeshIR v0 produces zero. */
  readonly restAnglesRad: Float32Array;
  /** Consecutive [offset, count] values, one pair per graph color. */
  readonly colorRanges: Uint32Array;
};

export type CompileBendConstraintsResult =
  | {
      readonly ok: true;
      readonly constraints: CompiledBendConstraints;
      readonly diagnostics: readonly BendConstraintDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly BendConstraintDiagnostic[];
    };

type Incident = {
  readonly from: number;
  readonly to: number;
  readonly opposite: number;
  readonly triangleIndex: number;
};

type EdgeRecord = {
  readonly first: number;
  readonly second: number;
  readonly incidents: Incident[];
};

type SourceConstraint = {
  readonly vertices: readonly [number, number, number, number];
};

const MIN_DOUBLE_AREA_MM2 = 1e-8;

function diagnostic(
  severity: BendConstraintDiagnostic['severity'],
  code: BendConstraintDiagnosticCode,
  message: string,
  edge?: readonly [number, number],
  triangleIndex?: number,
): BendConstraintDiagnostic {
  return { severity, code, message, edge, triangleIndex };
}

function edgeKey(first: number, second: number): string {
  return Math.min(first, second) + ':' + Math.max(first, second);
}

function triangleKey(first: number, second: number, third: number): string {
  return [first, second, third].sort((left, right) => left - right).join(':');
}

function addIncident(
  edges: Map<string, EdgeRecord>,
  from: number,
  to: number,
  opposite: number,
  triangleIndex: number,
): void {
  const first = Math.min(from, to);
  const second = Math.max(from, to);
  const key = edgeKey(first, second);
  const record = edges.get(key) ?? { first, second, incidents: [] };
  record.incidents.push({ from, to, opposite, triangleIndex });
  edges.set(key, record);
}

function colorConstraints(constraints: readonly SourceConstraint[]): {
  readonly grouped: readonly SourceConstraint[];
  readonly colorRanges: Uint32Array;
} {
  const colorsAtVertex = new Map<number, Set<number>>();
  const colorsFor = (vertex: number): Set<number> => {
    const existing = colorsAtVertex.get(vertex);
    if (existing !== undefined) return existing;
    const colors = new Set<number>();
    colorsAtVertex.set(vertex, colors);
    return colors;
  };
  const colors: SourceConstraint[][] = [];

  for (const constraint of constraints) {
    const occupied = constraint.vertices.map(colorsFor);
    let color = 0;
    while (occupied.some((used) => used.has(color))) color += 1;
    colors[color] ??= [];
    colors[color].push(constraint);
    occupied.forEach((used) => used.add(color));
  }

  const colorRanges = new Uint32Array(colors.length * 2);
  let offset = 0;
  colors.forEach((constraintsInColor, color) => {
    colorRanges[color * 2] = offset;
    colorRanges[color * 2 + 1] = constraintsInColor.length;
    offset += constraintsInColor.length;
  });
  return { grouped: colors.flat(), colorRanges };
}

/**
 * Builds signed-dihedral topology from manifold interior edges. Boundary edges are deliberately
 * omitted and diagnosed. Invalid, degenerate, duplicate, non-manifold or inconsistently wound
 * topology fails atomically: no partial constraint buffers are returned.
 */
export function compileBendConstraints(
  mesh: Pick<ClothMeshIR, 'restPositions2Mm' | 'triangles'>,
): CompileBendConstraintsResult {
  const diagnostics: BendConstraintDiagnostic[] = [];
  const positions = mesh.restPositions2Mm;
  const triangles = mesh.triangles;
  if (positions.length % 2 !== 0 || triangles.length % 3 !== 0) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'error',
          'invalid-index-buffer',
          'Rest positions must contain vec2 values and triangles must contain index triples.',
        ),
      ],
    };
  }

  const particleCount = positions.length / 2;
  const edges = new Map<string, EdgeRecord>();
  const triangleKeys = new Map<string, number>();

  for (let triangleIndex = 0; triangleIndex < triangles.length / 3; triangleIndex += 1) {
    const offset = triangleIndex * 3;
    const first = triangles[offset];
    const second = triangles[offset + 1];
    const third = triangles[offset + 2];
    const vertices = [first, second, third] as const;
    if (vertices.some((vertex) => vertex >= particleCount)) {
      diagnostics.push(
        diagnostic(
          'error',
          'out-of-range-index',
          'Triangle references a vertex outside the rest-position buffer.',
          undefined,
          triangleIndex,
        ),
      );
      continue;
    }
    if (new Set(vertices).size !== 3) {
      diagnostics.push(
        diagnostic(
          'error',
          'repeated-triangle-index',
          'Triangle must reference three distinct vertices.',
          undefined,
          triangleIndex,
        ),
      );
      continue;
    }

    const key = triangleKey(first, second, third);
    const duplicate = triangleKeys.get(key);
    if (duplicate !== undefined) {
      diagnostics.push(
        diagnostic(
          'error',
          'duplicate-triangle',
          'Triangle duplicates the undirected vertices of triangle ' + String(duplicate) + '.',
          undefined,
          triangleIndex,
        ),
      );
      continue;
    }
    triangleKeys.set(key, triangleIndex);

    const ax = positions[first * 2];
    const ay = positions[first * 2 + 1];
    const bx = positions[second * 2];
    const by = positions[second * 2 + 1];
    const cx = positions[third * 2];
    const cy = positions[third * 2 + 1];
    const doubleArea = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (!Number.isFinite(doubleArea) || Math.abs(doubleArea) <= MIN_DOUBLE_AREA_MM2) {
      diagnostics.push(
        diagnostic(
          'error',
          'degenerate-rest-triangle',
          'Triangle has zero or non-finite rest area.',
          undefined,
          triangleIndex,
        ),
      );
      continue;
    }

    addIncident(edges, first, second, third, triangleIndex);
    addIncident(edges, second, third, first, triangleIndex);
    addIncident(edges, third, first, second, triangleIndex);
  }

  const orderedEdges = [...edges.values()].sort(
    (left, right) => left.first - right.first || left.second - right.second,
  );
  const constraints: SourceConstraint[] = [];
  for (const edge of orderedEdges) {
    const edgeTuple = [edge.first, edge.second] as const;
    if (edge.incidents.length === 1) {
      diagnostics.push(
        diagnostic(
          'warning',
          'boundary-edge',
          'Boundary edge has no adjacent triangle pair and emits no bend constraint.',
          edgeTuple,
          edge.incidents[0].triangleIndex,
        ),
      );
      continue;
    }
    if (edge.incidents.length !== 2) {
      diagnostics.push(
        diagnostic(
          'error',
          'non-manifold-edge',
          'Interior bend edge must have exactly two incident triangles.',
          edgeTuple,
        ),
      );
      continue;
    }

    const forward = edge.incidents.find(
      (incident) => incident.from === edge.first && incident.to === edge.second,
    );
    const reverse = edge.incidents.find(
      (incident) => incident.from === edge.second && incident.to === edge.first,
    );
    if (!forward || !reverse) {
      diagnostics.push(
        diagnostic(
          'error',
          'inconsistent-winding',
          'Adjacent triangles must traverse their shared edge in opposite directions.',
          edgeTuple,
        ),
      );
      continue;
    }
    if (forward.opposite === reverse.opposite) {
      diagnostics.push(
        diagnostic(
          'error',
          'non-manifold-edge',
          'Adjacent triangles cannot share the same opposite vertex.',
          edgeTuple,
        ),
      );
      continue;
    }
    constraints.push({
      vertices: [edge.first, edge.second, forward.opposite, reverse.opposite],
    });
  }

  if (constraints.length === 0) {
    diagnostics.push(
      diagnostic(
        'error',
        'no-interior-edge',
        'Mesh contains no valid manifold interior edge for bend constraints.',
      ),
    );
  }
  if (diagnostics.some((entry) => entry.severity === 'error')) {
    return { ok: false, diagnostics };
  }

  const { grouped, colorRanges } = colorConstraints(constraints);
  const vertexQuads = new Uint32Array(grouped.length * 4);
  grouped.forEach((constraint, index) => vertexQuads.set(constraint.vertices, index * 4));

  return {
    ok: true,
    diagnostics,
    constraints: {
      model: 'xpbd-signed-dihedral-v0',
      constraintCount: grouped.length,
      colorCount: colorRanges.length / 2,
      vertexQuads,
      restAnglesRad: new Float32Array(grouped.length),
      colorRanges,
    },
  };
}
