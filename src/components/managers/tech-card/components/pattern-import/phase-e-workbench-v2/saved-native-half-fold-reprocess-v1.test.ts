import { buildAst } from 'lib/pattern-import/adapters/dxf/ast';
import { tokenize } from 'lib/pattern-import/adapters/dxf/tags';
import { expect, it } from 'vitest';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { embedManifest } from 'lib/pattern-import/manifest';
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
