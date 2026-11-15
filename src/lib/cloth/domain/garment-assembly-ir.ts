export const GARMENT_ASSEMBLY_IR_VERSION = '0.1.0' as const;

export type Vec2Mm = readonly [xMm: number, yMm: number];

export type PhysicalSurfaceContract =
  | {
      mode: 'sewing-surface';
      seamAllowancePhysical: false;
    }
  | {
      mode: 'cut-surface';
      seamAllowancePhysical: true;
    };

export type PatternContour = {
  readonly id: string;
  readonly role: 'shell' | 'hole';
  readonly closed: true;
  readonly pointsMm: readonly Vec2Mm[];
  readonly sourceCurveIds: readonly string[];
};

export type PatternPiece = {
  readonly id: string;
  readonly name: string;
  readonly cutCount: number;
  readonly grainDegrees: number;
  readonly contours: readonly PatternContour[];
};

export type SeamSide = {
  readonly pieceId: string;
  readonly contourId: string;
  readonly normalizedRange: readonly [from: number, to: number];
  readonly direction: 'forward' | 'reverse';
};

export type SeamDefinition = {
  readonly id: string;
  readonly operationId: string;
  readonly sides: readonly [SeamSide, SeamSide];
  readonly mapping: 'equal' | 'eased' | 'gathered';
  readonly lengthRatio: number;
};

export type AssemblyOperation = {
  readonly id: string;
  readonly order: number;
  readonly kind: 'place' | 'stitch' | 'release-support';
  readonly seamIds: readonly string[];
};

export type MaterialAssignment = {
  readonly id: string;
  readonly pieceIds: readonly string[];
  readonly materialRevision: string;
};

export type GarmentAssemblyIR = {
  readonly schemaVersion: typeof GARMENT_ASSEMBLY_IR_VERSION;
  readonly source: {
    readonly documentId: string;
    readonly revision: string;
    readonly hash: string;
    readonly units: 'mm';
  };
  readonly physicalSurface: PhysicalSurfaceContract;
  readonly pieces: readonly PatternPiece[];
  readonly seams: readonly SeamDefinition[];
  readonly operations: readonly AssemblyOperation[];
  readonly materials: readonly MaterialAssignment[];
};

export type GarmentAssemblyDiagnostic = {
  readonly severity: 'error' | 'warning';
  readonly code:
    | 'duplicate-id'
    | 'invalid-contour'
    | 'invalid-number'
    | 'invalid-range'
    | 'missing-reference'
    | 'operation-order'
    | 'surface-contract';
  readonly message: string;
  readonly sourceId?: string;
};

