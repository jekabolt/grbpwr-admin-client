import { describe, expect, it } from 'vitest';

import type { CardDraft, ConversionManifest, DraftScope, DraftShapeRef } from '../types';
import { planFormWrites, type LiveCard } from './apply';
import { buildDraft, cardNameOf, shapeCost, tokenKey, type DraftCardContext } from './draft';
import fixture from './__fixtures__/card6-reimport.json';

// Golden G1 (owner 09.11, card 6): re-importing the CLO shirt onto the card keeps every piece.
// The fixture is the card before the 11:01 re-import (pieces, links, the outlines of its old
// sheets) and the manifests the re-import produced; keys are neutral (`k:<piece>`).

const MAIN = 'TECH_CARD_BOM_PURPOSE_MAIN';
const PCK = 'TECH_CARD_BOM_PURPOSE_POCKETING';

type Fx = typeof fixture;
const manifest = (k: keyof Fx['manifests']) =>
  fixture.manifests[k] as unknown as ConversionManifest;

function scopeOf(m: ConversionManifest, purpose: string, line: string): DraftScope {
  return {
    target: {
      scopeKey: purpose,
      fabricPurpose: purpose,
      bomLineKey: line,
      label: purpose === MAIN ? 'main' : 'pocketing',
      isInterlining: false,
    },
    filename: '',
    name: '',
    dxfText: `0\nSECTION\n999\n${m.createdAt}\n0\nEOF\n`,
    manifest: m,
    identities: m.pieces.map((p) => p.identity),
  };
}
const mainScope = (k: 'main1101' | 'main1107') => scopeOf(manifest(k), MAIN, 'line:main');
const pckScope = () => scopeOf(manifest('pocketing'), PCK, 'line:pocketing');

type SmallPiece = {
  identity: string;
  displayName?: string;
  nameOrigin?: 'text' | 'operator';
  pairHand?: 'L' | 'R' | null;
  pairOf?: string | null;
  piecesPerGarment?: number;
  fused?: boolean;
  unfoldedFold?: boolean;
  box?: [number, number];
};

function smallManifest(specs: SmallPiece[]): ConversionManifest {
  const base = manifest('pocketing');
  const pieceBase = base.pieces[0];
  const blockBase = base.blocks[0];
  return {
    ...base,
    createdAt: '2026-11-09T00:00:00.000Z',
    pieces: specs.map((s) => ({
      ...pieceBase,
      identity: s.identity,
      code: s.identity,
      mods: [],
      displayName: s.displayName ?? s.identity,
      nameOrigin: s.nameOrigin ?? 'text',
      pairHand: s.pairHand ?? null,
      pairOf: s.pairOf ?? null,
      piecesPerGarment: s.piecesPerGarment ?? 1,
      fused: s.fused ?? false,
      unfoldedFold: s.unfoldedFold ?? false,
      ungraded: true,
    })),
    blocks: specs.map((s) => {
      const [w, h] = s.box ?? [10, 10];
      return {
        ...blockBase,
        block: s.identity,
        identity: s.identity,
        sizeToken: 'UNI',
        bboxMm: [0, 0, w, h],
        areaMm2: w * h,
      };
    }),
  };
}

const TEST_URL = 'https://files.example/current.dxf';
const smallScope = (specs: SmallPiece[]) => scopeOf(smallManifest(specs), MAIN, 'line:test');
const smallShape = (
  pieceLineKey: string,
  identity: string,
  box: [number, number] = [10, 10],
): DraftShapeRef => ({
  scopeKey: MAIN,
  pieceLineKey,
  identity,
  url: TEST_URL,
  sizes: { uni: { areaMm2: box[0] * box[1], wMm: box[0], hMm: box[1] } },
});
const smallCard = (
  existingPieces: DraftCardContext['existingPieces'],
  existingAliases: NonNullable<DraftCardContext['existingAliases']>,
  existingShapes: DraftShapeRef[] = [],
): DraftCardContext => ({
  techCardId: 1,
  existingPieces,
  existingAliases,
  existingShapes,
  existingPatterns: [
    {
      scopeKey: MAIN,
      filename: 'current.dxf',
      url: TEST_URL,
      lineKey: 'row:current',
      name: 'current',
    },
  ],
  styleLabel: 'TEST',
});

