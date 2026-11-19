import { savedWorkbenchScopeKeyV1 } from './saved-workbench-scope-v1';
import type { common_TechCard } from 'api/proto-http/admin';
import type { DxfProductSavedRowIdentityV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';

import type { PatternImportDxfPhaseEForeignSavedAliasIdentityFamilyV1 } from './foreign-saved-dxf-alias-identity-adapter-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_6_11_SAVED_CARD_FIXTURES_V1 =
  'pattern-import-dxf-phase-e-golden-card-6-11-saved-card-fixtures/1' as const;

const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';
const LINING = 'TECH_CARD_BOM_PURPOSE_LINING';
const POCKETING = 'TECH_CARD_BOM_PURPOSE_POCKETING';
const FABRIC = 'TECH_CARD_BOM_SECTION_FABRIC';
const LINING_SECTION = 'TECH_CARD_BOM_SECTION_LINING';

type FixturePieceV1 = Readonly<{ lineKey: string; name: string }>;
type FixtureAliasV1 = Readonly<{
  scopeKey: string;
  fabricPurpose: string;
  bomLineKey: string;
  blockName: string;
  pieceLineKey: string;
}>;

export type PatternImportDxfPhaseEGoldenSavedCardScopeFixtureV1 = Readonly<{
  purpose: string;
  scopeKey: string;
  bomLineKey: string;
  patternLineKey: string;
  corpusFilePrefix: string;
  row: DxfProductSavedRowIdentityV1;
  sourceIdentities: readonly string[];
  sourceFamilies: readonly PatternImportDxfPhaseEForeignSavedAliasIdentityFamilyV1[];
  aliases: readonly FixtureAliasV1[];
}>;

export type PatternImportDxfPhaseEGoldenSavedCardFixtureV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_6_11_SAVED_CARD_FIXTURES_V1;
  provenance: Readonly<{
    kind: 'sanitized-production-contract';
    syntheticAuthority: true;
    capturedProductionSnapshot: false;
    detail: string;
  }>;
  techCardId: 6 | 11;
  cardLockVersion: number;
  afterSaveLockVersion: number;
  sizeIds: readonly number[];
  sizeNameById: ReadonlyMap<number, string>;
  pieces: readonly FixturePieceV1[];
  aliases: readonly FixtureAliasV1[];
  scopes: readonly PatternImportDxfPhaseEGoldenSavedCardScopeFixtureV1[];
  card: common_TechCard;
  afterSaveCard: common_TechCard;
}>;

const CARD_6_PIECES = Object.freeze([
  ['01M1RYAEBRQ2REVXYTQM1Q35FY', 'BP_MAIN'],
  ['01M1RYAEBRK83QXTP3B99K5EKF', 'BP_U'],
  ['01M1RYAEBREMBGZP8E8GFMBJCQ', 'clr_main'],
  ['01M1RYAEBRHTCN8PT40TBA8V9J', 'clr_main_1'],
  ['01M1RYAEBRTMN2PJ53QB1J1BHZ', 'CLR_SECOND'],
  ['01M1RYAEBRZ2PFXK4KYAC3PEDX', 'CLR_SECOND_1'],
  ['01M1RYAEBRWV17M5CRXQG9612Z', 'FLP_L'],
  ['01M1RYAEBRZR5GGFHCN9QRZEW6', 'FLP_L_MAIN'],
  ['01M1RYAEBRQVQ26GP3387QRGP8', 'FLP_R'],
  ['01M1RYAEBRQY2FZ4STMMMEYMZN', 'FLP_R_MAIN'],
  ['01M1RYAEBRCNB1VJMZR0N8ZXZ5', 'nck'],
  ['01M1RYAEBR57TSB4GZZJMG6FXP', 'nck_1'],
  ['01M1RYAEBRYC0AYXS4YB8ZN74N', 'P_L_MAIN'],
  ['01M1RYAEBRTF0PMM5N143D2VAQ', 'P_L_U'],
  ['01M1RYAEBRKYK58SVSGZYMR7HG', 'P_R_MAIN'],
  ['01M1RYAEBRR5SW9VTBDGJG5V6N', 'P_R_U'],
  ['01M1RYAEBR8D3RWD8P8ERVQ173', 'PLCK_L'],
  ['01M1RYAEBR1S3WBPXSYTNHY9VG', 'PLCK_R'],
  ['01M1RYAEBR6JCSCEZQK9M4QT3K', 'SLV_L'],
  ['01M1RYAEBRCM74MRQCQWTSH42V', 'SLV_R'],
  ['01M1RYAMD2S67G6398SJW84N0Z', 'PCK_L_BTTM'],
  ['01M1RYAMD28HZ20WWMGBVJBJPE', 'PCK_L_MAIN'],
  ['01M1RYAMD2D5RJK8M7ZVVHHFZY', 'PCK_R_BTTM'],
  ['01M1RYAMD2FZ1DV121796HXATH', 'PCK_R_MAIN'],
  ['01M1V9WZC0TDN5FN51KH1AP3V8', 'BP_U_1'],
] as const);

