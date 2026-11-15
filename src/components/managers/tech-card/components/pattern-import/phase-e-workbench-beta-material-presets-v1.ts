import type { PatternImportDxfProductPhaseEMaterialRevisionOptionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_WORKBENCH_BETA_MATERIAL_PRESETS_V1 =
  'pattern-import-dxf-phase-e-workbench-beta-material-presets/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_WORKBENCH_BETA_MATERIAL_PRESETS_CONTRACT_V1 = Object.freeze(
  {
    loadedOnlyForExplicitWorkbench: true,
    canonicalClothPresetIdRetained: true,
    canonicalClothPresetRevisionRetained: true,
    onlyUncalibratedVisualPresetsExposed: true,
    catalogMaterialIdUsedAsRevision: false,
    bomNameUsedAsRevision: false,
    compositionOrGsmSelectsPreset: false,
    explicitUserSelectionRequired: true,
    productionMeasuredMaterialClaimed: false,
  } as const,
);

let optionsPromise: Promise<
  readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[]
> | null = null;

/**
 * Loads the canonical visual-only cloth presets behind the explicit workbench boundary. The
 * returned IDs/revisions are copied byte-for-byte from ClothMaterialV1; product BOM metadata never
 * participates in option identity or automatic selection.
 */
export function loadPatternImportDxfPhaseEWorkbenchBetaMaterialPresetsV1(): Promise<
  readonly PatternImportDxfProductPhaseEMaterialRevisionOptionV1[]
> {
  if (optionsPromise) return optionsPromise;
  optionsPromise = Promise.all([
    import('lib/cloth/material/presets'),
    import('lib/cloth/material/cloth-material-v1'),
  ])
    .then(([presetModule, materialModule]) => {
      const seen = new Set<string>();
      const options = presetModule.VISUAL_UNCALIBRATED_CLOTH_PRESETS.map((preset) => {
        if (
          materialModule.validateClothMaterialV1(preset).length > 0 ||
          preset.provenance.kind !== 'preset' ||
          preset.provenance.calibrationStatus !== 'uncalibrated-visual' ||
          !preset.id ||
          !preset.revision ||
          seen.has(`${preset.id}@${preset.revision}`)
        )
          throw new TypeError('The canonical Phase-E beta material preset catalog is invalid.');
        seen.add(`${preset.id}@${preset.revision}`);
        return Object.freeze({
          id: preset.id,
          label: preset.label,
          materialRevision: preset.revision,
        });
      });
      if (!options.length)
        throw new TypeError('The canonical Phase-E beta material preset catalog is empty.');
      return Object.freeze(options);
    })
    .catch((error: unknown) => {
      optionsPromise = null;
      throw error;
    });
  return optionsPromise;
}
