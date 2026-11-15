import type { Vec2Mm } from '../../domain/garment-assembly-ir';

export type BoundaryVertexSource = {
  readonly contourId: string;
  readonly sourceCurveId: string;
  readonly sourceCurveParameterSpace: 'unit' | 'angle-radians' | 'knot-domain';
  readonly sourceCurveT: number;
  readonly normalizedArc: number;
};

export type BoundaryVertex = {
  /** Stable within this compiler input; never derived from the output vertex index. */
  readonly id: string;
  readonly positionMm: Vec2Mm;
  readonly source: BoundaryVertexSource;
};

export type BoundaryRing = {
  readonly id: string;
  readonly role: 'shell' | 'hole';
  readonly vertices: readonly BoundaryVertex[];
};

export type RequiredSeamEndpoint = {
  readonly id: string;
  /** The endpoint must survive as this exact boundary vertex, not a nearest-point projection. */
  readonly boundaryVertexId: string;
};

export type TriangulationOptions = {
  readonly targetEdgeMm: number;
  readonly minInputEdgeMm: number;
  readonly minTriangleAngleDegrees: number;
  readonly maxEdgeRatio: number;
  readonly maxRadiusEdgeRatio: number;
  readonly maxBoundaryErrorMm: number;
  readonly collinearSinTolerance: number;
};

export type ConstrainedTriangulationInput = {
  readonly pieceId: string;
  /** Shell is CCW. Holes are CW. The compiler must reject, not silently reverse, bad winding. */
  readonly shell: BoundaryRing;
  readonly holes: readonly BoundaryRing[];
  readonly seamEndpoints: readonly RequiredSeamEndpoint[];
  /** Pattern-plane warp direction. The triangulator carries it to every triangle material frame. */
  readonly grainDegrees: number;
  readonly options: TriangulationOptions;
};

export type OutputVertexSource =
  | {
      readonly kind: 'boundary';
      readonly boundaryVertexId: string;
      /** Copied, not reconstructed, so the result hash binds native curve provenance. */
      readonly provenance: BoundaryVertexSource;
    }
  | {
      readonly kind: 'boundary-sample';
      /** The exact input constraint subdivided by this derived sample. */
      readonly parentSegment: Readonly<{
        ringId: string;
        startBoundaryVertexId: string;
        endBoundaryVertexId: string;
      }>;
      readonly provenance: BoundaryVertexSource;
    }
  | {
      readonly kind: 'interior';
      readonly generator: 'steiner' | 'seam-endpoint';
      readonly sourceId?: string;
    };

export type TriangulationVertex = {
  readonly positionMm: Vec2Mm;
  readonly source: OutputVertexSource;
};

export type TriangulationBoundaryLoop = {
  readonly inputRingId: string;
  readonly role: 'shell' | 'hole';
  /** Starts at input vertex 0 and follows input order; derived boundary samples may occur between. */
  readonly vertexIndices: Uint32Array;
};

export type TriangulationSeamEndpoint = {
  readonly seamEndpointId: string;
  readonly vertexIndex: number;
};

export type TriangulationIssueCode =
  | 'duplicate-vertex-id'
  | 'duplicate-coordinate'
  | 'tiny-boundary-edge'
  | 'near-collinear-boundary'
  | 'self-intersection'
  | 'duplicate-ring-id'
  | 'wrong-winding'
  | 'hole-outside-shell'
  | 'ring-contact'
  | 'nested-hole'
  | 'invalid-source-map'
  | 'invalid-option'
  | 'orphan-seam-endpoint'
  | 'triangulator-failure'
  | 'triangle-index-out-of-range'
  | 'triangle-outside-domain'
  | 'inverted-triangle'
  | 'degenerate-triangle'
  | 'sliver-triangle'
  | 'duplicate-triangle'
  | 'non-manifold-edge'
  | 'missing-boundary-segment'
  | 'boundary-source-mismatch'
  | 'unexpected-boundary-source'
  | 'duplicate-boundary-loop'
  | 'unexpected-boundary-loop'
  | 'boundary-position-drift'
  | 'hole-not-preserved'
  | 'domain-area-mismatch'
  | 'unexpected-seam-endpoint'
  | 'missing-grain-frame';

export type TriangulationIssue = {
  readonly severity: 'error' | 'warning';
  readonly code: TriangulationIssueCode;
  readonly message: string;
  readonly sourceId?: string;
};

export type MeshQualityReport = {
  readonly verdict: 'pass' | 'fail';
  readonly triangleCount: number;
  readonly trianglesOutsideDomain: number;
  readonly invertedTriangles: number;
  readonly degenerateTriangles: number;
  readonly sliverTriangles: number;
  readonly duplicateTriangles: number;
  readonly nonManifoldEdges: number;
  readonly minTriangleAngleDegrees: number;
  readonly maxEdgeRatio: number;
  readonly maxRadiusEdgeRatio: number;
  readonly maxBoundaryErrorMm: number;
  readonly missingBoundarySegments: number;
  readonly orphanBoundarySources: number;
  readonly orphanSeamEndpoints: number;
  readonly inputDomainAreaMm2: number;
  readonly outputAreaMm2: number;
  readonly areaErrorMm2: number;
  readonly holesPreserved: boolean;
  readonly grainFramesPreserved: boolean;
  readonly issues: readonly TriangulationIssue[];
};

export type ConstrainedTriangulationResult = {
  readonly vertices: readonly TriangulationVertex[];
  /** CCW triples in the pattern plane. */
  readonly triangles: Uint32Array;
  readonly boundaryLoops: readonly TriangulationBoundaryLoop[];
  readonly seamEndpoints: readonly TriangulationSeamEndpoint[];
  /** Per triangle: warp.x, warp.y, weft.x, weft.y. */
  readonly triangleMaterialFrames2: Float32Array;
  /** FNV-1a-64 of canonical geometry, topology and source maps; quality is derived and excluded. */
  readonly deterministicHash: string;
  readonly quality: MeshQualityReport;
};

export type TriangulationAuditCandidate = Omit<
  ConstrainedTriangulationResult,
  'deterministicHash' | 'quality'
>;

export interface ConstrainedTriangulator {
  readonly id: string;
  readonly version: string;
  triangulate(input: ConstrainedTriangulationInput): ConstrainedTriangulationResult;
}

export class UnsupportedTriangulationError extends Error {
  readonly issues: readonly TriangulationIssue[];

  constructor(issues: readonly TriangulationIssue[]) {
    super(
      'Constrained triangulation refused unsupported input: ' +
        issues
          .map((issue) => issue.code + (issue.sourceId ? ' (' + issue.sourceId + ')' : ''))
          .join(', '),
    );
    this.name = 'UnsupportedTriangulationError';
    this.issues = issues;
  }
}
