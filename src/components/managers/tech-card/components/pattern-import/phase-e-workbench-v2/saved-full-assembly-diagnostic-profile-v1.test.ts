import { describe, expect, it } from 'vitest';

import {
  SAVED_FULL_ASSEMBLY_DIAGNOSTIC_PROFILES_V1,
  resolveSavedFullAssemblyDiagnosticProfileV1,
} from './saved-full-assembly-diagnostic-profile-v1';

describe('saved full assembly diagnostic profile', () => {
  it('publishes one explicit versioned browser-proven descriptor without fixture authority', () => {
    expect(SAVED_FULL_ASSEMBLY_DIAGNOSTIC_PROFILES_V1).toHaveLength(1);
    const profile = resolveSavedFullAssemblyDiagnosticProfileV1(
      'browser-medium-isotropic-diagnostic',
      '1',
    );

    expect(profile).toMatchObject({
      id: 'browser-medium-isotropic-diagnostic',
      revision: '1',
      material: {
        id: 'browser-medium-isotropic-diagnostic-material',
        bendComplianceInvNm: { warp: 0.0006, weft: 0.0006 },
      },
      continuumMaterial: {
        complianceMPerN: { warp: 8e-11, weft: 1.2e-10, shear: 5e-10 },
      },
      materialSolver: { dtS: 1 / 120, solverIterations: 8 },
      claims: {
        diagnosticOnly: true,
        measuredFabric: false,
        anisotropicBendCollapsed: false,
        fixtureTopologyIncluded: false,
        fixtureBomIncluded: false,
        fixturePlacementIncluded: false,
      },
    });
    expect(Object.isFrozen(profile?.material.bendComplianceInvNm)).toBe(true);
    expect(Object.isFrozen(profile?.continuumMaterial.complianceMPerN)).toBe(true);
  });

  it('does not silently select an unknown profile revision', () => {
    expect(
      resolveSavedFullAssemblyDiagnosticProfileV1('browser-medium-isotropic-diagnostic', '2'),
    ).toBeNull();
  });
});
