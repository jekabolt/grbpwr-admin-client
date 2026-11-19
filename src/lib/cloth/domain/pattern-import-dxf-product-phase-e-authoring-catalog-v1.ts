import type { CardDraft } from '../../pattern-import/types';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from './pattern-import-dxf-product-draft-phase-d-selection-v1';

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1 =
  'pattern-import-dxf-product-phase-e-authoring-catalog/1' as const;

export type PatternImportDxfProductPhaseEAuthoringCatalogV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1;
  techCardId: number;
  scopeKey: string;
  sizeToken: string;
  sourceFileId: string;
  sizeSelectionCanonicalSha256: string;
  pieces: readonly Readonly<{
    pieceId: string;
    pieceLineKey: string;
    contours: readonly Readonly<{
      contourId: string;
      role: 'sewing-boundary' | 'cut-boundary' | 'hole';
      geometry: Readonly<{ kind: 'cut' | 'seam' | 'cut-loop'; index?: number }>;
      closed: boolean;
      boundaryVertices: readonly Readonly<{
        ordinal: number;
        vertexId: string;
        normalizedArc: number;
      }>[];
    }>[];
  }>[];
  requiredExplicitFields: readonly [
    'documentId-and-revision',
    'physical-surface',
    'two-seam-sides-and-anchor-ranges',
    'side-directions',
    'mapping-and-length-ratio',
    'operation-stage-and-order',
    'immutable-material-revisions',
    'tolerances',
  ];
  canonicalSha256: string;
  geometryCoordinatesExposed: false;
  rawDxfExposed: false;
  assemblyInferred: false;
  productionReady: false;
}>;

export type PatternImportDxfProductPhaseEAuthoringCatalogResultV1 =
  | Readonly<{
      ok: true;
      catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      catalog: null;
      blockers: readonly [
        Readonly<{
          code:
            | 'invalid-catalog-request'
            | 'phase-d-selection-blocked'
            | 'scope-binding-blocked'
            | 'piece-line-binding-blocked'
            | 'contour-binding-blocked'
            | 'sha256-unavailable';
          detail: string;
        }>,
      ];
    }>;

export const PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_CONTRACT_V1 = Object.freeze({
  freshDraftPhaseDSelectionRequired: true,
  exactPieceLineBindingRequired: true,
  sourceBoundaryVertexIdsExposed: true,
  geometryCoordinatesExposed: false,
  rawDxfExposed: false,
  seamPairingInferred: false,
  directionInferred: false,
  physicalSurfaceInferred: false,
  materialRevisionInferred: false,
  operationOrderInferred: false,
  productionReady: false,
} as const);

const REQUIRED_EXPLICIT_FIELDS = Object.freeze([
  'documentId-and-revision',
  'physical-surface',
  'two-seam-sides-and-anchor-ranges',
  'side-directions',
  'mapping-and-length-ratio',
  'operation-stage-and-order',
  'immutable-material-revisions',
  'tolerances',
] as const);

const textEncoder = new TextEncoder();
const preparedCatalogs = new WeakSet<PatternImportDxfProductPhaseEAuthoringCatalogV1>();

/** The current module built and sealed this immutable catalog from exact Phase-D replay. */
export function isPreparedPatternImportDxfProductPhaseEAuthoringCatalogV1(
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
): boolean {
  return preparedCatalogs.has(catalog);
}

function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new TypeError();
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (!value || typeof value !== 'object') throw new TypeError();
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocked(
  code: Extract<
    PatternImportDxfProductPhaseEAuthoringCatalogResultV1,
    { ok: false }
  >['blockers'][0]['code'],
  detail: string,
): PatternImportDxfProductPhaseEAuthoringCatalogResultV1 {
  return Object.freeze({
    ok: false as const,
    catalog: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as Extract<
      PatternImportDxfProductPhaseEAuthoringCatalogResultV1,
      { ok: false }
    >['blockers'],
  });
}

export async function computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
  payload: Omit<PatternImportDxfProductPhaseEAuthoringCatalogV1, 'canonicalSha256'>,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const digest = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        textEncoder.encode(
          `pattern-import-dxf-product-phase-e-authoring-catalog-v1\0${canonical(payload)}`,
        ),
      ),
    );
    if (digest.byteLength !== 32) return null;
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Builds the exact finite choice catalog an explicit authoring producer needs. It exposes stable
 * identities and boundary order only; it never guesses a seam or promotes card assembly rows.
 */
