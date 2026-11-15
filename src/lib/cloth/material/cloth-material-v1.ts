export const CLOTH_MATERIAL_V1 = 'cloth-material/v1' as const;

export type ClothMaterialProvenanceV1 = {
  readonly kind: 'preset' | 'measured' | 'estimated';
  readonly calibrationStatus: 'uncalibrated-visual' | 'measured' | 'estimated';
  readonly description: string;
  readonly sourceReference: string;
  readonly calibratedAtIso?: string;
};

export type ClothMaterialV1 = {
  readonly schemaVersion: typeof CLOTH_MATERIAL_V1;
  readonly id: string;
  readonly revision: string;
  readonly label: string;
  readonly provenance: ClothMaterialProvenanceV1;
  readonly units: {
    readonly length: 'm';
    readonly time: 's';
    readonly mass: 'kg';
    readonly arealDensity: 'kg/m^2';
    /** Compliance for the dimensionless triangle constraints documented by the CPU oracle. */
    readonly triangleCompliance: '1/(N*m)';
    readonly friction: '1';
    readonly velocityRetention: '1';
  };
  readonly mass: {
    readonly arealDensityKgM2: number;
  };
  readonly collision: {
    readonly thicknessM: number;
  };
  readonly stretchComplianceInvNm: {
    readonly warp: number;
    readonly weft: number;
  };
  readonly shearComplianceInvNm: number;
  readonly bendComplianceInvNm: {
    readonly warp: number;
    readonly weft: number;
  };
  readonly friction: {
    readonly staticCoefficient: number;
    readonly dynamicCoefficient: number;
  };
  readonly damping: {
    /** Multiplier applied during velocity reconstruction once per solver step. */
    readonly velocityRetentionPerStep: number;
  };
  readonly validSolverRange: {
    readonly minEdgeM: number;
    readonly maxEdgeM: number;
    readonly minDtS: number;
    readonly maxDtS: number;
    readonly minIterations: number;
    readonly maxIterations: number;
  };
};

export function validateClothMaterialV1(material: ClothMaterialV1): readonly string[] {
  const errors: string[] = [];
  const finitePositive = (value: number, path: string) => {
    if (!Number.isFinite(value) || value <= 0) errors.push(path + ' must be finite and > 0.');
  };
  const finiteNonNegative = (value: number, path: string) => {
    if (!Number.isFinite(value) || value < 0) errors.push(path + ' must be finite and >= 0.');
  };

  if (material.schemaVersion !== CLOTH_MATERIAL_V1) errors.push('Unsupported schemaVersion.');
  if (material.id.trim().length === 0) errors.push('id must not be empty.');
  if (material.revision.trim().length === 0) errors.push('revision must not be empty.');
  if (material.label.trim().length === 0) errors.push('label must not be empty.');
  const expectedUnits: ClothMaterialV1['units'] = {
    length: 'm',
    time: 's',
    mass: 'kg',
    arealDensity: 'kg/m^2',
    triangleCompliance: '1/(N*m)',
    friction: '1',
    velocityRetention: '1',
  };
  for (const unit of Object.keys(expectedUnits) as (keyof ClothMaterialV1['units'])[]) {
    if (material.units[unit] !== expectedUnits[unit]) {
      errors.push('units.' + unit + ' must be ' + expectedUnits[unit] + '.');
    }
  }
  if (material.provenance.description.trim().length === 0) {
    errors.push('provenance.description must not be empty.');
  }
  if (material.provenance.sourceReference.trim().length === 0) {
    errors.push('provenance.sourceReference must not be empty.');
  }
  const { kind, calibrationStatus, calibratedAtIso } = material.provenance;
  if (kind === 'preset' && calibrationStatus !== 'uncalibrated-visual') {
    errors.push('preset provenance must be marked uncalibrated-visual.');
  }
  if (kind === 'measured' && calibrationStatus !== 'measured') {
    errors.push('measured provenance must have measured calibrationStatus.');
  }
  if (kind === 'estimated' && calibrationStatus !== 'estimated') {
    errors.push('estimated provenance must have estimated calibrationStatus.');
  }
  if (calibrationStatus === 'measured') {
    if (calibratedAtIso === undefined || !Number.isFinite(Date.parse(calibratedAtIso))) {
      errors.push('measured provenance requires a valid calibratedAtIso timestamp.');
    }
  } else if (calibratedAtIso !== undefined) {
    errors.push('calibratedAtIso is only valid for measured provenance.');
  }

  finitePositive(material.mass.arealDensityKgM2, 'mass.arealDensityKgM2');
  finitePositive(material.collision.thicknessM, 'collision.thicknessM');
  finiteNonNegative(material.stretchComplianceInvNm.warp, 'stretchComplianceInvNm.warp');
  finiteNonNegative(material.stretchComplianceInvNm.weft, 'stretchComplianceInvNm.weft');
  finiteNonNegative(material.shearComplianceInvNm, 'shearComplianceInvNm');
  finiteNonNegative(material.bendComplianceInvNm.warp, 'bendComplianceInvNm.warp');
  finiteNonNegative(material.bendComplianceInvNm.weft, 'bendComplianceInvNm.weft');
  finiteNonNegative(material.friction.staticCoefficient, 'friction.staticCoefficient');
  finiteNonNegative(material.friction.dynamicCoefficient, 'friction.dynamicCoefficient');
  if (material.friction.dynamicCoefficient > material.friction.staticCoefficient) {
    errors.push('friction.dynamicCoefficient must not exceed staticCoefficient.');
  }
  const retention = material.damping.velocityRetentionPerStep;
  if (!Number.isFinite(retention) || retention < 0 || retention > 1) {
    errors.push('damping.velocityRetentionPerStep must be in [0, 1].');
  }

  const range = material.validSolverRange;
  finitePositive(range.minEdgeM, 'validSolverRange.minEdgeM');
  finitePositive(range.maxEdgeM, 'validSolverRange.maxEdgeM');
  finitePositive(range.minDtS, 'validSolverRange.minDtS');
  finitePositive(range.maxDtS, 'validSolverRange.maxDtS');
  if (range.maxEdgeM < range.minEdgeM) errors.push('validSolverRange edge bounds are reversed.');
  if (range.maxDtS < range.minDtS) errors.push('validSolverRange dt bounds are reversed.');
  if (!Number.isInteger(range.minIterations) || range.minIterations < 1) {
    errors.push('validSolverRange.minIterations must be a positive integer.');
  }
  if (!Number.isInteger(range.maxIterations) || range.maxIterations < range.minIterations) {
    errors.push('validSolverRange.maxIterations must be an integer >= minIterations.');
  }
  return errors;
}
