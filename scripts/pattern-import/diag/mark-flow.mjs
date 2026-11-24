// Where did the printed marks go between two runs: by the role of the chain that holds each path.
import { readFileSync, readdirSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';
const load = (dir) => {
  const s = deserialize(gunzipSync(readFileSync(dir + '/' + readdirSync(dir).filter((x) => x.endsWith('.snap.gz')).sort().pop())));
  const f = s.fields; const rankOfClass = new Map(f.run.sizes.map((z) => [z.classId, z.rank])); const lab = new Map(s.ranks.map((r) => [r.rank, r.label]));
  const name = new Map(); for (const c of f.chains.classes) for (const ch of c.chains) name.set(ch, c.role === 'size' ? 'size ' + lab.get(rankOfClass.get(c.id)) : c.role);
  const of = new Map(); for (const ch of f.chains.chains) for (const r of ch.ranges) if (!of.has(r.path)) of.set(r.path, name.get(ch.id) ?? 'unassigned');
  return { of, n: f.sheet.paths.length, small: new Set(f.sheet.paths.filter((p) => p.pts.length <= 40).map((p) => p.id)) };
};
const [A, B] = [load(process.argv[2]), load(process.argv[3])];
const g = (x) => (x === undefined ? 'no chain' : x.startsWith('size') ? 'a size' : x);
const t = {}; let sameSize = 0, otherSize = 0;
for (const id of A.small) { const a = A.of.get(id), b = B.of.get(id); if (a === b) continue; if (a?.startsWith('size') && b?.startsWith('size')) { otherSize++; continue; } const k = `${g(a)} → ${g(b)}`; t[k] = (t[k] ?? 0) + 1; }
console.log('marks that changed place:', Object.entries(t).sort((p, q) => q[1] - p[1]).map(([k, v]) => `${k}: ${v}`).join(' | '), '| one size → another size:', otherSize);
