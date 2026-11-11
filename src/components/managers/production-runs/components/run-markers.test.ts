import type { common_ProductionRunLay, common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { describe, expect, it } from 'vitest';
import {
  buildRunMarkerRows,
  isManualKept,
  layCandidates,
  markerPlies,
  pendingPairs,
  refusalWord,
  staticRunRefusals,
} from './run-markers';

const marker = (p: Partial<common_TechCardMarkerSummary>): common_TechCardMarkerSummary =>
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
