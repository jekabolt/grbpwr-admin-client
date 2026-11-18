import { DirectClient } from '../ordinary-dxf-wizard.test-fixture';
import type { StageIO, StageName } from 'lib/pattern-import/types';
import { createDxfProductSavedNativeReprocessOwnerV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import { createPatternImportDxfPhaseESavedDxfReprocessHostV1 } from './saved-dxf-reprocess-host-v1';
import { buildAst } from 'lib/pattern-import/adapters/dxf/ast';
import { tokenize } from 'lib/pattern-import/adapters/dxf/tags';
import { expect, it } from 'vitest';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { writeAndGate } from 'lib/pattern-import/gate';
import { withGradeMap } from 'lib/pattern-import/write/grade-map';
import * as blockRules from '../../nesting/block-code';
import { embedManifest, readManifest } from 'lib/pattern-import/manifest';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  digestFullAssemblyFixture,
} from './saved-full-assembly-compile-session-v1.test-fixture';

type SavedFixture = Awaited<ReturnType<typeof createSavedThreePanelFixtureV1>>;
async function halfFixture(dialect: 'r12' | 'r2000' = 'r12') {
  const f = await createSavedThreePanelFixtureV1(2);
  f.job.dialect = dialect;
  f.card.existingPieces[0]!.cutSymmetry = 'TECH_CARD_PIECE_CUT_SYMMETRY_FOLD';
  const front = f.job.pieces[0]!,
    s = front.sizes[0]!;
  front.halfFold = { evidence: ['confirmed fixture half'] };
  s.fold = {
    kind: 'fold',
    origin: 'operator',
    ranges: [],
    confidence: 1,
    a: s.cut[1]!,
    b: s.cut[0]!,
  };
  return f;
}
async function publish(
  f: SavedFixture,
  mutate?: (output: ReturnType<typeof writeDxfDetailed>) => string,
) {
  const written = writeDxfDetailed(f.job, { now: () => new Date(f.written.manifest.createdAt) });
  f.bytes = new TextEncoder().encode(mutate?.(written) ?? written.dxfText);
  f.row = { ...f.row, sha256: await digestFullAssemblyFixture(f.bytes), sizeBytes: f.bytes.length };
  f.card.existingPatterns![0]!.manifest = written.manifest;
}
it.each(['r12', 'r2000'] as const)(
  'replays the exact authoritative %s half bytes with their original direction',
  async (dialect) => {
    const f = await halfFixture(dialect);
    await publish(f);
    const fresh = await createSavedThreePanelSourceV1(f, true);
    try {
      const scope = fresh.native.draft.scopes[0]!,
        replay = scope.writerReplay!;
      const half = replay.job.pieces.filter((p) => p.halfFold);
      expect(half).toHaveLength(1);
      expect(half[0]!.identity).toBe('FRONT');
      expect(half[0]!.unfoldedFold).toBe(false);
      expect(half[0]!.sizes[0]!.fold).toMatchObject({ a: { x: 100, y: 0 }, b: { x: 0, y: 0 } });
      expect(replay.job.dialect).toBe(dialect);
      expect(fresh.native.row.sha256).toBe(f.row.sha256);
    } finally {
      fresh.dispose();
    }
  },
);
it.each([
  'wrong-policy',
  'missing-line',
  'duplicate-alias',
  'same-line-another-block',
  'scope-collision',
  'wrong-pattern',
  'wrong-scope',
  'missing-axis',
  'inside',
  'legacy',
  'multiple-cuts',
  'forged-record',
  'wrong-contour',
  'duplicate-axis',
  'bulged-axis',
  'bulged-cut',
  'wrong-layer',
  'altered-response',
] as const)('refuses unbound half authority for %s', async (variant) => {
  const f = await halfFixture(),
    front = f.job.pieces[0]!,
    size = front.sizes[0]!;
  if (variant === 'wrong-policy')
    f.card.existingPieces[0]!.cutSymmetry = 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL';
  if (variant === 'missing-line') f.card.existingPieces.shift();
  if (variant === 'duplicate-alias')
    f.card.existingAliases!.push({ ...f.card.existingAliases![0]! });
  if (variant === 'same-line-another-block')
    f.card.existingAliases![1]!.pieceLineKey = f.card.existingAliases![0]!.pieceLineKey;
  if (variant === 'scope-collision')
    f.card.existingAliases!.push({ ...f.card.existingAliases![0]!, scopeKey: ' main ' });
  if (variant === 'wrong-pattern') f.card.existingPatterns![0]!.lineKey += '-replaced';
  if (variant === 'wrong-scope') f.card.existingAliases![0]!.scopeKey = 'lining';
  if (variant === 'missing-axis') size.fold = null;
  if (variant === 'inside') size.fold!.a = { x: 30, y: 40 };
  if (variant === 'legacy') delete front.halfFold;
  if (variant === 'multiple-cuts') {
    front.piecesPerGarment = 2;
    f.card.existingPieces[0]!.piecesPerGarment = 2;
  }
  if (variant === 'forged-record') {
    f.card.existingPieces[1]!.cutSymmetry = 'TECH_CARD_PIECE_CUT_SYMMETRY_FOLD';
    delete front.halfFold;
    size.fold = null;
  }
  await publish(f, (w) => {
    if (variant === 'forged-record')
      return embedManifest(w.bareText, {
        ...w.manifest,
        pieces: w.manifest.pieces.map((p) =>
          p.identity === 'BACK' ? { ...p, halfFold: true } : p,
        ),
      });
    if (variant === 'wrong-contour') {
      const blocks = structuredClone(w.manifest.blocks);
      blocks[0]!.contour!.pts[0]! += 250;
      return embedManifest(w.bareText, { ...w.manifest, blocks });
    }
    if (variant === 'bulged-axis' || variant === 'bulged-cut' || variant === 'wrong-layer') {
      const lines = w.bareText.split('\r\n');
      const native = buildAst(tokenize(w.bareText).tags).blocks.get('FRONT_M')!.entities;
      const idx = native.findIndex(
        (e) => e.type === 'POLYLINE' && e.layer === (variant === 'bulged-cut' ? '1' : '6'),
      );
      const poly = native[idx]!;
      if (variant === 'wrong-layer') {
        for (const tag of [...poly.tags, ...poly.children.flatMap((v) => v.tags)])
          if (tag.code === 8) lines[tag.line] = '8';
      } else {
        const next = poly.children[1]!.line - 1;
        lines.splice(next, 0, ' 42', '0.000001');
      }
      return embedManifest(lines.join('\r\n'), w.manifest);
    }
    if (variant === 'duplicate-axis') {
      const dx = w.bareText;
      const entities = buildAst(tokenize(dx).tags).blocks.get('FRONT_M')!.entities;
      const idx = entities.findIndex((e) => e.type === 'POLYLINE' && e.layer === '6');
      expect(idx).toBeGreaterThan(-1);
      const start = entities[idx]!.line - 1,
        end = entities[idx + 1]!.line - 1;
      const lines = dx.split('\r\n');
      lines.splice(start, 0, ...lines.slice(start, end));
      return embedManifest(lines.join('\r\n'), w.manifest);
    }
    return w.dxfText;
  });
  if (variant === 'altered-response') f.row = { ...f.row, sha256: '0'.repeat(64) };
  const blocker =
    variant === 'altered-response'
      ? 'saved-row-sha256-mismatch'
      : variant === 'legacy'
        ? 'reconstructed-writer-byte-replay-mismatch'
        : 'saved-dxf-reprocess-failed';
  await expect(createSavedThreePanelSourceV1(f)).rejects.toThrow(blocker);
});

