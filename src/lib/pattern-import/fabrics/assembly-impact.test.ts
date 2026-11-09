import { describe, expect, it } from 'vitest';

import type {
  AssemblyContext,
  CardDraft,
  ConversionManifest,
  DraftScope,
  DraftShapeRef,
} from '../types';
import { applyDraft, planFormWrites, type LiveCard } from './apply';
import {
  KEEP_OLD,
  NEW_PIECE,
  answer,
  assemblyImpact,
  blockingCount,
  createdCount,
  unclearCount,
  warnCount,
  withAnswers,
  type ImpactCard,
  type ImpactLost,
  type ImpactUnclear,
} from './assembly-impact';
import { buildDraft, type DraftCardContext } from './draft';
import fixture from './__fixtures__/card6-reimport.json';
import assemblyFx from './__fixtures__/card6-assembly.json';

// T4 on golden card 6 (owner 09.11): the card's real operations and seam counts against the
// re-import drafts of the CLO shirt — outlines loaded (nothing to ask), not loaded (two exclusive
// pairs), the left sleeve gone from the file (a lost piece the assembly uses), a clean card.

const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';
const ZONE = 'TECH_CARD_PIECE_FUSING_MODE_ZONE';

const manifest = () => fixture.manifests.main1107 as unknown as ConversionManifest;
function scopeOf(m: ConversionManifest): DraftScope {
  return {
    target: {
      scopeKey: MAIN,
      fabricPurpose: MAIN,
      bomLineKey: 'line:main',
      label: 'main',
      isInterlining: false,
    },
    filename: '',
    name: '',
    dxfText: `0\nSECTION\n999\n${m.createdAt}\n0\nEOF\n`,
    manifest: m,
    identities: m.pieces.map((p) => p.identity),
  };
}
/** The main file without one block (the drawing no longer has it). */
function without(identity: string): ConversionManifest {
  const m = manifest();
  return {
    ...m,
    pieces: m.pieces.filter((p) => p.identity !== identity),
    blocks: m.blocks.filter((b) => b.identity !== identity),
  };
}

const FUSED: Record<string, 'full' | 'zone'> = {
  clr_main: 'full',
  clr_main_2: 'full',
  CLR_SECOND: 'full',
  CLR_SECOND_2: 'full',
  FLP_L: 'full',
  FLP_L_MAIN: 'full',
  FLP_R: 'full',
  FLP_R_MAIN: 'full',
  nck: 'full',
  nck_2: 'full',
  PLCK_L: 'full',
  PLCK_R: 'full',
  SLV_L: 'zone',
  SLV_R: 'zone',
};
const pieces = fixture.card.pieces.map((p) => ({
  ...p,
  fused: !!FUSED[p.name],
  fusingMode: FUSED[p.name] === 'zone' ? ZONE : p.fusingMode,
}));

/** The card's assembly: the real ops, and each piece's confirmed seams (one row per seam). */
const assembly: AssemblyContext = {
  ops: assemblyFx.ops,
  seams: Object.entries(assemblyFx.seamCounts as Record<string, number>).flatMap(([name, n]) =>
    Array.from({ length: n }, () => ({ pieces: [`k:${name}`], confirmed: true })),
  ),
};

function card(over: Partial<DraftCardContext & ImpactCard> = {}): DraftCardContext & ImpactCard {
  return {
    techCardId: 6,
    existingPieces: pieces,
    existingAliases: fixture.card.aliases,
    existingPatterns: fixture.card.patterns,
    existingShapes: fixture.card.shapes as DraftShapeRef[],
    styleLabel: 'SS26-006',
    assembly,
    ...over,
  };
}

let n = 0;
const mintKey = () => `new:${++n}`;
const draftOf = (c = card(), m = manifest()) =>
  buildDraft({ scopes: [scopeOf(m)] }, c, { mintKey });