function card(over: Partial<DraftCardContext> = {}): DraftCardContext {
  return {
    techCardId: 6,
    existingPieces: fixture.card.pieces,
    existingAliases: fixture.card.aliases,
    existingPatterns: fixture.card.patterns,
    existingShapes: fixture.card.shapes as DraftShapeRef[],
    styleLabel: 'SS26-006',
    ...over,
  };
}

let n = 0;
const mintKey = () => `new:${++n}`;
const nameOf = new Map(fixture.card.pieces.map((p) => [p.lineKey, p.name]));

/** block → card piece name, as the draft links them. */
function links(d: CardDraft, scopeKey: string): Record<string, string> {
  const piece = new Map(d.pieces.map((p) => [p.lineKey, p.name]));
  return Object.fromEntries(
    d.aliases
      .filter((a) => a.scopeKey === scopeKey)
      .map((a) => [a.blockName, piece.get(a.pieceLineKey) ?? '?']),
  );
}
/** The card's pieces linked in this scope before the re-import. */
const onScope = (scopeKey: string) =>
  [
    ...new Set(
      fixture.card.aliases.filter((a) => a.scopeKey === scopeKey).map((a) => a.pieceLineKey),
    ),
  ].sort();

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
    pieces: fixture.card.pieces.map((p) => ({ ...p })),
    aliases: fixture.card.aliases.map((a) => ({
      blockName: a.blockName,
      pieceLineKey: a.pieceLineKey,
      ...(a.scopeKey.startsWith('TECH_CARD_')
        ? { fabricPurpose: a.scopeKey }
        : { bomLineKey: a.scopeKey }),
    })),
  };
}

function apply(d: CardDraft) {
  const uploaded = d.scopes.map((s) => ({
    scopeKey: s.target.scopeKey,
    url: `https://files.example/new-${s.filename}`,
    filename: s.filename,
    sizeBytes: 1,
  }));
  return planFormWrites(d, live(), uploaded, { storageSizeId: 2, mintKey });
}

const MAIN_1107: Record<string, string> = {
  CLR_MAIN: 'clr_main',
  CLR_MAIN_2: 'clr_main_2',
  CLR_SECOND: 'CLR_SECOND',
  CLR_SECOND_2: 'CLR_SECOND_2',
  NCK: 'nck',
  NCK_2: 'nck_2',
  BP_MAIN: 'BP_MAIN',
  BP_U: 'BP_U',
  BP_U_1: 'BP_U_1',
  PLCK_L: 'PLCK_L',
  PLCK_R: 'PLCK_R',
  SLV_L: 'SLV_L',
  SLV_R: 'SLV_R',
  FLP_L_UNI: 'FLP_L',
  FLP_R_UNI: 'FLP_R',
  FLP_MAIN_L_UNI: 'FLP_L_MAIN',
  FLP_MAIN_R_UNI: 'FLP_R_MAIN',
  // renamed by the importer: bound by outline
  FP_L: 'P_L_MAIN',
  FP_R: 'P_R_MAIN',
  YK_L: 'P_L_U',
  YK_R: 'P_R_U',
};

