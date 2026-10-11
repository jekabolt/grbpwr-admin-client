// PATTERN-IMPORT · P1 continuity walls + cause E — synthetic controls, one per Codex major (pi/p1):
//   1 D3 stands on ≥ 2 ANCHOR ranks (closed on their own lines), local capped spread, growth band
//   2 R0: never a notch / internal / grain / seam line; no excursion; ignore paths are bracketed
//   3 R2: a spine only where it is a proven boundary (T-landings from one side, no crossing, role)
//   4 the beside test is hard, against every effective wall (reranked / operator lines too)
//   5 G21: provenance + verdict in the manifest, re-checked; any mismatch blocks
//   6 notDrawn from the ORIGINAL classes only, never over a verified common family; the override
//   7 an autopilot stop keeps its audit-only assumptions
// Each check names the rule it guards; mutating that rule in the code makes it FAIL.
import { continuityVerdicts } from 'lib/pattern-import/pieces/fill';
import {
  continuityWalls,
  itemsOf,
  undrawnRanks,
  type WallModel,
} from 'lib/pattern-import/pieces/walls';
import type { WallItem } from 'lib/pattern-import/pieces/snap';
import { markNotDrawn } from 'lib/pattern-import/sizes/map';
import { g21, type GateCtx } from 'lib/pattern-import/gate/checks';
import { continuityOfBlock } from 'lib/pattern-import/write/manifest-build';
import { continuityOk } from 'lib/pattern-import/manifest';
import {
  driveTick,
  newDriveState,
} from 'components/managers/tech-card/components/pattern-import/auto-drive';
import { CASES, runCase } from './e2e-entry';
import type {
  Chain,
  ChainSet,
  PieceFamily,
  Seed,
  ContinuityRecord,
  LineClass,
  PieceCandidate,
  PtMm,
  SizeMap,
  SizeRun,
} from 'lib/pattern-import/types';

const P = (x: number, y: number): PtMm => ({ x, y });
let fails = 0;
const check = (name: string, ok: boolean, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) fails++;
};
function setOf(
  lines: PtMm[][],
  classes: { role: LineClass['role']; chains: number[] }[] = [],
): ChainSet {
  const chains: Chain[] = lines.map((pts, id) => ({
    id,
    pts,
    closed: false,
    ranges: [],
    motif: null,
    style: 0 as never,
    lengthMm: pts.slice(1).reduce((a, p, i) => a + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0),
  }));
  return {
    chains,
    classes: classes.map(
      (c, i) => ({ id: i, role: c.role, chains: c.chains, evidence: [] }) as unknown as LineClass,
    ),
    bundles: [],
    orphans: [],
    warnings: [],
  };
}
const model = (byRank: number[][]): WallModel => ({
  mode: 'graded',
  n: byRank.length,
  common: [],
  byRank,
  emptyRanks: [],
  graded: byRank.flat(),
  fileOfRank: [],
});
const rect = (w: number, h: number): PtMm[] => [P(0, 0), P(w, 0), P(w, h), P(0, h)];
const cand = (
  rank: number,
  w: number,
  h: number,
  rankFrom: PieceCandidate['rankFrom'],
  extra: Partial<PieceCandidate> = {},
): PieceCandidate => ({
  seed: 0,
  rank,
  outer: rect(w, h),
  walls: [],
  inside: [],
  textsInside: [],
  outcome: 'closed',
  areaMm2: w * h,
  bbox: { minX: 0, minY: 0, maxX: w, maxY: h },
  sourceCoverage: 1,
  p95Mm: 0,
  rankFrom,
  ...(rankFrom === 'continuity'
    ? { continuity: [{ rule: 'R1' as const, chains: [9], pts: [P(0, 0), P(0, h)] }] }
    : {}),
  ...extra,
});
const ruleOf = (w: { rule: string; chain: number }[]) =>
  JSON.stringify(w.map((x) => `${x.rule}:${x.chain}`));

