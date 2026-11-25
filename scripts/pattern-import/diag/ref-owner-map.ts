// Whose line, by the reader, lies under each SIDE of a reference outline — verified and bad alike.
//   npx vite-node scripts/pattern-import/diag/ref-owner-map.ts <reference.json> <clone with .runs> [out.json]
// The fill and the walk both take the reader's word for which printed line is which size. This
// maps where that word and the owner's outline disagree. An outline is cut into sides at its
// corners (a turn over 30°); every side is sampled each millimetre and each sample is one of
//   own      a line of this size is under it (0.5 mm)
//   block    no line of this size, lines of 4 or more other sizes are (an edge a block shares)
//   foreign  no line of this size, lines of 1–3 other sizes are
//   nonsize  only lines that carry no size (common, internal, ignore, no row)
//   none     no printed line the reader kept
// A side is named by the kind that holds 60 % of it, else `mixed`. For a foreign side: how far the
// owner's size is from the outline's (`step`), whether the line is in the outline size's own pen
// (`ownPen`) and whether it is a row of marks (`row`).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { gunzipSync } from 'node:zlib';

import { SegGrid, segNearest, simplify } from 'lib/pattern-import/pieces/geom';
import type { ChainSet, PtMm, SizeRun } from 'lib/pattern-import/types';

type RefPiece = {
  id: string;
  root: string;
  file: string;
  label: string;
  set: string;
  sizes: { size: string; verdict: string; outer: number[] }[];
};
const [refPath, base, outPath] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(refPath, 'utf8'));
const pieces: RefPiece[] = Array.isArray(raw) ? raw : raw.pieces;
const jobs = new Map<string, RefPiece[]>();
for (const p of pieces) {
  const root = `${base}/${p.root}`;
  const dir = existsSync(root) ? readdirSync(root).find((d) => d.includes(p.file)) : undefined;
  if (!dir || !readdirSync(`${root}/${dir}`).some((x) => x.endsWith('.snap.gz'))) continue;
  jobs.set(`${root}/${dir}`, [...(jobs.get(`${root}/${dir}`) ?? []), p]);
}
type Kind = 'own' | 'block' | 'foreign' | 'nonsize' | 'none';
type Side = {
  piece: string;
  set: string;
  size: string;
  ok: boolean;
  lenMm: number;
  kind: Kind | 'mixed';
  share: Record<Kind, number>;
  step?: number;
  ownPen?: boolean;
  row?: boolean;
  at: [number, number];
};
const sides: Side[] = [];
for (const [dir, list] of jobs) {
  const snap = deserialize(
    gunzipSync(
      readFileSync(
        `${dir}/${readdirSync(dir)
          .filter((x) => x.endsWith('.snap.gz'))
          .sort()
          .pop()}`,
      ),
    ),
  ) as { fields: { chains: ChainSet; run: SizeRun }; ranks: { rank: number; label: string }[] };
  const set = snap.fields.chains;
  const rankOf = new Map(snap.ranks.map((r) => [r.label, r.rank]));
  const rankOfClass = new Map<number, number>();
  for (const z of snap.fields.run.sizes) if (z.classId != null) rankOfClass.set(z.classId, z.rank);
  /** chain → the rank of its size class, or -1 for a line that carries no size */
  const chainRank = new Map<number, number>();
  for (const c of set.classes)
    for (const id of c.chains)
      chainRank.set(id, c.role === 'size' ? rankOfClass.get(c.id) ?? -1 : -1);
  const grid = new SegGrid(3);
  for (const ch of set.chains) if (ch?.pts.length > 1) grid.addPolyline(ch.id, ch.pts, !!ch.closed);
  /** the pens a size is drawn in: the styles that carry 90 % of its line */
  const penOf = new Map<number, Set<number>>();
  for (const c of set.classes) {
    const r = c.role === 'size' ? rankOfClass.get(c.id) : undefined;
    if (r === undefined) continue;
    const by = new Map<number, number>();
    for (const id of c.chains) {
      const ch = set.chains[id];
      if (ch) by.set(ch.style, (by.get(ch.style) ?? 0) + ch.lengthMm);
    }
    const total = [...by.values()].reduce((a, b) => a + b, 0);
    const pens = new Set<number>();
    let acc = 0;
    for (const [st, mm] of [...by].sort((a, b) => b[1] - a[1])) {
      if (acc >= 0.9 * total) break;
      pens.add(st);
      acc += mm;
    }
    penOf.set(r, pens);
  }
  const under = (m: PtMm) => {
    const ids = new Set<number>();
    grid.near(m, 0.5, (id, i) => {
      if (ids.has(id)) return;
      const ch = set.chains[id];
      const a = ch.pts[i];
      const b = ch.pts[(i + 1) % ch.pts.length];
      if (segNearest(m, a, b).d <= 0.5) ids.add(id);
    });
    return [...ids];
  };
  for (const p of list)
    for (const z of p.sizes) {
      const rank = rankOf.get(z.size);
      if (rank === undefined || (z.verdict !== 'ok' && z.verdict !== 'bad')) continue;
      const pts: PtMm[] = [];
      for (let i = 0; i + 1 < z.outer.length; i += 2)
        pts.push({ x: z.outer[i], y: z.outer[i + 1] });
      if (pts.length < 4) continue;
      // corners: on the outline without its sub-millimetre steps, a turn over 30°
      const s = simplify([...pts, pts[0]], 1).slice(0, -1);
      const n = s.length;
      const corner = s.map((b, i) => {
        const a = s[(i - 1 + n) % n];
        const c = s[(i + 1) % n];
        let d = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d <= -Math.PI) d += 2 * Math.PI;
        return Math.abs(d) > Math.PI / 6;
      });
      const first = corner.indexOf(true);
      if (first < 0) continue;
      let cur: PtMm[] = [s[first]];
      const runs: PtMm[][] = [];
      for (let k = 1; k <= n; k++) {
        const i = (first + k) % n;
        cur.push(s[i]);
        if (corner[i]) {
          runs.push(cur);
          cur = [s[i]];
        }
      }
      for (const run of runs) {
        const share: Record<Kind, number> = { own: 0, block: 0, foreign: 0, nonsize: 0, none: 0 };
        const steps = new Map<number, number>();
        let pen = 0;
        let row = 0;
        let len = 0;
        for (let k = 1; k < run.length; k++) {
          const a = run[k - 1];
          const b = run[k];
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          const m = Math.max(1, Math.round(d));
          for (let t = 0; t < m; t++) {
            const q = {
              x: a.x + ((b.x - a.x) * (t + 0.5)) / m,
              y: a.y + ((b.y - a.y) * (t + 0.5)) / m,
            };
            const ids = under(q);
            const ranks = new Set(ids.map((id) => chainRank.get(id) ?? -1).filter((r) => r >= 0));
            const step = d / m;
            len += step;
            if (ranks.has(rank)) share.own += step;
            else if (ranks.size >= 4) share.block += step;
            else if (ranks.size) {
              share.foreign += step;
              for (const r of ranks) steps.set(r - rank, (steps.get(r - rank) ?? 0) + step);
              const lines = ids
                .map((id) => set.chains[id])
                .filter((ch) => (chainRank.get(ch.id) ?? -1) >= 0);
              if (lines.some((ch) => penOf.get(rank)?.has(ch.style))) pen += step;
              if (lines.some((ch) => ch.motif != null)) row += step;
            } else if (ids.length) share.nonsize += step;
            else share.none += step;
          }
        }
        if (len < 10) continue;
        const top = (Object.entries(share) as [Kind, number][]).sort((x, y) => y[1] - x[1])[0];
        const kind = top[1] >= 0.6 * len ? top[0] : 'mixed';
        const mid = run[run.length >> 1];
        const side: Side = {
          piece: p.id,
          set: p.set,
          size: z.size,
          ok: z.verdict === 'ok',
          lenMm: Math.round(len),
          kind,
          share: Object.fromEntries(
            Object.entries(share).map(([k, v]) => [k, +(v / len).toFixed(2)]),
          ) as Record<Kind, number>,
          at: [Math.round(mid.x), Math.round(mid.y)],
        };
        if (share.foreign >= 0.3 * len) {
          side.step = [...steps].sort((x, y) => y[1] - x[1])[0]?.[0];
          side.ownPen = pen >= 0.5 * share.foreign;
          side.row = row >= 0.5 * share.foreign;
        }
        sides.push(side);
      }
    }
}
if (outPath) writeFileSync(outPath, JSON.stringify(sides));
const kinds = ['own', 'block', 'foreign', 'nonsize', 'none', 'mixed'] as const;
for (const set of ['tune', 'confirm'])
  for (const ok of [true, false]) {
    const g = sides.filter((s) => s.set === set && s.ok === ok);
    const mm = g.reduce((a, s) => a + s.lenMm, 0) || 1;
    console.log(
      `${set.padEnd(7)} ${ok ? 'ok ' : 'bad'} · ${g.length} sides, ${mm} mm · ` +
        kinds
          .map((k) => {
            const h = g.filter((s) => s.kind === k);
            return `${k} ${h.length} (${Math.round((100 * h.reduce((a, s) => a + s.lenMm, 0)) / mm)}% of length)`;
          })
          .join(' · '),
    );
  }