describe('re-import onto card 6 (golden G1)', () => {
  it('main file: every block on its own card piece, no new piece, no hand swapped', () => {
    const d = buildDraft({ scopes: [mainScope('main1107')] }, card(), { mintKey });
    expect(links(d, MAIN)).toEqual(MAIN_1107);
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
    expect(d.unresolved).toBeUndefined();
    // no old piece of the scope is left without a block
    expect([...new Set(d.aliases.map((a) => a.pieceLineKey))].sort()).toEqual(onScope(MAIN));
    const shape = d.pieces.filter((p) => p.basis === 'shape').map((p) => p.name);
    expect(shape.sort()).toEqual(['P_L_MAIN', 'P_L_U', 'P_R_MAIN', 'P_R_U']);
  });

  it('main file applied: no piece created, fused flags and piece ids untouched', () => {
    const d = buildDraft({ scopes: [mainScope('main1107')] }, card(), { mintKey });
    const plan = apply(d);
    expect(plan.created).toBe(0);
    expect(plan.writes.find((w) => w.path === 'pieces')).toBeUndefined();
    expect(plan.writes.filter((w) => /\.fused(Mode)?$/.test(w.path))).toEqual([]);
    expect(plan.writes.filter((w) => /\.cutSymmetry$/.test(w.path))).toEqual([]);
    const next = plan.writes.find((w) => w.path === 'pieceDxfAliases')?.value as {
      blockName: string;
      pieceLineKey: string;
      fabricPurpose?: string;
    }[];
    const main = (block: string) =>
      next
        .filter((a) => a.fabricPurpose === MAIN && a.blockName === block)
        .map((a) => nameOf.get(a.pieceLineKey));
    expect(main('SLV_L')).toEqual(['SLV_L']);
    expect(main('FP_L')).toEqual(['P_L_MAIN']);
    // the old links ride through: the card's assembly still sees every piece it knew
    expect(next.length).toBe(fixture.card.aliases.length + 8);
    for (const a of fixture.card.aliases)
      expect(
        next.some((x) => x.blockName === a.blockName && x.pieceLineKey === a.pieceLineKey),
      ).toBe(true);
  });

  it('pockets file: hand-anywhere names bind to the per-hand card pieces', () => {
    const d = buildDraft({ scopes: [pckScope()] }, card(), { mintKey });
    expect(links(d, PCK)).toEqual({
      PCK_BTTM_L: 'PCK_L_BTTM',
      PCK_BTTM_R: 'PCK_R_BTTM',
      PCK_MAIN_L: 'PCK_L_MAIN',
      PCK_MAIN_R: 'PCK_R_MAIN',
    });
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
    expect(d.unresolved).toBeUndefined();
    expect(apply(d).created).toBe(0);
  });

  it('the 11:01 main file (upper fronts renamed FP_*_2, pockets in it) binds the same way', () => {
    const d = buildDraft({ scopes: [mainScope('main1101')] }, card(), { mintKey });
    const l = links(d, MAIN);
    expect(l.FP_L).toBe('P_L_MAIN');
    expect(l.FP_L_2).toBe('P_L_U');
    expect(l.FP_R_2).toBe('P_R_U');
    expect(l.SLV_L).toBe('SLV_L');
    expect(l.PCK_BTTM_L).toBe('PCK_L_BTTM');
    expect(l.PCK_MAIN_R).toBe('PCK_R_MAIN');
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
    expect(d.unresolved).toBeUndefined();
  });

  it('both files in one import: no new piece', () => {
    const d = buildDraft({ scopes: [mainScope('main1107'), pckScope()] }, card(), { mintKey });
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
    expect(apply(d).created).toBe(0);
  });

  it('outlines not loaded: a renamed block is left to the operator, never a new piece', () => {
    const d = buildDraft({ scopes: [mainScope('main1107')] }, card({ existingShapes: [] }), {
      mintKey,
    });
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
    const un = Object.fromEntries(
      (d.unresolved ?? []).map((u) => [u.blockName, u.candidates.map((c) => c.pieceName)]),
    );
    expect(un).toEqual({
      FP_L: ['P_L_MAIN', 'P_L_U'],
      YK_L: ['P_L_MAIN', 'P_L_U'],
      FP_R: ['P_R_MAIN', 'P_R_U'],
      YK_R: ['P_R_MAIN', 'P_R_U'],
    });
    expect(links(d, MAIN).FP_L).toBeUndefined();
    // the pieces the operator maps them to are offered in the scope's «no longer drawn» list
    const vanished = d.scopes[0].vanished!.map((v) => v.pieceName);
    expect([...new Set(vanished)].sort()).toEqual(['P_L_MAIN', 'P_L_U', 'P_R_MAIN', 'P_R_U']);
  });

  it('two card pieces of the same outline: unresolved, no guess', () => {
    const twin = { ...fixture.card.pieces.find((p) => p.name === 'P_L_MAIN')!, name: 'Q_L_MAIN' };
    twin.lineKey = 'k:Q_L_MAIN';
    const shape = fixture.card.shapes.find((r) => r.pieceLineKey === 'k:P_L_MAIN')!;
    const d = buildDraft(
      { scopes: [mainScope('main1107')] },
      card({
        existingPieces: [...fixture.card.pieces, twin],
        existingShapes: [
          ...(fixture.card.shapes as DraftShapeRef[]),
          { ...shape, pieceLineKey: twin.lineKey, identity: 'Q_L_MAIN' },
        ],
      }),
      { mintKey },
    );
    const fp = d.unresolved?.find((u) => u.blockName === 'FP_L');
    expect(fp?.candidates.map((c) => c.pieceName).sort()).toEqual(['P_L_MAIN', 'Q_L_MAIN']);
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
    expect(links(d, MAIN).YK_L).toBe('P_L_U');
  });

  it('a link that swapped hands is not followed: SLV_L goes back to SLV_L', () => {
    const swapped = fixture.card.aliases.map((a) =>
      a.scopeKey === MAIN && a.blockName === 'SLV_L' ? { ...a, pieceLineKey: 'k:SLV_R' } : a,
    );
    const d = buildDraft({ scopes: [mainScope('main1107')] }, card({ existingAliases: swapped }), {
      mintKey,
    });
    expect(links(d, MAIN).SLV_L).toBe('SLV_L');
    expect(links(d, MAIN).SLV_R).toBe('SLV_R');
  });
});

