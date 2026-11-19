import robustOrientation from 'robust-orientation';
import type { Vec2Mm } from '../../domain/garment-assembly-ir';
import type {
  BoundaryRing,
  BoundaryVertex,
  ConstrainedTriangulationInput,
  MeshQualityReport,
  TriangulationAuditCandidate,
  TriangulationIssue,
} from './types';
import { UnsupportedTriangulationError } from './types';

const EPSILON = 1e-9;

function cross(a: Vec2Mm, b: Vec2Mm, c: Vec2Mm): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function distance(a: Vec2Mm, b: Vec2Mm): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

function signedArea(vertices: readonly BoundaryVertex[]): number {
  let twiceArea = 0;
  for (let index = 0; index < vertices.length; index += 1) {
    const a = vertices[index].positionMm;
    const b = vertices[(index + 1) % vertices.length].positionMm;
    twiceArea += a[0] * b[1] - b[0] * a[1];
  }
  return twiceArea / 2;
}

function orientation(a: Vec2Mm, b: Vec2Mm, c: Vec2Mm): -1 | 0 | 1 {
  const value = cross(a, b, c);
  if (Math.abs(value) <= EPSILON) return 0;
  return value < 0 ? -1 : 1;
}

function onSegment(a: Vec2Mm, b: Vec2Mm, point: Vec2Mm): boolean {
  return (
    Math.abs(cross(a, b, point)) <= EPSILON &&
    point[0] >= Math.min(a[0], b[0]) - EPSILON &&
    point[0] <= Math.max(a[0], b[0]) + EPSILON &&
    point[1] >= Math.min(a[1], b[1]) - EPSILON &&
    point[1] <= Math.max(a[1], b[1]) + EPSILON
  );
}

function segmentsIntersect(a: Vec2Mm, b: Vec2Mm, c: Vec2Mm, d: Vec2Mm): boolean {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (abC !== abD && cdA !== cdB) return true;
  return (
    (abC === 0 && onSegment(a, b, c)) ||
    (abD === 0 && onSegment(a, b, d)) ||
    (cdA === 0 && onSegment(c, d, a)) ||
    (cdB === 0 && onSegment(c, d, b))
  );
}

function pointInRing(point: Vec2Mm, ring: BoundaryRing): boolean {
  let inside = false;
  for (
    let index = 0, previous = ring.vertices.length - 1;
    index < ring.vertices.length;
    previous = index++
  ) {
    const a = ring.vertices[index].positionMm;
    const b = ring.vertices[previous].positionMm;
    if (onSegment(a, b, point)) return true;
    if (a[1] > point[1] !== b[1] > point[1]) {
      const x = ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0];
      if (point[0] < x) inside = !inside;
    }
  }
  return inside;
}

function ringSegments(ring: BoundaryRing): readonly (readonly [Vec2Mm, Vec2Mm])[] {
  return ring.vertices.map((vertex, index) => [
    vertex.positionMm,
    ring.vertices[(index + 1) % ring.vertices.length].positionMm,
  ]);
}

function pointOnRing(point: Vec2Mm, ring: BoundaryRing): boolean {
  return ringSegments(ring).some(([a, b]) => onSegment(a, b, point));
}

function samePoint(a: Vec2Mm, b: Vec2Mm): boolean {
  return Math.abs(a[0] - b[0]) <= EPSILON && Math.abs(a[1] - b[1]) <= EPSILON;
}

function segmentsProperlyCross(a: Vec2Mm, b: Vec2Mm, c: Vec2Mm, d: Vec2Mm): boolean {
  if (samePoint(a, c) || samePoint(a, d) || samePoint(b, c) || samePoint(b, d)) return false;
  return (
    orientation(a, b, c) * orientation(a, b, d) < 0 &&
    orientation(c, d, a) * orientation(c, d, b) < 0
  );
}

function ringsTouch(a: BoundaryRing, b: BoundaryRing): boolean {
  return ringSegments(a).some(([a0, a1]) =>
    ringSegments(b).some(([b0, b1]) => segmentsIntersect(a0, a1, b0, b1)),
  );
}