const CARD_11_PIECES = Object.freeze([
  ['01M1M1ZAHF9Y0DR2YD9SD7FY25', 'Back_L'],
  ['01M1M1ZAHFJVZWPFTKEYMFPWD4', 'Back_R'],
  ['01M1M1ZAHF7DDEC59CJE3RRSPY', 'Back_Top_L_R'],
  ['01M1M1ZAHFPRN7B0V7KPRZQ1TQ', 'Back_Top_R_R'],
  ['01M1M1ZAHF1R4GEY7X8SRTH4F7', 'Back_Top_RL'],
  ['01M1M1ZAHF56ME893B22CK0A04', 'Back_Top_RR'],
  ['01M1M1ZAHFC325NZF44RAG1SM7', 'BLT'],
  ['01M1M1ZAHFXW494ZXKFFGMNBQK', 'BLT_1'],
  ['01M1M1ZAHFS8EYQW4RRX2S2QRS', 'FLAP_1_L'],
  ['01M1M1ZAHFNFXSPQ3V9ZA46AVQ', 'FLAP_L'],
  ['01M1M1ZAHFRDCHBSHH64B5NYQN', 'FLAP_R'],
  ['01M1M1ZAHF7JHJTWYXG59SBSPS', 'FRONT_L'],
  ['01M1M1ZAHF4WFQ42CAXGSAKA1M', 'FRONT_R'],
  ['01M1M1ZAHFV464XJ2A34N2MB34', 'PCK_B_L'],
  ['01M1M1ZAHF30K9ZDXAQ6RJ9B03', 'PCK_B_R'],
  ['01M1M1ZAHF10J2M5MN8ZQV2CF6', 'PCK_BACK_1L'],
  ['01M1M1ZAHFNSEHSFSE9DWFFHZ5', 'PCK_BACK_1R'],
  ['01M1M1ZAHFFT5H38VH8HM9N3FQ', 'PCK_BACK_L'],
  ['01M1M1ZAHFB2G161J0VNVV5D72', 'PCK_BACK_R'],
  ['01M1M1ZAHFK1V1SCZCYCHYWHZQ', 'PCK_L'],
  ['01M1M1ZAHFCB3HDD6BYW0C6N74', 'PCK_R'],
  ['01M1M1ZAHF234AZYFMF0HD21G4', 'WST_L'],
  ['01M1M1ZAHF441ANFEAA4Z1P0P0', 'WST_R'],
  ['01M1PKV2XYJJ4QMT3XB0T35MCC', 'WST_L_1'],
  ['01M1PKV2XYGMMR2H9HJ0W0GEMA', 'WST_R_1'],
] as const);

