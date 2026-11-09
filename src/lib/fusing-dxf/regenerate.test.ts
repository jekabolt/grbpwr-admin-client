import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  common_Size,
  common_TechCardBomItem,
  common_TechCardPiece,
  common_TechCardPieceDxfAlias,
} from 'api/proto-http/admin';
import type { PieceDTO, PieceManifestFacts } from 'lib/nesting/types';
import { parseSheets } from 'lib/nesting/worker/parse-files';
import { readRawDxf } from 'lib/pattern-import/gate/reader';
import { readDxf } from 'lib/pattern-import/adapters/dxf';
import { pointOnRings } from 'lib/pattern-import/semantics/grain-inside';
import { buildFusingSheets } from './dxf';
import { newestUpload, sourcePieces } from './regenerate';

const fullEvidence =
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/reimport-keeps-card/evidence/card6-prod-main-v10.dxf';
const fixture = fileURLToPath(new URL('./card6-main-v10.fixture.dxf', import.meta.url));
const aliasFixture = fileURLToPath(new URL('./card6-main-aliases.fixture.tsv', import.meta.url));

type AliasRow = { blockName: string; piece: string; fused: boolean };

const aliasRows: AliasRow[] = readFileSync(aliasFixture, 'utf8')
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const [blockName, piece, fused] = line.split('\t');
    return { blockName, piece, fused: fused === '1' };
  });

const dictionarySizes = ['XS', 'S', 'M', 'L', 'XL'].map(
  (name, index) => ({ id: index + 1, name }) as common_Size,
);
const cardSizeIds = dictionarySizes.map((size) => size.id!);

const aliasesOf = (rows: readonly AliasRow[]) =>
  rows.map(
    (row) =>
      ({
        blockName: row.blockName,
        pieceLineKey: row.piece,
        bomLineKey: 'main',
        fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
      }) as common_TechCardPieceDxfAlias,
  );

const cardPiecesOf = (rows: readonly AliasRow[]) => {
  const byKey = new Map<string, AliasRow[]>();
  for (const row of rows) byKey.set(row.piece, [...(byKey.get(row.piece) ?? []), row]);
  return [...byKey].map(
    ([lineKey, pieceRows]) =>
      ({
        lineKey,
        name: lineKey,
        fused: pieceRows.some((row) => row.fused),
        piecesPerGarment: 1,
        ungraded: false,
      }) as common_TechCardPiece,
  );
};

const parseDxf = async (path: string) => {
  const bytes = readFileSync(path);
  return parseSheets(
    [
      {
        name: path.split('/').at(-1)!,
        open: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      },
    ],
    { unit: 'auto', tol: 0.03, tolChain: 0.05 },
  );
};

const prepare = (pieces: readonly PieceDTO[], rows: readonly AliasRow[]) =>
  sourcePieces(
    pieces,
    cardPiecesOf(rows),
    aliasesOf(rows),
    new Map<string, common_TechCardBomItem>(),
    dictionarySizes,
    cardSizeIds,
    dictionarySizes[0].id,
    10,
  );

const build = (pieces: ReturnType<typeof prepare>['pieces']) =>
  buildFusingSheets({
    techCardId: 6,
    style: 'card-6',
    baseSizeId: dictionarySizes[0].id,
    bomLines: [{ bomLineKey: 'interlining', code: 'FUSE', label: 'Fusing' }],
    pieces,
  });

describe('fusing regeneration contours', () => {
  it('does not count cut/sew layers or Quantity copies twice and keeps aliases linked', async () => {
    const parsed = await parseDxf(fixture);
    expect(parsed.failedFiles).toBe(0);
    expect(parsed.skippedBlocks).toBe(0);

    const fixtureBlocks = new Set(['nck', 'clr_main', 'bp_u', 'clr_second_2']);
    const rows = aliasRows.filter((row) => fixtureBlocks.has(row.blockName.toLowerCase()));
    const prepared = prepare(parsed.pieces, rows);
    const duplicateWarnings = prepared.warnings.filter((warning) =>
      warning.includes('duplicate contour ignored'),
    );

    expect(duplicateWarnings).toEqual([]);
    expect(prepared.unmatchedFused).toEqual([]);

    const built = build(prepared.pieces);
    const expectedContours = prepared.pieces
      .filter((piece) => piece.fuse)
      .reduce((sum, piece) => sum + piece.sizes.length, 0);
    expect(expectedContours).toBe(6);
    expect(built.skippedSizes).toEqual([]);
    expect(built.sheets).toHaveLength(1);
    expect(built.sheets[0].blocks).toHaveLength(expectedContours);
    expect(new Set(built.sheets[0].blocks)).toHaveLength(expectedContours);
    const markedBytes = new TextEncoder().encode(built.sheets[0].dxfText).buffer as ArrayBuffer;
    const marked = await readDxf(
      { id: 'generated', name: 'neutral-name.dxf', bytes: markedBytes },
      { sagittaMm: 0.05, keepFills: true },
    );
    expect(marked.meta.generatedFusing).toBe(true);
    const raw = readRawDxf(built.sheets[0].dxfText);
    let grains = 0;
    for (const entities of raw.blocks.values()) {
      const cut = entities.find(
        (entity) => entity.layer === '1' && entity.closed && entity.pts.length >= 3,
      );
      const grain = entities.find((entity) => entity.layer === '7' && entity.pts.length >= 2);
      if (!cut || !grain) continue;
      grains++;
      const mid = {
        x: (grain.pts[0].x + grain.pts[1].x) / 2,
        y: (grain.pts[0].y + grain.pts[1].y) / 2,
      };
      expect(pointOnRings(mid, [cut.pts])).toBe(true);
    }
    expect(grains).toBeGreaterThan(0);
  });

  it('still warns for two distinct cut contours of one piece and size', () => {
    const manifest: PieceManifestFacts = {
      techCardId: 6,
      identity: 'DUP',
      size: 'XS',
      sizeId: dictionarySizes[0].id!,
      cardName: 'DUP',
      pairHand: null,
      pairOf: null,
      unfolded: false,
      halfFold: false,
      cutLayer: '1',
      seamLayer: '14',
      grainLayer: '7',
      cutAllowanceCm: 0,
    };
    const contour = (id: number, width: number): PieceDTO => ({
      id,
      name: 'DUP_XS',
      blockName: 'DUP_XS',
      layer: '1',
      source: 'two-real-contours.dxf',
      fileIndex: 0,
      poly: [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: 10 },
        { x: 0, y: 10 },
      ],
      bboxW: width,
      bboxH: 10,
      areaCm2: width * 10,
      originX: id * 20,
      originY: 0,
      manifest,
    });
    const rows = [{ blockName: 'dup', piece: 'dup', fused: true }];
    const prepared = prepare([contour(1, 10), contour(2, 12)], rows);

    expect(prepared.warnings).toEqual(['DUP_XS: duplicate contour ignored']);
    expect(prepared.unmatchedFused).toEqual([]);
    expect(prepared.pieces).toHaveLength(1);
    expect(prepared.pieces[0].sizes).toHaveLength(1);
  });
});