function live(): LiveCard {
  return {
    patterns: fixture.card.patterns.map((p) => ({
      lineKey: p.lineKey,
      url: p.url,
      filename: p.filename,
      name: p.name,
      ...(p.scopeKey.startsWith('TECH_CARD_')
        ? { fabricPurpose: p.scopeKey }
        : { fabricPurpose: 'TECH_CARD_BOM_PURPOSE_UNSET', bomLineKey: p.scopeKey }),
    })),
    pieces: pieces.map((p) => ({ ...p })),
    aliases: fixture.card.aliases.map((a) => ({
      blockName: a.blockName,
      pieceLineKey: a.pieceLineKey,
      ...(a.scopeKey.startsWith('TECH_CARD_')
        ? { fabricPurpose: a.scopeKey }
        : { bomLineKey: a.scopeKey }),
    })),
  };
}
const plan = (d: CardDraft) =>
  planFormWrites(
    d,
    live(),
    d.scopes.map((s) => ({
      scopeKey: s.target.scopeKey,
      url: `https://files.example/new-${s.filename}`,
      filename: s.filename,
      sizeBytes: 1,
    })),
    { storageSizeId: 2, mintKey },
  );

function renamed(): ConversionManifest {
  const m = manifest();
  return {
    ...m,
    pieces: m.pieces.map((p) =>
      p.identity === 'SLV_L' ? { ...p, identity: 'SLEEVE_L', displayName: 'SLEEVE_L' } : p,
    ),
    blocks: m.blocks.map((b) =>
      b.identity === 'SLV_L' ? { ...b, identity: 'SLEEVE_L', block: 'SLEEVE_L' } : b,
    ),
  };
}
const aliasOf = (p: ReturnType<typeof plan>, block: string) =>
  (
    p.writes.find((w) => w.path === 'pieceDxfAliases')?.value as {
      blockName: string;
      pieceLineKey: string;
    }[]
  )
    .filter((x) => x.blockName === block)
    .map((x) => x.pieceLineKey);
const unclearOf = (d: CardDraft, c = card()) =>
  assemblyImpact(d, c).filter((i): i is ImpactUnclear => i.kind === 'unclear');
const pick = (d: CardDraft, part: 'blocks' | 'lost' | 'take', key: string, v?: string) => ({
  ...d,
  answers: answer(d.answers, part, key, v),
});

