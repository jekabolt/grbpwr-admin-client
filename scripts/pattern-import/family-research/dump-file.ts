// Every piece of one file, every closed size: replay its pieces snapshot and write the outlines.
// The research input for checks across pieces (seams that sew together, mirrored pairs), which the
// reference set alone cannot give: it keeps only the judged pieces.
//   npx vite-node scripts/pattern-import/family-research/dump-file.ts <shot dir> <file id substring> <out.json>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { readSnapshot, replaySnapshot } from '../pieces-bench-lib';

const [root, id, outFile] = process.argv.slice(2);
const d = readdirSync(root).find((n) => n.includes(id));
if (!d) throw new Error(`no ${id} in ${root}`);
const dir = resolve(root, d);
const snap = readdirSync(dir)
  .filter((f) => /^pieces-\d+\.snap\.gz$/.test(f))
  .sort((a, b) => +b.match(/\d+/)![0] - +a.match(/\d+/)![0])[0];
const s = readSnapshot(readFileSync(resolve(dir, snap)));
const out = await replaySnapshot(s);
const label = new Map((s.ranks ?? []).map((r) => [r.rank, r.label]));
const r1 = (v: number) => Math.round(v * 10) / 10;
const pieces = out.families.map((fm) => {
  const sd = out.seeds.find((x) => x.id === fm.seed);
  return {
    seed: fm.seed,
    label: sd?.text?.text ?? null,
    sizes: fm.candidates
      .filter((c) => c.outcome === 'closed' && c.outer?.length)
      .map((c) => ({
        size: label.get(c.rank) ?? `r${c.rank}`,
        outer: c.outer.flatMap((p) => [r1(p.x), r1(p.y)]),
      })),
  };
});
writeFileSync(outFile, JSON.stringify({ file: s.id, pieces }));
console.log(`${s.id}: ${pieces.length} pieces, ${pieces.reduce((n, p) => n + p.sizes.length, 0)} closed sizes`);