function selfIntersects(ring: BoundaryRing): boolean {
  const segments = ringSegments(ring);
  return segments.some(([a, b], index) =>
    segments.some(([c, d], other) => {
      if (index === other) return false;
      if ((index + 1) % segments.length === other || (other + 1) % segments.length === index) {
        return false;
      }
      return segmentsIntersect(a, b, c, d);
    }),
  );
}

function issue(
  issues: TriangulationIssue[],
  code: TriangulationIssue['code'],
  message: string,
  sourceId?: string,
): void {
  issues.push({ severity: 'error', code, message, sourceId });
}

export function preflightTriangulationInput(
  input: ConstrainedTriangulationInput,
): readonly TriangulationIssue[] {
  const issues: TriangulationIssue[] = [];
  const rings = [input.shell, ...input.holes];
  const ids = new Set<string>();
  const ringIds = new Set<string>();
  const coordinates = new Map<string, string>();

  if (input.shell.role !== 'shell') {
    issue(issues, 'invalid-source-map', 'The outer ring must have role shell.', input.shell.id);
  }
  for (const hole of input.holes) {
    if (hole.role !== 'hole') {
      issue(issues, 'invalid-source-map', 'An inner ring must have role hole.', hole.id);
    }
  }
  for (const [name, value] of Object.entries(input.options)) {
    if (!Number.isFinite(value) || value <= 0) {
      issue(issues, 'invalid-option', name + ' must be finite and greater than zero.', name);
    }
  }
  if (!Number.isFinite(input.grainDegrees)) {
    issue(issues, 'invalid-option', 'grainDegrees must be finite.', input.pieceId);
  }

  for (const ring of rings) {
    if (ringIds.has(ring.id)) {
      issue(issues, 'duplicate-ring-id', 'Boundary ring id is not unique.', ring.id);
    }
    ringIds.add(ring.id);
    if (ring.vertices.length < 3) {
      issue(issues, 'invalid-source-map', 'A closed ring needs at least three vertices.', ring.id);
      continue;
    }
    const area = signedArea(ring.vertices);
    const correctWinding = ring.role === 'shell' ? area > 0 : area < 0;
    if (!correctWinding) {
      issue(
        issues,
        'wrong-winding',
        ring.role === 'shell' ? 'Shell must be CCW.' : 'Hole must be CW.',
        ring.id,
      );
    }
    if (selfIntersects(ring)) {
      issue(issues, 'self-intersection', 'Ring is not a simple polygon.', ring.id);
    }
    ring.vertices.forEach((vertex, index) => {
      if (ids.has(vertex.id)) {
        issue(issues, 'duplicate-vertex-id', 'Boundary vertex id is not unique.', vertex.id);
      }
      ids.add(vertex.id);
      const coordinateKey = vertex.positionMm[0] + ',' + vertex.positionMm[1];
      const previousId = coordinates.get(coordinateKey);
      if (previousId !== undefined) {
        issue(
          issues,
          'duplicate-coordinate',
          'Two boundary vertices have the same coordinate: ' +
            previousId +
            ' and ' +
            vertex.id +
            '.',
          vertex.id,
        );
      }
      coordinates.set(coordinateKey, vertex.id);
      const next = ring.vertices[(index + 1) % ring.vertices.length];
      const previous = ring.vertices[(index + ring.vertices.length - 1) % ring.vertices.length];
      const edgeLength = distance(vertex.positionMm, next.positionMm);
      if (edgeLength < input.options.minInputEdgeMm) {
        issue(
          issues,
          'tiny-boundary-edge',
          'Boundary edge is ' + edgeLength.toPrecision(4) + ' mm.',
          vertex.id + '->' + next.id,
        );
      }
      const previousLength = distance(previous.positionMm, vertex.positionMm);
      const turn = cross(previous.positionMm, vertex.positionMm, next.positionMm);
      const sine = Math.abs(turn) / Math.max(previousLength * edgeLength, EPSILON);
      const intentionalSourceCurveSplit =
        previous.source.sourceCurveId === vertex.source.sourceCurveId && sine <= EPSILON;
      // A straight run can contain separate native DXF segments. Keep their shared vertex and
      // source IDs when the middle point is strictly between its neighbours. A nonzero turn
      // still uses the original sine check.
      const segmentDot =
        (vertex.positionMm[0] - previous.positionMm[0]) *
          (next.positionMm[0] - vertex.positionMm[0]) +
        (vertex.positionMm[1] - previous.positionMm[1]) *
          (next.positionMm[1] - vertex.positionMm[1]);
      const forwardStraightSubdivision =
        turn === 0 &&
        segmentDot > 0 &&
        robustOrientation(previous.positionMm, vertex.positionMm, next.positionMm) === 0;
      if (
        sine < input.options.collinearSinTolerance &&
        !intentionalSourceCurveSplit &&
        !forwardStraightSubdivision
      ) {
        issue(
          issues,
          'near-collinear-boundary',
          'Boundary turn is below the configured sine tolerance.',
          vertex.id,
        );
      }
      const source = vertex.source;
      const previousArc = index === 0 ? -1 : ring.vertices[index - 1].source.normalizedArc;
      if (
        source.contourId !== ring.id ||
        !source.sourceCurveId ||
        !Number.isFinite(source.sourceCurveT) ||
        !['unit', 'angle-radians', 'knot-domain'].includes(source.sourceCurveParameterSpace) ||
        (source.sourceCurveParameterSpace === 'unit' &&
          (source.sourceCurveT < 0 || source.sourceCurveT > 1)) ||
        !Number.isFinite(source.normalizedArc) ||
        source.normalizedArc < 0 ||
        source.normalizedArc > 1 ||
        (index === 0 && Math.abs(source.normalizedArc) > EPSILON) ||
        (index > 0 && source.normalizedArc <= previousArc)
      ) {
        issue(
          issues,
          'invalid-source-map',
          'Boundary source mapping is incomplete or invalid.',
          vertex.id,
        );
      }
    });
  }

  input.holes.forEach((hole, index) => {
    if (!pointInRing(hole.vertices[0].positionMm, input.shell)) {
      issue(issues, 'hole-outside-shell', 'Hole is not strictly inside the shell.', hole.id);
    }
    if (ringsTouch(input.shell, hole)) {
      issue(issues, 'ring-contact', 'Hole touches or crosses the shell.', hole.id);
    }
    input.holes.slice(index + 1).forEach((other) => {
      if (ringsTouch(hole, other)) {
        issue(issues, 'ring-contact', 'Holes touch or cross.', hole.id + '/' + other.id);
      } else if (
        pointInRing(hole.vertices[0].positionMm, other) ||
        pointInRing(other.vertices[0].positionMm, hole)
      ) {
        issue(
          issues,
          'nested-hole',
          'Nested or overlapping holes are unsupported.',
          hole.id + '/' + other.id,
        );
      }
    });
  });

  const seamIds = new Set<string>();
  for (const endpoint of input.seamEndpoints) {
    if (seamIds.has(endpoint.id) || !ids.has(endpoint.boundaryVertexId)) {
      issue(
        issues,
        'orphan-seam-endpoint',
        'Seam endpoint id must be unique and reference an exact boundary vertex.',
        endpoint.id,
      );
    }
    seamIds.add(endpoint.id);
  }
  return issues;
}

