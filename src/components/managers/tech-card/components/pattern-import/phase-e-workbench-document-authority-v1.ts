export const PATTERN_IMPORT_DXF_PHASE_E_DOCUMENT_AUTHORITY_V1 =
  'pattern-import-dxf-phase-e-document-authority/1' as const;

const STABLE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type PatternImportDxfPhaseEDocumentEvidenceV1 = Readonly<{
  techCardId: number;
  scopeKey: string;
  patternLineKey: string;
  dxfSha256: string;
  patternVersion: number;
  cardLockVersion: number;
}>;

export type PatternImportDxfPhaseEDocumentAuthorityV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_DOCUMENT_AUTHORITY_V1;
  evidence: PatternImportDxfPhaseEDocumentEvidenceV1;
  sizeSelectionCanonicalSha256: string;
  catalogCanonicalSha256: string;
  documentId: string;
  revision: string;
}>;

export type PatternImportDxfPhaseEDocumentAuthorityResultV1 =
  | Readonly<{
      ok: true;
      authority: PatternImportDxfPhaseEDocumentAuthorityV1;
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      authority: null;
      blockers: readonly [
        Readonly<{
          code: 'document-evidence-invalid' | 'document-authority-sha256-unavailable';
          detail: string;
        }>,
      ];
    }>;

function validEvidence(value: PatternImportDxfPhaseEDocumentEvidenceV1): boolean {
  return (
    !!value &&
    Number.isSafeInteger(value.techCardId) &&
    value.techCardId > 0 &&
    STABLE_ID.test(value.scopeKey ?? '') &&
    STABLE_ID.test(value.patternLineKey ?? '') &&
    SHA256.test(value.dxfSha256 ?? '') &&
    Number.isSafeInteger(value.patternVersion) &&
    value.patternVersion > 0 &&
    Number.isSafeInteger(value.cardLockVersion) &&
    value.cardLockVersion > 0
  );
}

async function digestText(
  value: string,
  crypto: Pick<Crypto, 'subtle'> | undefined,
): Promise<string | null> {
  if (!crypto?.subtle || typeof crypto.subtle.digest !== 'function') return null;
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    if (digest.byteLength !== 32) return null;
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  } catch {
    return null;
  }
}

function blocked(
  code: Extract<
    PatternImportDxfPhaseEDocumentAuthorityResultV1,
    { ok: false }
  >['blockers'][0]['code'],
  detail: string,
): PatternImportDxfPhaseEDocumentAuthorityResultV1 {
  return Object.freeze({
    ok: false as const,
    authority: null,
    blockers: Object.freeze([Object.freeze({ code, detail })]) as Extract<
      PatternImportDxfPhaseEDocumentAuthorityResultV1,
      { ok: false }
    >['blockers'],
  });
}

/**
 * Mints display-safe document identities only from a freshly verified saved row and the exact
 * Phase-D/catalog seals. The operator still confirms them, but freehand replacements are not
 * accepted as authority by the workbench.
 */
export async function derivePatternImportDxfPhaseEDocumentAuthorityV1(
  evidence: PatternImportDxfPhaseEDocumentEvidenceV1,
  sizeSelectionCanonicalSha256: string,
  catalogCanonicalSha256: string,
  crypto: Pick<Crypto, 'subtle'> | undefined = globalThis.crypto,
): Promise<PatternImportDxfPhaseEDocumentAuthorityResultV1> {
  if (
    !validEvidence(evidence) ||
    !SHA256.test(sizeSelectionCanonicalSha256 ?? '') ||
    !SHA256.test(catalogCanonicalSha256 ?? '')
  )
    return blocked(
      'document-evidence-invalid',
      'A current saved row, card lock, row revision and fresh Phase-D/catalog seals are required.',
    );

  const stableEvidence = Object.freeze({ ...evidence });
  const documentDigest = await digestText(
    JSON.stringify({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DOCUMENT_AUTHORITY_V1,
      techCardId: evidence.techCardId,
      scopeKey: evidence.scopeKey,
      patternLineKey: evidence.patternLineKey,
    }),
    crypto,
  );
  const revisionDigest = documentDigest
    ? await digestText(
        JSON.stringify({
          schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DOCUMENT_AUTHORITY_V1,
          documentDigest,
          dxfSha256: evidence.dxfSha256,
          patternVersion: evidence.patternVersion,
          cardLockVersion: evidence.cardLockVersion,
          sizeSelectionCanonicalSha256,
          catalogCanonicalSha256,
        }),
        crypto,
      )
    : null;
  if (!documentDigest || !revisionDigest)
    return blocked(
      'document-authority-sha256-unavailable',
      'SHA-256 is required to bind the semantic document revision to the saved DXF row.',
    );

  return Object.freeze({
    ok: true as const,
    authority: Object.freeze({
      schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_DOCUMENT_AUTHORITY_V1,
      evidence: stableEvidence,
      sizeSelectionCanonicalSha256,
      catalogCanonicalSha256,
      documentId: `phase-e-v1:document:${documentDigest}`,
      revision: `phase-e-v1:revision:${revisionDigest}`,
    }),
    blockers: Object.freeze([]) as readonly [],
  });
}
