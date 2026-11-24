// Confirm positive offline replays in the real fill and export gates. Requires a fresh geometry
// report from gap-evidence-check. node gap-candidate-shot.mjs <pdf> <run.json> <report.jsonl> <out> [raw|fragments]
import { build } from 'esbuild';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const [pdf, baseline, report, out, variant] = process.argv.slice(2);
if (!out || existsSync(out))
  throw new Error('Expected PDF, baseline run.json, report.jsonl and a new output directory');
const run = JSON.parse(readFileSync(baseline, 'utf8'));
if (basename(pdf).replace(/\.pdf$/i, '') !== run.id) throw new Error('PDF differs from baseline');
if (variant && !['raw', 'fragments'].includes(variant))
  throw new Error('Expected raw or fragments');
const cases = new Map();
for (const l of readFileSync(report, 'utf8').trim().split('\n')) {
  const x = JSON.parse(l);
  if (x.id !== run.id || x.mode !== 'open-holes') continue;
  const clips =
    variant === 'fragments'
      ? x.fragmentClips
      : variant === 'raw'
        ? x.rawClips
        : x.rawClips ?? x.fragmentClips;
  if (clips?.length) cases.set(x.seed + '/' + run.card.indexOf(x.size), clips);
}
if (!cases.size) throw new Error('No improved replay for this PDF');
const here = dirname(fileURLToPath(import.meta.url));
const events = [];
globalThis.__gapCase = (seed, rank) => cases.get(seed + '/' + rank);
globalThis.__gapClips = (ctx, seed, rank) => {
  const clips = globalThis.__gapCase(seed, rank) ?? [];
  const selected = [];
  for (const clip of clips) {
    // Wall IDs can move when upstream chains are rebuilt. Resolve by actual geometry among
    // eligible native loose walls. Never assign an excluded, interior or foreign-size line.
    const samples = [clip.pts[0]];
    for (let i = 1; i < clip.pts.length; i++) {
      const a = clip.pts[i - 1],
        b = clip.pts[i],
        n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.25));
      for (let j = 1; j <= n; j++)
        samples.push({ x: a.x + ((b.x - a.x) * j) / n, y: a.y + ((b.y - a.y) * j) / n });
    }
    const matches = (ctx.loose ?? []).filter((w) =>
      samples.every((p) =>
        w.pts.slice(1).some((b, i) => {
          const a = w.pts[i],
            dx = b.x - a.x,
            dy = b.y - a.y,
            t = Math.max(
              0,
              Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
            );
          return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) <= 0.02;
        }),
      ),
    );
    events.push({ seed, rank, source: clip.source, eligible: matches.map((w) => w.chain) });
    if (matches.length === 1) selected.push({ chain: matches[0].chain, pts: clip.pts });
  }
  return selected;
};
const bundle = resolve(mkdtempSync(resolve(tmpdir(), 'pattern-gap-')), 'shot.mjs');
const insert = (src, marker, txt) => {
  if (!src.includes(marker)) throw new Error('Missing instrumentation point ' + marker);
  return src.replace(marker, txt);
};
await build({
  entryPoints: [resolve(here, 'dxf-shot-entry.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: { react: resolve(here, 'react-hook-shim.ts') },
  plugins: [
    {
      name: 'source-gap-trial',
      setup(b) {
        b.onLoad({ filter: /dxf-shot-entry\.ts$/ }, ({ path }) => ({
          loader: 'ts',
          contents: insert(
            readFileSync(path, 'utf8'),
            'const first = await run([], null);',
            'const first: Rec = {sizesRead:{labels:' + JSON.stringify(run.card) + '}};',
          ),
        }));
        b.onLoad({ filter: /gfit[\\/]repair-hook\.ts$/ }, ({ path }) => {
          let src = insert(
            readFileSync(path, 'utf8'),
            'withLooseWalls = false,',
            'withLooseWalls = false, clipped = false,',
          );
          src = insert(
            src,
            '    let fitCache =',
            `    if(clipped) for(const w of (globalThis as any).__gapClips(ctx,c.seed,r)){
        ws.push({kind:'loose',pts:w.pts});chainOf.push(w.chain);
      }
    let fitCache =`,
          );
          src = insert(
            src,
            '    probeSink?.({',
            `    if (why.length && withLooseWalls && !clipped && kind==='leak' && (globalThis as any).__gapCase(c.seed,r))return tryRepair(list,i,kind,exclude,true,true);
    probeSink?.({`,
          );
          return { contents: src, loader: 'ts' };
        });
      },
    },
  ],
});
process.on('exit', () => {
  unlinkSync(bundle);
  rmdirSync(dirname(bundle));
});
mkdirSync(out, { recursive: true });
process.env.PATIMPORT_REPO = resolve(here, '../..');
process.env.PIECES_OPEN_PASS = '1';
process.env.AUTOPILOT_OUTLINES = '1';
const { main } = await import(pathToFileURL(bundle).href);
process.exitCode = await main([resolve(pdf), resolve(out)]);
writeFileSync(resolve(out, 'eligible-clips.json'), JSON.stringify(events, null, 2));