describe('a link across hands', () => {
  const yoke = (pieces: { lineKey: string; name: string; piecesPerGarment: number }[]) =>
    buildDraft(
      { scopes: [mainScope('main1107')] },
      {
        techCardId: 1,
        existingPieces: pieces,
        existingAliases: [
          { scopeKey: MAIN, blockName: 'YK_L', pieceLineKey: 'k:YOKE_R' },
          { scopeKey: MAIN, blockName: 'YK_R', pieceLineKey: 'k:YOKE_R' },
        ],
        styleLabel: 'SS26-006',
      },
      { mintKey },
    );

  it('an R in a pair piece name is no hand: both hands keep their link to it', () => {
    const d = yoke([{ lineKey: 'k:YOKE_R', name: 'YOKE R', piecesPerGarment: 2 }]);
    expect(links(d, MAIN).YK_L).toBe('YOKE R');
    expect(links(d, MAIN).YK_R).toBe('YOKE R');
    expect(d.pieces.find((p) => p.name === 'YOKE R')?.piecesPerGarment).toBe(2);
    expect(d.pieces.some((p) => p.name === 'YK')).toBe(false);
  });

  it('is dropped once the card holds the piece of the block’s own hand', () => {
    const d = yoke([
      { lineKey: 'k:YOKE_L', name: 'YOKE L', piecesPerGarment: 1 },
      { lineKey: 'k:YOKE_R', name: 'YOKE R', piecesPerGarment: 1 },
    ]);
    expect(links(d, MAIN).YK_L).not.toBe('YOKE R');
    expect(links(d, MAIN).YK_R).toBe('YOKE R');
  });
});

describe('a scope with two sheets: the re-import replaces one', () => {
  const MAIN_URL = 'https://files.example/TECH_CARD_BOM_PURPOSE_MAIN.dxf';
  const BELT_URL = 'https://files.example/belt.dxf';
  const shapeOf = (k: string) => fixture.card.shapes.find((r) => r.pieceLineKey === k)!;
  const extra = (name: string) => ({
    ...fixture.card.pieces.find((p) => p.name === 'SLV_L')!,
    lineKey: `k:${name}`,
    name,
  });
  /** A second main sheet draws a belt and a piece of the very outline of P_L_MAIN. */
  const sibling: DraftShapeRef[] = [
    { ...shapeOf('k:P_L_MAIN'), pieceLineKey: 'k:Q_L_MAIN', identity: 'Q_L_MAIN', url: BELT_URL },
    { ...shapeOf('k:SLV_L'), pieceLineKey: 'k:BELT_L', identity: 'BELT_L', url: BELT_URL },
  ];
  const twoSheets = (own: DraftShapeRef[]) =>
    card({
      existingPieces: [...fixture.card.pieces, extra('Q_L_MAIN'), extra('BELT_L')],
      existingAliases: [
        ...fixture.card.aliases,
        { scopeKey: MAIN, blockName: 'Q_L_MAIN', pieceLineKey: 'k:Q_L_MAIN' },
        { scopeKey: MAIN, blockName: 'BELT_L', pieceLineKey: 'k:BELT_L' },
      ],
      existingPatterns: [
        ...fixture.card.patterns,
        { scopeKey: MAIN, filename: 'belt.dxf', url: BELT_URL, lineKey: 'row:belt', name: 'belt' },
      ],
      existingShapes: [...own, ...sibling],
    });
  const own = (fixture.card.shapes as DraftShapeRef[]).map((r) =>
    r.scopeKey === MAIN ? { ...r, url: MAIN_URL } : r,
  );
  const siblingKeys = ['k:Q_L_MAIN', 'k:BELT_L'];

  it('the other sheet’s outlines are no candidates, its pieces are not «no longer drawn»', () => {
    const d = buildDraft({ scopes: [mainScope('main1107')] }, twoSheets(own), { mintKey });
    expect(d.scopes[0].replaces?.url).toBe(MAIN_URL);
    expect(links(d, MAIN)).toEqual(MAIN_1107);
    expect(d.unresolved).toBeUndefined();
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
    const gone = (d.scopes[0].vanished ?? []).map((v) => v.pieceLineKey);
    expect(gone.filter((k) => siblingKeys.includes(k))).toEqual([]);
  });

  it('outlines of the replaced sheet not loaded: only its own pieces are asked', () => {
    const d = buildDraft(
      { scopes: [mainScope('main1107')] },
      twoSheets(own.filter((r) => r.scopeKey !== MAIN)),
      { mintKey },
    );
    const un = Object.fromEntries(
      (d.unresolved ?? []).map((u) => [u.blockName, u.candidates.map((c) => c.pieceName)]),
    );
    expect(un.FP_L).toEqual(['P_L_MAIN', 'P_L_U']);
    expect(un.YK_L).toEqual(['P_L_MAIN', 'P_L_U']);
    const gone = (d.scopes[0].vanished ?? []).map((v) => v.pieceLineKey);
    expect(gone.filter((k) => siblingKeys.includes(k))).toEqual([]);
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
  });
});

