import { expect, it } from 'vitest';
import {
  consumeDxfProductSavedNativeCompilerSourceV1 as consume,
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1 as schemaVersion,
} from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import { aliasKey } from 'lib/pattern-import/fabrics/draft';
import { answer, NEW_PIECE } from 'lib/pattern-import/fabrics/assembly-impact';
import { planFormWrites } from 'lib/pattern-import/fabrics/apply';
import { signedArea } from 'lib/pattern-import/semantics/geom';
import { writeDxfDetailed } from 'lib/pattern-import/write';
import { draftThroughWizardStages } from '../ordinary-dxf-wizard.test-fixture';
import { readSavedNativeCutEdgesV1 } from './draft-cad-parallel-spread-source-v1';
import { prepareSavedJoinBoundaryV1 } from './draft-cad-saved-join-boundary-v1';
import {
  createSavedThreePanelFixtureV1,
  createSavedThreePanelSourceV1,
  digestFullAssemblyFixture,
} from './saved-full-assembly-compile-session-v1.test-fixture';

async function fixture(
  dialect: 'r12' | 'r2000',
  geometry?: 'different-grain' | 'sloped' | 'two-ranks',
) {
  const seed = await createSavedThreePanelFixtureV1(2);
  const { card, job } = seed;
  card.assembly = { ops: [], seams: [] };
  job.dialect = dialect;
  for (const [i, p] of job.pieces.entries()) {
    const name = i ? 'BP' : 'FP';
    p.code = p.identity = p.displayName = name;
    card.existingAliases![i]!.blockName = card.existingPieces[i]!.name = name;
    p.allowance.meaning = 'both';
    const z = p.sizes[0]!;
    const x = i ? 100 : 0;
    z.cut = [
      { x, y: 0 },
      { x: x + 100, y: 0 },
      { x: x + 100, y: 100 },
      { x, y: 100 },
    ];
    z.seam = structuredClone(z.cut);
    z.grain = { ...z.grain!, a: { x: 100, y: 20 }, b: { x: 100, y: 80 } };
    z.cutLoops = [
      [
        { x: x + 20, y: 30 },
        { x: x + 20, y: 40 },
        { x: x + 30, y: 40 },
        { x: x + 30, y: 30 },
      ],
    ];
    z.areaMm2 = 9900;
    z.internal = [
      {
        kind: 'internal',
        label: 'draft-cad:dart',
        closed: false,
        origin: 'operator',
        confidence: 1,
        ranges: [],
        pts: [
          { x: x + 45, y: 65 },
          { x: x + 50, y: 72 },
          { x: x + 55, y: 65 },
        ],
      },
    ];
    z.drills = [
      {
        kind: 'drill',
        at: { x: x + 60, y: 22 },
        ...(dialect === 'r12'
          ? { form: 'point' as const }
          : { form: 'circle' as const, sizeMm: 4 }),
        origin: 'operator',
        confidence: 1,
        ranges: [],
      },
    ];
    z.textMarks = [{ text: name, at: { x: x + 35, y: 45 } }];
    z.pointMarks = [{ kind: 'point-only', at: { x: x + 44, y: 55 } }];
  }
  if (geometry === 'different-grain') {
    const g = job.pieces[1]!.sizes[0]!.grain!;
    g.a.x += 20;
    g.b.x += 20;
  }
  if (geometry === 'sloped') {
    const z = job.pieces[0]!.sizes[0]!;
    z.cut[0]!.x += 10;
    z.seam = structuredClone(z.cut);
    z.areaMm2 -= 500;
  }
  if (geometry === 'two-ranks') {
    job.sizes.push({ token: 'L', sizeId: 8, name: 'Large', sourceLabel: 'L', rank: 1 });
    card.sizes.push({ token: 'L', sizeId: 8, name: 'Large', spellings: ['L', 'Large'], rank: 1 });
    job.source.sizeEncoding = 'dxf-block';
    for (const p of job.pieces)
      p.sizes.push({ ...structuredClone(p.sizes[0]!), sizeToken: 'L', sizeId: 8, rank: 1 });
  }
  const written = writeDxfDetailed(job);
  const baseline = await draftThroughWizardStages(
    new File([written.dxfText], 'joined-source.dxf'),
    card,
    undefined,
    undefined,
    undefined,
    dialect,
  );
  const s = baseline.scopes[0]!;
  seed.bytes = new TextEncoder().encode(s.dxfText);
  seed.row = {
    ...seed.row,
    sha256: await digestFullAssemblyFixture(seed.bytes),
    sizeBytes: seed.bytes.length,
  };
  card.existingPatterns![0]!.manifest = s.manifest;
  const open = async () => {
    const source = await createSavedThreePanelSourceV1(seed);
    const n = source.native;
    return {
      sourceOwner: n.sourceOwner,
      sourceRequest: {
        schemaVersion,
        sourceFileId: n.sourceFileId,
        sourceSha256: n.row.sha256,
        techCardId: n.row.techCardId,
        scopeKey: n.row.scopeKey,
        patternLineKey: n.row.patternLineKey,
        cardLockVersion: n.row.cardLockVersion,
        draft: n.draft,
      } as const,
      dispose: source.dispose,
    };
  };
  const preview = await open();
  let fixed, moving, translateMovingMm;
  try {
    const src = consume(preview.sourceOwner, preview.sourceRequest);
    if (!src.ok) throw Error(JSON.stringify(src.blockers));
    const [left, right] = await readSavedNativeCutEdgesV1(src.value, ['FP', 'BP']);
    const edge = (part: typeof left, sign: number) =>
      part!.edges[0]!.descriptors.find(
        (e) => e.startMm[0] === e.endMm[0] && Math.sign(e.endMm[1] - e.startMm[1]) === sign,
      )!;
    const le = edge(left, 1),
      re = edge(right, -1);
    const pick = (pieceId: string, index: number, e: typeof le) => ({
      pieceId,
      pieceLineKey: card.existingPieces[index]!.lineKey,
      sourceCurveId: e.sourceCurveId,
      startVertexId: e.startVertexId,
      endVertexId: e.endVertexId,
    });
    fixed = pick('FP', 0, le);
    moving = pick('BP', 1, re);
    translateMovingMm = { x: le.startMm[0] - re.endMm[0], y: le.startMm[1] - re.endMm[1] };
  } finally {
    preview.dispose();
  }
  return {
    card,
    seed,
    open,
    intent: {
      fixed,
      moving,
      translateMovingMm,
      newIdentity: 'JN',
      row: structuredClone(seed.row),
      sizeToken: 'M',
    },
  };
}
it.each(['r12', 'r2000'] as const)(
  'registers two original %s boundary intervals and reopens the one exact union',
  async (dialect) => {
    const f = await fixture(dialect);
    const source = await f.open();
    try {
      const r = await prepareSavedJoinBoundaryV1({
        ...source,
        selection: f.intent,
        readCurrent: () => ({ card: f.card, row: f.seed.row }),
      });
      expect(r.job.pieces.map((p) => p.identity)).toEqual(['JN']);
      expect(r.selection.fixed.pieceLineKey).not.toBe(r.selection.moving.pieceLineKey);
      const size = r.job.pieces[0]!.sizes[0]!;
      expect(size.areaMm2).toBe(19800);
      expect(f.intent.translateMovingMm).toEqual({ x: -50, y: 0 });
      expect(size.cut).toEqual([
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
        { x: 0, y: 100 },
      ]);
      expect(size.cutLoops).toEqual(
        [0, 100].map((x) => [
          { x: x + 20, y: 30 },
          { x: x + 20, y: 40 },
          { x: x + 30, y: 40 },
          { x: x + 30, y: 30 },
        ]),
      );
      expect(size.pointMarks).toEqual(
        [0, 100].map((x) => ({ kind: 'point-only', at: { x: x + 44, y: 55 } })),
      );
      expect(size.textMarks).toEqual(
        ['FP', 'BP'].map((text, i) => ({ text, at: { x: 100 * i + 35, y: 45 } })),
      );
      expect(size.internal.map((m) => [m.label, m.pts])).toEqual(
        [0, 100].map((x) => [
          'draft-cad:dart',
          [
            { x: x + 45, y: 65 },
            { x: x + 50, y: 72 },
            { x: x + 55, y: 65 },
          ],
        ]),
      );
      expect(size.drills.map((d) => [d.form, d.sizeMm, d.at])).toEqual(
        [0, 100].map((x) => [
          dialect === 'r12' ? 'point' : 'circle',
          dialect === 'r12' ? undefined : 4,
          { x: x + 60, y: 22 },
        ]),
      );
      expect([size.grain!.a, size.grain!.b]).toEqual([
        { x: 100, y: -40 },
        { x: 100, y: 140 },
      ]);
      const reviewed = await draftThroughWizardStages(
        new File([writeDxfDetailed(r.job).dxfText], 'join.dxf'),
        f.card,
        undefined,
        undefined,
        undefined,
        dialect,
      );
      expect(reviewed.scopes[0]!.manifest.gate?.passed).toBe(true);
      const output = reviewed.scopes[0]!.writerReplay!.job.pieces;
      expect(output.map((p) => p.identity)).toEqual(['JN']);
      const z = output[0]!.sizes[0]!;
      expect(z.cutLoops?.map(signedArea)).toEqual([-100, -100]);
      expect(z.textMarks?.map((m) => m.text).sort()).toEqual(['BP', 'FP']);
      const project = (s: typeof z) => ({
        cut: s.cut,
        holes: s.cutLoops,
        grain: [s.grain!.a, s.grain!.b],
        text: s.textMarks,
        points: s.pointMarks,
        internal: s.internal.map((m) => [m.label, m.closed, m.pts]),
        drills: s.drills.map((d) => [d.form, d.sizeMm, d.at]),
        rank: [s.sizeToken, s.sizeId, s.rank],
      });
      expect(project(z)).toEqual(project(size));
      expect(z.internal).toHaveLength(2);
      expect(z.drills).toHaveLength(2);
      const sc = reviewed.scopes[0]!;
      const row = {
        ...f.seed.row,
        url: f.seed.row.url + '?join',
        revision: f.seed.row.revision + 1,
        cardLockVersion: f.seed.row.cardLockVersion + 1,
      };
      const bytes = new TextEncoder().encode(sc.dxfText);
      row.sizeBytes = bytes.length;
      row.sha256 = await digestFullAssemblyFixture(bytes);
      // Pure production Apply planner demonstrates the outstanding retirement contract.
      expect(reviewed.unresolved?.map((u) => u.identity)).toEqual(['JN']);
      const u = reviewed.unresolved![0]!;
      const resolved = {
        ...reviewed,
        answers: answer(reviewed.answers, 'blocks', aliasKey(u.scopeKey, u.blockName), NEW_PIECE),
      };
      const plan = planFormWrites(
        resolved,
        {
          pieces: f.card.existingPieces,
          aliases: f.card.existingAliases!.map((a) => ({ ...a, fabricPurpose: 'main' })),
          patterns: f.card.existingPatterns!.map((p) => ({
            ...p,
            fabricPurpose: 'main',
            sizeId: 7,
          })),
        },
        [
          {
            scopeKey: 'main',
            url: row.url,
            filename: sc.filename,
            sizeBytes: bytes.length,
            sha256: row.sha256,
          },
        ],
        { storageSizeId: 7, mintKey: () => 'test-fresh-key' },
      );
      expect(plan.writes.find((w) => w.path === 'pieceDxfAliases')?.value).toEqual(
        expect.arrayContaining(
          ['line-FRONT', 'line-BACK', 'test-fresh-key'].map((pieceLineKey) =>
            expect.objectContaining({ pieceLineKey }),
          ),
        ),
      );
      // Read the emitted file as a separate fixture row. No form changes or Apply receipt assumed.
      const scopeCard = {
        ...f.card,
        existingPieces: [
          ...f.card.existingPieces,
          { ...f.card.existingPieces[0]!, lineKey: 'test-fresh-key', name: 'JN' },
        ],
        existingAliases: [
          ...f.card.existingAliases!,
          { scopeKey: u.scopeKey, pieceLineKey: 'test-fresh-key', blockName: u.blockName },
        ],
        existingPatterns: [
          { ...f.card.existingPatterns![0]!, url: row.url, manifest: sc.manifest },
        ],
      };
      const reopened = await createSavedThreePanelSourceV1({
        ...f.seed,
        bytes,
        row,
        card: scopeCard,
      });
      try {
        expect(reopened.native.row).toEqual(row);
        const saved = reopened.native.draft.scopes[0]!.writerReplay!.job.pieces;
        expect(saved.map((p) => p.identity)).toEqual(['JN']);
        expect(project(saved[0]!.sizes[0]!)).toEqual(project(size));
      } finally {
        reopened.dispose();
      }
    } finally {
      source.dispose();
    }
  },
);