const CARD_6_MAIN = Object.freeze([
  'BP_MAIN',
  'BP_U',
  'BP_U_1',
  'CLR_SECOND',
  'CLR_SECOND_1',
  'FLP_L',
  'FLP_L_MAIN',
  'FLP_R',
  'FLP_R_MAIN',
  'PLCK_L',
  'PLCK_R',
  'P_L_MAIN',
  'P_L_U',
  'P_R_MAIN',
  'P_R_U',
  'SLV_L',
  'SLV_R',
  'clr_main',
  'clr_main_1',
  'nck',
  'nck_1',
]);
const CARD_6_POCKETING = Object.freeze(['PCK_L_BTTM', 'PCK_L_MAIN', 'PCK_R_BTTM', 'PCK_R_MAIN']);
const CARD_11_MAIN = Object.freeze([
  'BLT',
  'BLT_1',
  'Back_L',
  'Back_R',
  'Back_Top_L_R',
  'Back_Top_RL',
  'Back_Top_RR',
  'Back_Top_R_R',
  'FLAP_1_L',
  'FLAP_L',
  'FLAP_R',
  'FRONT_L',
  'FRONT_R',
  'WST_L',
  'WST_R',
]);
const CARD_11_LINING = Object.freeze([
  'PCK_BACK_1L',
  'PCK_BACK_1R',
  'PCK_BACK_L_1',
  'PCK_BACK_L',
  'PCK_B_L',
  'PCK_B_R',
  'PCK_L',
  'PCK_R',
  'WST_L_1',
  'WST_R_1',
]);

function pieces(rows: readonly (readonly [string, string])[]): readonly FixturePieceV1[] {
  return Object.freeze(rows.map(([lineKey, name]) => Object.freeze({ lineKey, name })));
}

function aliasesFor(
  allPieces: readonly FixturePieceV1[],
  scopeKey: string,
  bomLineKey: string,
  sourceIdentities: readonly string[],
  renames: Readonly<Record<string, string>> = Object.freeze({}),
): readonly FixtureAliasV1[] {
  return Object.freeze(
    sourceIdentities.map((blockName) => {
      const pieceName = renames[blockName] ?? blockName;
      const piece = allPieces.find(({ name }) => name === pieceName);
      if (!piece) throw new Error(`Saved-card fixture piece ${pieceName} is unavailable.`);
      return Object.freeze({
        scopeKey: savedWorkbenchScopeKeyV1({ key: scopeKey, byPurpose: true }),
        fabricPurpose: scopeKey,
        bomLineKey,
        blockName,
        pieceLineKey: piece.lineKey,
      });
    }),
  );
}

function families(sourceIdentities: readonly string[]) {
  return Object.freeze(
    sourceIdentities.map((identity, seed) =>
      Object.freeze({
        seed,
        candidates: Object.freeze(
          [0, 1, 2, 3, 4].map((rank) =>
            Object.freeze({ seed, rank, dxf: Object.freeze({ identity }) }),
          ),
        ),
      }),
    ),
  );
}

type ScopeSeed = Readonly<{
  purpose: string;
  bomLineKey: string;
  patternLineKey: string;
  corpusFilePrefix: string;
  sizeBytes: number;
  sha256: string;
  sourceIdentities: readonly string[];
  aliases: readonly FixtureAliasV1[];
}>;