describe('a fresh card keeps pairing', () => {
  it('both hands of a pair become one piece × 2', () => {
    const m = manifest('main1107');
    const d = buildDraft(
      { scopes: [mainScope('main1107')] },
      { techCardId: 1, existingPieces: [], styleLabel: 'SS26-006' },
      { mintKey },
    );
    expect(d.unresolved).toBeUndefined();
    const names = d.pieces.map((p) => p.name).sort();
    expect(names).toEqual([...new Set(m.pieces.map((p) => cardNameOf(p)))].sort());
    const fp = d.pieces.find((p) => p.name === 'FP')!;
    expect(fp.piecesPerGarment).toBe(2);
    expect(links(d, MAIN).FP_L).toBe('FP');
    expect(links(d, MAIN).FP_R).toBe('FP');
    expect(links(d, MAIN).SLV_L).toBe('SLV');
    expect(d.pieces.every((p) => p.basis === 'new')).toBe(true);
  });

  it('a card with a hand-less pair piece takes both hands on it', () => {
    const d = buildDraft(
      { scopes: [pckScope()] },
      {
        techCardId: 1,
        existingPieces: [
          { lineKey: 'k:PCK_BTTM', name: 'PCK_BTTM', piecesPerGarment: 2 },
          { lineKey: 'k:PCK_MAIN', name: 'PCK_MAIN', piecesPerGarment: 2 },
        ],
        styleLabel: 'SS26-006',
      },
      { mintKey },
    );
    expect(links(d, PCK)).toEqual({
      PCK_BTTM_L: 'PCK_BTTM',
      PCK_BTTM_R: 'PCK_BTTM',
      PCK_MAIN_L: 'PCK_MAIN',
      PCK_MAIN_R: 'PCK_MAIN',
    });
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
  });
});

describe('name and outline helpers', () => {
  it('token key ignores order and UNI', () => {
    expect(tokenKey('FLP_MAIN_L_UNI')).toBe(tokenKey('FLP_L_MAIN'));
    expect(tokenKey('PCK_BTTM_L')).toBe(tokenKey('PCK_L_BTTM'));
    expect(tokenKey('FLP_L')).not.toBe(tokenKey('FLP_L_MAIN'));
  });

  it('the same piece re-exported is within 1 %, another piece of the hand is not', () => {
    const blocks = manifest('main1107').blocks.filter((b) => b.identity === 'FP_L');
    const ref = (k: string) => fixture.card.shapes.find((r) => r.pieceLineKey === k)!.sizes;
    expect(shapeCost(blocks, ref('k:P_L_MAIN'))!).toBeLessThan(0.01);
    expect(shapeCost(blocks, ref('k:P_L_U'))!).toBeGreaterThan(0.1);
  });
});

