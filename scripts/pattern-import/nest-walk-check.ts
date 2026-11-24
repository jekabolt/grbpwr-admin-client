// NEST WALK CHECK — offline validation of pieces/gfit/nest-walk on one dxf-shot file
// (cells.json + rows.json: run dxf-shot with SHOT_ROWS=1). No pipeline is run.
//   npx vite-node scripts/pattern-import/nest-walk-check.ts <shot>/<file> [--only <label>] [--json f]
// Per piece: the etalon, landmarks, steps measured / interpolated / extrapolated / replaced, and
//   (a) leave-one-out: every closed non-etalon size built with its own lines hidden, vs its outline;
//   (b) every open cell built with its own lines hidden, vs the own lines it does have;
//   (c) the built areas grow along the card order;
//   and the walk's outline of every open cell (own lines visible): derived mm, refusals.
// Acceptance (task, 17 Nov 2026): (a) p95 ≤ 0.5 mm and max ≤ 1.5 mm, (b) p95 ≤ 0.5 mm, (c) holds.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  canonRing,
  linesToRing,
  NestLineIndex,
  nestWalk,
  ringDistance,
  type NestSizeIn,
} from 'lib/pattern-import/pieces/gfit/nest-walk';
import { signedArea } from 'lib/pattern-import/pieces/geom';
import { parseSizeToken } from 'lib/pattern-import/sizes/tokens';
import type { PtMm } from 'lib/pattern-import/types';

type Cell = {
  size: string;
  outcome: string;
  from?: string | null;
  outer?: [number, number][];
  derived?: { kind: string; pts: [number, number][] }[];
  derivedMm?: number;
};
type Family = { seed: number; label: string | null; cells: Cell[] };
type Rows = { chains: [number, number][][]; byRank: number[][]; common: number[] };

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const dir = args.find(
  (a, i) => !a.startsWith('--') && !['--only', '--json', '--dump'].includes(args[i - 1]),
);
if (!dir) {
  console.error('usage: nest-walk-check.ts <shot>/<file> [--only <label>] [--json f]');
  process.exit(2);
}
const fams: Family[] = JSON.parse(readFileSync(resolve(dir, 'cells.json'), 'utf8'));
const rows: Rows = JSON.parse(readFileSync(resolve(dir, 'rows.json'), 'utf8'))[0];
const P = (a: [number, number][]): PtMm[] => a.map(([x, y]) => ({ x, y }));
const chains = rows.chains.map(P);
const commonRows = rows.common.map((id) => chains[id]);
const ownRows = (r: number) => (rows.byRank[r] ?? []).map((id) => chains[id]);
// a common chain no size owns: the reference check counts only these as common
const ranked = new Set(rows.byRank.flat());
const pureCommon = rows.common.filter((id) => !ranked.has(id)).map((id) => chains[id]);
/** Share of a closed cell's outline on its own lines or on common lines no size owns. */
const refShare = (r: number, outer: readonly PtMm[]) => {
  const idx = new NestLineIndex([...ownRows(r), ...pureCommon]);
  const ring = canonRing(outer).pts;
  return ring.filter((p) => idx.nearest(p, 0.5)).length / ring.length;
};
/** A reference this far off its own lines closed on another size's line (Leah B 00: on 6–12's shoulder). */
const REF_MIN_SHARE = 0.98;
/** The sheet's chains (ids, with the ranks that own them) passing within 0.3 mm of p. */
const chainsAt = (p: PtMm) => {
  const out: string[] = [];
  chains.forEach((c, id) => {
    for (let i = 1; i < c.length; i++) {
      const a = c[i - 1];
      const b = c[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1e-12;
      const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
      if (Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy) <= 0.3) {
        const rk = rows.byRank.flatMap((ids, r) => (ids.includes(id) ? [r] : []));
        out.push(`c${id}${rk.length ? `[r${rk.join(',')}]` : '[common]'}`);
        return;
      }
    }
  });
  return out;
};
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '∞');
const q95 = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
};
const report: unknown[] = [];

