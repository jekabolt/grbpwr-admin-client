import { describe, expect, it } from 'vitest';

import {
  projectPatternImportDxfPhaseECadWorkbenchColorwaysV1,
  resolvePatternImportDxfPhaseECadWorkbenchColorwayContourPreviewV1,
  resolvePatternImportDxfPhaseECadWorkbenchColorwayPreviewV1,
} from './cad-workbench-bom-visual-authority-v1';

describe('Assembly Table colorway preview authority', () => {
  it('resolves only a saved card colorway and keeps its normalized swatch display-only', () => {
    const projected = projectPatternImportDxfPhaseECadWorkbenchColorwaysV1({
      expectedTechCardId: 6,
      card: {
        id: 6,
        colorways: [
          {
            colorwayId: 10,
            status: 'TECH_CARD_COLORWAY_STATUS_ACTIVE',
            devName: 'Black',
            devHex: '111111',
          },
          {
            colorwayId: 11,
            status: 'TECH_CARD_COLORWAY_STATUS_ACTIVE',
            devName: 'Natural',
            devHex: '#e5ddc8',
          },
        ],
      },
    });

    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    const preview = resolvePatternImportDxfPhaseECadWorkbenchColorwayPreviewV1(
      projected.options,
      11,
    );
    expect(preview).toEqual({
      colorwayId: 11,
      label: 'Natural',
      swatchHex: '#e5ddc8',
    });
    expect(
      resolvePatternImportDxfPhaseECadWorkbenchColorwayContourPreviewV1(preview, {
        role: 'cut-boundary',
        closed: true,
      }),
    ).toEqual({ fill: '#e5ddc8', fillOpacity: 0.18 });
    expect(
      resolvePatternImportDxfPhaseECadWorkbenchColorwayContourPreviewV1(preview, {
        role: 'sewing-boundary',
        closed: true,
      }),
    ).toEqual({ fill: 'none', fillOpacity: 0 });
    expect(
      resolvePatternImportDxfPhaseECadWorkbenchColorwayContourPreviewV1(preview, {
        role: 'hole',
        closed: true,
      }),
    ).toEqual({ fill: 'none', fillOpacity: 0 });
    expect(resolvePatternImportDxfPhaseECadWorkbenchColorwayPreviewV1(projected.options, 99)).toBe(
      null,
    );
  });

  it('keeps a saved colorway selectable but unpainted when it has no valid swatch', () => {
    const projected = projectPatternImportDxfPhaseECadWorkbenchColorwaysV1({
      expectedTechCardId: 11,
      card: {
        id: 11,
        colorways: [
          {
            colorwayId: 21,
            status: 'TECH_CARD_COLORWAY_STATUS_ACTIVE',
            devName: 'Unspecified',
            devHex: 'not-a-colour',
          },
        ],
      },
    });

    expect(projected.ok).toBe(true);
    if (!projected.ok) return;
    expect(
      resolvePatternImportDxfPhaseECadWorkbenchColorwayPreviewV1(projected.options, 21),
    ).toEqual({
      colorwayId: 21,
      label: 'Unspecified',
      swatchHex: null,
    });
  });
});
