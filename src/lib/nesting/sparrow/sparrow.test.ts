import { describe, expect, it, vi } from 'vitest';
import type { NestConfig, NestResult, PieceDTO, Pt } from '../types';
import { placedPoly } from '../types';
import { buildSparrowJob, SEPARATION_SAFETY_CM } from './instance';
import { convertSolution, type SppSolution } from './solution';

vi.mock('./runtime', () => ({ loadSparrow: vi.fn() }));
import { loadSparrow } from './runtime';
import { legacyBudgetMs, nestWithSparrow } from './index';

// An L-shaped piece: not symmetric under any rotation, and its mirror is a different shape.
const L: Pt[] = [
  { x: 0, y: 0 },
  { x: 30, y: 0 },
  { x: 30, y: 10 },
  { x: 10, y: 10 },
  { x: 10, y: 20 },
  { x: 0, y: 20 },
];
const piece = (id: number, poly: Pt[] = L, extra: Partial<PieceDTO> = {}): PieceDTO => ({
  id,
  name: `P${id}`,
  source: 'test.dxf',
  poly,
  bboxW: 30,
  bboxH: 20,
  areaCm2: 400,
  ...extra,
});
const config = (over: Partial<NestConfig> = {}): NestConfig => ({
  pieces: [{ pieceId: 1, quantity: 2, flippedQuantity: 1 }],
  fabricWidthCm: 100,
  gapCm: 0.5,
  edgeMarginCm: 1,
  allowCrossGrain: false,
  fabricDirection: 'any',
  grainLayer: '',
  seamAllowanceCm: 0,
  timeBudgetMs: 1000,
  rdpEpsCm: 0.05,
  ...over,
});

describe('buildSparrowJob', () => {
  it('turns quantity into demand and a mirrored copy into its own pre-mirrored item', () => {
    const job = buildSparrowJob(
      [piece(1)],
      config({ pieces: [{ pieceId: 1, quantity: 3, flippedQuantity: 1 }] }),
    );
    expect(job.items).toEqual([
      { pieceId: 1, flipped: false, instances: [0, 1] },
      { pieceId: 1, flipped: true, instances: [2] },
    ]);
    expect(job.instance.items.map((i) => i.demand)).toEqual([2, 1]);
    expect(job.instance.items[1].shape.data[1]).toEqual([-30, 0]);
    expect(job.instance.items[0].orientation.rotation.angles).toEqual([0, 180]);
  });

  it('sizes the strip for the gap and the margins', () => {
    const job = buildSparrowJob([piece(1)], config());
    const sep = 0.5 + SEPARATION_SAFETY_CM;
    expect(job.instance.min_item_separation).toBeCloseTo(sep, 9);
    expect(job.instance.strip_height).toBeCloseTo(100 - 2 + sep, 9);
    expect(job.shiftY).toBeCloseTo(1 - sep / 2, 9);
  });

  it('derives rotations from the fabric: cross-grain adds 90/270, one-way drops 180 and mirrors', () => {
    const cross = buildSparrowJob([piece(1)], config({ allowCrossGrain: true }));
    expect(cross.instance.items[0].orientation.rotation.angles).toEqual([0, 90, 180, 270]);
    const oneWay = buildSparrowJob([piece(1)], config({ fabricDirection: 'one_way' }));
    expect(oneWay.instance.items).toHaveLength(1);
    expect(oneWay.instance.items[0].orientation.rotation.angles).toEqual([0]);
    expect(oneWay.unplacedUpFront).toEqual([{ pieceId: 1, instance: 1, reason: 'mirror' }]);
    expect(oneWay.warnings[0]).toContain('directional');
  });

  it('keeps pieces that do not fit the width, missing ones and refused folds out of the solver', () => {
    const wide = piece(2, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 99 },
      { x: 0, y: 99 },
    ]);
    const fold = piece(3, L, { fold: { kind: 'refused', reason: 'no axis' } });
    const job = buildSparrowJob(
      [wide, fold],
      config({
        pieces: [
          { pieceId: 2, quantity: 1 },
          { pieceId: 3, quantity: 1 },
          { pieceId: 4, quantity: 1 },
        ],
      }),
    );
    expect(job.instance.items).toHaveLength(0);
    expect(job.unplacedUpFront.map((u) => u.reason).sort()).toEqual(['fold', 'missing', 'width']);
    expect(job.totalCount).toBe(3);
  });
});

