import { describe, expect, it } from 'vitest';

import { identityGrammarProblem } from 'lib/pattern-import/manifest/identity';

import {
  buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1,
  canonicalPatternImportDxfPhaseEForeignSavedWriterIdentityV1,
  type PatternImportDxfPhaseEForeignSavedAliasIdentityRequestV1,
} from './foreign-saved-dxf-alias-identity-adapter-v1';

const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';
const CARD_156_IDENTITIES = [
  'FRONT_L',
  'FLAP_L',
  'FLAP_1_L',
  'FRONT_R',
  'Back_R',
  'WST_R',
  'Back_L',
  'WST_L',
  'FLAP_R',
  'Back_Top_RL',
  'Back_Top_RR',
  'Back_Top_L_R',
  'Back_Top_R_R',
  'BLT',
] as const;

function request(
  identities: readonly string[] = CARD_156_IDENTITIES,
): PatternImportDxfPhaseEForeignSavedAliasIdentityRequestV1 {
  return {
    scopeKey: MAIN,
    mappedSourceRanks: [0, 1, 2, 3, 4],
    families: identities.map((identity, seed) => ({
      seed,
      candidates: Array.from({ length: 5 }, (_, rank) => ({ rank, dxf: { identity } })),
    })),
    aliases: identities.map((blockName, index) => ({
      scopeKey: MAIN,
      blockName,
      pieceLineKey: `piece:${index}`,
    })),
    pieces: identities.map((name, index) => ({ lineKey: `piece:${index}`, name })),
  };
}

function blockerCode(
  value: ReturnType<typeof buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1>,
) {
  return value.ok ? null : value.blocker.code;
}

