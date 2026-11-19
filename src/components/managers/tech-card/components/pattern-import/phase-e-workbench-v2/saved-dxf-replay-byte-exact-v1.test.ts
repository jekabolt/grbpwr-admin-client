import { describe, expect, it } from 'vitest';

import { readManifest } from 'lib/pattern-import/manifest';
import type {
  CardDraft,
  ConversionManifest,
  DraftScopeTarget,
  PieceSizeSpec,
  PieceSpec,
  ReplayAnswer,
  WriteJob,
} from 'lib/pattern-import/types';
import { writeDxfDetailed, type WriteDetail } from 'lib/pattern-import/write';

import { restorePatternImportDxfSavedWriterReplayV1 } from './saved-dxf-reprocess-host-v1';

const CREATED_AT = '2026-11-16T00:00:00.000Z';
const TARGET: DraftScopeTarget = {
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
  bomLineKey: 'bom:main',
  label: 'main',
  isInterlining: false,
  sections: ['TECH_CARD_BOM_SECTION_FABRIC'],
};

const CLOTH_AUTHORED_FRAME: ReplayAnswer = {
  step: 'cloth-preview',
  kind: 'cloth-authored-frame',
  subject: 'front panel · authored frame',
  value: {
    frameId: 'cloth:front:authored:0',
    matrix: [1, 0, 0, 1, 12.5, -3.25],
    pins: [
      { vertexId: 'front:v0', xMm: 12.5, yMm: -3.25 },
      { vertexId: 'front:v1', xMm: 84.75, yMm: 41.125 },
    ],
    future: { solver: 'unknown-to-this-client', revision: 9 },
  },
  strong: true,
};

const encoder = new TextEncoder();

function exactJsonBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(value));
}

function writerJob(): WriteJob {
  return {
    techCardId: 11,
    scope: structuredClone(TARGET),
    pieces: [],
    sizes: [],
    source: {
      files: [
        {
          name: 'pants-source.dxf',
          sha256: 'a'.repeat(64),
          bytes: 321,
          kind: 'dxf',
          pages: 1,
        },
      ],
      scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
      sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      sizeEncoding: 'single',
      variant: null,
    },
    generator: 'saved-dxf-replay-byte-exact-v1-test',
    dialect: 'r12',
    replay: { v: 1, answers: [structuredClone(CLOTH_AUTHORED_FRAME)] },
  };
}

function draftFrom(detail: WriteDetail, job: WriteJob): CardDraft {
  return {
    techCardId: job.techCardId,
    scopes: [
      {
        target: structuredClone(job.scope),
        filename: 'pants-main.dxf',
        name: 'main',
        dxfText: detail.dxfText,
        manifest: detail.manifest,
        identities: [],
        writerReplay: {
          schemaVersion: 'pattern-import-dxf-product-writer-replay-carrier/1',
          createdAt: detail.manifest.createdAt,
          job: { ...structuredClone(job), replay: undefined },
        },
      },
    ],
    pieces: [],
    aliases: [],
    pieceUpdates: [],
    downloads: [],
  };
}

function restoredJob(detail: WriteDetail, job: WriteJob): WriteJob {
  const restored = restorePatternImportDxfSavedWriterReplayV1(
    draftFrom(detail, job),
    detail.manifest,
  );
  const replay = restored.scopes[0]?.writerReplay;
  if (!replay) throw new Error('Saved-only replay did not restore one writer carrier.');
  return replay.job;
}

function replayAnswer(manifest: ConversionManifest): ReplayAnswer {
  const answer = manifest.replay?.answers.find(({ kind }) => kind === 'cloth-authored-frame');
  if (!answer) throw new Error('Unknown cloth-authored-frame replay answer was dropped.');
  return answer;
}

describe('saved-only unknown manifest replay preservation', () => {
  it('keeps cloth-authored-frame and the complete DXF byte-exact through two reload cycles', () => {
    const initialJob = writerJob();
    const initial = writeDxfDetailed(initialJob, { now: () => new Date(CREATED_AT) });
    const initialManifest = readManifest(initial.dxfText);
    if (!initialManifest) throw new Error('Fixture DXF has no embedded manifest.');

    const expectedAnswerBytes = exactJsonBytes(CLOTH_AUTHORED_FRAME);
    const expectedDxfBytes = encoder.encode(initial.dxfText);
    expect(exactJsonBytes(replayAnswer(initialManifest))).toEqual(expectedAnswerBytes);

    const firstJob = restoredJob(initial, initialJob);
    const first = writeDxfDetailed(firstJob, { now: () => new Date(CREATED_AT) });
    const firstManifest = readManifest(first.dxfText);
    if (!firstManifest) throw new Error('First saved-only reload has no manifest.');
    expect(exactJsonBytes(replayAnswer(firstManifest))).toEqual(expectedAnswerBytes);
    expect(encoder.encode(first.dxfText)).toEqual(expectedDxfBytes);

    const secondJob = restoredJob(first, firstJob);
    const second = writeDxfDetailed(secondJob, { now: () => new Date(CREATED_AT) });
    const secondManifest = readManifest(second.dxfText);
    if (!secondManifest) throw new Error('Second saved-only reload has no manifest.');
    expect(exactJsonBytes(replayAnswer(secondManifest))).toEqual(expectedAnswerBytes);
    expect(encoder.encode(second.dxfText)).toEqual(expectedDxfBytes);
  });
});

