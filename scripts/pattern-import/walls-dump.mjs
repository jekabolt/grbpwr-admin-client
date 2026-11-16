#!/usr/bin/env node
// PATTERN-IMPORT · walls dump (probe only) — runs dxf-shot-entry.ts on ONE pdf with pieces/fill.ts
// patched at bundle time (no src change): every fillPieces call records its wall model and, per
// rank, the chain ids of each source baseItems draws from (common / own byRank / extra / rescued /
// sandwich / lone / corner / graded.walls), plus pass C's reranked byRank if it was built.
//   node scripts/pattern-import/walls-dump.mjs <one.pdf> --out <dir>
// WD_LONE=nest|nestfill|step patches (nestfill = nest only in fill.ts's own lonePortions call; nestinv = everywhere but there)
// WD_LONE=nest|step patches pieces/walls.ts lonePortions (probe variants, no src change):
//   nest  a lone sample is NOT lone when the family's r-1 and r+1 lines lie on either side of it,
//         parallel, within 60 mm, at a consistent step (max/min <= 1.6); for the end ranks the two
//         inner neighbours on one side at d and ~2d (ratio 1.6..2.4)
//   step  sideMm = max(20, 1.5 x the file's median grade step (ranked line -> nearest r+1 line))
// WD_ALL=1 dumps every chain of the set, not only the ranked/common ones.
// Writes <dir>/<pdf>/walls-dump.json beside the usual dxf-shot files.
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');

if (process.env.WD_CHILD) {
  process.env.PATIMPORT_REPO = REPO;
  const m = await import(pathToFileURL(process.env.WD_CHILD).href);
  process.exit((await m.main(process.argv.slice(2))) ?? 0);
}

const argv = process.argv.slice(2);
const pdf = resolve(argv[0]);
const OUT = resolve(argv[argv.indexOf('--out') + 1]);
const dir = resolve(OUT, basename(pdf).replace(/\.pdf$/i, ''));
mkdirSync(dir, { recursive: true });