describe('assembly impact on card 6', () => {
  it('outlines loaded: every block bound, only the settings the drawing changes', () => {
    const d = draftOf();
    const out = assemblyImpact(d, card());
    expect(out.filter((i) => i.kind !== 'differ')).toEqual([]);
    expect(blockingCount(out)).toBe(0);
    // the drawing's per-garment count never blocks: the card keeps its value (owner default 3)
    for (const i of out) expect(i.severity).not.toBe('block');
  });

  it('outlines not loaded: two exclusive pairs, one question each, the candidates’ first ops', () => {
    const c = card({ existingShapes: [] });
    const d = draftOf(c);
    const out = assemblyImpact(d, c);
    const rows = unclearOf(d, c);
    expect(rows.map((r) => [r.blockName, r.state])).toEqual([
      ['FP_L', 'open'],
      ['YK_L', 'wait'],
      ['FP_R', 'open'],
      ['YK_R', 'wait'],
    ]);
    expect(blockingCount(out)).toBe(2);
    expect(unclearCount(out)).toBe(4);
    const meta = Object.fromEntries(
      rows.flatMap((r) => r.all).map((x) => [x.pieceName, `op ${x.op} · ${x.seams} seams`]),
    );
    expect(meta).toEqual({
      P_L_MAIN: 'op 540 · 9 seams',
      P_L_U: 'op 570 · 8 seams',
      P_R_MAIN: 'op 630 · 10 seams',
      P_R_U: 'op 610 · 10 seams',
    });
    // candidates of an open pair are not reported lost while the question is open
    expect(out.some((i) => i.kind === 'lost')).toBe(false);
    expect(createdCount(d)).toBe(0);
  });

  it('a pair: the first answer settles the sibling; a new piece leaves the card piece lost', () => {
    const c = card({ existingShapes: [] });
    const d = draftOf(c);
    const fpL = unclearOf(d, c).find((r) => r.blockName === 'FP_L')!;
    const pl = fpL.all.find((x) => x.pieceName === 'P_L_MAIN')!.pieceLineKey;
    const a = pick(d, 'blocks', fpL.key, pl);
    const rows = unclearOf(a, c);
    expect(rows.find((r) => r.blockName === 'YK_L')).toMatchObject({
      state: 'auto',
      answer: 'k:P_L_U',
    });
    expect(blockingCount(assemblyImpact(a, c))).toBe(1);

    // apply writes the answers as links to the card pieces: nothing new is created
    const fpR = rows.find((r) => r.blockName === 'FP_R')!;
    const both = pick(a, 'blocks', fpR.key, 'k:P_R_MAIN');
    expect(blockingCount(assemblyImpact(both, c))).toBe(0);
    const p = plan(both);
    expect(p.created).toBe(0);
    const next = p.writes.find((w) => w.path === 'pieceDxfAliases')?.value as {
      blockName: string;
      pieceLineKey: string;
    }[];
    const to = (b: string) => next.filter((x) => x.blockName === b).map((x) => x.pieceLineKey);
    expect(to('FP_L')).toEqual(['k:P_L_MAIN']);
    expect(to('YK_L')).toEqual(['k:P_L_U']);
    expect(to('YK_R')).toEqual(['k:P_R_U']);

    // FP_L made a new piece: YK_L is still asked, P_L_MAIN's ops are not silently lost
    const fresh = pick(d, 'blocks', fpL.key, NEW_PIECE);
    const rows2 = unclearOf(fresh, c);
    expect(rows2.find((r) => r.blockName === 'YK_L')?.state).toBe('open');
    expect(createdCount(fresh)).toBe(1);
  });

  it('the left sleeve gone from the file: apply waits, the ops and seams it carries are named', () => {
    const d = draftOf(card(), without('SLV_L'));
    const out = assemblyImpact(d, card());
    const lost = out.filter((i): i is ImpactLost => i.kind === 'lost');
    expect(lost.map((l) => l.pieceName)).toEqual(['SLV_L']);
    const slv = lost[0];
    expect(slv.severity).toBe('block');
    expect(slv.direct.map((o) => o.number)).toEqual([10, 30]);
    expect(slv.direct.map((o) => o.work)).toEqual(['fuse', 'join / seam']);
    expect(slv.seams).toBe(11);
    expect(slv.fused).toBe('zone');
    expect(slv.units.map((u) => u.unitKey)).toEqual([
      'SLEEVE',
      'SLEEVE-2',
      'BASE WITH SLEEVES',
      'OUTER',
    ]);
    expect(slv.units[0]).toMatchObject({
      unitName: 'left sleeve with placket detail',
      ops: [
        { number: 40, work: 'press to one side' },
        { number: 50, work: 'topstitch' },
        { number: 60, work: 'press flat' },
        { number: 380, work: 'join / seam' },
      ],
    });
    expect(blockingCount(out)).toBe(1);
    expect(warnCount(out)).toBeGreaterThanOrEqual(1);

    // keep old: answered, nothing changes on the card
    const kept = pick(d, 'lost', slv.pieceLineKey, KEEP_OLD);
    expect(blockingCount(assemblyImpact(kept, card()))).toBe(0);
    expect(plan(kept).writes).toEqual(plan(d).writes);
  });

  it('the sleeve redrawn under another name, outlines not loaded: asked as an unclear block', () => {
    const c = card({ existingShapes: [] });
    const d = draftOf(c, renamed());
    const row = unclearOf(d, c).find((r) => r.blockName === 'SLEEVE_L')!;
    expect(row.state).toBe('open');
    expect(row.all.map((x) => x.pieceName)).toContain('SLV_L');
    const a = pick(d, 'blocks', row.key, 'k:SLV_L');
    expect(assemblyImpact(a, c).some((i) => i.kind === 'lost')).toBe(false);
    expect(aliasOf(plan(a), 'SLEEVE_L')).toEqual(['k:SLV_L']);
  });

  it('a lost piece linked to a new block: the block takes the card piece, its ops stay', () => {
    const base = draftOf(card(), without('SLV_L'));
    // a new block of the file the draft could not bind (a new piece of the scope)
    const d: CardDraft = {
      ...base,
      pieces: [
        ...base.pieces,
        {
          lineKey: 'new:sleeve',
          name: 'SLEEVE_L',
          piecesPerGarment: 1,
          cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL',
          grainline: '',
          fused: false,
          fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_UNKNOWN',
          existingLineKey: null,
          ungraded: false,
          basis: 'new',
          scopeKeys: [MAIN],
        },
      ],
      aliases: [
        ...base.aliases,
        {
          scopeKey: MAIN,
          fabricPurpose: MAIN,
          bomLineKey: 'line:main',
          blockName: 'SLEEVE_L',
          pieceLineKey: 'new:sleeve',
        },
      ],
    };
    const slv = assemblyImpact(d, card()).find((i): i is ImpactLost => i.kind === 'lost')!;
    expect(slv.links.map((l) => l.name)).toEqual(['SLEEVE_L']);
    expect(createdCount(d)).toBe(1);
    const linked = pick(d, 'lost', slv.pieceLineKey, 'new:sleeve');
    const out = assemblyImpact(linked, card());
    expect(blockingCount(out)).toBe(0);
    expect(out.some((i) => i.kind === 'fresh')).toBe(false);
    expect(createdCount(linked)).toBe(0);
    const p = plan(linked);
    expect(p.created).toBe(0);
    expect(aliasOf(p, 'SLEEVE_L')).toEqual(['k:SLV_L']);
  });

  it('clean: the card as the file draws it says nothing', () => {
    const d = draftOf();
    const clean: CardDraft = { ...d, pieceDifferences: [] };
    expect(assemblyImpact(clean, card())).toEqual([]);
    // no assembly on the card: nothing either, even with new pieces
    expect(assemblyImpact(clean, card({ assembly: null }))).toEqual([]);
    expect(withAnswers(clean, pieces)).toBe(clean);
  });
});

