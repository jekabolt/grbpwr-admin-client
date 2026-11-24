// Offline nest alignment (Э4–Э5). No pipeline.
//   npx vite-node scripts/pattern-import/nest-align-check.ts <shot>/<file> [--only <letter>] [--loo]
// Reads cells.json + rows.json. --loo runs the leave-one-out gate (slower).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  nestAlign,
  nestAlignOracle,
  type AlignChain,
  type NestAlignOut,
} from 'lib/pattern-import/pieces/gfit/nest-align';
import {
  NestLineIndex,
  pickEtalon,
  ringDistance,
  type NestSizeIn,
} from 'lib/pattern-import/pieces/gfit/nest-walk';
import { parseSizeToken } from 'lib/pattern-import/sizes/tokens';
import type { PtMm } from 'lib/pattern-import/types';

type Cell = { size: string; outcome: string; outer?: unknown[] };
type Family = { label: string | null; cells: Cell[] };
type Rows = {
  chains: [number, number][][];
  byRank: number[][];
  common: number[];
  style?: number[];
  motif?: (number[] | null)[];
};

const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const valued = new Set(['--only', '--ray', '--costs', '--miss']);
const dir = args.find((a, i) => !a.startsWith('--') && !valued.has(args[i - 1] ?? ''));
if (!dir) {
  console.error('usage: nest-align-check.ts <shot>/<file> [--only <letter>] [--loo]');
  process.exit(2);
}
const only = opt('--only');
const looOn = args.includes('--loo');
const tune = {
  ray: opt('--ray') === 'first' ? ('first' as const) : ('fixed' as const),
  costs: opt('--costs') === 'step' ? ('step' as const) : ('band' as const),
};
const missDir = opt('--miss');
const fams: Family[] = JSON.parse(readFileSync(resolve(dir, 'cells.json'), 'utf8'));
const rows: Rows = JSON.parse(readFileSync(resolve(dir, 'rows.json'), 'utf8'))[0];

const pt = (p: unknown): PtMm =>
  Array.isArray(p) ? { x: +(p[0] as number), y: +(p[1] as number) } : (p as PtMm);

const lenOf = (pts: readonly PtMm[]) => {
  let L = 0;
  for (let i = 1; i < pts.length; i++)
    L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return L;
};

const chains: AlignChain[] = rows.chains.map((pts, id) => ({
  id,
  pts: pts.map(([x, y]) => ({ x, y })),
  style: rows.style?.[id] ?? 0,
  motif: rows.motif?.[id] ?? null,
}));

const f2 = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : 'inf');

function windowIds(outers: PtMm[][], pad: number): Set<number> {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of outers)
    for (const p of o) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  const ids = new Set<number>();
  chains.forEach((c, id) => {
    if (
      c.pts.some(
        (p) => p.x >= minX - pad && p.x <= maxX + pad && p.y >= minY - pad && p.y <= maxY + pad,
      )
    )
      ids.add(id);
  });
  return ids;
}

function runFamily(
  fam: Family,
): { out: NestAlignOut; ids: Set<number>; outers: (PtMm[] | null)[] } | null {
  const outers = fam.cells.map((c) =>
    c.outcome === 'closed' && c.outer && c.outer.length > 2 ? c.outer.map(pt) : null,
  );
  const closed = outers.flatMap((o) => (o ? [o] : []));
  if (closed.length < 2) return null;
  const ids = windowIds(closed, 80);
  const byRank = fam.cells.map((_, r) => (rows.byRank[r] ?? []).filter((id) => ids.has(id)));
  const common = rows.common.filter((id) => ids.has(id));
  const use = chains.filter((c) => ids.has(c.id));
  const sizes = fam.cells.map((c, r) => ({
    rank: r,
    step: parseSizeToken(c.size)?.value ?? r,
    outer: outers[r],
  }));
  const nestSizes: NestSizeIn[] = sizes.map((s) => ({
    rank: s.rank,
    step: s.step,
    outer: s.outer,
    from: s.outer ? 'class' : null,
  }));
  const ownIdx = (r: number) => new NestLineIndex(byRank[r].map((id) => chains[id].pts));
  const etalon = pickEtalon(nestSizes, ownIdx).etalon ?? undefined;
  const input = { sizes, chains: use, byRank, common, etalon, tune };
  const out = args.includes('--oracle') ? nestAlignOracle(input) : nestAlign(input);
  return { out, ids, outers };
}