function buildFixture(
  input: Readonly<{
    techCardId: 6 | 11;
    cardLockVersion: number;
    sizeIds: readonly number[];
    sizeNames: readonly string[];
    pieces: readonly FixturePieceV1[];
    bomItems: readonly Readonly<{
      lineKey: string;
      section: string;
      purpose: string;
      name: string;
    }>[];
    scopes: readonly ScopeSeed[];
  }>,
): PatternImportDxfPhaseEGoldenSavedCardFixtureV1 {
  const afterSaveLockVersion = input.cardLockVersion + 1;
  const scopes = Object.freeze(
    input.scopes.map((scope, index) => {
      const row = Object.freeze({
        techCardId: input.techCardId,
        scopeKey: savedWorkbenchScopeKeyV1({ key: scope.purpose, byPurpose: true }),
        patternLineKey: scope.patternLineKey,
        revision: index + 1,
        cardLockVersion: input.cardLockVersion,
        url: `https://fixture.invalid/card-${input.techCardId}/${scope.purpose.toLowerCase()}.dxf`,
        sizeBytes: scope.sizeBytes,
        sha256: scope.sha256,
      });
      return Object.freeze({
        purpose: scope.purpose,
        scopeKey: savedWorkbenchScopeKeyV1({ key: scope.purpose, byPurpose: true }),
        bomLineKey: scope.bomLineKey,
        patternLineKey: scope.patternLineKey,
        corpusFilePrefix: scope.corpusFilePrefix,
        row,
        sourceIdentities: scope.sourceIdentities,
        sourceFamilies: families(scope.sourceIdentities),
        aliases: scope.aliases,
      });
    }),
  );
  const allAliases = Object.freeze(scopes.flatMap(({ aliases }) => aliases));
  const makeCard = (lockVersion: number): common_TechCard =>
    ({
      id: input.techCardId,
      lockVersion,
      techCard: {
        sizeIds: [...input.sizeIds],
        bomItems: input.bomItems.map((item) => ({ ...item })),
        patterns: scopes.map(({ purpose, bomLineKey, row }, index) => ({
          sizeId: input.sizeIds[0],
          lineKey: row.patternLineKey,
          fabricPurpose: purpose,
          bomLineKey,
          url: row.url,
          downloadUrl: `/api/p/fixture-card-${input.techCardId}-${index + 1}/download`,
          sizeBytes: row.sizeBytes,
          sha256: row.sha256,
          savedRowRevision: row.revision,
          filename: `fixture-card-${input.techCardId}-${index + 1}.dxf`,
        })),
        pieces: input.pieces.map(({ lineKey, name }) => ({ lineKey, name })),
        pieceDxfAliases: {
          items: allAliases.map(({ fabricPurpose, bomLineKey, blockName, pieceLineKey }) => ({
            fabricPurpose,
            bomLineKey,
            blockName,
            pieceLineKey,
          })),
        },
      },
    }) as unknown as common_TechCard;
  return Object.freeze({
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_CARD_6_11_SAVED_CARD_FIXTURES_V1,
    provenance: Object.freeze({
      kind: 'sanitized-production-contract' as const,
      syntheticAuthority: true as const,
      capturedProductionSnapshot: false as const,
      detail:
        'Real corpus bytes and identities with synthetic lock, row revision, line key and capability URL.',
    }),
    techCardId: input.techCardId,
    cardLockVersion: input.cardLockVersion,
    afterSaveLockVersion,
    sizeIds: Object.freeze([...input.sizeIds]),
    sizeNameById: new Map(input.sizeIds.map((id, index) => [id, input.sizeNames[index]])),
    pieces: input.pieces,
    aliases: allAliases,
    scopes,
    card: makeCard(input.cardLockVersion),
    afterSaveCard: makeCard(afterSaveLockVersion),
  });
}

const card6Pieces = pieces(CARD_6_PIECES);
const card6MainBom = '01M1PWP5HFK93BNDPYEJ42SDYK';
const card6PocketingBom = '01M1PWPRYS49G09BYESEFH2V6P';
const card6MainAliases = aliasesFor(card6Pieces, MAIN, card6MainBom, CARD_6_MAIN);
const card6PocketingAliases = aliasesFor(
  card6Pieces,
  POCKETING,
  card6PocketingBom,
  CARD_6_POCKETING,
);

const card11Pieces = pieces(CARD_11_PIECES);
const card11MainBom = '01M1C2VS3RRNJDGFPE3RF6CX6K';
const card11LegacyPocketingBom = '01M1PKT1CN2GHWTZ978AD2Z34J';
const card11LiningBom = '01M1S9GE7MPTA9ARR6AZX0ES2D';
const card11MainAliases = aliasesFor(card11Pieces, MAIN, card11MainBom, CARD_11_MAIN);
const card11LiningAliases = aliasesFor(
  card11Pieces,
  LINING,
  card11LegacyPocketingBom,
  CARD_11_LINING,
  Object.freeze({ PCK_BACK_L_1: 'PCK_BACK_R' }),
);