it.each([
  'foreign-edge',
  'reversed-vertex',
  'translation',
  'same-piece',
  'wrong-rank',
  'alias',
  'assembly',
  'missing-assembly',
  'row-drift',
  'forged-owner',
  'tampered-feature',
  'identity',
] as const)('refuses %s before producing replacement geometry', async (attack) => {
  const f = await fixture('r12'),
    source = await f.open();
  try {
    const sel = structuredClone(f.intent);
    let owner: unknown = source.sourceOwner;
    let n = 0;
    const current = () => ({
      card: f.card,
      row:
        attack === 'row-drift' && n++ > 0
          ? { ...f.seed.row, cardLockVersion: f.seed.row.cardLockVersion + 1 }
          : f.seed.row,
    });
    switch (attack) {
      case 'foreign-edge':
        sel.fixed.sourceCurveId = sel.moving.sourceCurveId;
        break;
      case 'reversed-vertex':
        [sel.fixed.startVertexId, sel.fixed.endVertexId] = [
          sel.fixed.endVertexId,
          sel.fixed.startVertexId,
        ];
        break;
      case 'translation':
        sel.translateMovingMm.x += 0.000001;
        break;
      case 'same-piece':
        sel.moving = sel.fixed;
        break;
      case 'wrong-rank':
        sel.sizeToken = 'L';
        break;
      case 'alias':
        f.card.existingAliases!.push({
          ...f.card.existingAliases![0]!,
          blockName: ' fp ',
          pieceLineKey: 'other',
        });
        break;
      case 'assembly':
        f.card.assembly!.seams.push({ pieces: [sel.moving.pieceLineKey], confirmed: false });
        break;
      case 'missing-assembly':
        delete f.card.assembly;
        break;
      case 'tampered-feature':
        source.sourceRequest.draft.scopes[0]!.writerReplay!.job.pieces[0]!.sizes[0]!.drills = [];
        break;
      case 'forged-owner':
        owner = { ...source.sourceOwner };
        break;
      case 'identity':
        sel.newIdentity = 'FP';
        break;
    }
    const original = structuredClone(source.sourceRequest.draft);
    await expect(
      prepareSavedJoinBoundaryV1({
        sourceOwner: owner,
        sourceRequest: source.sourceRequest,
        selection: sel,
        readCurrent: current,
      }),
    ).rejects.toThrow();
    expect(source.sourceRequest.draft).toEqual(original);
  } finally {
    source.dispose();
  }
});

it.each(['different-grain', 'sloped', 'two-ranks'] as const)(
  'blocks original native %s input without partial registration',
  async (geometry) => {
    const f = await fixture('r12', geometry);
    const source = await f.open();
    try {
      await expect(
        prepareSavedJoinBoundaryV1({
          ...source,
          selection: f.intent,
          readCurrent: () => ({ row: f.seed.row, card: f.card }),
        }),
      ).rejects.toThrow(geometry === 'different-grain' ? /directed grain/ : /one identical grade/);
    } finally {
      source.dispose();
    }
  },
);