/** A chain counts only where it lies on this piece's rings, not in the +80 mm window. */
const PIECE_MM = 1;
/**
 * A sample is a tie when two closed rings are each closer than this and the gap between
 * those distances is under it too. 0.45 mm is `corridorMinMm` in gfit repair — the measure
 * does not add a threshold of its own.
 */
const TIE_MM = 0.45;

const segDist = (p: PtMm, a: PtMm, b: PtMm) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1e-12;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy);
};

const distTo = (p: PtMm, ring: readonly PtMm[]) => {
  let d = Infinity;
  for (let i = 0; i < ring.length; i++)
    d = Math.min(d, segDist(p, ring[i], ring[(i + 1) % ring.length]));
  return d;
};

const median = (xs: number[]) => {
  if (!xs.length) return Infinity;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** Two rings each inside the corridor, and not separated by a full corridor. */
const isTie = (d: readonly number[]) => {
  const s = d.filter((x) => x < 1e8).sort((a, b) => a - b);
  return s.length >= 2 && s[1] < TIE_MM && s[1] - s[0] < TIE_MM;
};

type ChainRead = {
  /** on the piece and not a tie */
  len: number;
  tie: number;
  med: number[];
  step: number;
};

function readChain(pts: readonly PtMm[], rings: readonly (PtMm[] | null)[]): ChainRead {
  const open: { w: number; d: number[] }[] = [];
  let tie = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    if (L < 1e-9) continue;
    const n = Math.max(1, Math.ceil(L / 2));
    for (let k = 0; k < n; k++) {
      const p = {
        x: a.x + ((b.x - a.x) * (k + 0.5)) / n,
        y: a.y + ((b.y - a.y) * (k + 0.5)) / n,
      };
      const d = rings.map((r) => (r ? distTo(p, r) : Infinity));
      if (Math.min(...d) > PIECE_MM) continue;
      const w = L / n;
      if (isTie(d)) tie += w;
      else open.push({ w, d });
    }
  }
  const len = open.reduce((s, p) => s + p.w, 0);
  if (!open.length) return { len: 0, tie, med: [], step: 0 };
  const med = rings.map((_, i) => median(open.map((p) => p.d[i])));
  const gaps: number[] = [];
  for (const p of open) {
    const s = p.d.filter((d) => d < 1e8).sort((a, b) => a - b);
    if (s.length >= 2) gaps.push(s[1] - s[0]);
  }
  return { len, tie, med, step: gaps.length ? median(gaps) : 0 };
}

type Miss = {
  id: number;
  size: string;
  rank: number;
  len: number;
  owner: string;
  step: number;
  med: number[];
  pts: readonly PtMm[];
};

function agree(fam: Family, got: NonNullable<ReturnType<typeof runFamily>>) {
  const owner = new Map<number, number | 'common' | 'ask'>();
  got.out.sizes.forEach((s, i) => s.chains.forEach((c) => owner.set(c.id, i)));
  got.out.common.forEach((c) => owner.set(c.id, 'common'));
  got.out.asks.forEach((a) => owner.set(a.chain, 'ask'));
  let hit = 0;
  let ok = 0;
  let wrong = 0;
  let indistinct = 0;
  const misses: Miss[] = [];
  fam.cells.forEach((c, r) => {
    if (c.outcome !== 'closed') return;
    for (const id of rows.byRank[r] ?? []) {
      const pts = chains[id]?.pts;
      if (!pts || pts.length < 2) continue;
      const g = readChain(pts, got.outers);
      indistinct += g.tie;
      if (g.len < 1) continue;
      hit += g.len;
      const o = owner.get(id);
      if (o === r) ok += g.len;
      else {
        if (typeof o === 'number') wrong += g.len;
        misses.push({
          id,
          size: c.size,
          rank: r,
          len: g.len,
          owner: o == null ? 'none' : String(o),
          step: g.step,
          med: g.med,
          pts,
        });
      }
    }
  });
  const onPiece = hit + indistinct;
  const measurable = !(onPiece > 0 && indistinct > onPiece / 2);
  const share = hit ? ok / hit : 1;
  const status = !measurable ? 'не измерима' : share >= 0.98 ? '≥98%' : 'ниже';
  return {
    share,
    wrong: hit ? wrong / hit : 0,
    hit,
    ok,
    indistinct,
    misses,
    status,
  };
}