async function gradedHalf(
  dialect: 'r12' | 'r2000',
  damaged: false | 'missing' | 'interior' = false,
  coincidentAxes = false,
) {
  const f = await createSavedThreePanelFixtureV1(2, { wizardExport: true });
  f.job.dialect = dialect;
  const front = f.job.pieces[0]!;
  front.halfFold = { evidence: ['confirmed graded half'] };
  f.card.existingPieces[0]!.cutSymmetry = 'TECH_CARD_PIECE_CUT_SYMMETRY_FOLD';
  for (const size of front.sizes) {
    const [a, b] =
      size.rank === 0 || coincidentAxes
        ? [size.cut[1]!, size.cut[0]!]
        : [size.cut[2]!, size.cut[1]!];
    size.fold = { kind: 'fold', origin: 'operator', confidence: 1, ranges: [], a, b };
  }
  if (damaged === 'missing') front.sizes[1]!.fold = null;
  if (damaged === 'interior') front.sizes[1]!.fold!.a = { x: 30, y: 21 };
  const opts = { now: () => new Date(f.written.manifest.createdAt) };
  const output = writeDxfDetailed(f.job, opts);
  let text = output.dxfText;
  if (!damaged) {
    const gated = await writeAndGate(f.job, {
      ...opts,
      rules: blockRules,
      sizeTokens: new Set(['M', 'L']),
    });
    if (!gated.report.passed)
      throw new Error(JSON.stringify(gated.report.checks.filter((c) => !c.ok)));
    const graded = await withGradeMap(gated.dxfText, f.job.sizes);
    expect(graded.file).not.toBeNull();
    text = graded.text;
  }
  f.bytes = new TextEncoder().encode(text);
  f.row = { ...f.row, sizeBytes: f.bytes.length, sha256: await digestFullAssemblyFixture(f.bytes) };
  f.card.existingPatterns![0]!.manifest = readManifest(text)!;
  return f;
}

