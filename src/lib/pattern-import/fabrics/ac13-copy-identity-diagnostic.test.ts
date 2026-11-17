import { describe, expect, it, vi } from 'vitest';
import { identityProblem, readManifest, sizeTokenTest } from '../manifest';
import type { DraftScope, PieceSizeSpec, PieceSpec, WriteJob } from '../types';
import { writeDxfDetailed } from '../write';
import { applyDraft, type ApplyDeps, type FormWrite, type LiveCard } from './apply';
import { sealApplyNewPieceIntent, type ApplyNewPieceIntent } from './apply-new-piece-intent';
import { buildDraft, type DraftCardContext } from './draft';

const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';
const ORIGINAL = { lineKey: 'saved-original', name: 'BASE_FRONT' };
const RETAINED_OTHER = { lineKey: 'saved-other', name: 'FRONT_COPY' };
const COPY_ID = 'COPY_FRONT';
const PLANNED_LINE = 'planned-copy';
const UPLOAD_URL = 'https://diagnostic.invalid/compiled.dxf';
const scopeTarget = {
  scopeKey: MAIN,
  fabricPurpose: MAIN,
  bomLineKey: 'bom-main',
  label: 'Main',
  isInterlining: false,
};

const fixtures = ['S', 'M'].map((token, rank) => ({
  rank,
  token,
  name: token,
  sourceLabel: token,
  sizeId: rank + 1,
}));

function spec(identity: string, seed: number): PieceSpec {
  return {
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
    fabrics: [MAIN],
    fused: false,
    ungraded: false,
    sizes: fixtures.map(
      ({ rank, sizeId, token }): PieceSizeSpec => ({
        rank,
        sizeId,
        sizeToken: token,
        cut: [
          { x: 0, y: 0 },
          { x: 80 + rank, y: 0 },
          { x: 0, y: 100 + rank },
        ],
        seam: null,
        grain: {
          kind: 'grain',
          origin: 'operator',
          ranges: [],
          confidence: 1,
          a: { x: 10, y: 10 },
          b: { x: 10, y: 40 },
          angleDeg: 90,
        },
        notches: [],
        drills: [
          { kind: 'drill', origin: 'operator', ranges: [], confidence: 1, at: { x: 8, y: 20 } },
        ],
        internal: [],
        fold: null,
        offset: null,
        walls: [],
        bbox: { minX: 0, minY: 0, maxX: 80 + rank, maxY: 100 + rank },
        areaMm2: ((80 + rank) * (100 + rank)) / 2,
      }),
    ),
  };
}

function existing(pieces: DraftCardContext['existingPieces']): DraftCardContext {
  return {
    techCardId: 33,
    styleLabel: 'AC13 diagnostic',
    existingPieces: pieces,
    existingAliases: pieces.map(({ lineKey, name }) => ({
      scopeKey: MAIN,
      blockName: name,
      pieceLineKey: lineKey,
    })),
    existingPatterns: [
      {
        scopeKey: MAIN,
        lineKey: 'current-pattern',
        name: 'Current',
        filename: 'current.dxf',
        url: 'https://diagnostic.invalid/current.dxf',
      },
    ],
  };
}

function writeScope(pieces: PieceSpec[]): DraftScope {
  const job: WriteJob = {
    techCardId: 33,
    scope: scopeTarget,
    pieces,
    sizes: fixtures,
    source: {
      files: [],
      scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
      sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      sizeEncoding: 'dxf-block',
      variant: null,
    },
    generator: 'detached AC13 diagnostic',
    dialect: 'r12',
  };
  const { dxfText } = writeDxfDetailed(job, { now: () => new Date(0) });
  const manifest = readManifest(dxfText);
  if (!manifest) throw new Error('The diagnostic writer must round-trip its manifest.');
  expect(
    manifest.blocks
      .filter(({ identity }) => identity === COPY_ID)
      .map(({ sizeToken }) => sizeToken),
  ).toEqual(['S', 'M']);
  return {
    target: scopeTarget,
    filename: 'compiled.dxf',
    name: 'Compiled',
    dxfText,
    manifest,
    identities: pieces.map(({ identity }) => identity),
  };
}