function blend(a: PtMm[], b: PtMm[], w: number): PtMm[] {
  return a.map((p) => {
    let q = b[0];
    let bd = Infinity;
    for (const t of b) {
      const d = (t.x - p.x) ** 2 + (t.y - p.y) ** 2;
      if (d < bd) {
        bd = d;
        q = t;
      }
    }
    return { x: p.x + (q.x - p.x) * w, y: p.y + (q.y - p.y) * w };
  });
}

function loo(fam: Family, base: NonNullable<ReturnType<typeof runFamily>>) {
  const fails: string[] = [];
  let n = 0;
  let p00 = Number.NaN;
  fam.cells.forEach((c, r) => {
    if (c.outcome !== 'closed' || !c.outer || r === base.out.etalon) return;
    const hide = new Set(rows.byRank[r] ?? []);
    const outers = fam.cells.map((q, i) =>
      i !== r && q.outcome === 'closed' && q.outer && q.outer.length > 2 ? q.outer.map(pt) : null,
    );
    const closed = outers.flatMap((o) => (o ? [o] : []));
    if (closed.length < 2) return;
    const ids = windowIds(closed, 80);
    hide.forEach((id) => ids.delete(id));
    const byRank = fam.cells.map((_, i) =>
      (rows.byRank[i] ?? []).filter((id) => ids.has(id) && !hide.has(id)),
    );
    const sizes = fam.cells.map((q, i) => ({
      rank: i,
      step: parseSizeToken(q.size)?.value ?? i,
      outer: outers[i],
    }));
    const out = nestAlign({
      sizes,
      chains: chains.filter((ch) => ids.has(ch.id)),
      byRank,
      common: rows.common.filter((id) => ids.has(id)),
      etalon: base.out.etalon ?? undefined,
      tune,
    });
    const built = out.sizes[r]?.ring;
    if (!built || built.length < 3) {
      fails.push(`${c.size}:no-ring`);
      n++;
      return;
    }
    const truth = c.outer.map(pt);
    const d = ringDistance(built, truth);
    const lo = [...Array(fam.cells.length).keys()].filter((i) => i < r && outers[i]).pop();
    const hi = [...Array(fam.cells.length).keys()].find((i) => i > r && outers[i]);
    let floor = 0;
    if (lo != null && hi != null && outers[lo] && outers[hi]) {
      const slo = parseSizeToken(fam.cells[lo].size)?.value ?? lo;
      const shi = parseSizeToken(fam.cells[hi].size)?.value ?? hi;
      const sr = parseSizeToken(c.size)?.value ?? r;
      const w = shi === slo ? 0.5 : (sr - slo) / (shi - slo);
      floor = ringDistance(truth, blend(outers[lo]!, outers[hi]!, w)).p95;
    }
    const bar = Math.max(0.5, floor + 0.2);
    n++;
    if (c.size === '00') p00 = d.p95;
    if (d.p95 > bar) fails.push(`${c.size}:p95 ${f2(d.p95)} bar ${f2(bar)} floor ${f2(floor)}`);
  });
  return { n, fails, p00 };
}

function missSvg(rings: readonly (PtMm[] | null)[], misses: Miss[]): string {
  const all = [...rings.flatMap((r) => r ?? []), ...misses.flatMap((m) => m.pts)];
  if (!all.length) return '<svg xmlns="http://www.w3.org/2000/svg"/>';
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of all) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const pad = 8;
  const W = maxX - minX + pad * 2;
  const H = maxY - minY + pad * 2;
  const X = (p: PtMm) => (p.x - minX + pad).toFixed(1);
  const Y = (p: PtMm) => (maxY - p.y + pad).toFixed(1);
  const dOf = (pts: readonly PtMm[], close: boolean) =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${X(p)} ${Y(p)}`).join(' ') + (close ? 'Z' : '');
  const grey = rings
    .filter((r): r is PtMm[] => !!r && r.length > 2)
    .map((r) => `<path d="${dOf(r, true)}" fill="none" stroke="#c8c8c8" stroke-width="0.5"/>`)
    .join('\n');
  const red = misses
    .map(
      (m) =>
        `<path d="${dOf(m.pts, false)}" fill="none" stroke="#c0392b" stroke-width="1.1"><title>c${m.id} size ${m.size} ${m.len.toFixed(0)}mm owner ${m.owner}</title></path>`,
    )
    .join('\n');
  return `<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}">\n${grey}\n${red}\n</svg>\n`;
}

