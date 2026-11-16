import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_CATALOG_CLAIMS_V1,
  type PatternImportDxfPhaseECadMaterialScopeCatalogResultV1,
} from './cad-material-scope-catalog-v1';
import type { PatternImportDxfPhaseECadMaterialScopePreparationResultV1 } from './cad-material-scope-preparation-v1';
import { PatternImportDxfPhaseECadMaterialScopeProductionControlV1 } from './cad-material-scope-production-control-v1';
import { PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_PERSISTENCE_BLOCKER_V1 } from './cad-table-cross-scope-connect-v1';

const scope = (scopeKey: string, label: string, pieceLineKey: string) =>
  Object.freeze({
    scopeKey,
    label,
    fabricPurpose: scopeKey,
    bomLineKey: `bom:${scopeKey}`,
    isInterlining: false,
    filename: `${scopeKey}.dxf`,
    pieceLineKeys: Object.freeze([pieceLineKey]),
    blockNames: Object.freeze([pieceLineKey]),
  });

const catalog: Extract<PatternImportDxfPhaseECadMaterialScopeCatalogResultV1, { ok: true }> =
  Object.freeze({
    ok: true,
    techCardId: 6,
    scopes: Object.freeze([scope('MAIN', 'Main', 'FRONT'), scope('LINING', 'Lining', 'POCKET')]),
    pieceScopeKeys: Object.freeze({
      FRONT: Object.freeze(['MAIN']),
      POCKET: Object.freeze(['LINING']),
    }),
    blocker: null,
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_MATERIAL_SCOPE_CATALOG_CLAIMS_V1,
  });

const preparation = Object.freeze({
  ok: true,
  catalog,
  // The control reads only the exact prepared scope count; geometry stays owned by preparation.
  scopes: Object.freeze([{ scopeKey: 'MAIN' }, { scopeKey: 'LINING' }]),
}) as unknown as Extract<PatternImportDxfPhaseECadMaterialScopePreparationResultV1, { ok: true }>;

describe('Assembly Table material scope chrome', () => {
  it('keeps cross-scope capability machine-readable without a technical connection banner', () => {
    const markup = renderToStaticMarkup(
      <PatternImportDxfPhaseECadMaterialScopeProductionControlV1
        catalog={catalog}
        preparation={preparation}
        active={{ techCardId: 6, scopeKey: 'MAIN' }}
        preparedScopeKeys={['MAIN', 'LINING']}
        onSelectPreparedScope={() => undefined}
      />,
    );

    expect(markup).toContain(
      `data-cad-cross-scope-connect="${PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CROSS_SCOPE_PERSISTENCE_BLOCKER_V1.code}"`,
    );
    expect(markup).not.toContain('cross-material connections ready');
    expect(markup).not.toContain('same material scope connections only');
    expect(markup).toContain('data-cad-material-scope-browser');
    expect(markup).toContain('Material');
  });
});