// ── corpus: the leak cases of the dossier (scratchpad/leaks), at the automatic pieces run ──
type Auto = { families: PieceFamily[]; seeds: Seed[]; sizes: string[] };
const STOP = new Error('continuity probe: auto pieces captured');
async function autoPieces(id: string): Promise<Auto | null> {
  const c = CASES.find((x) => x.id === id);
  if (!c) return null;
  let got: Auto | null = null;
  try {
    await runCase(c, {
      onAutoPieces: (s, pc) => {
        const run = (s as unknown as { run?: SizeRun | null }).run;
        got = {
          families: pc.families,
          seeds: pc.seeds,
          sizes: (run?.sizes ?? []).map((x, r) => x.label || `r${r}`),
        };
        throw STOP;
      },
    });
  } catch (e) {
    if (e !== STOP && !got) throw e;
  }
  return got;
}
const labelOf = (a: Auto, seed: number) => {
  const sd = a.seeds.find((x) => x.id === seed);
  return (sd?.text?.text ?? sd?.origin ?? String(seed)).trim().slice(0, 24);
};
/**
 * A region of the dossier: case, the piece's label on the sheet (the seed text), the size label,
 * and the area the family's own native ranks expect there (cm², the dossier's trend; null = none).
 */
type Region = { id: string; piece: string; size: string; expCm2: number | null };
/** Must close through continuity walls, within the dossier's trend. */
const CLOSE: Region[] = [
  { id: 'viola', piece: '6', size: '46', expCm2: 865 },
  { id: 'viola', piece: '7', size: '40', expCm2: 916 },
  { id: 'viola', piece: '7', size: '48', expCm2: 1057 },
  // palto's 25: tile-seam trims classed as notch marks (no dossier trend: 84 / 88 grow 4.8 % a size)
  { id: 'palto', piece: '25', size: '72', expCm2: 549 },
  { id: 'palto', piece: '25', size: '80', expCm2: 602 },
];
/** A wrong continuity closure there must be refused (stays a stop). */
const REFUSE: Region[] = [{ id: 'viola', piece: '1', size: '46', expCm2: 2102 }];
/** Reported only: closures the hardened rules no longer prove (see the report). */
const INFO: Region[] = [
  { id: 'leonie', piece: 'face#2', size: 'r0', expCm2: 388 },
  { id: 'viola', piece: '1', size: '40', expCm2: 1796 },
];
/** The family's natively closed ranks alone grow monotonically (a continuity closure may not break it). */
const nativeMono = (f: PieceFamily) => {
  const xs = f.candidates
    .filter((c) => c.outcome === 'closed' && c.rankFrom !== 'continuity')
    .sort((p, q) => p.rank - q.rank);
  return xs.every((c, i) => !i || c.areaMm2 >= xs[i - 1].areaMm2);
};
async function corpus(): Promise<void> {
  const ids = [...new Set([...CLOSE, ...REFUSE, ...INFO].map((r) => r.id))];
  for (const id of ids) {
    const t = Date.now();
    const a = await autoPieces(id);
    if (!a) {
      check(`corpus · ${id}: the automatic pieces run`, false, 'no pieces stage reached');
      continue;
    }
    let kept = 0;
    let open = 0;
    for (const f of a.families) {
      const lab = labelOf(a, f.seed);
      for (const c of f.candidates) {
        if (c.outcome !== 'closed') open++;
        if (c.rankFrom !== 'continuity' || c.outcome !== 'closed') continue;
        kept++;
        const v = c.continuityVerdict;
        console.log(
          `  ${id} ${lab}·${a.sizes[c.rank]} closed ${(c.areaMm2 / 100).toFixed(0)} cm² via ${(c.continuity ?? []).map((e) => e.rule + ':' + e.chains.join('+')).join(',')} anchors ${v?.anchors.join(',') ?? '-'} mono ${f.monotone}`,
        );
        // no wrong closure: a verdict on ≥ 2 anchors, every check inside what it allowed, the
        // family monotone
        check(
          `corpus · ${id} ${lab}·${a.sizes[c.rank]}: a kept closure carries a holding verdict, family monotone`,
          !!v &&
            v.anchors.length >= 2 &&
            v.checks.length > 0 &&
            v.checks.every(
              (k) =>
                k.hMm <= k.hAllowMm &&
                k.hu <= k.huAllow &&
                k.growth >= k.band[0] &&
                k.growth <= k.band[1] &&
                k.dk <= k.kMax,
            ) &&
            (f.monotone || !nativeMono(f)),
        );
      }
    }
    console.log(
      `  ${id}: ${kept} continuity closure(s), ${open} open candidate(s), ${((Date.now() - t) / 1000).toFixed(0)} s`,
    );
    const find = (g: Region) => {
      const f = a.families.find(
        (x) => labelOf(a, x.seed) === g.piece || `${labelOf(a, x.seed)}#${x.seed}` === g.piece,
      );
      const r = a.sizes.indexOf(g.size);
      return f?.candidates.find((c) => c.rank === r);
    };
    const near = (g: Region, area: number) =>
      g.expCm2 == null || Math.abs(area / 100 / g.expCm2 - 1) <= 0.1;
    for (const g of CLOSE.filter((x) => x.id === id)) {
      const c = find(g);
      check(
        `corpus · ${id} ${g.piece}·${g.size} closes through continuity walls (≈ ${g.expCm2} cm²)`,
        !!c && c.outcome === 'closed' && c.rankFrom === 'continuity' && near(g, c.areaMm2),
        c ? `${c.outcome} ${(c.areaMm2 / 100).toFixed(0)} cm² ${c.rankFrom ?? ''}` : 'no candidate',
      );
    }
    for (const g of REFUSE.filter((x) => x.id === id)) {
      const c = find(g);
      check(
        `corpus · ${id} ${g.piece}·${g.size}: the wrong continuity closure is refused (stays a stop)`,
        !!c && !(c.outcome === 'closed' && c.rankFrom === 'continuity'),
        c ? `${c.outcome} ${(c.areaMm2 / 100).toFixed(0)} cm² ${c.rankFrom ?? ''}` : 'no candidate',
      );
    }
    for (const g of INFO.filter((x) => x.id === id)) {
      const c = find(g);
      console.log(
        `INFO  corpus · ${id} ${g.piece}·${g.size}: ${c ? `${c.outcome} ${(c.areaMm2 / 100).toFixed(0)} cm² ${c.rankFrom ?? ''}` : 'no candidate'}`,
      );
    }
  }
}