function duplicateIds(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function isFinitePoint(point: Vec2Mm): boolean {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function rangeIsValid(range: readonly [number, number]): boolean {
  const [from, to] = range;
  return (
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    from >= 0 &&
    from <= 1 &&
    to >= 0 &&
    to <= 1 &&
    from !== to
  );
}

/**
 * Structural preflight only. Geometry quality, seam-length compatibility and winding are compiler
 * responsibilities because they require the resolved curves rather than just this domain contract.
 */
export function validateGarmentAssemblyIR(
  ir: GarmentAssemblyIR,
): readonly GarmentAssemblyDiagnostic[] {
  const diagnostics: GarmentAssemblyDiagnostic[] = [];
  const report = (
    code: GarmentAssemblyDiagnostic['code'],
    message: string,
    sourceId?: string,
    severity: GarmentAssemblyDiagnostic['severity'] = 'error',
  ) => diagnostics.push({ severity, code, message, sourceId });

  if (ir.physicalSurface.mode === 'sewing-surface' && ir.physicalSurface.seamAllowancePhysical) {
    report('surface-contract', 'A sewing-surface package cannot include physical seam allowance.');
  }

  for (const id of duplicateIds(ir.pieces.map((piece) => piece.id))) {
    report('duplicate-id', 'Duplicate piece id.', id);
  }
  for (const id of duplicateIds(ir.seams.map((seam) => seam.id))) {
    report('duplicate-id', 'Duplicate seam id.', id);
  }
  for (const id of duplicateIds(ir.operations.map((operation) => operation.id))) {
    report('duplicate-id', 'Duplicate operation id.', id);
  }
  for (const order of duplicateIds(ir.operations.map((operation) => String(operation.order)))) {
    report('operation-order', 'Two operations share order ' + order + '.');
  }

  const pieces = new Map(ir.pieces.map((piece) => [piece.id, piece]));
  const contours = new Set<string>();
  for (const piece of ir.pieces) {
    if (!Number.isInteger(piece.cutCount) || piece.cutCount < 1) {
      report('invalid-number', 'cutCount must be a positive integer.', piece.id);
    }
    if (!Number.isFinite(piece.grainDegrees)) {
      report('invalid-number', 'grainDegrees must be finite.', piece.id);
    }
    for (const id of duplicateIds(piece.contours.map((contour) => contour.id))) {
      report('duplicate-id', 'Duplicate contour id inside piece.', piece.id + '/' + id);
    }
    for (const contour of piece.contours) {
      const contourKey = piece.id + '/' + contour.id;
      contours.add(contourKey);
      if (contour.pointsMm.length < 3) {
        report('invalid-contour', 'A closed contour needs at least three points.', contourKey);
      }
      if (contour.pointsMm.some((point) => !isFinitePoint(point))) {
        report('invalid-number', 'Contour contains a non-finite coordinate.', contourKey);
      }
    }
  }

  const operations = new Map(ir.operations.map((operation) => [operation.id, operation]));
  const seams = new Map(ir.seams.map((seam) => [seam.id, seam]));

  for (const seam of ir.seams) {
    if (!operations.has(seam.operationId)) {
      report('missing-reference', 'Seam references a missing operation.', seam.id);
    }
    if (!Number.isFinite(seam.lengthRatio) || seam.lengthRatio <= 0) {
      report('invalid-number', 'Seam lengthRatio must be finite and greater than zero.', seam.id);
    }
    seam.sides.forEach((side, sideIndex) => {
      const sideId = seam.id + '/side-' + String(sideIndex);
      if (!pieces.has(side.pieceId)) {
        report('missing-reference', 'Seam side references a missing piece.', sideId);
      }
      if (!contours.has(side.pieceId + '/' + side.contourId)) {
        report('missing-reference', 'Seam side references a missing contour.', sideId);
      }
      if (!rangeIsValid(side.normalizedRange)) {
        report('invalid-range', 'Seam normalizedRange must be distinct values in [0, 1].', sideId);
      }
    });
  }

  for (const operation of ir.operations) {
    for (const seamId of operation.seamIds) {
      const seam = seams.get(seamId);
      if (!seam) {
        report('missing-reference', 'Operation references a missing seam.', operation.id);
      } else if (seam.operationId !== operation.id) {
        report(
          'missing-reference',
          'Operation and seam disagree about their ownership.',
          operation.id + '/' + seamId,
        );
      }
    }
  }

  for (const material of ir.materials) {
    for (const pieceId of material.pieceIds) {
      if (!pieces.has(pieceId)) {
        report('missing-reference', 'Material references a missing piece.', material.id);
      }
    }
  }

  if (ir.physicalSurface.mode === 'cut-surface') {
    report(
      'surface-contract',
      'Cut-surface simulation is outside the beta scope.',
      undefined,
      'warning',
    );
  }

  return diagnostics;
}

function canonicalize(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  switch (typeof value) {
    case 'boolean':
    case 'number':
    case 'string':
      return JSON.stringify(value);
    case 'object': {
      const record = value as Record<string, unknown>;
      return (
        '{' +
        Object.keys(record)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + canonicalize(record[key]))
          .join(',') +
        '}'
      );
    }
    default:
      throw new TypeError('GarmentAssemblyIR contains a non-serializable value.');
  }
}

/**
 * Cheap deterministic identity for fixtures and compile-cache keys. It is not a security hash;
 * production packages should additionally carry the source document's cryptographic digest.
 */
export function garmentAssemblyFingerprint(ir: GarmentAssemblyIR): string {
  const source = canonicalize(ir);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return 'ga0-' + (hash >>> 0).toString(16).padStart(8, '0');
}