describe('production re-import binding continuity', () => {
  it('keeps the linked duplicate when a sibling has the new block name', () => {
    const d = buildDraft(
      { scopes: [smallScope([{ identity: 'PCK_MAIN_L', pairHand: 'L' }])] },
      smallCard(
        [
          { lineKey: 'k:linked', name: 'PCK_MAIN_L_S_S' },
          { lineKey: 'k:sibling', name: 'PCK_MAIN_L' },
        ],
        [{ scopeKey: MAIN, blockName: 'PCK_MAIN_L_S_S', pieceLineKey: 'k:linked' }],
        [smallShape('k:linked', 'PCK_MAIN_L_S_S')],
      ),
      { mintKey },
    );

    expect(links(d, MAIN).PCK_MAIN_L).toBe('PCK_MAIN_L_S_S');
    expect(d.pieces.find((p) => p.name === 'PCK_MAIN_L_S_S')?.basis).toBe('shape');
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
    expect(d.unresolved).toBeUndefined();
  });

  it('restores both new pair blocks through the linked opposite hands', () => {
    const d = buildDraft(
      {
        scopes: [
          smallScope([
            {
              identity: 'P02_L',
              displayName: 'SHLD_1_L_1',
              nameOrigin: 'operator',
              pairHand: 'L',
              pairOf: 'P02_R',
            },
            { identity: 'P02_R', pairHand: 'R', pairOf: 'P02_L' },
            { identity: 'P01_L', pairHand: 'L', pairOf: 'P01_R' },
            {
              identity: 'P01_R',
              displayName: 'SHLD_1_R_1',
              nameOrigin: 'operator',
              pairHand: 'R',
              pairOf: 'P01_L',
            },
          ]),
        ],
      },
      smallCard(
        [
          { lineKey: 'k:left', name: 'SHLD_1_L_1' },
          { lineKey: 'k:right', name: 'SHLD_1_R_1' },
        ],
        [
          { scopeKey: MAIN, blockName: 'SHLD_1_L_1', pieceLineKey: 'k:left' },
          { scopeKey: MAIN, blockName: 'SHLD_1_R_1', pieceLineKey: 'k:right' },
        ],
        [smallShape('k:left', 'SHLD_1_L_1'), smallShape('k:right', 'SHLD_1_R_1')],
      ),
      { mintKey },
    );

    expect(links(d, MAIN)).toEqual({
      P02_L: 'SHLD_1_L_1',
      P02_R: 'SHLD_1_R_1',
      P01_L: 'SHLD_1_L_1',
      P01_R: 'SHLD_1_R_1',
    });
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
  });

  it('uses a same-outline mojibake alias without changing its card name', () => {
    const d = buildDraft(
      {
        scopes: [
          smallScope([
            { identity: 'P02', displayName: 'Р?Р _8', nameOrigin: 'operator' },
            { identity: 'P01', displayName: 'Р?Р _9', nameOrigin: 'operator' },
          ]),
        ],
      },
      smallCard(
        [
          { lineKey: 'k:eight', name: 'Ð?Ð _8' },
          { lineKey: 'k:nine', name: 'Ð?Ð _9' },
        ],
        [
          { scopeKey: MAIN, blockName: 'Ð?Ð _8', pieceLineKey: 'k:eight' },
          { scopeKey: MAIN, blockName: 'Ð?Ð _9', pieceLineKey: 'k:nine' },
        ],
        [smallShape('k:eight', 'Ð?Ð _8'), smallShape('k:nine', 'Ð?Ð _9')],
      ),
      { mintKey },
    );

    expect(links(d, MAIN)).toEqual({ P02: 'Ð?Ð _8', P01: 'Ð?Ð _9' });
    expect(d.pieces.map((p) => p.name).sort()).toEqual(['Ð?Ð _8', 'Ð?Ð _9']);
    expect(d.unresolved).toBeUndefined();
  });

  it('keeps a same-contour cross-hand link from the replaced sheet', () => {
    const d = buildDraft(
      {
        scopes: [
          smallScope([
            { identity: 'P01', displayName: 'PCK_BACK_L', nameOrigin: 'operator' },
            { identity: 'BP_L_1', pairHand: 'L' },
          ]),
        ],
      },
      smallCard(
        [
          { lineKey: 'k:left', name: 'PCK_BACK_L' },
          { lineKey: 'k:right', name: 'PCK_BACK_R' },
        ],
        [
          { scopeKey: MAIN, blockName: 'PCK_BACK_L', pieceLineKey: 'k:left' },
          { scopeKey: MAIN, blockName: 'PCK_BACK_L_1', pieceLineKey: 'k:right' },
        ],
        [smallShape('k:left', 'PCK_BACK_L'), smallShape('k:right', 'PCK_BACK_L_1')],
      ),
      { mintKey },
    );

    expect(links(d, MAIN).BP_L_1).toBe('PCK_BACK_R');
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
    expect(d.unresolved).toBeUndefined();
  });

  it('normalizes a generated label and lets its prior alias beat a sibling name', () => {
    const d = buildDraft(
      {
        scopes: [
          smallScope([
            { identity: 'P04', displayName: 'Piece Name: Back_Top_L_R', nameOrigin: 'operator' },
            { identity: 'P05', displayName: 'Piece Name: Back_Top_R_R', nameOrigin: 'operator' },
            { identity: 'PCK_R', displayName: 'FLAP_R_UNI', pairHand: 'R' },
          ]),
        ],
      },
      smallCard(
        [
          { lineKey: 'k:back-left', name: 'Back_Top_L_R' },
          { lineKey: 'k:back-right', name: 'Back_Top_R_R' },
          { lineKey: 'k:flap', name: 'FLAP_R' },
          { lineKey: 'k:sibling', name: 'PCK_R' },
        ],
        [
          { scopeKey: MAIN, blockName: 'Back_Top_L_R', pieceLineKey: 'k:back-left' },
          { scopeKey: MAIN, blockName: 'Back_Top_R_R', pieceLineKey: 'k:back-right' },
          { scopeKey: MAIN, blockName: 'FLAP_R', pieceLineKey: 'k:flap' },
        ],
      ),
      { mintKey },
    );

    expect(links(d, MAIN)).toEqual({
      P04: 'Back_Top_L_R',
      P05: 'Back_Top_R_R',
      PCK_R: 'FLAP_R',
    });
    expect(d.pieces.filter((p) => !p.existingLineKey)).toEqual([]);
    expect(d.unresolved).toBeUndefined();
  });
});