describe('foreign saved DXF exact alias identity adapter', () => {
  it('maps all 14 card 156 main-scope families one-to-one and preserves source display names', () => {
    const result = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1(request());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bindings).toHaveLength(14);
    expect(new Set(result.bindings.map(({ pieceLineKey }) => pieceLineKey)).size).toBe(14);
    expect(new Set(result.bindings.map(({ writerIdentity }) => writerIdentity)).size).toBe(14);
    expect(result.bindings.map(({ sourceBlockIdentity }) => sourceBlockIdentity)).toEqual(
      CARD_156_IDENTITIES,
    );
    expect(
      result.bindings.every(
        ({ writerIdentity }) => identityGrammarProblem(writerIdentity) === null,
      ),
    ).toBe(true);
    expect(result.bindings.find(({ seed }) => seed === 0)).toMatchObject({
      sourceBlockIdentity: 'FRONT_L',
      sourceDisplayName: 'FRONT_L',
      writerIdentity: 'FRONT_L',
      pieceLineKey: 'piece:0',
    });
    expect(result.bindings.find(({ seed }) => seed === 4)).toMatchObject({
      sourceBlockIdentity: 'Back_R',
      sourceDisplayName: 'Back_R',
      writerIdentity: 'BACK_R',
      pieceLineKey: 'piece:4',
    });
    expect(result.bindings.find(({ seed }) => seed === 2)?.writerIdentity).toMatch(
      /^CAD_XFLAP_X1_XL_H[A-F0-9]{8}$/,
    );
    expect(result.bindings.find(({ seed }) => seed === 11)?.writerIdentity).toMatch(
      /^CAD_XBACK_XTOP_XL_XR_H[A-F0-9]{8}$/,
    );
    expect(result.pieceOverrides[11]).toEqual({
      code: result.bindings[11].writerIdentity,
      mods: [],
      displayName: 'Back_Top_L_R',
      nameOrigin: 'text',
      ungraded: false,
    });
  });

  it('preserves the explicit saved quantity of an identical-handed piece without deriving a twin', () => {
    const input = request(['PCK_L', 'PCK_R', 'PCK_L_1']);
    const result = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      ...input,
      pieces: input.pieces.map((piece, index) => ({
        ...piece,
        cutSymmetry:
          index < 2
            ? 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL'
            : 'TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED',
        piecesPerGarment: index + 1,
      })),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pieceOverrides[0]).toMatchObject({
      code: 'PCK_L',
      pairHand: null,
      piecesPerGarment: 1,
    });
    expect(result.pieceOverrides[1]).toMatchObject({
      code: 'PCK_R',
      pairHand: null,
      piecesPerGarment: 2,
    });
    expect(result.pieceOverrides[2]?.pairHand).toBeUndefined();
    expect(result.pieceOverrides[2]?.piecesPerGarment).toBeUndefined();
    expect(result.bindings.map(({ pieceLineKey }) => pieceLineKey)).toEqual([
      'piece:0',
      'piece:1',
      'piece:2',
    ]);
  });

  it('keeps a single-rank source family eligible for true ungraded semantics', () => {
    const input = request(['BLT']);
    const result = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      ...input,
      families: [{ ...input.families[0], candidates: [input.families[0].candidates[0]] }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pieceOverrides[0]?.ungraded).toBeUndefined();
  });

  it('rejects a partially graded family instead of silently treating it as ungraded', () => {
    const input = request(['BLT']);
    const result = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      ...input,
      families: [{ ...input.families[0], candidates: input.families[0].candidates.slice(0, 4) }],
    });

    expect(blockerCode(result)).toBe('source-rank-incomplete');
  });

  it('is stable for valid, invalid and non-ASCII vendor spellings', () => {
    for (const source of ['FRONT_L', 'FLAP_1_L', 'Back_Top_L_R', 'деталь левая']) {
      const first = canonicalPatternImportDxfPhaseEForeignSavedWriterIdentityV1(source);
      const second = canonicalPatternImportDxfPhaseEForeignSavedWriterIdentityV1(source);
      expect(first).toBe(second);
      expect(first && identityGrammarProblem(first)).toBeNull();
    }
  });

  it('requires an exact alias in the requested scope', () => {
    const input = request(['FRONT_L']);
    const result = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      ...input,
      aliases: input.aliases.map((alias) => ({ ...alias, scopeKey: 'OTHER' })),
    });

    expect(blockerCode(result)).toBe('scope-alias-missing');
  });

  it('rejects two exact scope aliases for one source block', () => {
    const input = request(['FRONT_L']);
    const result = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      ...input,
      aliases: [...input.aliases, { ...input.aliases[0] }],
    });

    expect(blockerCode(result)).toBe('scope-alias-ambiguous');
  });

  it('rejects a missing or duplicate current card piece', () => {
    const input = request(['FRONT_L']);
    const missing = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      ...input,
      pieces: [],
    });
    const ambiguous = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      ...input,
      pieces: [...input.pieces, { ...input.pieces[0], name: 'duplicate' }],
    });

    expect(blockerCode(missing)).toBe('card-piece-missing');
    expect(blockerCode(ambiguous)).toBe('card-piece-ambiguous');
  });

  it('rejects two source blocks claiming one card piece', () => {
    const input = request(['FRONT_L', 'FRONT_R']);
    const result = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      ...input,
      aliases: input.aliases.map((alias) => ({ ...alias, pieceLineKey: 'piece:0' })),
    });

    expect(blockerCode(result)).toBe('card-piece-binding-duplicate');
  });

  it('rejects duplicate seeds, duplicate source identities and mixed-identity families', () => {
    const input = request(['FRONT_L', 'FRONT_R']);
    const duplicateSeed = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      ...input,
      families: input.families.map((family) => ({ ...family, seed: 0 })),
    });
    const duplicateSource = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      ...input,
      families: input.families.map((family) => ({
        ...family,
        candidates: family.candidates.map((candidate) => ({
          ...candidate,
          dxf: { identity: 'FRONT_L' },
        })),
      })),
    });
    const mixed = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1({
      ...request(['FRONT_L']),
      families: [
        {
          seed: 0,
          candidates: [
            { rank: 0, dxf: { identity: 'FRONT_L' } },
            { rank: 1, dxf: { identity: 'FRONT_R' } },
          ],
        },
      ],
    });

    expect(blockerCode(duplicateSeed)).toBe('seed-duplicate');
    expect(blockerCode(duplicateSource)).toBe('source-identity-duplicate');
    expect(blockerCode(mixed)).toBe('source-identity-ambiguous');
  });

  it('rejects distinct source spellings that would collide as one writer identity', () => {
    const input = request(['front', 'FRONT']);
    const result = buildPatternImportDxfPhaseEForeignSavedAliasIdentityOverridesV1(input);

    expect(blockerCode(result)).toBe('writer-identity-duplicate');
  });
});