// T5 (09.11, beta card 124): the generated sheet printed the wall clock in its R12 header («Creation
// Time: 16:09»), so every rebuild was a new file — a new sha256, a new upload, a card write and a
// version bump on every open that owed a rebuild, though nothing it is built from had changed.
describe('the same inputs give the same sheet (T5)', () => {
  afterEach(() => vi.useRealTimers());
  const fixtureRows = () =>
    aliasRows.filter((row) =>
      new Set(['nck', 'clr_main', 'bp_u', 'clr_second_2']).has(row.blockName.toLowerCase()),
    );

  it("two builds minutes apart: byte-identical, the header time is the source sheet's", async () => {
    const parsed = await parseDxf(fixture);
    const prepared = prepare(parsed.pieces, fixtureRows());
    const at = (createdAt?: string) =>
      buildFusingSheets({
        techCardId: 6,
        style: 'card-6',
        baseSizeId: dictionarySizes[0].id,
        bomLines: [{ bomLineKey: 'interlining', code: 'FUSE', label: 'Fusing' }],
        pieces: prepared.pieces,
        createdAt,
      }).sheets[0].dxfText;
    vi.useFakeTimers({ now: new Date('2026-11-09T16:09:00Z') });
    const first = at('2026-11-09T16:04:25Z');
    vi.setSystemTime(new Date('2026-11-09T16:17:00Z'));
    const second = at('2026-11-09T16:04:25Z');
    expect(second).toBe(first);
    expect(first).toContain('Creation Date: 09-11-2026');
    expect(first).toContain('Creation Time: 16:04');
    // without a source time: the epoch, still not the clock
    expect(at()).toBe(at());
    expect(at()).toContain('Creation Time: 00:00');
  });

  it('newestUpload: the newest readable upload time of the source sheets', () => {
    expect(
      newestUpload([
        { uploadedAt: '2026-11-09T12:53:30Z' },
        { uploadedAt: '2026-11-09T16:09:15Z' },
        { uploadedAt: undefined },
        { uploadedAt: 'not a time' },
      ] as unknown as Parameters<typeof newestUpload>[0]),
    ).toBe('2026-11-09T16:09:15Z');
    expect(newestUpload([])).toBeUndefined();
  });
});

describe.skipIf(!existsSync(fullEvidence))('card 6 full production v10 evidence', () => {
  it('has no duplicate or unlinked fused-piece warnings', async () => {
    const parsed = await parseDxf(fullEvidence);
    expect(parsed.failedFiles).toBe(0);
    expect(parsed.skippedBlocks).toBe(0);

    const prepared = prepare(parsed.pieces, aliasRows);
    const duplicateCount = prepared.warnings.filter((warning) =>
      warning.includes('duplicate contour ignored'),
    ).length;
    const unlinkedCount = prepared.unmatchedFused.length;
    const built = build(prepared.pieces);
    const expectedContours = prepared.pieces
      .filter((piece) => piece.fuse)
      .reduce((sum, piece) => sum + piece.sizes.length, 0);
    const generatedContours = built.sheets.reduce((sum, sheet) => sum + sheet.blocks.length, 0);

    console.log(
      `card6 full v10: duplicate=${duplicateCount}, unlinked=${unlinkedCount}, fusing contours=${generatedContours}`,
    );
    expect(duplicateCount).toBe(0);
    expect(unlinkedCount).toBe(0);
    expect(expectedContours).toBe(50);
    expect(generatedContours).toBe(expectedContours);
  }, 30_000);
});