const ANCHOR = '  // P3: a click carried to the other size files by its face';
const HOOK = `
  {
    const __g: any = globalThis as any;
    if (__g.__WD) {
      const ids = (xs: any[]) => [...new Set(xs.map((i: any) => i.chain))];
      const call: any = { mode: model.mode, n: model.n, nRanks, emptyRanks: model.emptyRanks,
        common: model.common, byRank: model.byRank, gradedWalls: !!graded?.walls,
        lone: lone.map((i: any) => ({ chain: i.chain, pts: i.pts })), perRank: [] as any[] };
      for (let r = 0; r < nRanks; r++)
        call.perRank.push(graded?.walls
          ? { graded: graded.walls(r).map((i: any) => ({ chain: i.chain, pts: i.pts })) }
          : { extra: extraOf(r), rescued: ids(rescuedItems(r)), sandwich: rescuedItems(r) && sandwichItems(r).map((i: any) => ({ chain: i.chain, pts: i.pts })),
              corner: cornerItems(r).map((i: any) => i.pts) });
      call.rerank = () => reranked ? { byRank: reranked.model.byRank, common: reranked.model.common, demoted: [...reranked.demoted] } : null;
      call.set = set;
      __g.__WD(call);
    }
  }
`;
const bundle = resolve(tmpdir(), `patimport-wd-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'dxf-shot-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: bundle,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    react: resolve(HERE, 'react-hook-shim.ts'),
    lib: resolve(REPO, 'src/lib'),
    components: resolve(REPO, 'src/components'),
    utils: resolve(REPO, 'src/utils'),
  },
  banner: {
    js: `import { writeFileSync as __wfs } from 'node:fs';
const __calls = [];
globalThis.__WD = (c) => __calls.push(c);
const __G = new WeakMap();
const __C = 10;
function __grid(set) {
  let g = __G.get(set);
  if (g) return g;
  g = new Map();
  set.chains.forEach((c, id) => {
    if (!c || !c.pts || c.pts.length < 2) return;
    for (let i = 1; i < c.pts.length; i++) {
      const a = c.pts[i - 1], b = c.pts[i];
      for (let gx = Math.floor(Math.min(a.x, b.x) / __C); gx <= Math.floor(Math.max(a.x, b.x) / __C); gx++)
        for (let gy = Math.floor(Math.min(a.y, b.y) / __C); gy <= Math.floor(Math.max(a.y, b.y) / __C); gy++) {
          const k = gx + ',' + gy;
          let l = g.get(k);
          if (!l) g.set(k, (l = []));
          l.push(id, i - 1);
        }
    }
  });
  __G.set(set, g);
  return g;
}
/** per other chain within R: nearest foot {d, fx, fy, dx, dy (segment unit dir), i} */
function __nearest(set, p, R, keep) {
  const g = __grid(set), out = new Map(), seen = new Set();
  for (let gx = Math.floor((p.x - R) / __C); gx <= Math.floor((p.x + R) / __C); gx++)
    for (let gy = Math.floor((p.y - R) / __C); gy <= Math.floor((p.y + R) / __C); gy++) {
      const l = g.get(gx + ',' + gy);
      if (!l) continue;
      for (let k = 0; k < l.length; k += 2) {
        const o = l[k], i = l[k + 1];
        if (!keep(o)) continue;
        const key = o * 1e6 + i;
        if (seen.has(key)) continue;
        seen.add(key);
        const a = set.chains[o].pts[i], b = set.chains[o].pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
        const u = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
        const fx = a.x + u * dx, fy = a.y + u * dy, d = Math.hypot(fx - p.x, fy - p.y);
        if (d > R) continue;
        const prev = out.get(o);
        const L = Math.sqrt(L2) || 1;
        if (!prev || d < prev.d) out.set(o, { d, fx, fy, dx: dx / L, dy: dy / L });
      }
    }
  return out;
}
const __stats = { nestHits: 0, step: null };
if (process.env.WD_LONE === 'nest' || process.env.WD_LONE === 'nestfill' || process.env.WD_LONE === 'nestinv')
  globalThis.__WDNEST = (set, m, rank, id, rc, p, tx, ty) => {
    if (rc < 0) return false;
    if (process.env.WD_LONE === 'nestfill' && !globalThis.__WDSCOPE) return false;
    if (process.env.WD_LONE === 'nestinv' && globalThis.__WDSCOPE) return false;
    const n = m.byRank.length;
    const want = new Set([rc - 2, rc - 1, rc + 1, rc + 2]);
    const near = __nearest(set, p, 60, (o) => o !== id && want.has(rank.get(o) ?? -9));
    const best = new Map(); // rank -> {d, side}
    for (const [o, f] of near) {
      if (f.d < 0.05 || Math.abs(tx * f.dx + ty * f.dy) < 0.8) continue;
      const r = rank.get(o);
      const side = Math.sign(tx * (f.fy - p.y) - ty * (f.fx - p.x));
      const b = best.get(r);
      if (!b || f.d < b.d) best.set(r, { d: f.d, side });
    }
    const lo = best.get(rc - 1), hi = best.get(rc + 1);
    let hit = false;
    if (lo && hi) hit = lo.side !== hi.side && Math.max(lo.d, hi.d) / Math.min(lo.d, hi.d) <= 1.6;
    else if (rc === n - 1 || rc === 0) {
      const a = rc === 0 ? hi : lo, b = best.get(rc === 0 ? rc + 2 : rc - 2);
      if (a && b && a.side === b.side) { const q = b.d / a.d; hit = q >= 1.6 && q <= 2.4; }
    }
    if (hit) __stats.nestHits++;
    return hit;
  };
if (process.env.WD_LONE === 'step')
  globalThis.__WDSIDE = (set, m, s0) => {
    if (m.mode === 'single') return s0;
    if (__stats.step == null) {
      const rank = new Map();
      m.byRank.forEach((ids, r) => ids.forEach((id) => rank.set(id, r)));
      const ds = [];
      m.byRank.forEach((ids, r) => {
        for (const id of ids) {
          const pts = set.chains[id]?.pts;
          if (!pts || pts.length < 2) continue;
          let acc = 0;
          for (let i = 1; i < pts.length; i++) {
            acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            if (acc < 10) continue;
            acc = 0;
            const p = pts[i];
            const tl = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 1;
            const tx = (pts[i].x - pts[i - 1].x) / tl, ty = (pts[i].y - pts[i - 1].y) / tl;
            let bd = Infinity;
            for (const [, f] of __nearest(set, p, 60, (o) => rank.get(o) === r + 1))
              if (f.d >= 0.05 && Math.abs(tx * f.dx + ty * f.dy) >= 0.8) bd = Math.min(bd, f.d);
            if (bd < Infinity) ds.push(bd);
          }
        }
      });
      ds.sort((a, b) => a - b);
      __stats.step = ds.length ? ds[ds.length >> 1] : 0;
      __stats.stepN = ds.length;
    }
    return Math.max(s0, 1.5 * __stats.step);
  };
process.on('exit', () => {
  if (!process.env.WD_FILE) return;
  const used = new Set();
  const out = __calls.map((c) => {
    for (const id of c.common) used.add(id);
    for (const ids of c.byRank) for (const id of ids) used.add(id);
    for (const p of c.perRank) for (const id of p.rescued ?? []) used.add(id);
    const rr = c.rerank();
    if (rr) for (const ids of rr.byRank) for (const id of ids) used.add(id);
    // WD_ALL=1: every chain of the set, also the ones no rank or common took (unranked lines)
    if (process.env.WD_ALL) c.set.chains.forEach((ch, id) => ch && used.add(id));
    const { set, rerank, ...rest } = c;
    const chains = {};
    for (const id of used) if (set.chains[id]) chains[id] = { role: set.chains[id].role, closed: !!set.chains[id].closed, pts: set.chains[id].pts.map((q) => [+q.x.toFixed(2), +q.y.toFixed(2)]) };
    return { ...rest, rerank: rr, chains, orphans: set.orphans };
  });
  __wfs(process.env.WD_FILE, JSON.stringify(out));
  __wfs(process.env.WD_FILE.replace(/\.json$/, '.stats.json'), JSON.stringify({ lone: process.env.WD_LONE ?? 'base', ...__stats }));
});`,
  },
  plugins: [
    {
      name: 'wd-hook',
      setup(b) {
        b.onLoad({ filter: /pieces[\\/]walls\.ts$/ }, (a) => {
          let src = readFileSync(a.path, 'utf8');
          const SIG = 'export function lonePortions(set: ChainSet, m: WallModel, sideMm = 20): WallItem[] {';
          const PUSH = '      lone.push(!beside);';
          if (!src.includes(SIG) || !src.includes(PUSH)) throw new Error('walls-dump: lone anchors not found');
          src = src
            .replace(SIG, 'export function lonePortions(set: ChainSet, m: WallModel, sideMm0 = 20): WallItem[] {\n  const sideMm: number = (globalThis as any).__WDSIDE ? (globalThis as any).__WDSIDE(set, m, sideMm0) : sideMm0;')
            .replace(PUSH, '      lone.push(!beside && !((globalThis as any).__WDNEST ? (globalThis as any).__WDNEST(set, m, rank, id, rc, p, tx, ty) : false));');
          return { contents: src, loader: 'ts' };
        });
        b.onLoad({ filter: /pieces[\\/]fill\.ts$/ }, (a) => {
          const src = readFileSync(a.path, 'utf8');
          if (!src.includes(ANCHOR)) throw new Error('walls-dump: anchor not found in fill.ts');
          const LONE = '  const lone = lonePortions(set, model);';
          if (!src.includes(LONE)) throw new Error('walls-dump: fill lone anchor not found');
          return {
            contents: src
              .replace(LONE, '  (globalThis as any).__WDSCOPE = 1;\n' + LONE + '\n  (globalThis as any).__WDSCOPE = 0;')
              .replace(ANCHOR, HOOK + ANCHOR),
            loader: 'ts',
          };
        });
      },
    },
  ],
});
const r = spawnSync(
  process.execPath,
  ['--expose-gc', '--max-old-space-size=8192', fileURLToPath(import.meta.url), pdf, dir],
  {
    env: { ...process.env, WD_CHILD: bundle, PATIMPORT_REPO: REPO, WD_FILE: resolve(dir, 'walls-dump.json') },
    stdio: ['ignore', 'ignore', 'inherit'],
  },
);
console.log('exit', r.status, resolve(dir, 'walls-dump.json'));
