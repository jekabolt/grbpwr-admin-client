import type { CardDraft } from 'lib/pattern-import/types';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_SOURCE_V1 =
  'pattern-import-dxf-phase-e-draft-cad-compile-source/1' as const;

type DraftCadCompileScope = Readonly<
  Pick<CardDraft['scopes'][number], 'target' | 'writerReplay'> & {
    rankedOutlineBlocks?: readonly Readonly<{
      block: string;
      identity: string;
      sizeToken: string;
      sizeId: number;
      insetWidthMm?: number;
    }>[];
  }
>;

export type PatternImportDxfPhaseEDraftCadCompileSourceV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_SOURCE_V1;
  techCardId: CardDraft['techCardId'];
  scopes: readonly DraftCadCompileScope[];
  dxfProvenance: CardDraft['dxfProvenance'];
  dxfPhaseDReplay: CardDraft['dxfPhaseDReplay'];
}>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_SOURCE_CLAIMS_V1 = Object.freeze({
  retainedWriterReplayReused: true,
  phaseDIdentityRetained: true,
  rawDxfTextRetained: false,
  downloadsRetained: false,
  cardApplyPayloadRetained: false,
  productionReady: false,
} as const);

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

/** Detaches only the identities and writer inputs required by the session-only compile action. */
export function createPatternImportDxfPhaseEDraftCadCompileSourceV1(
  draft: CardDraft,
): PatternImportDxfPhaseEDraftCadCompileSourceV1 | null {
  try {
    if (!Number.isSafeInteger(draft?.techCardId) || draft.techCardId < 1) return null;
    const source = structuredClone({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_COMPILE_SOURCE_V1,
      techCardId: draft.techCardId,
      scopes: draft.scopes.map(({ target, writerReplay, manifest }) => ({
        target,
        writerReplay,
        rankedOutlineBlocks: manifest?.blocks?.map(
          ({ block, identity, sizeToken, sizeId, authoredInsetOutlineCorner }) => ({
            block,
            identity,
            sizeToken,
            sizeId,
            insetWidthMm: authoredInsetOutlineCorner?.widthMm,
          }),
        ),
      })),
      dxfProvenance: draft.dxfProvenance,
      dxfPhaseDReplay: draft.dxfPhaseDReplay,
    });
    return deepFreeze(source);
  } catch {
    return null;
  }
}