function mixedRankJob(dialect: WriteJob['dialect']): WriteJob {
  const sizes = ['XS', 'S', 'M', 'L', 'XL'].map((token, rank) => ({
    token,
    name: token,
    sourceLabel: token,
    rank,
    sizeId: 56 + rank,
  }));
  const spec = (identity: string, ungraded: boolean, seed: PieceSpec['seed']): PieceSpec => ({
    identity,
    code: identity,
    mods: [],
    displayName: identity,
    nameOrigin: 'operator',
    seed,
    variant: null,
    pairHand: null,
    pairOf: null,
    unfoldedFold: false,
    piecesPerGarment: 1,
    allowance: { meaning: 'cut', allowanceMm: 0, origin: 'operator', evidence: [] },
    fabrics: [TARGET.scopeKey],
    fused: false,
    ungraded,
    sizes: (ungraded ? sizes.slice(2, 3) : sizes).map(({ token, sizeId, rank }): PieceSizeSpec => {
      const width = 40 + rank;
      const cut = [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: 30 },
        { x: 0, y: 30 },
      ];
      return {
        rank,
        sizeToken: token,
        sizeId,
        cut,
        seam: structuredClone(cut),
        grain: null,
        notches: [],
        drills: [],
        internal: [],
        fold: null,
        offset: null,
        walls: [],
        bbox: { minX: 0, minY: 0, maxX: width, maxY: 30 },
        areaMm2: width * 30,
      };
    }),
  });
  return {
    ...writerJob(),
    sizes,
    dialect,
    pieces: [
      spec('BOUNDARY', false, 1 as PieceSpec['seed']),
      spec('RECT', true, 2 as PieceSpec['seed']),
    ],
  };
}

describe('exact saved UNI writer block replay', () => {
  it.each(['r12', 'r2000'] as const)(
    'retains one UNI block and all five ranked blocks byte-exact in %s',
    (dialect) => {
      const job = mixedRankJob(dialect);
      const options = { now: () => new Date(CREATED_AT) };
      const initial = writeDxfDetailed(job, options);
      const restored = restoredJob(initial, job);
      expect(restored.pieces.find(({ identity }) => identity === 'RECT')?.sizes).toMatchObject([
        { sizeToken: 'M', sizeId: 58, rank: 2 },
      ]);
      const actual = writeDxfDetailed(restored, options);
      expect(actual.manifest.blocks.map(({ block, sizeToken }) => [block, sizeToken])).toEqual([
        ['BOUNDARY_XS', 'XS'],
        ['BOUNDARY_S', 'S'],
        ['BOUNDARY_M', 'M'],
        ['RECT_UNI', 'UNI'],
        ['BOUNDARY_L', 'L'],
        ['BOUNDARY_XL', 'XL'],
      ]);
      expect(actual.dxfText).toBe(initial.dxfText);
    },
  );

  it('refuses a false UNI identity, mismatched authoring rank or extra candidate', () => {
    const job = mixedRankJob('r12');
    const initial = writeDxfDetailed(job, { now: () => new Date(CREATED_AT) });
    const withoutRestoration = () => structuredClone(draftFrom(initial, job));
    const manifest = () => structuredClone(initial.manifest);

    const wrongName = manifest();
    wrongName.blocks.find(({ sizeToken }) => sizeToken === 'UNI')!.block = 'FOREIGN_UNI';
    expect(() =>
      restorePatternImportDxfSavedWriterReplayV1(withoutRestoration(), wrongName),
    ).toThrow('Saved manifest has no unique exact block for RECT / M.');

    const wrongRank = withoutRestoration();
    wrongRank.scopes[0]!.writerReplay!.job.pieces.find(
      ({ identity }) => identity === 'RECT',
    )!.sizes[0]!.rank = 1;
    expect(() => restorePatternImportDxfSavedWriterReplayV1(wrongRank, manifest())).toThrow(
      'Saved manifest has no unique exact block for RECT / M.',
    );

    const duplicate = manifest();
    const block = duplicate.blocks.find(({ sizeToken }) => sizeToken === 'UNI')!;
    duplicate.blocks.push(structuredClone(block));
    expect(() =>
      restorePatternImportDxfSavedWriterReplayV1(withoutRestoration(), duplicate),
    ).toThrow('Saved manifest has no unique exact block for RECT / M.');
  });
});