describe('convertSolution', () => {
  const pieces = [piece(1)];
  const job = buildSparrowJob(pieces, config());
  // Two Ls side by side in sparrow's frame, the mirrored one turned 180°.
  const sol = (x2: number): SppSolution => ({
    strip_width: 70,
    layout: {
      placed_items: [
        { item_id: 0, transformation: { rotation: 0, translation: [0.3, 0.3] } },
        { item_id: 1, transformation: { rotation: 180, translation: [x2, 40] } },
      ],
    },
  });

  it('maps items back to instances, applies the margins and measures from the roll start', () => {
    const c = convertSolution(sol(80), job, pieces, config());
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.placements.map((p) => [p.instance, p.rot, p.flipped === true])).toEqual([
      [0, 0, false],
      [1, 180, true],
    ]);
    const xs = c.placements.flatMap((pl) => placedPoly(L, pl).map((q) => q.x));
    const ys = c.placements.flatMap((pl) => placedPoly(L, pl).map((q) => q.y));
    expect(Math.min(...xs)).toBeCloseTo(1, 9);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(c.usedLengthCm).toBeCloseTo(Math.max(...xs) + 1, 9);
  });

  it('refuses a layout that breaks the gap', () => {
    // The mirrored L turned 180° spans x ∈ [x2 − 0 … x2 + 30] after the mirror; put it on top
    // of the first one.
    const c = convertSolution(sol(5), job, pieces, config());
    expect(c.ok).toBe(false);
  });

  it('refuses a rotation the job does not allow', () => {
    const bad = sol(80);
    bad.layout.placed_items[0].transformation.rotation = 90;
    expect(convertSolution(bad, job, pieces, config()).ok).toBe(false);
  });

  it('cuts at the table length and reports the rest as table-full', () => {
    const c = convertSolution(sol(80), job, pieces, config({ maxLengthCm: 40 }));
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.placements).toHaveLength(1);
    expect(c.overflow).toEqual([{ pieceId: 1, instance: 1, reason: 'table-full' }]);
  });
});