export function assertTriangulationInputSupported(input: ConstrainedTriangulationInput): void {
  const issues = preflightTriangulationInput(input);
  if (issues.length > 0) throw new UnsupportedTriangulationError(issues);
}

function edgeKey(a: number, b: number): string {
  return a < b ? a + ':' + b : b + ':' + a;
}

function angleDegrees(adjacentA: number, adjacentB: number, opposite: number): number {
  const denominator = 2 * adjacentA * adjacentB;
  if (denominator <= EPSILON) return 0;
  const cosine = Math.max(
    -1,
    Math.min(1, (adjacentA ** 2 + adjacentB ** 2 - opposite ** 2) / denominator),
  );
  return (Math.acos(cosine) * 180) / Math.PI;
}

export function auditTriangulationResult(
  input: ConstrainedTriangulationInput,
  result: TriangulationAuditCandidate,
): MeshQualityReport {
  const issues = [...preflightTriangulationInput(input)];
  const vertexCount = result.vertices.length;
  const triangleCount = result.triangles.length / 3;
  const meshEdges = new Set<string>();
  const meshEdgeIncidence = new Map<string, number>();
  const triangleKeys = new Set<string>();
  let invertedTriangles = 0;
  let trianglesOutsideDomain = 0;
  let degenerateTriangles = 0;
  let sliverTriangles = 0;
  let duplicateTriangles = 0;
  let minTriangleAngleDegrees = 180;
  let maxEdgeRatio = 1;
  let maxRadiusEdgeRatio = 0;
  let outputAreaMm2 = 0;

  if (!Number.isInteger(triangleCount)) {
    issue(issues, 'triangle-index-out-of-range', 'Triangle buffer is not a list of triples.');
  }
  for (let offset = 0; offset + 2 < result.triangles.length; offset += 3) {
    const indices = [
      result.triangles[offset],
      result.triangles[offset + 1],
      result.triangles[offset + 2],
    ];
    if (indices.some((index) => index >= vertexCount)) {
      issue(
        issues,
        'triangle-index-out-of-range',
        'Triangle references a missing vertex.',
        String(offset / 3),
      );
      continue;
    }
    const [a, b, c] = indices.map((index) => result.vertices[index].positionMm) as [
      Vec2Mm,
      Vec2Mm,
      Vec2Mm,
    ];
    const triangleKey = [...indices].sort((left, right) => left - right).join(':');
    if (triangleKeys.has(triangleKey)) {
      duplicateTriangles += 1;
      issue(
        issues,
        'duplicate-triangle',
        'Triangle duplicates an existing face.',
        String(offset / 3),
      );
    }
    triangleKeys.add(triangleKey);
    for (const key of [
      edgeKey(indices[0], indices[1]),
      edgeKey(indices[1], indices[2]),
      edgeKey(indices[2], indices[0]),
    ]) {
      meshEdges.add(key);
      meshEdgeIncidence.set(key, (meshEdgeIncidence.get(key) ?? 0) + 1);
    }
    const signedTwiceArea = cross(a, b, c);
    outputAreaMm2 += signedTwiceArea / 2;
    const centroid: Vec2Mm = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
    const triangleEdges: readonly (readonly [Vec2Mm, Vec2Mm])[] = [
      [a, b],
      [b, c],
      [c, a],
    ];
    const domainRings = [input.shell, ...input.holes];
    const crossesBoundary = triangleEdges.some(([from, to]) =>
      domainRings.some((ring) =>
        ringSegments(ring).some(([start, end]) => segmentsProperlyCross(from, to, start, end)),
      ),
    );
    const vertexOutsideDomain = [a, b, c].some(
      (point) =>
        !pointInRing(point, input.shell) ||
        input.holes.some((hole) => pointInRing(point, hole) && !pointOnRing(point, hole)),
    );
    if (
      crossesBoundary ||
      vertexOutsideDomain ||
      !pointInRing(centroid, input.shell) ||
      input.holes.some((hole) => pointInRing(centroid, hole) && !pointOnRing(centroid, hole))
    ) {
      trianglesOutsideDomain += 1;
      issue(
        issues,
        'triangle-outside-domain',
        'Triangle crosses the boundary or lies outside the shell-minus-holes domain.',
        String(offset / 3),
      );
    }
    if (signedTwiceArea < -EPSILON) {
      invertedTriangles += 1;
      issue(issues, 'inverted-triangle', 'Triangle winding is not CCW.', String(offset / 3));
      continue;
    }
    const lengths = [distance(a, b), distance(b, c), distance(c, a)];
    if (signedTwiceArea <= EPSILON || lengths.some((length) => length <= EPSILON)) {
      degenerateTriangles += 1;
      issue(
        issues,
        'degenerate-triangle',
        'Triangle has zero area or edge length.',
        String(offset / 3),
      );
      continue;
    }
    const angles = [
      angleDegrees(lengths[0], lengths[2], lengths[1]),
      angleDegrees(lengths[0], lengths[1], lengths[2]),
      angleDegrees(lengths[1], lengths[2], lengths[0]),
    ];
    const triangleMinAngle = Math.min(...angles);
    const sorted = [...lengths].sort((left, right) => left - right);
    const edgeRatio = sorted[2] / sorted[0];
    const area = signedTwiceArea / 2;
    const radius = (lengths[0] * lengths[1] * lengths[2]) / (4 * area);
    const radiusEdgeRatio = radius / sorted[0];
    minTriangleAngleDegrees = Math.min(minTriangleAngleDegrees, triangleMinAngle);
    maxEdgeRatio = Math.max(maxEdgeRatio, edgeRatio);
    maxRadiusEdgeRatio = Math.max(maxRadiusEdgeRatio, radiusEdgeRatio);
    if (
      triangleMinAngle < input.options.minTriangleAngleDegrees ||
      edgeRatio > input.options.maxEdgeRatio ||
      radiusEdgeRatio > input.options.maxRadiusEdgeRatio
    ) {
      sliverTriangles += 1;
      issue(
        issues,
        'sliver-triangle',
        'Triangle violates the configured quality bounds.',
        String(offset / 3),
      );
    }
  }

  const inputById = new Map(
    [input.shell, ...input.holes]
      .flatMap((ring) => ring.vertices)
      .map((vertex) => [vertex.id, vertex]),
  );
  const outputByBoundaryId = new Map<string, number[]>();
  result.vertices.forEach((vertex, index) => {
    if (vertex.source.kind !== 'boundary') return;
    const indices = outputByBoundaryId.get(vertex.source.boundaryVertexId) ?? [];
    indices.push(index);
    outputByBoundaryId.set(vertex.source.boundaryVertexId, indices);
  });
  let orphanBoundarySources = 0;
  let maxBoundaryErrorMm = 0;
  for (const [id, vertex] of inputById) {
    const mapped = outputByBoundaryId.get(id) ?? [];
    if (mapped.length !== 1) {
      orphanBoundarySources += 1;
      issue(issues, 'boundary-source-mismatch', 'Boundary source must map exactly once.', id);
      continue;
    }
    const errorMm = distance(vertex.positionMm, result.vertices[mapped[0]].positionMm);
    maxBoundaryErrorMm = Math.max(maxBoundaryErrorMm, errorMm);
    if (errorMm > input.options.maxBoundaryErrorMm) {
      issue(issues, 'boundary-position-drift', 'Boundary vertex moved by ' + errorMm + ' mm.', id);
    }
    const outputSource = result.vertices[mapped[0]].source;
    if (
      outputSource.kind !== 'boundary' ||
      outputSource.provenance.contourId !== vertex.source.contourId ||
      outputSource.provenance.sourceCurveId !== vertex.source.sourceCurveId ||
      outputSource.provenance.sourceCurveParameterSpace !==
        vertex.source.sourceCurveParameterSpace ||
      outputSource.provenance.sourceCurveT !== vertex.source.sourceCurveT ||
      outputSource.provenance.normalizedArc !== vertex.source.normalizedArc
    ) {
      issue(issues, 'boundary-source-mismatch', 'Boundary curve provenance changed.', id);
    }
  }
  for (const id of outputByBoundaryId.keys()) {
    if (inputById.has(id)) continue;
    orphanBoundarySources += 1;
    issue(
      issues,
      'unexpected-boundary-source',
      'Output references a boundary source that is absent from the input.',
      id,
    );
  }

  let missingBoundarySegments = 0;
  let holesPreserved = true;
  const declaredBoundaryEdges = new Set<string>();
  for (const ring of [input.shell, ...input.holes]) {
    const matchingLoops = result.boundaryLoops.filter(
      (candidate) => candidate.inputRingId === ring.id,
    );
    if (matchingLoops.length > 1) {
      issue(
        issues,
        'duplicate-boundary-loop',
        'Input ring must map to exactly one output boundary loop.',
        ring.id,
      );
    }
    const loop = matchingLoops[0];
    if (!loop || loop.role !== ring.role || loop.vertexIndices.length < ring.vertices.length) {
      missingBoundarySegments += ring.vertices.length;
      if (ring.role === 'hole') holesPreserved = false;
      issue(
        issues,
        'missing-boundary-segment',
        'Boundary loop is missing or cannot contain every input constraint vertex.',
        ring.id,
      );
      continue;
    }
    let expectedInputIndex = 0;
    for (let index = 0; index < loop.vertexIndices.length; index += 1) {
      const a = loop.vertexIndices[index];
      const b = loop.vertexIndices[(index + 1) % loop.vertexIndices.length];
      declaredBoundaryEdges.add(edgeKey(a, b));
      const actual = result.vertices[a];
      if (!actual) {
        orphanBoundarySources += 1;
        issue(
          issues,
          'boundary-source-mismatch',
          'Boundary loop references a missing output vertex.',
          ring.id + ':' + index,
        );
      } else if (actual.source.kind === 'boundary') {
        const expected = ring.vertices[expectedInputIndex];
        if (!expected || actual.source.boundaryVertexId !== expected.id) {
          orphanBoundarySources += 1;
          issue(
            issues,
            'boundary-source-mismatch',
            'Boundary loop order lost source identity.',
            expected?.id ?? ring.id,
          );
        } else expectedInputIndex += 1;
      } else if (actual.source.kind === 'boundary-sample') {
        const previous =
          ring.vertices[(expectedInputIndex + ring.vertices.length - 1) % ring.vertices.length];
        const next = ring.vertices[expectedInputIndex % ring.vertices.length];
        if (
          index === 0 ||
          actual.source.parentSegment.ringId !== ring.id ||
          actual.source.parentSegment.startBoundaryVertexId !== previous.id ||
          actual.source.parentSegment.endBoundaryVertexId !== next.id ||
          actual.source.provenance.contourId !== ring.id
        ) {
          orphanBoundarySources += 1;
          issue(
            issues,
            'boundary-source-mismatch',
            'Derived boundary sample lost its parent constraint identity.',
            ring.id + ':' + index,
          );
        }
      } else {
        orphanBoundarySources += 1;
        issue(
          issues,
          'boundary-source-mismatch',
          'Interior vertex appears in a boundary loop.',
          ring.id + ':' + index,
        );
      }
      if (!meshEdges.has(edgeKey(a, b))) {
        missingBoundarySegments += 1;
        if (ring.role === 'hole') holesPreserved = false;
        issue(
          issues,
          'missing-boundary-segment',
          'Required boundary edge is absent.',
          ring.id + ':' + index,
        );
      }
    }
    if (expectedInputIndex !== ring.vertices.length) {
      orphanBoundarySources += ring.vertices.length - expectedInputIndex;
      issue(
        issues,
        'boundary-source-mismatch',
        'Boundary loop omitted one or more input constraint vertices.',
        ring.id,
      );
    }
  }
  const inputRingIds = new Set([input.shell, ...input.holes].map((ring) => ring.id));
  for (const loop of result.boundaryLoops) {
    if (inputRingIds.has(loop.inputRingId)) continue;
    issue(
      issues,
      'unexpected-boundary-loop',
      'Output contains a boundary loop that is absent from the input.',
      loop.inputRingId,
    );
  }

  let nonManifoldEdges = 0;
  for (const [key, incidence] of meshEdgeIncidence) {
    const expectedIncidence = declaredBoundaryEdges.has(key) ? 1 : 2;
    if (incidence === expectedIncidence) continue;
    nonManifoldEdges += 1;
    issue(
      issues,
      'non-manifold-edge',
      `Mesh edge has incidence ${incidence}; expected ${expectedIncidence}.`,
      key,
    );
  }

  const inputDomainAreaMm2 =
    Math.abs(signedArea(input.shell.vertices)) -
    input.holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole.vertices)), 0);
  const areaErrorMm2 = Math.abs(outputAreaMm2 - inputDomainAreaMm2);
  const areaTolerance = Math.max(1e-6, inputDomainAreaMm2 * 1e-8);
  if (areaErrorMm2 > areaTolerance) {
    holesPreserved = false;
    issue(issues, 'domain-area-mismatch', 'Triangle area does not equal shell minus holes.');
  }
  if (!holesPreserved) {
    issue(issues, 'hole-not-preserved', 'One or more hole loops were filled or lost.');
  }

  let orphanSeamEndpoints = 0;
  const inputSeamEndpointIds = new Set(input.seamEndpoints.map((endpoint) => endpoint.id));
  for (const endpoint of input.seamEndpoints) {
    const mapped = result.seamEndpoints.filter(
      (candidate) => candidate.seamEndpointId === endpoint.id,
    );
    if (mapped.length !== 1) {
      orphanSeamEndpoints += 1;
      issue(issues, 'orphan-seam-endpoint', 'Seam endpoint must map exactly once.', endpoint.id);
      continue;
    }
    const vertex = result.vertices[mapped[0].vertexIndex];
    if (
      !vertex ||
      vertex.source.kind !== 'boundary' ||
      vertex.source.boundaryVertexId !== endpoint.boundaryVertexId
    ) {
      orphanSeamEndpoints += 1;
      issue(
        issues,
        'orphan-seam-endpoint',
        'Seam endpoint mapped to the wrong source vertex.',
        endpoint.id,
      );
    }
  }
  for (const endpoint of result.seamEndpoints) {
    if (inputSeamEndpointIds.has(endpoint.seamEndpointId)) continue;
    orphanSeamEndpoints += 1;
    issue(
      issues,
      'unexpected-seam-endpoint',
      'Output contains a seam endpoint that is absent from the input.',
      endpoint.seamEndpointId,
    );
  }

  const radians = (input.grainDegrees * Math.PI) / 180;
  const expectedFrame = [
    Math.cos(radians),
    Math.sin(radians),
    -Math.sin(radians),
    Math.cos(radians),
  ];
  let grainFramesPreserved = result.triangleMaterialFrames2.length === triangleCount * 4;
  if (grainFramesPreserved) {
    grainFramesPreserved = [...result.triangleMaterialFrames2].every(
      (value, index) => Math.abs(value - expectedFrame[index % 4]) <= 1e-6,
    );
  }
  if (!grainFramesPreserved) {
    issue(issues, 'missing-grain-frame', 'Every triangle must carry the input grain frame.');
  }

  return {
    verdict: issues.some((item) => item.severity === 'error') ? 'fail' : 'pass',
    triangleCount: Number.isInteger(triangleCount) ? triangleCount : Math.floor(triangleCount),
    trianglesOutsideDomain,
    invertedTriangles,
    degenerateTriangles,
    sliverTriangles,
    duplicateTriangles,
    nonManifoldEdges,
    minTriangleAngleDegrees: minTriangleAngleDegrees === 180 ? 0 : minTriangleAngleDegrees,
    maxEdgeRatio,
    maxRadiusEdgeRatio,
    maxBoundaryErrorMm,
    missingBoundarySegments,
    orphanBoundarySources,
    orphanSeamEndpoints,
    inputDomainAreaMm2,
    outputAreaMm2,
    areaErrorMm2,
    holesPreserved,
    grainFramesPreserved,
    issues,
  };
}