const copyOf = (source: PieceSpec, seed: number): PieceSpec => ({
  ...structuredClone(source),
  identity: COPY_ID,
  code: COPY_ID,
  displayName: COPY_ID,
  seed,
});

function draftForCopy() {
  const source = spec(ORIGINAL.name, 1);
  return buildDraft({ scopes: [writeScope([source, copyOf(source, 2)])] }, existing([ORIGINAL]), {
    mintKey: () => PLANNED_LINE,
  });
}

function intentFor(draft: ReturnType<typeof draftForCopy>) {
  return sealApplyNewPieceIntent({
    draft,
    scopeKey: MAIN,
    writerIdentity: COPY_ID,
    expectedLineKey: PLANNED_LINE,
  });
}

function applyFixture(changeWhileUploading?: (live: LiveCard) => LiveCard) {
  const writes: FormWrite[] = [];
  let current: LiveCard = {
    pieces: [ORIGINAL],
    aliases: [{ fabricPurpose: MAIN, blockName: ORIGINAL.name, pieceLineKey: ORIGINAL.lineKey }],
    patterns: [
      {
        fabricPurpose: MAIN,
        lineKey: 'current-pattern',
        sizeId: 2,
        filename: 'current.dxf',
        url: 'https://diagnostic.invalid/current.dxf',
      },
    ],
  };
  const upload = vi.fn<ApplyDeps['upload']>(async ({ filename, text }) => {
    if (changeWhileUploading) current = changeWhileUploading(current);
    return {
      filename,
      url: UPLOAD_URL,
      sizeBytes: new TextEncoder().encode(text).byteLength,
      sha256: 'a'.repeat(64),
    };
  });
  const save = vi.fn(async () => 'ok');
  const deps: ApplyDeps = {
    storageSizeId: 2,
    read: () => current,
    readPreviousLockVersion: () => 4,
    upload,
    write: (path, value) => writes.push({ path, value }),
    save,
  };
  return {
    deps,
    writes,
    upload,
    save,
    change: (update: (live: LiveCard) => LiveCard) => {
      current = update(current);
    },
  };
}

const byName = (live: LiveCard): LiveCard => ({
  ...live,
  pieces: [...live.pieces, { lineKey: 'late-existing', name: COPY_ID }],
});
const byLine = (live: LiveCard): LiveCard => ({
  ...live,
  pieces: [...live.pieces, { lineKey: PLANNED_LINE.toUpperCase(), name: 'Spare' }],
});
const byAlias = (live: LiveCard): LiveCard => ({
  ...live,
  aliases: [
    ...live.aliases,
    { fabricPurpose: MAIN, blockName: COPY_ID, pieceLineKey: ORIGINAL.lineKey },
  ],
});

describe('AC13 copy identity diagnostic on the existing reimport owner', () => {
  it('coalesces a distinct two-rank copy with a retained token-equivalent card alias', () => {
    expect(identityProblem(COPY_ID, { isSizeToken: sizeTokenTest(['S', 'M']) })).toBeNull();
    const source = spec(ORIGINAL.name, 1);
    const scope = writeScope([source, spec(RETAINED_OTHER.name, 2), copyOf(source, 3)]);
    const draft = buildDraft({ scopes: [scope] }, existing([ORIGINAL, RETAINED_OTHER]), {
      mintKey: () => PLANNED_LINE,
    });
    expect(draft.unresolved).toBeUndefined();
    expect(draft.pieces.filter(({ basis }) => basis === 'new')).toHaveLength(0);
    expect(intentFor(draft)).toBeNull();
    expect(draft.aliases).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ blockName: ORIGINAL.name, pieceLineKey: ORIGINAL.lineKey }),
        expect.objectContaining({
          blockName: RETAINED_OTHER.name,
          pieceLineKey: RETAINED_OTHER.lineKey,
        }),
        expect.objectContaining({ blockName: COPY_ID, pieceLineKey: RETAINED_OTHER.lineKey }),
      ]),
    );
  });

  it('silently substitutes a late existing card row for the approved new copy in Apply', async () => {
    const draft = draftForCopy();
    expect(draft.pieces).toContainEqual(
      expect.objectContaining({
        lineKey: PLANNED_LINE,
        name: COPY_ID,
        basis: 'new',
        existingLineKey: null,
      }),
    );
    const { deps, writes } = applyFixture(byName);
    const result = await applyDraft(draft, deps);
    expect(result).toMatchObject({
      ok: true,
      commitReceipt: {
        scopes: [
          expect.objectContaining({
            aliases: expect.arrayContaining([
              expect.objectContaining({ blockName: ORIGINAL.name, pieceLineKey: ORIGINAL.lineKey }),
              expect.objectContaining({ blockName: COPY_ID, pieceLineKey: 'late-existing' }),
            ]),
          }),
        ],
      },
    });
    expect(writes.some(({ path }) => path === 'pieces')).toBe(false);
  });
});