export async function buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
  draft: CardDraft,
  scopeKey: string,
  sizeToken: string,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductPhaseEAuthoringCatalogResultV1> {
  if (!draft || !scopeKey || !sizeToken)
    return blocked(
      'invalid-catalog-request',
      'Draft, explicit scope and explicit size are required.',
    );
  const selected = await selectPatternImportDxfProductDraftPhaseDSizeV1(
    draft,
    scopeKey,
    sizeToken,
    crypto,
  );
  if (!selected.ok)
    return blocked(
      'phase-d-selection-blocked',
      `${selected.blockers[0].code}: ${selected.blockers[0].detail}`,
    );
  const selection = selected.selection;
  const scopes = draft.scopes.filter(({ target }) => target.scopeKey === scopeKey);
  if (scopes.length !== 1)
    return blocked('scope-binding-blocked', 'The authored scope must resolve to one draft scope.');
  const manifest = scopes[0].manifest;
  const carrier = selection.pipeline.carrier;
  if (!manifest || !carrier)
    return blocked(
      'contour-binding-blocked',
      'Selected Phase-D identity carrier and product manifest are required.',
    );

  const pieces: PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number][] = [];
  for (const selectedPieceId of selection.selection.pieceIds) {
    const carried = carrier.pieces.filter(
      ({ pieceId, sizeToken: carriedSize }) =>
        pieceId === selectedPieceId && carriedSize === sizeToken,
    );
    if (carried.length !== 1)
      return blocked(
        'contour-binding-blocked',
        `Selected piece ${selectedPieceId} does not have one exact Phase-D contour set.`,
      );
    const spellings = new Set(
      manifest.blocks
        .filter(
          ({ identity, sizeToken: blockSize }) =>
            identity === selectedPieceId &&
            (blockSize === sizeToken || blockSize.toUpperCase() === 'UNI'),
        )
        .flatMap(({ block, identity }) => [block, identity]),
    );
    const lineKeys = [
      ...new Set(
        draft.aliases
          .filter(
            ({ scopeKey: aliasScope, blockName }) =>
              aliasScope === scopeKey && spellings.has(blockName),
          )
          .map(({ pieceLineKey }) => pieceLineKey),
      ),
    ];
    if (lineKeys.length !== 1)
      return blocked(
        'piece-line-binding-blocked',
        `Selected piece ${selectedPieceId} must resolve to one exact card piece line key.`,
      );
    const contours: PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number]['contours'][number][] =
      [];
    for (const contour of carried[0].contours) {
      const phaseD = selection.phaseD.contours.filter(
        ({ pieceId, sizeToken: contourSize, contourId }) =>
          pieceId === selectedPieceId && contourSize === sizeToken && contourId === contour.id,
      );
      if (phaseD.length !== 1 || phaseD[0].pointsMm.length !== contour.sourceVertices.length)
        return blocked(
          'contour-binding-blocked',
          `Selected contour ${contour.id} does not exact-match its Phase-D boundary.`,
        );
      contours.push({
        contourId: contour.id,
        role: contour.role,
        geometry:
          contour.geometry.kind === 'cut-loop'
            ? { kind: contour.geometry.kind, index: contour.geometry.index }
            : { kind: contour.geometry.kind },
        closed: phaseD[0].closed,
        boundaryVertices: contour.sourceVertices.map(({ vertexId, normalizedArc }, ordinal) => ({
          ordinal,
          vertexId,
          normalizedArc,
        })),
      });
    }
    if (!contours.length)
      return blocked(
        'contour-binding-blocked',
        `Selected piece ${selectedPieceId} exposes no exact authorable contour.`,
      );
    pieces.push({ pieceId: selectedPieceId, pieceLineKey: lineKeys[0], contours });
  }
  if (pieces.length !== selection.selection.pieceIds.length)
    return blocked('contour-binding-blocked', 'Selected piece coverage is incomplete.');

  const unsigned = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
    techCardId: draft.techCardId,
    scopeKey,
    sizeToken,
    sourceFileId: selection.phaseD.source.sourceFileId,
    sizeSelectionCanonicalSha256: selection.selection.canonicalSha256,
    pieces,
    requiredExplicitFields: REQUIRED_EXPLICIT_FIELDS,
    geometryCoordinatesExposed: false as const,
    rawDxfExposed: false as const,
    assemblyInferred: false as const,
    productionReady: false as const,
  };
  const canonicalSha256 = await computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
    unsigned,
    crypto,
  );
  if (!canonicalSha256) return blocked('sha256-unavailable', 'SHA-256 is unavailable.');
  const catalog = deepFreeze({ ...unsigned, canonicalSha256 });
  preparedCatalogs.add(catalog);
  return deepFreeze({
    ok: true as const,
    catalog,
    blockers: [] as const,
  });
}
