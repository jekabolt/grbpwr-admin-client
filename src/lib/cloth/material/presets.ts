import { CLOTH_MATERIAL_V1, type ClothMaterialV1 } from './cloth-material-v1';

const visualRange = {
  minEdgeM: 0.01,
  maxEdgeM: 0.05,
  minDtS: 1 / 240,
  maxDtS: 1 / 60,
  minIterations: 4,
  maxIterations: 12,
} as const;

const units = {
  length: 'm',
  time: 's',
  mass: 'kg',
  arealDensity: 'kg/m^2',
  triangleCompliance: '1/(N*m)',
  friction: '1',
  velocityRetention: '1',
} as const;

/** Visual placeholders only. These values are not fit-grade material measurements. */
export const VISUAL_UNCALIBRATED_CLOTH_PRESETS: readonly ClothMaterialV1[] = [
  {
    schemaVersion: CLOTH_MATERIAL_V1,
    id: 'visual-light-woven',
    revision: '1',
    label: 'Light woven — visual only',
    provenance: {
      kind: 'preset',
      calibrationStatus: 'uncalibrated-visual',
      description: 'Hand-tuned placeholder for visual development; no physical swatch calibration.',
      sourceReference: 'docs/cloth-simulation/workstreams/material-strain.md#placeholder-presets',
    },
    units,
    mass: { arealDensityKgM2: 0.11 },
    collision: { thicknessM: 0.00025 },
    stretchComplianceInvNm: { warp: 2e-6, weft: 3e-6 },
    shearComplianceInvNm: 2e-5,
    bendComplianceInvNm: { warp: 8e-4, weft: 1.1e-3 },
    friction: { staticCoefficient: 0.35, dynamicCoefficient: 0.25 },
    damping: { velocityRetentionPerStep: 0.995 },
    validSolverRange: visualRange,
  },
  {
    schemaVersion: CLOTH_MATERIAL_V1,
    id: 'visual-medium-woven',
    revision: '1',
    label: 'Medium woven — visual only',
    provenance: {
      kind: 'preset',
      calibrationStatus: 'uncalibrated-visual',
      description: 'Hand-tuned placeholder for visual development; no physical swatch calibration.',
      sourceReference: 'docs/cloth-simulation/workstreams/material-strain.md#placeholder-presets',
    },
    units,
    mass: { arealDensityKgM2: 0.2 },
    collision: { thicknessM: 0.0005 },
    stretchComplianceInvNm: { warp: 1e-6, weft: 1.5e-6 },
    shearComplianceInvNm: 1e-5,
    bendComplianceInvNm: { warp: 4e-4, weft: 6e-4 },
    friction: { staticCoefficient: 0.45, dynamicCoefficient: 0.32 },
    damping: { velocityRetentionPerStep: 0.992 },
    validSolverRange: visualRange,
  },
  {
    schemaVersion: CLOTH_MATERIAL_V1,
    id: 'visual-heavy-woven',
    revision: '1',
    label: 'Heavy woven — visual only',
    provenance: {
      kind: 'preset',
      calibrationStatus: 'uncalibrated-visual',
      description: 'Hand-tuned placeholder for visual development; no physical swatch calibration.',
      sourceReference: 'docs/cloth-simulation/workstreams/material-strain.md#placeholder-presets',
    },
    units,
    mass: { arealDensityKgM2: 0.36 },
    collision: { thicknessM: 0.0012 },
    stretchComplianceInvNm: { warp: 5e-7, weft: 8e-7 },
    shearComplianceInvNm: 6e-6,
    bendComplianceInvNm: { warp: 1.5e-4, weft: 2.5e-4 },
    friction: { staticCoefficient: 0.55, dynamicCoefficient: 0.4 },
    damping: { velocityRetentionPerStep: 0.99 },
    validSolverRange: visualRange,
  },
] as const;
