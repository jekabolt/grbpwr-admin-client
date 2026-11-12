import type { common_ProductionRunLay, common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import {
  buildRunMarkerRows,
  isManualKept,
  layCandidates,
  markerLetter,
  markerPlies,
  parseTablePick,
  pendingPairs,
  refusalWord,
  sizeLengthEstimates,
  splitSizesByTable,
  staleAutoMarkerIds,
  staticRunRefusals,
} from './run-markers';

type MarkerInput = Omit<Partial<common_TechCardMarkerSummary>, 'composition'> & {
  composition?: { sizeId: number; quantity: number }[];
};
const marker = (p: MarkerInput): common_TechCardMarkerSummary =>
  ({
    id: 1,
    source: 'auto',
    bomLineKey: 'main',
    colorwayId: 7,
    composition: [
      { sizeId: 1, quantity: 1 },
      { sizeId: 2, quantity: 2 },
    ],
    fabricWidthCm: { value: '160' },
    usedLengthCm: { value: '1011' },
    efficiencyPct: { value: '87' },
    isDraft: false,
    ...p,
  }) as common_TechCardMarkerSummary;

// Партия: S 2, M 4 одного колорвея → состав 1S+2M, слоёв 2.
const cells = [
  { colorwayId: 7, sizeId: 1, qty: 2 },
  { colorwayId: 7, sizeId: 2, qty: 4 },
];
const lines = [
  { lineKey: 'main', name: 'main material' },
  { lineKey: 'pocket', name: 'pocketing' },
  { lineKey: 'rubber', name: 'rubber' },
];
const sizeLabel = (id: number) => (id === 1 ? 'S' : 'M');

describe('markerPlies', () => {
  it('divides the run qty by the composition qty', () => {
    expect(markerPlies(marker({}), cells)).toBe(2);
  });
  it('is null when the ratio no longer matches the run', () => {
    expect(markerPlies(marker({}), [...cells, { colorwayId: 7, sizeId: 1, qty: 1 }])).toBeNull();
  });
});

describe('isManualKept', () => {
  it('keeps only a manual marker of the same colourway and line', () => {
    const ms = [marker({ source: 'manual' })];
    expect(isManualKept(ms, 7, 'main')).toBe(true);
    expect(isManualKept(ms, 8, 'main')).toBe(false);
    expect(isManualKept(ms, 7, 'pocket')).toBe(false);
    expect(isManualKept([marker({})], 7, 'main')).toBe(false);
  });
});

describe('refusalWord', () => {
  it('maps planner reasons to one or two words', () => {
    expect(refusalWord('this fabric has no DXF at all — there is nothing to nest.')).toBe(
      'no pattern',
    );
    expect(refusalWord('the cloth width is unknown: the article has no roll width')).toBe(
      'no width',
    );
    expect(refusalWord('something else')).toBe('other');
  });
});

describe('staticRunRefusals', () => {
  it('names missing patterns and widths without parsing', () => {
    const out = staticRunRefusals({
      scopes: [
        { lineKeys: ['main'], sheetCount: 2, slotCutCm: 160 },
        { lineKeys: ['pocket'], sheetCount: 1, slotCutCm: NaN },
        { lineKeys: ['rubber'], sheetCount: 0, slotCutCm: NaN },
      ],
      colorwayIds: [7],
      pinCutCm: () => undefined,
    });
    expect(out).toEqual([
      { lineKey: 'pocket', colorwayId: 7, word: 'no width' },
      { lineKey: 'rubber', colorwayId: 0, word: 'no pattern' },
    ]);
  });
  it('a colourway pin width wins over the empty slot', () => {
    const out = staticRunRefusals({
      scopes: [{ lineKeys: ['pocket'], sheetCount: 1, slotCutCm: NaN }],
      colorwayIds: [7],
      pinCutCm: () => 150,
    });
    expect(out).toEqual([]);
  });
});

describe('buildRunMarkerRows', () => {
  it('renders persisted markers, then skipped and failed pairs, in BOM order', () => {
    const rows = buildRunMarkerRows({
      lines,
      colorwayIds: [7],
      colorwayLabel: () => 'black',
      runMarkers: [marker({ id: 2, bomLineKey: 'pocket', source: 'manual' }), marker({})],
      cells,
      sizeLabel,
      staticRefusals: [{ lineKey: 'rubber', colorwayId: 0, word: 'no pattern' }],
      sessionRefusals: [],
      failures: [{ lineKey: 'main', colorwayId: 7, word: 'save' }],
    });
    expect(rows.map((r) => [r.material, r.kind])).toEqual([
      ['main material', 'marker'],
      ['pocketing', 'marker'],
      ['rubber', 'skipped'],
    ]);
    const main = rows[0];
    expect(main.kind === 'marker' && main.plies).toBe(2);
    expect(main.kind === 'marker' && main.sizes).toEqual([
      { label: 'S', qty: 1 },
      { label: 'M', qty: 2 },
    ]);
    expect(rows[1].kind === 'marker' && rows[1].source).toBe('manual');
    expect(rows[0].colorway).toBe('');
  });
  it('a failure without a marker shows as failed; colourway named only with several', () => {
    const rows = buildRunMarkerRows({
      lines: lines.slice(0, 1),
      colorwayIds: [7, 8],
      colorwayLabel: (id) => (id === 7 ? 'black' : 'white'),
      runMarkers: [marker({})],
      cells,
      sizeLabel,
      staticRefusals: [],
      sessionRefusals: [],
      failures: [{ lineKey: 'main', colorwayId: 8, word: 'nesting' }],
    });
    expect(rows.map((r) => [r.colorway, r.kind])).toEqual([
      ['black', 'marker'],
      ['white', 'failed'],
    ]);
  });
  it('no rows when nothing is built or refused', () => {
    expect(
      buildRunMarkerRows({
        lines,
        colorwayIds: [7],
        colorwayLabel: () => '',
        runMarkers: [],
        cells,
        sizeLabel,
        staticRefusals: [],
        sessionRefusals: [],
        failures: [],
      }),
    ).toEqual([]);
  });
});

describe('pendingPairs / layCandidates', () => {
  it('counts pairs neither built nor refused', () => {
    expect(
      pendingPairs({
        lines,
        colorwayIds: [7],
        runMarkers: [marker({})],
        refusals: [{ lineKey: 'rubber', colorwayId: 0, word: 'no pattern' }],
      }),
    ).toBe(1);
  });
  it('proposes one lay per uncovered pair, manual first, never a draft', () => {
    const ms = [
      marker({ id: 5 }),
      marker({ id: 3, source: 'manual' }),
      marker({ id: 9, bomLineKey: 'pocket', isDraft: true }),
    ];
    expect(layCandidates({ runMarkers: ms, lays: [], cells })).toEqual([
      { colorwayId: 7, bomLineKey: 'main', markerId: 3, plies: 2 },
    ]);
    const lays = [{ colorwayId: 7, bomLineKey: 'main' } as common_ProductionRunLay];
    expect(layCandidates({ runMarkers: ms, lays, cells })).toEqual([]);
  });
});

// ═══ «By table» ═══════════════════════════════════════════════════════════════════════════

describe('parseTablePick', () => {
  it('keeps 4 | 6 | 8, anything else is 6 m', () => {
    expect(parseTablePick('4')).toBe(4);
    expect(parseTablePick('8')).toBe(8);
    expect(parseTablePick(null)).toBe(6);
    expect(parseTablePick('5')).toBe(6);
    expect(parseTablePick('junk')).toBe(6);
  });
});

describe('sizeLengthEstimates', () => {
  it('splits the length by piece area, unsized pieces by garment count', () => {
    const est = sizeLengthEstimates({
      sizes: [
        { sizeId: 1, units: 1 },
        { sizeId: 2, units: 3 },
      ],
      pieces: [
        { sizeId: 1, areaCm2: 100, quantity: 1 },
        { sizeId: 2, areaCm2: 100, quantity: 3 },
        { sizeId: 0, areaCm2: 100, quantity: 4 },
      ],
      lengthCm: 800,
    });
    // веса: 100+100 = 200 и 300+300 = 600
    expect(est).toEqual([
      { sizeId: 1, estCm: 200 },
      { sizeId: 2, estCm: 600 },
    ]);
  });
  it('falls back to garment count without areas', () => {
    const est = sizeLengthEstimates({
      sizes: [
        { sizeId: 1, units: 1 },
        { sizeId: 2, units: 1 },
      ],
      pieces: [],
      lengthCm: 500,
    });
    expect(est.map((e) => e.estCm)).toEqual([250, 250]);
  });
});

describe('splitSizesByTable', () => {
  // XS1 S2 M3 L2 XL1 → 9 изделий, 10.11 м: по 1.12 м на изделие.
  const per = 1011 / 9;
  const est = [
    { sizeId: 1, estCm: per },
    { sizeId: 2, estCm: per * 2 },
    { sizeId: 3, estCm: per * 3 },
    { sizeId: 4, estCm: per * 2 },
    { sizeId: 5, estCm: per },
  ];
  it('one group when the marker fits the table', () => {
    expect(splitSizesByTable(est, 1200)).toEqual([[1, 2, 3, 4, 5]]);
  });
  it('k = ceil(length / table) groups of adjacent sizes, each under the table', () => {
    const g = splitSizesByTable(est, 800);
    expect(g).toHaveLength(2);
    expect(g.flat()).toEqual([1, 2, 3, 4, 5]);
    for (const grp of g)
      expect(
        grp.reduce((s, id) => s + (est.find((e) => e.sizeId === id)?.estCm ?? 0), 0),
      ).toBeLessThanOrEqual(800);
  });
  it('adds a group when k adjacent groups still overflow', () => {
    // 10.11 / 6 → 2, но любые 2 смежные группы > 6 м → 3: 1+2 | 3 | 4+5
    expect(splitSizesByTable(est, 600)).toEqual([[1, 2], [3], [4, 5]]);
  });
  it('a size alone longer than the table stays its own group', () => {
    const g = splitSizesByTable(
      [
        { sizeId: 1, estCm: 900 },
        { sizeId: 2, estCm: 100 },
      ],
      400,
    );
    expect(g).toEqual([[1], [2]]);
  });
});

describe('split rows', () => {
  const split = [
    marker({
      id: 11,
      composition: [{ sizeId: 2, quantity: 2 }],
      usedLengthCm: { value: '650' },
    }),
    marker({ id: 10, composition: [{ sizeId: 1, quantity: 1 }], usedLengthCm: { value: '300' } }),
  ];
  it('several markers of one material → a group row with markers A, B in size order', () => {
    const rows = buildRunMarkerRows({
      lines: lines.slice(0, 1),
      colorwayIds: [7],
      colorwayLabel: () => 'black',
      runMarkers: split,
      cells,
      sizeLabel,
      staticRefusals: [],
      sessionRefusals: [],
      failures: [],
      tableCm: 600,
    });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.kind).toBe('split');
    if (r.kind !== 'split') return;
    expect(r.widthCm).toBe(160);
    expect(r.parts.map((p) => [p.letter, p.sizes[0].label, p.plies, p.over])).toEqual([
      ['A', 'S', 2, false],
      ['B', 'M', 2, true],
    ]);
  });
  it('one marker longer than the table is flagged', () => {
    const rows = buildRunMarkerRows({
      lines: lines.slice(0, 1),
      colorwayIds: [7],
      colorwayLabel: () => '',
      runMarkers: [marker({})],
      cells,
      sizeLabel,
      staticRefusals: [],
      sessionRefusals: [],
      failures: [],
      tableCm: 600,
    });
    expect(rows[0].kind === 'marker' && rows[0].over).toBe(true);
  });
  it('lays: every part of a split material, a stale overlapping marker skipped', () => {
    const stale = marker({ id: 4 }); // целый 1S+2M, старше частей
    expect(layCandidates({ runMarkers: [...split, stale], lays: [], cells })).toEqual([
      { colorwayId: 7, bomLineKey: 'main', markerId: 10, plies: 2 },
      { colorwayId: 7, bomLineKey: 'main', markerId: 11, plies: 2 },
    ]);
  });
  it('markerLetter', () => {
    expect([0, 1, 25].map(markerLetter)).toEqual(['A', 'B', 'Z']);
  });
});

describe('staleAutoMarkerIds', () => {
  const ms = [
    marker({ id: 1, name: '1S+2M · black · main' }),
    marker({ id: 2, name: '1S · black · main' }),
    marker({ id: 3, name: '2M · black · main' }),
    marker({ id: 4, name: 'M · black · main' }), // копия карточной нормы
    marker({ id: 5, name: '1S+2M · black · main', source: 'manual' }),
    marker({ id: 6, name: '1S+2M · white · main' }),
    marker({ id: 7, name: '1S+2M · black · main', bomLineKey: 'pocket' }),
  ];
  it("drops this queue's old auto markers of the pair, keeps saved, laid, manual, copies", () => {
    expect(
      staleAutoMarkerIds({
        runMarkers: ms,
        colorwayId: 7,
        lineKey: 'main',
        colorwayLabel: 'black',
        keepIds: new Set([2]),
        referencedMarkerIds: new Set([3]),
      }),
    ).toEqual([1]);
  });
});