describe('answers become point writes only on apply', () => {
  it('take the drawing’s count: the card piece gets × per garment, nothing else', () => {
    const d: CardDraft = {
      ...draftOf(),
      pieceDifferences: [
        {
          pieceLineKey: 'k:nck',
          pieceName: 'nck',
          field: 'piecesPerGarment',
          cardValue: 1,
          drawingValue: 2,
        },
      ],
    };
    const out = assemblyImpact(d, card());
    expect(out).toMatchObject([{ kind: 'differ', field: 'piecesPerGarment', answer: null }]);
    expect(warnCount(out)).toBe(1);
    expect(blockingCount(out)).toBe(0);
    const i = live().pieces.findIndex((p) => p.lineKey === 'k:nck');
    // default (no answer) keeps the card
    expect(plan(d).writes.some((w) => w.path === `pieces.${i}.piecesPerGarment`)).toBe(false);
    const took = pick(d, 'take', 'piecesPerGarment', 'drawing');
    const writes = plan(took).writes;
    expect(writes.find((w) => w.path === `pieces.${i}.piecesPerGarment`)?.value).toBe(2);
    expect(withAnswers(took, pieces).pieceUpdates).toEqual([
      { lineKey: 'k:nck', piecesPerGarment: 2, reason: '× per garment 1 → 2 from the drawing' },
    ]);
  });

  it('applyDraft refuses an unclear block nobody answered: nothing is uploaded', async () => {
    const c = card({ existingShapes: [] });
    const d = draftOf(c);
    let uploads = 0;
    const res = await applyDraft(d, {
      read: () => live(),
      write: () => {},
      storageSizeId: 2,
      upload: async (f) => {
        uploads++;
        return { url: 'x', filename: f.filename, sizeBytes: 1 };
      },
    });
    expect(res.ok).toBe(false);
    expect(uploads).toBe(0);
  });
});