it.each(['r12', 'r2000'] as const)(
  'replays both independent confirmed half ranks with the complete %s writer bytes and grade map',
  async (dialect) => {
    const f = await gradedHalf(dialect),
      owner = await createSavedThreePanelSourceV1(f, true);
    try {
      const scope = owner.native.draft.scopes[0]!,
        replay = scope.writerReplay!;
      const half = replay.job.pieces.filter((p) => p.halfFold);
      expect(half).toHaveLength(1);
      expect(half[0]!.unfoldedFold).toBe(false);
      expect(
        half[0]!.sizes.map((s) => [s.rank, s.sizeId, s.sizeToken, s.fold?.a, s.fold?.b]),
      ).toEqual([
        [0, 7, 'M', { x: 100, y: 0 }, { x: 0, y: 0 }],
        [1, 8, 'L', { x: 100, y: 104 }, { x: 100, y: 0 }],
      ]);
      expect(owner.native.row.sha256).toBe(f.row.sha256);
      expect(replay.job.dialect).toBe(dialect);
    } finally {
      owner.dispose();
    }
  },
);

it.each(['missing', 'interior'] as const)(
  'refuses the whole saved half when only L has an %s axis',
  async (damage) => {
    const f = await gradedHalf('r12', damage);
    await expect(createSavedThreePanelSourceV1(f)).rejects.toThrow('saved-dxf-reprocess-failed');
  },
);