export const PATTERN_IMPORT_DXF_PHASE_E_GOLDEN_SAVED_CARD_FIXTURES_V1 = Object.freeze([
  buildFixture({
    techCardId: 6,
    cardLockVersion: 10_006,
    sizeIds: Object.freeze([2, 3, 4, 5, 6]),
    sizeNames: Object.freeze(['xs', 's', 'm', 'l', 'xl']),
    pieces: card6Pieces,
    bomItems: Object.freeze([
      Object.freeze({
        lineKey: card6MainBom,
        section: FABRIC,
        purpose: MAIN,
        name: 'Main fabric',
      }),
      Object.freeze({
        lineKey: card6PocketingBom,
        section: FABRIC,
        purpose: POCKETING,
        name: 'Pocketing',
      }),
    ]),
    scopes: Object.freeze([
      Object.freeze({
        purpose: MAIN,
        bomLineKey: card6MainBom,
        patternLineKey: 'fixture-card-6-main',
        corpusFilePrefix: 'card6-MAIN',
        sizeBytes: 839_334,
        sha256: '50e98f9e1f67006bc077230f06e43c1efff6ee0f4aa39dbd97144aa259ec95c5',
        sourceIdentities: CARD_6_MAIN,
        aliases: card6MainAliases,
      }),
      Object.freeze({
        purpose: POCKETING,
        bomLineKey: card6PocketingBom,
        patternLineKey: 'fixture-card-6-pocketing',
        corpusFilePrefix: 'card6-POCKETING',
        sizeBytes: 116_711,
        sha256: 'd3e4b41fa3899eaa6a3a9453aab96d75bd5481738576908db9d1e9718160456f',
        sourceIdentities: CARD_6_POCKETING,
        aliases: card6PocketingAliases,
      }),
    ]),
  }),
  buildFixture({
    techCardId: 11,
    cardLockVersion: 10_011,
    sizeIds: Object.freeze([82, 83, 84, 85, 86]),
    sizeNames: Object.freeze(['xs_28bo_m', 's_30bo_m', 'm_32bo_m', 'l_34bo_m', 'xl_36bo_m']),
    pieces: card11Pieces,
    bomItems: Object.freeze([
      Object.freeze({
        lineKey: card11MainBom,
        section: FABRIC,
        purpose: MAIN,
        name: 'Main fabric',
      }),
      Object.freeze({
        lineKey: card11LegacyPocketingBom,
        section: FABRIC,
        purpose: POCKETING,
        name: 'Legacy pocketing line',
      }),
      Object.freeze({
        lineKey: card11LiningBom,
        section: LINING_SECTION,
        purpose: LINING,
        name: 'Lining',
      }),
    ]),
    scopes: Object.freeze([
      Object.freeze({
        purpose: MAIN,
        bomLineKey: card11MainBom,
        patternLineKey: 'fixture-card-11-main',
        corpusFilePrefix: 'card11-MAIN',
        sizeBytes: 390_347,
        sha256: 'b023e1b467831a12b2ec419503ca1b6676c64ecceb57d9039222c8f37454ea3d',
        sourceIdentities: CARD_11_MAIN,
        aliases: card11MainAliases,
      }),
      Object.freeze({
        purpose: LINING,
        // Deliberately preserves the legacy card row: purpose must win over this POCKETING line.
        bomLineKey: card11LegacyPocketingBom,
        patternLineKey: 'fixture-card-11-lining',
        corpusFilePrefix: 'card11-LINING',
        sizeBytes: 355_911,
        sha256: 'e5300bed9c7946c4e6fe75e7a480ddef36847fab416cb3608ce68112488d0b6b',
        sourceIdentities: CARD_11_LINING,
        aliases: card11LiningAliases,
      }),
    ]),
  }),
]);

export function clonePatternImportDxfPhaseEGoldenSavedCardV1(
  card: common_TechCard,
): common_TechCard {
  return structuredClone(card);
}