console.log('\nforeign sides — whose line, in whose pen:');
for (const set of ['tune', 'confirm'])
  for (const ok of [true, false]) {
    const g = sides.filter((s) => s.set === set && s.ok === ok && s.step !== undefined);
    const c = (f: (s: Side) => boolean) => g.filter(f).length;
    console.log(
      `${set.padEnd(7)} ${ok ? 'ok ' : 'bad'} · ${g.length} sides with ≥ 30 % foreign · next size (±1) ${c((s) => Math.abs(s.step!) === 1)} · two away ${c((s) => Math.abs(s.step!) === 2)} · farther ${c((s) => Math.abs(s.step!) > 2)} · in the outline size's own pen ${c((s) => !!s.ownPen)} · a row of marks ${c((s) => !!s.row)}`,
    );
  }
// per size: is any side not its own?
console.log('\nsizes with a side that is not own or block (≥ 10 mm):');
for (const set of ['tune', 'confirm'])
  for (const ok of [true, false]) {
    const key = (s: Side) => `${s.piece}:${s.size}`;
    const all = new Set(sides.filter((s) => s.set === set && s.ok === ok).map(key));
    const off = new Set(
      sides
        .filter((s) => s.set === set && s.ok === ok && s.kind !== 'own' && s.kind !== 'block')
        .map(key),
    );
    console.log(`${set.padEnd(7)} ${ok ? 'ok ' : 'bad'} · ${off.size} of ${all.size} sizes`);
  }