describe('strict opt-in for a sealed new-piece intent', () => {
  it('keeps the approved key distinct through the ordinary write plan and receipt', async () => {
    const draft = draftForCopy();
    const newPieceIntent = intentFor(draft);
    if (!newPieceIntent) throw new Error('Expected a seal for the verified new draft piece.');
    const { deps, writes, save } = applyFixture();
    const result = await applyDraft(draft, { ...deps, newPieceIntent });
    expect(result).toMatchObject({
      ok: true,
      commitReceipt: {
        scopes: [
          expect.objectContaining({
            pieceLineKeys: [ORIGINAL.lineKey, PLANNED_LINE],
            aliases: expect.arrayContaining([
              expect.objectContaining({ blockName: ORIGINAL.name, pieceLineKey: ORIGINAL.lineKey }),
              expect.objectContaining({ blockName: COPY_ID, pieceLineKey: PLANNED_LINE }),
            ]),
          }),
        ],
      },
    });
    expect(writes.map(({ path }) => path)).toEqual(['patterns', 'pieces', 'pieceDxfAliases']);
    expect(save).toHaveBeenCalledOnce();
  });

  it.each([
    ['name', byName],
    ['line key', byLine],
    ['scope alias', byAlias],
  ] as const)(
    'refuses a late %s collision after upload before touching the form',
    async (_reason, collision) => {
      const draft = draftForCopy();
      const newPieceIntent = intentFor(draft);
      if (!newPieceIntent) throw new Error('Expected a seal for the verified new draft piece.');
      const { deps, writes, upload, save } = applyFixture(collision);
      await expect(applyDraft(draft, { ...deps, newPieceIntent })).resolves.toMatchObject({
        ok: false,
        failedScope: MAIN,
        uploaded: [expect.objectContaining({ url: UPLOAD_URL })],
      });
      expect(upload).toHaveBeenCalledOnce();
      expect(writes).toEqual([]);
      expect(save).not.toHaveBeenCalled();
    },
  );

  it('refuses an already occupied key and forged or cross-review tokens before upload', async () => {
    const draft = draftForCopy();
    const newPieceIntent = intentFor(draft);
    if (!newPieceIntent) throw new Error('Expected a seal for the verified new draft piece.');
    const { deps, change, writes, upload, save } = applyFixture();
    for (const token of [{} as ApplyNewPieceIntent, newPieceIntent]) {
      await expect(
        applyDraft(draftForCopy(), { ...deps, newPieceIntent: token }),
      ).resolves.toMatchObject({
        ok: false,
        uploaded: [],
      });
    }
    change(byLine);
    await expect(applyDraft(draft, { ...deps, newPieceIntent })).resolves.toMatchObject({
      ok: false,
      uploaded: [],
    });
    expect(upload).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a lost-piece answer that would redirect the actual write plan', async () => {
    const draft = draftForCopy();
    const newPieceIntent = intentFor(draft);
    if (!newPieceIntent) throw new Error('Expected a seal for the verified new draft piece.');
    const { deps, change, writes, save } = applyFixture();
    change((live) => ({ ...live, pieces: [...live.pieces, RETAINED_OTHER] }));
    draft.answers = { lost: { [RETAINED_OTHER.lineKey]: PLANNED_LINE } };
    await expect(applyDraft(draft, { ...deps, newPieceIntent })).resolves.toMatchObject({
      ok: false,
      failedScope: MAIN,
    });
    expect(writes).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });
});