for (const fam of fams) {
  if (opt('--only') && !(fam.label ?? '').includes(opt('--only')!)) continue;
  const card = fam.cells.map((c) => c.size);
  const stepOf = (label: string, rank: number) => parseSizeToken(label)?.value ?? rank;
  let sizes: NestSizeIn[] = fam.cells.map((c, rank) => ({
    rank,
    outer: c.outcome === 'closed' && c.outer?.length ? P(c.outer) : null,
    from: c.from ?? null,
    derived: (c.derived ?? []).map((d) => ({ kind: d.kind, pts: P(d.pts) })),
    step: stepOf(c.size, rank),
  }));
  let own = ownRows;
  let common = commonRows;
  // --dump: the walk's inputs as the pipeline gave them (repair-hook, one JSON per seed)
  if (opt('--dump')) {
    const d: { sizes: NestSizeIn[]; own: PtMm[][][]; common: PtMm[][] } = JSON.parse(
      readFileSync(resolve(opt('--dump')!, `seed${fam.seed}.json`), 'utf8'),
    );
    const byRank = new Map(d.sizes.map((s, i) => [s.rank, d.own[i]]));
    sizes = d.sizes.map((s, i) => ({
      ...s,
      step: s.step ?? stepOf(card[i] ?? String(s.rank), s.rank),
    }));
    own = (r: number) => byRank.get(r) ?? [];
    common = d.common;
  }
  const t0 = Date.now();
  const full = nestWalk({ sizes, own, common });
  console.log(
    `\n== ${fam.label}  etalon ${full.etalon == null ? `NONE (${full.why})` : card[full.etalon]}`,
  );
  if (full.etalon == null) {
    console.log(
      '   candidates:',
      full.candidates.map((c) => `${card[c.rank]}:${c.fails.join('+') || 'ok'}`).join(' '),
    );
    report.push({ label: fam.label, etalon: null, why: full.why });
    continue;
  }
  const E = full.etalon;
  const kinds: Record<string, number> = {};
  for (const l of full.landmarks) kinds[l.kind] = (kinds[l.kind] ?? 0) + 1;
  const elig = full.candidates.filter((c) => c.eligible);
  console.log(
    `   candidates ${elig.map((c) => `${card[c.rank]}:${(c.ownShare * 100).toFixed(1)}${c.tier === 2 ? '(t2)' : ''}`).join(' ')} · mode corners ${full.modeCorners}`,
  );
  console.log(
    `   landmarks ${full.landmarks.length} (${Object.entries(kinds)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')})`,
  );
  const st = full.stats;
  console.log(
    `   steps: measured ${st.measured} · interpolated ${st.interpolated} · extrapolated ${st.extrapolated} · replaced ${st.replaced} · lost ${st.lost} · breaks ${st.worst?.length ?? 0}`,
  );

  // (a) leave-one-out
  const loo: { size: string; p95: number; max: number; at: PtMm; lm?: string; ref: number }[] = [];
  const doubt: string[] = [];
  for (const s of sizes) {
    if (!s.outer || s.rank === E) continue;
    if (fam.cells[s.rank].from && fam.cells[s.rank].from !== 'class') {
      doubt.push(`${card[s.rank]}(${fam.cells[s.rank].from})`);
      continue;
    }
    const ref = refShare(s.rank, s.outer);
    if (ref < REF_MIN_SHARE) {
      doubt.push(`${card[s.rank]}(ref ${(ref * 100).toFixed(1)} %)`);
      continue;
    }
    const w = nestWalk({
      sizes,
      own,
      common,
      etalon: E,
      hide: new Set([s.rank]),
      only: new Set([s.rank]),
    });
    const b = w.sizes.get(s.rank);
    if (!b) {
      loo.push({ size: card[s.rank], p95: Infinity, max: Infinity, at: { x: 0, y: 0 }, ref });
      continue;
    }
    const d = ringDistance(b.outer, canonRing(s.outer).pts);
    // the landmark nearest the worst point
    let lm = '';
    let bd = Infinity;
    full.landmarks.forEach((l, j) => {
      const dd = Math.hypot(l.p.x - d.at.x, l.p.y - d.at.y);
      if (dd < bd) [bd, lm] = [dd, `#${j} ${l.kind} e${l.edge} t${l.t.toFixed(2)}`];
    });
    loo.push({ size: card[s.rank], p95: d.p95, max: d.max, at: d.at, lm, ref });
  }
  const looP95 = q95(loo.map((x) => x.p95));
  const looMax = Math.max(0, ...loo.map((x) => x.max));
  const okA = loo.every((x) => x.p95 <= 0.5 && x.max <= 1.5);
  console.log(
    `   (a) leave-one-out ${okA ? 'PASS' : 'FAIL'}: p95 of p95 ${f2(looP95)} · max ${f2(looMax)} · ${loo.map((x) => `${x.size}:${f2(x.p95)}/${f2(x.max)}`).join(' ')}`,
  );
  if (doubt.length) console.log(`       not a reference: ${doubt.join(' ')}`);
  const worstA = loo.slice().sort((a, b) => b.max - a.max)[0];
  if (worstA && !okA)
    console.log(
      `       worst ${worstA.size} max ${f2(worstA.max)} at ${worstA.at.x.toFixed(1)},${worstA.at.y.toFixed(1)} near ${worstA.lm}`,
    );

  // (b) open cells, own lines hidden, vs the own lines they have
  const part: { size: string; p95: number; max: number; n: number }[] = [];
  const open = sizes.filter((s) => !s.outer);
  for (const s of open) {
    const w = nestWalk({
      sizes,
      own,
      common,
      etalon: E,
      hide: new Set([s.rank]),
      only: new Set([s.rank]),
    });
    const b = w.sizes.get(s.rank);
    if (!b) {
      part.push({ size: card[s.rank], p95: Infinity, max: Infinity, n: 0 });
      continue;
    }
    const d = linesToRing(own(s.rank), b.outer, 3);
    part.push({ size: card[s.rank], p95: d.p95, max: d.max, n: d.n });
  }
  const okB = part.every((x) => x.p95 <= 0.5);
  if (part.length)
    console.log(
      `   (b) open cells ${okB ? 'PASS' : 'FAIL'}: ${part.map((x) => `${x.size}:${f2(x.p95)}/${f2(x.max)} n${x.n}`).join(' ')}`,
    );

  // (c) areas along the card order: the cell's own outline where it closed, else the walk's
  const areas = sizes.map((s) => {
    const o = s.outer ? canonRing(s.outer).pts : full.sizes.get(s.rank)?.outer;
    return o ? Math.abs(signedArea(o)) : NaN;
  });
  const drops: string[] = [];
  let last = -Infinity;
  areas.forEach((a, r) => {
    if (!Number.isFinite(a)) return;
    if (a < last) drops.push(`${card[r]} ${(a / 100).toFixed(0)} < ${(last / 100).toFixed(0)} cm²`);
    last = Math.max(last, a);
  });
  console.log(`   (c) areas ${drops.length ? `FAIL: ${drops.join(', ')}` : 'PASS'}`);

  // the walk's outline of each open cell (own lines visible), and the closed cells as a check
  const built = open.map((s) => {
    const b = full.sizes.get(s.rank);
    const L = b ? b.outer.length * 0.5 : 0;
    return b
      ? `${card[s.rank]}: derived ${b.derivedMm.toFixed(1)} mm (${((b.derivedMm / L) * 100).toFixed(1)} %, ${b.derived.map((d) => `${d.kind[0]}${d.mm.toFixed(0)}`).join('/')})${b.refused ? ` REFUSED ${b.refused}` : ''}`
      : `${card[s.rank]}: not built`;
  });
  if (built.length) console.log(`   open cells built: ${built.join(' · ')}`);
  const chk = sizes
    .filter((s) => s.outer && s.rank !== E)
    .map((s) => {
      const b = full.sizes.get(s.rank);
      if (!b) return { size: card[s.rank], max: Infinity, derivedMm: NaN };
      return {
        size: card[s.rank],
        max: ringDistance(b.outer, canonRing(s.outer!).pts).max,
        derivedMm: b.derivedMm,
      };
    });
  // gate (owner, 17 Nov 2026): no built ring crosses itself, ≤ 2 closed sizes the walk cannot
  // build; loops cut off the size's own drawn line are counted apart
  const crossing = [...full.sizes.values()]
    .filter((b) => b.refused === 'self-crossing')
    .map((b) => card[b.rank]);
  const unchecked = sizes
    .filter((s) => s.outer && s.rank !== E)
    .filter((s) => {
      const b = full.sizes.get(s.rank);
      return !b || b.outer.length < 3 || !!b.refused;
    })
    .map((s) => `${card[s.rank]}(${full.sizes.get(s.rank)?.refused ?? 'not-built'})`);
  const loops = [...full.sizes.values()].flatMap((b) =>
    (b.loops ?? []).map((l) => ({ size: card[b.rank], ...l })),
  );
  console.log(
    `   gate: self-crossing ${crossing.length}${crossing.length ? ` (${crossing.join(' ')})` : ''} · unchecked ${unchecked.length}${unchecked.length ? ` (${unchecked.join(' ')})` : ''} · drawn-line loops ${loops.length}`,
  );
  for (const l of loops)
    console.log(
      `     loop ${l.size} edge ${l.edge}: at ${l.at.x.toFixed(2)},${l.at.y.toFixed(2)} · ${l.mm.toFixed(1)} mm · ${l.cut ? 'cut, kept' : 'edge derived'} · lines ${l.lines.join('+')} · chains at the crossing ${chainsAt(l.at).join(' ') || '-'}`,
    );
  console.log(
    `   closed cells, walk vs own outline: max ${f2(Math.max(0, ...chk.map((x) => x.max)))} · ${
      chk
        .filter((x) => x.max > 0.5)
        .map((x) => `${x.size}:${f2(x.max)}`)
        .join(' ') || 'all ≤ 0.5'
    } · ${Date.now() - t0} ms`,
  );
  report.push({
    label: fam.label,
    etalon: card[E],
    landmarks: full.landmarks.length,
    stats: { ...st, worst: undefined },
    loo,
    doubt,
    part,
    drops,
    okA,
    okB,
    okC: !drops.length,
    crossing,
    unchecked,
    loops,
  });
}
if (opt('--json')) writeFileSync(opt('--json')!, JSON.stringify(report, null, 1));
