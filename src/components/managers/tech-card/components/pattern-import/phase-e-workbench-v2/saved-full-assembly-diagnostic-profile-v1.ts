import { GARMENT_BOUNDARY_MESH_POLICY_V1 } from 'lib/cloth/mesh/garment-phase2-boundary-recovery-v1';
import { VISUAL_UNCALIBRATED_CLOTH_PRESETS } from 'lib/cloth/material/presets';

import type { SavedFullAssemblyCompileIntentV1 } from './saved-full-assembly-compile-session-v1';

export const SAVED_FULL_ASSEMBLY_DIAGNOSTIC_PROFILE_V1 =
  'saved-full-assembly-diagnostic-profile/1' as const;

export type SavedFullAssemblyDiagnosticProfileV1 = Readonly<{
  schemaVersion: typeof SAVED_FULL_ASSEMBLY_DIAGNOSTIC_PROFILE_V1;
  id: string;
  revision: string;
  label: string;
  description: string;
  material: SavedFullAssemblyCompileIntentV1['compile']['materials'][number];
  continuumMaterial: SavedFullAssemblyCompileIntentV1['compile']['continuumMaterials'][number];
  targetEdgeMm: number;
  exactSeamToleranceMm: number;
  materialPolicy: SavedFullAssemblyCompileIntentV1['compile']['materialPolicy'];
  materialSolver: SavedFullAssemblyCompileIntentV1['compile']['materialSolver'];
  claims: Readonly<{
    diagnosticOnly: true;
    measuredFabric: false;
    isotropicBendAuthoredExplicitly: true;
    anisotropicBendCollapsed: false;
    fixtureTopologyIncluded: false;
    fixtureBomIncluded: false;
    fixturePlacementIncluded: false;
  }>;
}>;

const source = VISUAL_UNCALIBRATED_CLOTH_PRESETS.find(
  ({ id, revision }) => id === 'visual-medium-woven' && revision === '1',
);
if (!source) throw new Error('The proven medium visual material preset is unavailable.');

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

/**
 * Explicit diagnostic profile proven by the generic browser and durable-host lifecycle paths.
 * Only their numeric material/continuum/solver descriptor is reused. No fixture DXF, topology,
 * BOM, body, seam or placement evidence is part of this production descriptor.
 */
const browserMediumV1: SavedFullAssemblyDiagnosticProfileV1 = deepFreeze({
  schemaVersion: SAVED_FULL_ASSEMBLY_DIAGNOSTIC_PROFILE_V1,
  id: 'browser-medium-isotropic-diagnostic',
  revision: '1',
  label: 'Medium diagnostic preview',
  description: 'Uncalibrated visual cloth for the first mannequin preview.',
  material: {
    ...structuredClone(source),
    id: 'browser-medium-isotropic-diagnostic-material',
    revision: '1',
    label: 'Medium diagnostic isotropic-bend material',
    provenance: {
      ...source.provenance,
      description:
        'Uncalibrated numeric browser diagnostic; no garment fit or material-failure claim.',
      sourceReference: 'scripts/cloth/generic-observed-webgpu-v1.tsx',
    },
    // This scalar pair is explicitly authored and proven by the generic browser/durable-host
    // execution paths. It is not an average or collapse of the source anisotropic bend values.
    bendComplianceInvNm: { warp: 0.0006, weft: 0.0006 },
  },
  continuumMaterial: {
    materialId: 'browser-medium-isotropic-diagnostic-material',
    materialRevision: '1',
    complianceMPerN: { warp: 8e-11, weft: 1.2e-10, shear: 5e-10 },
    provenance: {
      calibrationStatus: 'uncalibrated-visual',
      sourceId: 'explicit-isotropic-browser-diagnostic',
    },
  },
  targetEdgeMm: 40,
  exactSeamToleranceMm: 1e-6,
  materialPolicy: {
    version: GARMENT_BOUNDARY_MESH_POLICY_V1,
    policyId: 'browser-medium-isotropic-diagnostic-mesh',
    revision: '1',
    minEdgeMm: 10,
    maxEdgeMm: 50,
  },
  materialSolver: {
    dtS: 1 / 120,
    solverIterations: 8,
    allowUncalibratedVisual: true,
  },
  claims: {
    diagnosticOnly: true,
    measuredFabric: false,
    isotropicBendAuthoredExplicitly: true,
    anisotropicBendCollapsed: false,
    fixtureTopologyIncluded: false,
    fixtureBomIncluded: false,
    fixturePlacementIncluded: false,
  },
});

export const SAVED_FULL_ASSEMBLY_DIAGNOSTIC_PROFILES_V1 = Object.freeze([browserMediumV1]);

export function resolveSavedFullAssemblyDiagnosticProfileV1(
  id: string,
  revision: string,
): SavedFullAssemblyDiagnosticProfileV1 | null {
  return (
    SAVED_FULL_ASSEMBLY_DIAGNOSTIC_PROFILES_V1.find(
      (profile) => profile.id === id && profile.revision === revision,
    ) ?? null
  );
}