export async function main(args: string[] = []): Promise<number> {
  if (args.includes('--corpus-only')) {
    await corpus();
    console.log(fails ? `\n${fails} FAILED` : '\nall passed');
    return fails;
  }
  // ── 1 · D3 anchors ──
  {
    // a grade of +4 mm a side a size: 100×200, 104×204, …
    const g = (r: number) => [100 + 4 * r, 200 + 4 * r] as const;
    const fam = (from: (r: number) => PieceCandidate['rankFrom'], ranks = [0, 1, 2, 3]) =>
      ranks.map((r) => cand(r, ...g(r), from(r)));
    let j = continuityVerdicts(fam((r) => (r === 2 ? 'continuity' : 'class')));
    check(
      '1 · two clean anchors, a consistent closure stands',
      !j.refused.has(2) && !!j.kept.get(2)?.anchors.length,
      j.refused.get(2),
    );
    j = continuityVerdicts(fam((r) => (r === 2 ? 'continuity' : r === 3 ? 'class' : 'innerPlug')));
    check(
      '1 · one anchor (the others closed by plugs): refused',
      j.refused.has(2),
      j.refused.get(2),
    );
    j = continuityVerdicts(fam((r) => (r === 2 ? 'continuity' : r === 0 ? 'class' : 'bundleRank')));
    check('1 · bundleRank ranks are no anchors', j.refused.has(2), j.refused.get(2));
    // a closure the size of its neighbour (+0.2 %): outside the anchors' growth band
    const flat = fam((r) => (r === 2 ? 'continuity' : 'class'));
    flat[2] = cand(2, 108.1, 208.1, 'continuity');
    flat[2].outer = rect(104.2, 204.2);
    flat[2].areaMm2 = 104.2 * 204.2;
    j = continuityVerdicts(flat);
    check("1 · growth below the anchors' band: refused", j.refused.has(2), j.refused.get(2));
    // anchors that jump 40 mm a size cannot license a 60 mm wrong outline (cap)
    const wild = [
      cand(0, 100, 200, 'class'),
      cand(1, 105, 205, 'class'),
      cand(2, 120, 196, 'continuity'),
    ];
    wild[2].outer = [P(0, 0), P(120, 0), P(120, 100), P(60, 196), P(0, 196)];
    wild[2].areaMm2 = 120 * 100 + 0.5 * (120 + 60) * 96;
    j = continuityVerdicts(wild);
    check('1 · an unlike outline beside its anchors: refused', j.refused.has(2), j.refused.get(2));
  }
  // ── 2 · R0 ──
  {
    const a = [P(0, 0), P(20, 0)];
    const b = [P(30, 0), P(50, 0)];
    const d1 = [P(20.3, 0.1), P(24.5, 0.1)];
    const d2 = [P(25.2, 0.1), P(29.7, 0)];
    const m = model([[0, 1], []]);
    let set = setOf(
      [a, b, d1, d2],
      [
        { role: 'size', chains: [0, 1] },
        { role: 'ignore', chains: [2, 3] },
      ],
    );
    let w = continuityWalls(set, m, 0, itemsOf(set, [0, 1]));
    check(
      '2 · R0 through ignore dashes: taken, bracketed',
      w.filter((x) => x.rule === 'R0' && x.bracket).length === 2,
      ruleOf(w),
    );
    set = setOf(
      [a, b, d1, d2],
      [
        { role: 'size', chains: [0, 1] },
        { role: 'notch', chains: [2, 3] },
      ],
    );
    w = continuityWalls(set, m, 0, itemsOf(set, [0, 1]));
    check('2 · R0 through notch pieces: refused', !w.some((x) => x.rule === 'R0'), ruleOf(w));
    set = setOf(
      [a, b, d1, d2],
      [
        { role: 'size', chains: [0, 1] },
        { role: 'internal', chains: [2, 3] },
      ],
    );
    w = continuityWalls(set, m, 0, itemsOf(set, [0, 1]));
    check('2 · R0 through internal lines: refused', !w.some((x) => x.rule === 'R0'), ruleOf(w));
    // a path that leaves the chord (a 6 mm tooth) between two aligned ends — no R0 path, and no
    // R1 stretch along it either
    const t1 = [P(20.3, 0), P(23, 0.3), P(25, 6), P(27, 0.3), P(29.7, 0)];
    set = setOf(
      [a, b, t1],
      [
        { role: 'size', chains: [0, 1] },
        { role: 'ignore', chains: [2] },
      ],
    );
    w = continuityWalls(set, m, 0, itemsOf(set, [0, 1]));
    check('2 · a tooth off the chord: refused (R0 and R1)', !w.length, ruleOf(w));
    // D3: a bracketed closure needs anchors on both sides
    const fam = [0, 1, 2].map((r) =>
      cand(r, 100 + 4 * r, 200 + 4 * r, r === 2 ? 'continuity' : 'class'),
    );
    fam[2].continuity = [{ rule: 'R0', chains: [9], pts: [P(0, 0), P(0, 1)], bracket: true }];
    const j = continuityVerdicts(fam);
    check(
      '2 · a bracketed closure with anchors on one side only: refused',
      j.refused.has(2),
      j.refused.get(2),
    );
  }
  // ── 3 · R2 spine ──
  {
    // L: x = 0 (rank 3's line). r = 0: A ends on L at y 20 (dangling); its walls reach L again at
    // y −20 at a corner (B, C). Ranks 1 and 2 end on L from the right; nothing crosses it.
    const L = [P(0, -60), P(0, 60)];
    const A = [P(40, 20), P(0.3, 20)];
    const B = [P(40, -20), P(0.4, -20)];
    const C = [P(0.4, -20), P(0.4, -24), P(30, -50)];
    const D = [P(40, 10), P(0.2, 10)];
    const E = [P(40, 0), P(0.2, 0)];
    const run = (extra: PtMm[][], roleL: LineClass['role'] = 'size', sideE = 1) => {
      const e = sideE > 0 ? E : [P(-40, 0), P(-0.2, 0)];
      const set = setOf(
        [L, A, B, C, D, e, ...extra],
        [
          { role: roleL, chains: [0] },
          { role: 'size', chains: [1, 2, 3] },
          { role: 'size', chains: [4, ...extra.map((_, k) => 6 + k)] },
          { role: 'size', chains: [5] },
        ],
      );
      const m = model([[1, 2, 3], [4, ...extra.map((_, k) => 6 + k)], [5], [0]]);
      return continuityWalls(set, m, 0, itemsOf(set, [1, 2, 3]));
    };
    let w = run([]);
    check(
      '3 · R2 on a proven boundary: taken',
      w.some((x) => x.rule === 'R2' && x.chain === 0),
      ruleOf(w),
    );
    w = run([], 'size', -1);
    check(
      '3 · R2 where a size ends on it from the other side: refused',
      !w.some((x) => x.rule === 'R2'),
      ruleOf(w),
    );
    w = run([[P(-20, 5), P(20, 5)]]);
    check(
      '3 · R2 where a size line crosses it: refused',
      !w.some((x) => x.rule === 'R2'),
      ruleOf(w),
    );
    w = run([], 'internal');
    check('3 · R2 on an internal line: refused', !w.some((x) => x.rule === 'R2'), ruleOf(w));
    w = run([], 'grain');
    check('3 · R2 on a grain line: refused', !w.some((x) => x.rule === 'R2'), ruleOf(w));
  }
  // ── 4 · beside, hard ──
  {
    const U = [
      [P(0, 10), P(0, -30)],
      [P(0, -30), P(60, -30)],
      [P(60, -30), P(60, 10)],
    ];
    const L = [P(-30, 10.4), P(90, 10.4)];
    const set = setOf(
      [...U, L],
      [
        { role: 'size', chains: [0, 1, 2] },
        { role: 'size', chains: [3] },
      ],
    );
    const m = model([[0, 1, 2], [3]]);
    let w = continuityWalls(set, m, 0, itemsOf(set, [0, 1, 2]));
    check(
      '4 · R1 closes a U along L',
      w.some((x) => x.rule === 'R1' && x.chain === 3),
      ruleOf(w),
    );
    for (const [role, want] of [
      ['notch', true],
      ['internal', false],
      ['grain', false],
    ] as const) {
      const s2 = setOf(
        [...U, L],
        [
          { role: 'size', chains: [0, 1, 2] },
          { role, chains: [3] },
        ],
      );
      const w2 = continuityWalls(s2, m, 0, itemsOf(s2, [0, 1, 2]));
      check(
        `4 · R1 along a ${role}-class line: ${want ? 'taken (a tile-seam trim)' : 'refused'}`,
        w2.some((x) => x.rule === 'R1' && x.chain === 3) === want,
        ruleOf(w2),
      );
    }
    // a line of r drawn within 1 mm of L is the same edge, not one beside it
    const twin: WallItem = { chain: 98, pts: [P(10, 10.9), P(50, 10.9)] };
    w = continuityWalls(set, m, 0, itemsOf(set, [0, 1, 2]), new Set(), { beside: [twin] });
    check(
      '4 · a wall of r within 1 mm of L (the same edge drawn twice) is not beside it',
      w.some((x) => x.rule === 'R1' && x.chain === 3),
      ruleOf(w),
    );
    // a wall of r that converges on the stretch at a corner (its foot outside it) is not beside it
    const corner: WallItem = { chain: 97, pts: [P(-40, -20), P(-5, 5), P(-5, -40)] };
    w = continuityWalls(set, m, 0, itemsOf(set, [0, 1, 2]), new Set(), { beside: [corner] });
    check(
      '4 · a wall converging on a corner of the stretch is not beside it',
      w.some((x) => x.rule === 'R1' && x.chain === 3),
      ruleOf(w),
    );
    // a reranked line of r, 6 mm under L along 10 mm of the stretch (a sixth of it)
    const near: WallItem = { chain: 99, pts: [P(25, 4.4), P(35, 4.4)] };
    w = continuityWalls(set, m, 0, itemsOf(set, [0, 1, 2]), new Set(), { beside: [near] });
    check(
      '4 · any parallel run of an effective wall beside it (10 mm of 60): refused',
      !w.some((x) => x.chain === 3),
      ruleOf(w),
    );
    // a line crossing the stretch: refused
    const set2 = setOf(
      [...U, L, [P(30, -20), P(30, 30)]],
      [
        { role: 'size', chains: [0, 1, 2, 4] },
        { role: 'size', chains: [3] },
      ],
    );
    w = continuityWalls(set2, model([[0, 1, 2, 4], [3]]), 0, itemsOf(set2, [0, 1, 2, 4]));
    check(
      "4 · R1 across the rank's own line: refused",
      !w.some((x) => x.chain === 3 && x.rule === 'R1'),
      ruleOf(w),
    );
  }
  // ── 5 · G21 ──
  {
    const line = [P(0, 0), P(100, 0), P(100, 50), P(0, 50)];
    const rec: ContinuityRecord = {
      rank: 2,
      edges: [{ rule: 'R1', chains: [7], roles: ['size'], ownRank: false }],
      verdict: {
        anchors: [0, 1],
        checks: [
          {
            vs: 1,
            steps: 1,
            hMm: 3,
            hAllowMm: 9,
            hu: 0.02,
            huAllow: 0.2,
            growth: 0.04,
            band: [0.02, 0.07],
            dk: 0.01,
            kMax: 0.08,
          },
        ],
      },
    };
    const geo = {
      edges: [{ pts: [[P(100, 10), P(100, 40)]], chainLines: [[P(100, -20), P(100, 80)]] }],
    };
    const ctxOf = (r: ContinuityRecord, g: typeof geo | null = geo, mc = continuityOfBlock(r)) =>
      ({
        blocks: [
          {
            block: 'B',
            mb: { continuity: mc },
            spec: { allowance: { meaning: 'cut' } },
            size: { continuity: r },
          },
        ],
        expect: { continuityByBlock: g ? { B: g } : {} },
        contours: new Map([['B', new Map([['1', line]])]]),
      }) as unknown as GateCtx;
    check('5 · G21: a recorded, holding closure passes', g21(ctxOf(rec)).ok, g21(ctxOf(rec)).note);
    let c = g21(
      ctxOf(rec, geo, continuityOfBlock({ ...rec, edges: [{ ...rec.edges[0], chains: [8] }] })),
    );
    check('5 · G21: manifest entry ≠ the run → blocks', !c.ok, c.note);
    c = g21(ctxOf(rec, geo, continuityOfBlock({ ...rec, verdict: null })));
    check('5 · G21: a manifest entry without the D3 verdict → blocks', !c.ok, c.note);
    {
      // the manifest's audit survives its own validation unchanged (written = read back)
      const mc = continuityOfBlock(rec);
      const rt = JSON.parse(JSON.stringify(mc));
      check(
        '5 · the continuity audit (edges, roles, verdict, checks) is valid manifest data and round-trips',
        continuityOk(rt) &&
          JSON.stringify(continuityOfBlock(rt)) === JSON.stringify(mc) &&
          mc.edges[0].roles.length === 1 &&
          mc.verdict?.checks.length === 1,
      );
      check(
        '5 · a manifest continuity entry without roles / with a bad rule / a bad check is rejected',
        !continuityOk({ ...rt, edges: [{ ...rt.edges[0], roles: [] }] }) &&
          !continuityOk({ ...rt, edges: [{ ...rt.edges[0], rule: 'R9' }] }) &&
          !continuityOk({
            ...rt,
            verdict: { ...rt.verdict, checks: [{ ...rt.verdict.checks[0], hMm: 'x' }] },
          }),
      );
    }
    c = g21(
      ctxOf({
        ...rec,
        verdict: { ...rec.verdict!, checks: [{ ...rec.verdict!.checks[0], hMm: 12 }] },
      }),
    );
    check('5 · G21: a verdict outside what it allowed → blocks', !c.ok, c.note);
    c = g21(ctxOf({ ...rec, verdict: { ...rec.verdict!, anchors: [1] } }));
    check('5 · G21: a verdict on one anchor → blocks', !c.ok, c.note);
    c = g21(ctxOf({ ...rec, edges: [{ ...rec.edges[0], roles: ['internal'] }] }));
    check('5 · G21: a stretch on an internal line → blocks', !c.ok, c.note);
    c = g21(ctxOf({ ...rec, edges: [{ ...rec.edges[0], rule: 'R0', roles: ['notch'] }] }));
    check('5 · G21: an R0 path on a notch line → blocks', !c.ok, c.note);
    c = g21(ctxOf({ ...rec, edges: [{ ...rec.edges[0], roles: ['notch'] }] }));
    check('5 · G21: an R1 stretch on a notch-class line (a tile-seam trim) passes', c.ok, c.note);
    c = g21(
      ctxOf(rec, {
        edges: [{ pts: [[P(100, 10), P(100, 40)]], chainLines: [[P(104, -20), P(104, 80)]] }],
      }),
    );
    check('5 · G21: a stretch off the chain it names → blocks', !c.ok, c.note);
    c = g21(
      ctxOf(rec, {
        edges: [{ pts: [[P(80, 10), P(80, 40)]], chainLines: [[P(80, -20), P(80, 80)]] }],
      }),
    );
    check('5 · G21: the written line does not run along the stretch → blocks', !c.ok, c.note);
    c = g21(ctxOf(rec, null));
    check('5 · G21: no geometry to check → blocks', !c.ok, c.note);
  }
  // ── 6 · notDrawn ──
  {
    const lines = [
      [P(0, 0), P(50, 0)],
      [P(0, 5), P(55, 5)],
    ];
    const run: SizeRun = {
      encoding: 'separate-dash',
      sizes: [0, 1, 2].map((r) => ({ label: String(34 + 2 * r), rank: r, classId: r })),
      evidence: [],
    } as unknown as SizeRun;
    let set = setOf(lines, [
      { role: 'size', chains: [] },
      { role: 'size', chains: [0] },
      { role: 'size', chains: [1] },
    ]);
    check(
      '6 · an originally empty size class: not drawn',
      JSON.stringify(undrawnRanks(set, run)) === '[0]',
      JSON.stringify(undrawnRanks(set, run)),
    );
    set = setOf(lines, [
      { role: 'size', chains: [0] },
      { role: 'size', chains: [0] },
      { role: 'size', chains: [1] },
    ]);
    check(
      '6 · a size class that carried chains is never not drawn',
      undrawnRanks(set, run).length === 0,
    );
    const loop = [P(100, 0), P(200, 10), P(220, 60), P(150, 110), P(95, 60), P(100, 0)];
    const mark = [P(300, 0), P(320, 0), P(320, 20), P(300, 20), P(300, 0)];
    set = setOf(
      [...lines, loop],
      [
        { role: 'size', chains: [] },
        { role: 'size', chains: [0] },
        { role: 'size', chains: [1] },
        { role: 'common', chains: [2] },
      ],
    );
    check(
      '6 · a closed common outline (a collar for every size) covers it: drawn',
      undrawnRanks(set, run).length === 0,
    );
    set = setOf(
      [...lines, mark],
      [
        { role: 'size', chains: [] },
        { role: 'size', chains: [0] },
        { role: 'size', chains: [1] },
        { role: 'common', chains: [2] },
      ],
    );
    check(
      '6 · a small common mark (a buttonhole, 4 cm²) covers nothing: still not drawn',
      JSON.stringify(undrawnRanks(set, run)) === '[0]',
      JSON.stringify(undrawnRanks(set, run)),
    );
    const card = [34, 36, 38].map((t, i) => ({
      sizeId: i + 1,
      token: String(t),
      name: String(t),
      rank: i,
    }));
    const map: SizeMap = {
      entries: run.sizes.map((s, i) => ({
        source: s,
        card: card[i],
        origin: 'auto',
        confidence: 1,
      })),
      unmapped: [],
    } as unknown as SizeMap;
    let m2 = markNotDrawn(map, [0], card as never);
    check(
      '6 · marked: no card, the size it would take, unmapped card size',
      !m2.entries[0].card &&
        m2.entries[0].notDrawn?.wouldMap?.token === '34' &&
        m2.unmapped.length === 1,
    );
    m2 = markNotDrawn(
      {
        ...map,
        entries: map.entries.map((e, i) =>
          i === 0 ? { ...e, origin: 'operator', drawnAnyway: true } : e,
        ),
      } as SizeMap,
      [0],
      card as never,
    );
    check(
      '6 · the operator\'s "this size is drawn" stands',
      !!m2.entries[0].card && !m2.entries[0].notDrawn,
    );
  }
  // ── 7 · a stop keeps its audit record ──
  {
    const patched: unknown[] = [];
    const rec = [{ kind: 'size-dropped', subject: 'size 34', strong: true }];
    const t = await driveTick(newDriveState(), {
      session: { step: 'sizes', busy: false, error: null } as never,
      inputs: {},
      blocker: null,
      offer: "size 34 isn't drawn on this sheet — it will not be written",
      notice: null,
      busy: false,
      resolve: () =>
        ({
          stop: true,
          reason: { reason: 'the card has 34' },
          patch: { autopilot: rec },
          assumptions: [],
        }) as never,
      current: () => ({ session: { step: 'sizes' } as never, inputs: {} }),
      forward: async () => false,
      patch: (p: unknown) => void patched.push(p),
      dispatch: async () => undefined,
      live: () => true,
      failed: () => false,
    } as never);
    check(
      '7 · a stop applies its audit-only record',
      t.kind === 'stopped' && JSON.stringify(patched) === JSON.stringify([{ autopilot: rec }]),
      JSON.stringify(patched),
    );
  }
  if (!args.includes('--synthetic-only')) await corpus();
  console.log(fails ? `\n${fails} FAILED` : '\nall passed');
  return fails;
}
