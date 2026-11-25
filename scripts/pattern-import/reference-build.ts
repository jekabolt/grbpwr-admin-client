// REFERENCE BUILD — the owner's answers + the exported pieces → reference.json.
//   npx vite-node scripts/pattern-import/reference-build.ts <pick.txt> <pieces.json> <verdicts.json> <out.json> [--confirm id,id,…]
// pieces.json: what reference-export.ts wrote — the outlines the owner actually looked at.
// verdicts.json: the review page's `verdicts` rows, [{ id, verdict, badSizes?, note? }].
// Per size: «ok» → every size ok; «bad» with sizes marked → those bad, the rest ok;
// «bad» with none marked → every size bad; «unsure» → the piece is left out.
// --confirm: pieces kept out of tuning (set 'confirm'); every other piece is 'tune'.
import { readFileSync, writeFileSync } from 'node:fs';

import type { ReferencePiece } from './reference-lib';

type Exported = {
  id: string;
  file: string;
  label: string | null;
  group: string;
  sizes: { size: string; outcome: string; d: number[] }[];
};
type Verdict = { id: string; verdict: 'ok' | 'bad' | 'unsure'; badSizes?: string[]; note?: string };

const args = process.argv.slice(2);
const ci = args.indexOf('--confirm');
const confirm = new Set(ci >= 0 ? args[ci + 1].split(',') : []);
const [pickFile, piecesFile, verdictsFile, outFile] = args.filter(
  (_, k) => ci < 0 || (k !== ci && k !== ci + 1),
);

const picks = new Map(
  readFileSync(pickFile, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => l.split('\t'))
    .map(([root, file, , , id]) => [id, { root, file }]),
);
const pieces: Exported[] = JSON.parse(readFileSync(piecesFile, 'utf8'));
const verdicts = new Map<string, Verdict>(
  (JSON.parse(readFileSync(verdictsFile, 'utf8')) as Verdict[]).map((v) => [v.id, v]),
);

const out: ReferencePiece[] = [];
const skipped: string[] = [];
for (const p of pieces) {
  const v = verdicts.get(p.id);
  const at = picks.get(p.id);
  if (!v || v.verdict === 'unsure' || !at) {
    skipped.push(`${p.id} (${!at ? 'not in pick list' : v ? 'unsure' : 'no answer'})`);
    continue;
  }
  const bad = new Set(v.badSizes ?? []);
  const unknown = [...bad].filter((s) => !p.sizes.some((x) => x.size === s));
  if (unknown.length) throw new Error(`${p.id}: marked sizes ${unknown} are not on the piece`);
  out.push({
    id: p.id,
    root: at.root,
    file: at.file,
    label: p.label,
    group: p.group,
    ...(v.note ? { note: v.note } : {}),
    set: confirm.has(p.id) ? 'confirm' : 'tune',
    sizes: p.sizes
      // a size with no closed outline was never shown as an outline: nothing to confirm
      .filter((s) => s.outcome === 'closed' && s.d.length >= 6)
      .map((s) => ({
        size: s.size,
        verdict: v.verdict === 'ok' || (bad.size && !bad.has(s.size)) ? 'ok' : 'bad',
        outer: s.d,
      })),
  });
}
writeFileSync(outFile, JSON.stringify(out, null, 0).replace(/\},\{"id"/g, '},\n{"id"'));
const n = (k: 'ok' | 'bad') =>
  out.reduce((s, p) => s + p.sizes.filter((x) => x.verdict === k).length, 0);
console.log(`wrote ${out.length} pieces: ${n('ok')} sizes ok, ${n('bad')} bad`);
if (skipped.length) console.log(`left out: ${skipped.join(', ')}`);