let openBase = 0;
let openNow = 0;
const named = ['A24', 'A26', 'G10', 'G12', 'G18', 'G24', 'F22', 'F24'];

for (const fam of fams) {
  const letter = (fam.label ?? '?').slice(0, 1);
  if (only && !letter.startsWith(only) && !(fam.label ?? '').startsWith(only)) continue;
  const got = runFamily(fam);
  if (!got) {
    console.log(`== ${fam.label}  not-nested/no-grade (fewer than 2 closed)`);
    continue;
  }
  const { out } = got;
  console.log(`== ${fam.label}  etalon ${out.etalon ?? '-'} ${out.why ?? ''}`);
  if (out.why) continue;
  fam.cells.forEach((c, r) => {
    const s = out.sizes[r];
    if (!s) return;
    if (c.outcome !== 'closed') openBase++;
    if (c.outcome !== 'closed' && s.ok) openNow++;
    const tag = c.outcome === 'closed' ? 'closed' : s.ok ? 'ALIGN-CLOSED' : 'open';
    if (c.outcome !== 'closed' || s.derivedShare > 0.02)
      console.log(
        `  ${c.size} ${tag} holes ${s.holesMm}mm share ${(s.derivedShare * 100).toFixed(1)}% cross ${s.cross} nested ${s.nested} chains ${s.chains.length}`,
      );
  });
  const moves = out.moves.filter((m) => m.mm >= 20).slice(0, 12);
  if (moves.length)
    console.log(
      '  moves',
      moves.map((m) => `c${m.id} ${m.from}→${m.to} ${m.mm.toFixed(0)}mm`).join(' | '),
    );
  if (out.asks.length)
    console.log(
      '  asks',
      out.asks.map((a) => `c${a.chain} ${a.ranks.join('|')} ${a.mm.toFixed(0)}mm`).join(' | '),
    );
  const ag = agree(fam, got);
  console.log(
    `  agree ${(ag.share * 100).toFixed(1)}% of ${ag.hit.toFixed(0)}mm  wrong ${(ag.wrong * 100).toFixed(1)}%  tie ${ag.indistinct.toFixed(0)}mm  ${ag.status}`,
  );
  if (missDir && ag.misses.length) {
    mkdirSync(missDir, { recursive: true });
    const lines = ag.misses
      .sort((a, b) => b.len - a.len)
      .map(
        (m) =>
          `c${m.id}\tbyRank ${m.rank} (${m.size})\tlen ${m.len.toFixed(0)}\towner ${m.owner}\tstep ${m.step.toFixed(2)}\tmed ${m.med.map((d) => (d > 1e3 ? '-' : d.toFixed(2))).join(' ')}`,
      );
    writeFileSync(resolve(missDir, `${letter}.txt`), lines.join('\n') + '\n');
    writeFileSync(resolve(missDir, `${letter}.svg`), missSvg(got.outers, ag.misses));
    console.log(`  misses ${ag.misses.length} -> ${missDir}/${letter}.txt`);
  }
  for (const c of fam.cells) {
    const key = `${letter}${c.size}`;
    if (!named.includes(key) || c.outcome === 'closed') continue;
    const s = out.sizes[fam.cells.indexOf(c)];
    console.log(
      `  NAMED ${key} ok ${s?.ok} share ${s?.derivedShare} chains ${s?.chains.map((x) => x.id).join(',')}`,
    );
  }
  if (looOn) {
    const g = loo(fam, got);
    console.log(
      `  LOO ${g.n - g.fails.length}/${g.n} p00 ${Number.isFinite(g.p00) ? f2(g.p00) : '-'}${g.fails.length ? ' FAIL ' + g.fails.slice(0, 8).join('; ') : ' PASS'}`,
    );
  }
}

console.log(`open cells base ${openBase} align-closed ${openNow}`);