describe('existing piece settings', () => {
  it('keeps card values, exposes drawing differences, and plans no setting writes', () => {
    const mirrored = 'TECH_CARD_PIECE_CUT_SYMMETRY_MIRRORED';
    const existing = {
      lineKey: 'k:cut',
      name: 'CUT',
      piecesPerGarment: 1,
      cutSymmetry: mirrored,
      fused: false,
      fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_ZONE',
    };
    const aliases = [{ scopeKey: MAIN, blockName: 'CUT', pieceLineKey: 'k:cut' }];
    const d = buildDraft(
      {
        scopes: [
          smallScope([
            {
              identity: 'CUT',
              piecesPerGarment: 2,
              fused: true,
              unfoldedFold: true,
            },
          ]),
        ],
      },
      smallCard([existing], aliases, [smallShape('k:cut', 'CUT')]),
      { mintKey },
    );

    expect(d.pieces[0]).toMatchObject({
      piecesPerGarment: 1,
      cutSymmetry: mirrored,
      fused: false,
      fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_ZONE',
    });
    expect(d.pieces[0].symmetryForce).toBeUndefined();
    expect(d.pieceUpdates).toEqual([]);
    expect(d.pieceDifferences?.map((x) => x.field).sort()).toEqual([
      'cutSymmetry',
      'fused',
      'piecesPerGarment',
    ]);

    const plan = planFormWrites(
      d,
      {
        patterns: [
          {
            lineKey: 'row:current',
            fabricPurpose: MAIN,
            url: TEST_URL,
            filename: 'current.dxf',
          },
        ],
        pieces: [existing],
        aliases: aliases.map((a) => ({
          fabricPurpose: a.scopeKey,
          blockName: a.blockName,
          pieceLineKey: a.pieceLineKey,
        })),
      },
      [
        {
          scopeKey: MAIN,
          url: 'https://files.example/reimport.dxf',
          filename: d.scopes[0].filename,
          sizeBytes: 1,
        },
      ],
      { storageSizeId: 2, mintKey },
    );
    expect(plan.created).toBe(0);
    expect(plan.writes.filter((w) => w.path === 'pieces' || w.path.startsWith('pieces.'))).toEqual(
      [],
    );
  });
});