it.each([
  'direction',
  'size-id',
  'wrong-block',
  'foreign-source',
  'duplicate-rank',
  'missing-rank',
  'generic-axis',
  'generic-identical',
] as const)(
  'withholds the entire current saved publish when the L answer is modified: %s',
  async (variant) => {
    const f = await gradedHalf('r12', false, variant === 'generic-identical');
    let changed = 0,
      wrote = 0;
    class ChangedChoiceClient extends DirectClient {
      override run<S extends StageName>(id: number, stage: S, input: StageIO[S]['in']) {
        if (stage === 'write') wrote++;
        if (stage === 'semantics') {
          const semantic = structuredClone(input) as StageIO['semantics']['in'];
          const [entry] = Object.entries(semantic.savedNativeHalfFolds ?? {});
          if (entry) {
            const [key, axes] = entry;
            const seed = Number(key);
            if (axes?.length !== 2) throw new Error('Expected two actual saved-axis answers.');
            const first = axes.find((x) => x.rank === 0)!,
              second = axes.find((x) => x.rank === 1)!;
            if (variant === 'generic-identical') {
              expect(second.a).toEqual(first.a);
              expect(second.b).toEqual(first.b);
            }
            const modified = { ...second };
            let replacement = [first, modified];
            switch (variant) {
              case 'direction':
                [modified.a, modified.b] = [second.b, second.a];
                break;
              case 'size-id':
                modified.sizeId = first.sizeId;
                break;
              case 'wrong-block':
                modified.block = first.block;
                break;
              case 'foreign-source':
                modified.sourceSha256 = 'f'.repeat(64);
                break;
              case 'duplicate-rank':
                replacement = [first, first];
                break;
              case 'missing-rank':
                replacement = [first];
                break;
              case 'generic-identical':
              case 'generic-axis':
                delete semantic.savedNativeHalfFolds;
                semantic.operatorFold = { [seed]: { a: first.a, b: first.b, half: true } };
                break;
            }
            if (semantic.savedNativeHalfFolds) semantic.savedNativeHalfFolds[seed] = replacement;
            changed++;
            return super.run(id, stage, semantic as StageIO[S]['in']);
          }
        }
        return super.run(id, stage, input);
      }
    }
    const host = createPatternImportDxfPhaseESavedDxfReprocessHostV1({
      resolveCard: async () => ({ card: f.card, cardLockVersion: f.row.cardLockVersion }),
      readAuthoritativeRow: async () => ({ row: f.row, downloadUrl: f.row.url }),
      fetch: async () => new Response(f.bytes.slice()),
      createClient: () => new ChangedChoiceClient(),
    });
    const owner = createDxfProductSavedNativeReprocessOwnerV1(host);
    try {
      const result = await owner.run({
        schemaVersion: DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1,
        row: f.row,
      });
      expect(result.ok).toBe(false);
      expect(result.blockers[0]?.code).toBe('saved-dxf-reprocess-failed');
      expect(changed).toBe(1);
      expect(wrote).toBe(0);
    } finally {
      owner.dispose();
      host.dispose();
    }
  },
);

it('makes G5 refuse an R2000 L axis whose endpoints were reversed after the plan', async () => {
  const f = await gradedHalf('r2000');
  const alternate = structuredClone(f.job),
    fold = alternate.pieces[0]!.sizes[1]!.fold!;
  [fold.a, fold.b] = [fold.b, fold.a];
  const redrawn = writeDxfDetailed(alternate).bareText;
  const gated = await writeAndGate(f.job, {
    rules: blockRules,
    sizeTokens: new Set(['M', 'L']),
    embed: (_text, m) => embedManifest(redrawn, m),
  });
  const check = gated.report.checks.find((c) => c.id === 'G5-features')!;
  expect(check.ok).toBe(false);
  expect(check.blocks).toEqual(['FRONT_L']);
  expect(check.note).toContain('directed confirmed half axis on layer 6');
});

it('still requires every ordinary layer-8 path on a confirmed R2000 half', async () => {
  const f = await gradedHalf('r2000');
  for (const size of f.job.pieces[0]!.sizes)
    size.internal.push({
      kind: 'internal',
      origin: 'operator',
      confidence: 1,
      ranges: [],
      closed: false,
      pts: [
        { x: 20, y: 20 },
        { x: 35, y: 28 },
        { x: 38, y: 36 },
      ],
    });
  const valid = await writeAndGate(f.job, { rules: blockRules, sizeTokens: new Set(['M', 'L']) });
  expect(valid.report.passed).toBe(true);
  const alternate = structuredClone(f.job);
  alternate.pieces[0]!.sizes[1]!.internal = [];
  const redrawn = writeDxfDetailed(alternate).bareText;
  const damaged = await writeAndGate(f.job, {
    rules: blockRules,
    sizeTokens: new Set(['M', 'L']),
    embed: (_text, manifest) => embedManifest(redrawn, manifest),
  });
  const failure = damaged.report.checks.find((c) => c.id === 'G5-features')!;
  expect(failure.ok).toBe(false);
  expect(failure.blocks).toContain('FRONT_L');
  expect(failure.note).toContain('card parser keeps 0 of 1 layer-8 paths');
});
