import { describe, expect, it } from 'vitest';

import { readManifest } from 'lib/pattern-import/manifest';
import type {
  CardDraft,
  ConversionManifest,
  DraftScopeTarget,
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
