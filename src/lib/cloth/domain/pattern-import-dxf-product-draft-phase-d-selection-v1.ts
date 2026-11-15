import {
  selectDxfProductPhaseDSizeV1,
  type DxfProductPhaseDSizeSelectionResultV1,
} from '../../pattern-import/dxf-product-phase-d-size-selection-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type CardDraft,
  type PieceSpec,
} from '../../pattern-import/types';

export const PATTERN_IMPORT_DXF_PRODUCT_DRAFT_PHASE_D_SELECTION_V1 =
  'pattern-import-dxf-product-draft-phase-d-selection/1' as const;

export type PatternImportDxfProductDraftPhaseDSelectionResultV1 =
  | Readonly<{
      ok: true;
      selection: Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      selection: null;
      blockers: readonly [
        Readonly<{
          code:
            | 'invalid-draft-selection-request'
            | 'phase-d-carrier-unavailable'
            | 'writer-piece-carrier-unavailable'
            | 'size-selection-blocked';
          detail: string;
        }>,
      ];
    }>;

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

function blocked(
  code: Extract<
    PatternImportDxfProductDraftPhaseDSelectionResultV1,
    { ok: false }
  >['blockers'][0]['code'],
  detail: string,
): PatternImportDxfProductDraftPhaseDSelectionResultV1 {
  return Object.freeze({
    ok: false as const,
    selection: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as Extract<
      PatternImportDxfProductDraftPhaseDSelectionResultV1,
      { ok: false }
    >['blockers'],
  });
}

function piecesOf(draft: CardDraft, scopeKey: string): readonly PieceSpec[] | null {
  const target = draft.scopes.filter(({ target }) => target.scopeKey === scopeKey);
  if (
    target.length !== 1 ||
    target[0].writerReplay?.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1
  )
    return null;
  const byIdentity = new Map<string, PieceSpec>();
  try {
    for (const scope of draft.scopes) {
      const replay = scope.writerReplay;
      if (!replay) continue;
      if (replay.schemaVersion !== PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1) return null;
      for (const piece of replay.job.pieces) {
        const previous = byIdentity.get(piece.identity);
        if (previous && canonical(previous) !== canonical(piece)) return null;
        byIdentity.set(piece.identity, piece);
      }
    }
  } catch {
    return null;
  }
  return byIdentity.size
    ? Object.freeze(
        [...byIdentity.values()].sort((left, right) =>
          left.identity < right.identity ? -1 : left.identity > right.identity ? 1 : 0,
        ),
      )
    : null;
}

/** Fresh-selects one size from the exact product draft without accepting caller PieceSpec data. */
export async function selectPatternImportDxfProductDraftPhaseDSizeV1(
  draft: CardDraft,
  scopeKey: string,
  sizeToken: string,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfProductDraftPhaseDSelectionResultV1> {
  if (!draft || !scopeKey || !sizeToken)
    return blocked(
      'invalid-draft-selection-request',
      'Draft, explicit scope and explicit size are required.',
    );
  if (!draft.dxfProvenance?.pipelineIntegrated || !draft.dxfPhaseDReplay?.replayReady)
    return blocked(
      'phase-d-carrier-unavailable',
      'A successful public Phase-D carrier and exact replay carrier are required.',
    );
  const pieces = piecesOf(draft, scopeKey);
  if (!pieces)
    return blocked(
      'writer-piece-carrier-unavailable',
      'One exact product scope and canonical retained writer pieces are required.',
    );
  const selection = await selectDxfProductPhaseDSizeV1(
    {
      scopeKey,
      sizeToken,
      pieces,
      pipeline: draft.dxfProvenance,
      replay: draft.dxfPhaseDReplay,
    },
    crypto,
  );
  if (!selection.ok)
    return blocked(
      'size-selection-blocked',
      selection.blockers.map(({ code, detail }) => `${code}: ${detail}`).join('; '),
    );
  return Object.freeze({
    ok: true as const,
    selection,
    blockers: Object.freeze([]) as readonly [],
  });
}
