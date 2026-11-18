import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { describe, expect, it } from 'vitest';

import { BUNDLED_WORK_CATALOG } from '../../operation-work';
import {
  planPatternImportDxfPhaseECadTablePressForProjectionV1,
  preparePatternImportDxfPhaseECadTablePressDraftRowV1,
} from './cad-table-press-authoring-v1';

const cameraMm = { minX: 0, minY: 0, maxX: 100, maxY: 100, padding: 0 };
const projection: PatternImportDxfProductPhaseEAssemblyProjectionV1 = {
  schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  sourceFileId: 'current-dxf',
  sizeToken: 'M',
  joinMode: 'catalog-ordinal-to-phase-d-point',
  geometryPlacementApplied: false,
  expectedCatalogCanonicalSha256: 'a'.repeat(64),
  sizeSelectionCanonicalSha256: 'b'.repeat(64),
  pieces: [
    { pieceId: 'back', pieceLineKey: 'card-back', contours: [], cameraMm },
    { pieceId: 'front', pieceLineKey: 'card-front', contours: [], cameraMm },
  ],
};

const selection = {
  projection,
  techCardId: 11,
  scopeKey: 'main',
  selectedPieceIds: ['front', 'back'],
  pressAction: 'TECH_CARD_PRESS_ACTION_PRESS_FLAT',
  pressEquipment: 'TECH_CARD_PRESS_EQUIPMENT_IRON',
};

describe('Press on a saved pattern set', () => {
  it('retains exact selected line keys and the active projection identity', () => {
    const result = planPatternImportDxfPhaseECadTablePressForProjectionV1({
      ...selection,
      readPieceScopeKeys: () => ['main'],
    });

    expect(result).toMatchObject({
      ok: true,
      candidate: {
        inputKeys: ['card-front', 'card-back'],
        sourceFileId: projection.sourceFileId,
        catalogCanonicalSha256: projection.expectedCatalogCanonicalSha256,
        sizeSelectionCanonicalSha256: projection.sizeSelectionCanonicalSha256,
        scopeKey: 'main',
        pressAction: selection.pressAction,
        pressEquipment: selection.pressEquipment,
      },
    });
  });

  it('supplies the required zone to the ordinary operation writer', () => {
    const selected = planPatternImportDxfPhaseECadTablePressForProjectionV1({
      ...selection,
      readPieceScopeKeys: () => ['main'],
    });
    if (!selected.ok) throw new Error(selected.blocker.detail);

    expect(
      preparePatternImportDxfPhaseECadTablePressDraftRowV1({
        candidate: selected.candidate,
        historyKey: 'press-draft',
        existingHistoryKeys: [],
        workCatalog: BUNDLED_WORK_CATALOG,
      }),
    ).toMatchObject({ ok: true, row: { zone: 'TECH_CARD_GARMENT_ZONE_OTHER' } });
  });

  it.each([[], ['pocketing'], ['main', 'interlining']])(
    'refuses a saved piece without unique membership in Main (%s)',
    (...scopeKeys) => {
      const result = planPatternImportDxfPhaseECadTablePressForProjectionV1({
        ...selection,
        readPieceScopeKeys: (pieceLineKey) =>
          pieceLineKey === 'card-front' ? scopeKeys : ['main'],
      });

      expect(result).toMatchObject({
        ok: false,
        blocker: { code: 'press-material-scope-ambiguous' },
      });
    },
  );
});