describe('nestWithSparrow', () => {
  const pieces = [piece(1)];
  const report = (strip: number, x2: number) =>
    JSON.stringify({
      kind: 'ExplFeas',
      elapsed_sec: 0.1,
      strip_width: strip,
      solution: {
        strip_width: strip,
        layout: {
          placed_items: [
            { item_id: 0, transformation: { rotation: 0, translation: [0.3, 0.3] } },
            { item_id: 1, transformation: { rotation: 180, translation: [x2, 40] } },
          ],
        },
      },
    });
  const legacy = vi.fn(
    async (): Promise<NestResult> => ({
      placements: [],
      usedLengthCm: 0,
      efficiency: 0,
      placedCount: 0,
      totalCount: 2,
      unplaced: [],
      generation: 0,
      elapsedMs: 0,
      cancelled: false,
      warnings: ['legacy'],
    }),
  );

  it('falls back to the old engine with a warning when the module does not load', async () => {
    vi.mocked(loadSparrow).mockRejectedValueOnce(new Error('404'));
    const r = await nestWithSparrow(
      pieces,
      config(),
      () => false,
      () => {},
      legacy,
    );
    expect(legacy).toHaveBeenCalledTimes(1);
    expect(r.warnings[0]).toContain('failed to load');
    expect(r.warnings).toContain('legacy');
  });

  it('streams the first checked layout and keeps the best valid one, skipping an invalid report', async () => {
    legacy.mockClear();
    vi.mocked(loadSparrow).mockResolvedValueOnce({
      kind: 'in-process',
      solve: async (_i, _s, _seed, onReport) => {
        onReport(report(90, 80));
        onReport(report(60, 5)); // shorter but overlapping — must never leave
        return { resultJson: null, cancelled: false };
      },
    });
    const frames: number[] = [];
    const r = await nestWithSparrow(
      pieces,
      config(),
      () => false,
      (p) => p.best && frames.push(p.best.placedCount),
      legacy,
    );
    expect(legacy).not.toHaveBeenCalled();
    expect(frames[0]).toBe(2);
    expect(r.placedCount).toBe(2);
    expect(r.placements[1].x).toBeGreaterThan(60);
    expect(r.cancelled).toBe(false);
  });

  it('returns the last checked layout as a cancelled result on stop', async () => {
    vi.mocked(loadSparrow).mockResolvedValueOnce({
      kind: 'worker',
      solve: async (_i, _s, _seed, onReport) => {
        onReport(report(90, 80));
        return { resultJson: null, cancelled: true };
      },
    });
    let stop = false;
    const r = await nestWithSparrow(
      pieces,
      config(),
      () => stop,
      () => (stop = true),
      legacy,
    );
    expect(r.cancelled).toBe(true);
    expect(r.placedCount).toBe(2);
    expect(legacy).not.toHaveBeenCalled();
  });

  it('does not start the solver when stop is already raised', async () => {
    vi.mocked(loadSparrow).mockClear();
    const solve = vi.fn();
    vi.mocked(loadSparrow).mockResolvedValueOnce({ kind: 'in-process', solve });
    const r = await nestWithSparrow(
      pieces,
      config(),
      () => true,
      () => {},
      legacy,
    );
    expect(solve).not.toHaveBeenCalled();
    expect(r.cancelled).toBe(true);
    expect(r.placedCount).toBe(0);
  });

  it('keeps a valid wider layout when a narrower one inside the same frame breaks the gap', async () => {
    legacy.mockClear();
    vi.mocked(loadSparrow).mockResolvedValueOnce({
      kind: 'worker',
      solve: async (_i, _s, _seed, onReport) => {
        onReport(report(100, 80)); // shown at once
        onReport(report(90, 70)); // valid, shorter — within the 200 ms frame
        onReport(report(80, 5)); // narrower still, but overlapping
        return { resultJson: null, cancelled: false };
      },
    });
    const r = await nestWithSparrow(
      pieces,
      config(),
      () => false,
      () => {},
      legacy,
    );
    expect(legacy).not.toHaveBeenCalled();
    expect(r.placedCount).toBe(2);
    expect(r.placements[1].x).toBeGreaterThan(60);
    expect(r.placements[1].x).toBeLessThan(75);
  });

  it('with a table length prefers fewer pieces left off over a narrower strip', async () => {
    const stacked = JSON.stringify({
      kind: 'ExplFeas',
      elapsed_sec: 0.2,
      strip_width: 95,
      solution: {
        strip_width: 95,
        layout: {
          placed_items: [
            { item_id: 0, transformation: { rotation: 0, translation: [0.3, 0.3] } },
            { item_id: 1, transformation: { rotation: 180, translation: [0.3, 45] } },
          ],
        },
      },
    });
    vi.mocked(loadSparrow).mockResolvedValueOnce({
      kind: 'worker',
      solve: async (_i, _s, _seed, onReport) => {
        onReport(report(70, 80)); // side by side: the second L is past a 40 cm table
        onReport(stacked); // wider strip by sparrow's measure, but both fit the table
        return { resultJson: null, cancelled: false };
      },
    });
    const r = await nestWithSparrow(
      pieces,
      config({ maxLengthCm: 40 }),
      () => false,
      () => {},
      legacy,
    );
    expect(r.placedCount).toBe(2);
    expect(r.unplaced).toEqual([]);
  });

  it('falls back with a warning and only the time left when sparrow gives no valid layout', async () => {
    legacy.mockClear();
    vi.mocked(loadSparrow).mockResolvedValueOnce({
      kind: 'worker',
      solve: async (_i, _s, _seed, onReport) => {
        onReport(report(80, 5));
        return { resultJson: null, cancelled: false };
      },
    });
    const r = await nestWithSparrow(
      pieces,
      config({ timeBudgetMs: 20_000 }),
      () => false,
      () => {},
      legacy,
    );
    expect(legacy).toHaveBeenCalledTimes(1);
    const budget = (legacy.mock.calls[0] as unknown as [unknown, NestConfig])[1].timeBudgetMs;
    expect(budget).toBeLessThanOrEqual(23_000);
    expect(budget).toBeGreaterThan(20_000); // nothing used yet: budget + slack
    expect(r.warnings[0]).toContain('no valid layout');
  });

  it('never calls the old engine when one sparrow layout passed, even if the solver then died', async () => {
    legacy.mockClear();
    vi.mocked(loadSparrow).mockResolvedValueOnce({
      kind: 'worker',
      solve: async (_i, _s, _seed, onReport) => {
        onReport(report(90, 80));
        return { resultJson: null, cancelled: false, error: 'worker crashed' };
      },
    });
    const r = await nestWithSparrow(
      pieces,
      config(),
      () => false,
      () => {},
      legacy,
    );
    expect(legacy).not.toHaveBeenCalled();
    expect(r.placedCount).toBe(2);
  });

  it('does not fall back when stop was pressed while the module was loading and it then failed', async () => {
    legacy.mockClear();
    let stop = false;
    vi.mocked(loadSparrow).mockImplementationOnce(async () => {
      stop = true;
      throw new Error('404');
    });
    const r = await nestWithSparrow(
      pieces,
      config(),
      () => stop,
      () => {},
      legacy,
    );
    expect(legacy).not.toHaveBeenCalled();
    expect(r.cancelled).toBe(true);
    expect(r.placedCount).toBe(0);
  });
});

describe('legacyBudgetMs', () => {
  it('ends the fallback within the acceptance slack and gives it a floor', () => {
    expect(legacyBudgetMs(20_000, 19_000)).toBe(4_000);
    expect(legacyBudgetMs(1_000, 0)).toBe(1_150);
    expect(legacyBudgetMs(20_000, 25_000)).toBe(250);
  });
});
