// Capture the graded size rows of one PDF before filling any contours. Reuse the size card
// from an accepted shot. node single-reference-rows.mjs <pdf> <run.json> <new output.json>
import { build } from 'esbuild';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [pdf, shot, output] = process.argv.slice(2);
if (!output) throw new Error('Expected PDF, its run.json, and a new output file');
const run = JSON.parse(readFileSync(shot, 'utf8'));
if (basename(pdf).replace(/\.pdf$/i, '') !== run.id) throw new Error('PDF and shot differ');
const here = dirname(fileURLToPath(import.meta.url));
const marker = 'const model = solved ? SOLVER_MODEL : wallModel(set, run, sheet.texts, styleMap);';
const result = await build({
  entryPoints: [resolve(here, 'autopilot-entry.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: { react: resolve(here, 'react-hook-shim.ts') },
  plugins: [
    {
      name: 'record-size-rows',
      setup(b) {
        b.onLoad({ filter: /pieces[\\/]fill\.ts$/ }, ({ path }) => {
          const src = readFileSync(path, 'utf8');
          if (!src.includes(marker)) throw new Error('wall model call moved');
          return {
            contents: src.replace(
              marker,
              marker +
                "\n  if(model.mode==='graded') (globalThis as any).__saveSizeRows(set,model,run);",
            ),
            loader: 'ts',
          };
        });
      },
    },
  ],
});
// The normal PDF reader resolves pdfjs-dist from the repository. Bundle under the OS temp
// directory, exactly as the corpus runner does.
const bundle = resolve(mkdtempSync(resolve(tmpdir(), 'pattern-rows-')), 'capture.mjs');
writeFileSync(bundle, result.outputFiles[0].contents);
process.on('exit', () => {
  unlinkSync(bundle);
  rmdirSync(dirname(bundle));
});
globalThis.__saveSizeRows = (set, model, sizeRun) => {
  const labels = sizeRun.sizes.map((s) => s.label);
  if (JSON.stringify(labels) !== JSON.stringify(run.card)) throw new Error('Size order differs');
  const roles = new Map();
  for (const group of set.classes) for (const id of group.chains) roles.set(id, group.role);
  const chains = Object.fromEntries(
    set.chains.flatMap((c, i) =>
      c
        ? [
            [
              i,
              {
                closed: !!c.closed,
                role: roles.get(c.id) ?? null,
                pts: c.pts.map((p) => [p.x, p.y]),
              },
            ],
          ]
        : [],
    ),
  );
  writeFileSync(
    output,
    JSON.stringify({
      id: run.id,
      card: labels,
      rows: { byRank: model.byRank, common: model.common, chains },
    }),
    { flag: 'wx' },
  );
  process.exit(0);
};
process.env.PATIMPORT_REPO = resolve(here, '../..');
process.env.AUTOPILOT_ORACLE_PAGES = '1';
process.env.GOLDEN_ANSWERS = JSON.stringify({ pages: true, asides: true, outline: 'seam' });
process.env.AUTOPILOT_OUTLINES = '1';
process.env.PIECES_OPEN_PASS = '1';
const { runCase } = await import(pathToFileURL(bundle).href);
const resultCase = await runCase(
  { id: run.id, group: 'pdf', files: [resolve(pdf)], card: run.card },
  null,
);
throw new Error('No graded rows captured for ' + run.id + ' (' + resultCase.verdict + ')');
