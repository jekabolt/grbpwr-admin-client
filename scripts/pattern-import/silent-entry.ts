// SILENT probe entry (see silent.mjs): reads GRADE-REVIEW family dumps (cands + the wall chains near
// the family with their wall-model ranks), runs the size-run sanity (pieces/gfit/silent
// sizeRunProblems) and the grade-model verdicts (gradeVerdicts) per file, prints one line per family.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { PtMm } from 'lib/pattern-import/types';
import {
  gradeVerdicts,
  sizeRunProblems,
  type GradeFamilyIn,
} from 'lib/pattern-import/pieces/gfit/silent';

type DumpChain = { id: number; closed: boolean; wm: number[]; common: boolean; pts: number[][] };
type Dump = {
  prefix: string;
  seed: number;
  ranks: string;
  labels: string[];
  cands: { rank: number; o: string; outer: number[][] }[];
  wall: DumpChain[];
};
const P = (a: number[][]): PtMm[] => a.map(([x, y]) => ({ x, y }));

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'coin') {
    await coin(args[1]);
    return 0;
  }
  if (args[0] !== 'dump') {
    console.error('usage: silent.mjs dump <dir> [out.json]');
    return 2;
  }
  const dir = args[1];
  const byFile = new Map<string, Dump[]>();
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const d = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as Dump;
    const a = byFile.get(d.prefix) ?? [];
    a.push(d);
    byFile.set(d.prefix, a);
  }
  const out: Record<string, unknown>[] = [];
  for (const [prefix, ds] of byFile) {
    const fams: GradeFamilyIn[] = ds.map((d) => {
      const lines = (pick: (c: DumpChain) => boolean) =>
        d.wall.filter(pick).map((c) => (c.closed ? [...P(c.pts), P(c.pts)[0]] : P(c.pts)));
      const memo = new Map<string, PtMm[][]>();
      const cached = (k: string, f: () => PtMm[][]) => {
        let v = memo.get(k);
        if (!v) memo.set(k, (v = f()));
        return v;
      };
      return {
        seed: d.seed,
        sizes: d.cands
          .filter((c) => 'NCD'.includes(c.o) && c.outer.length > 2)
          .map((c) => ({ rank: c.rank, outer: P(c.outer), anchor: c.o === 'N' })),
        lines: {
          neighbour: (r: number) =>
            cached(`n${r}`, () => lines((c) => !c.common && c.wm.length > 0 && !c.wm.includes(r))),
          own: (r: number) => cached(`o${r}`, () => lines((c) => c.common || c.wm.includes(r))),
        },
      };
    });
    const g = gradeVerdicts(fams);
    for (const d of ds) {
      const run = sizeRunProblems(
        d.cands
          .filter((c) => 'NCD'.includes(c.o) && c.outer.length > 2)
          .map((c) => ({ key: d.labels[c.rank] ?? String(c.rank), rank: c.rank, ring: P(c.outer) })),
      );
      const vs = g.verdicts.filter((v) => v.seed === d.seed);
      const tag = (v: (typeof vs)[number]) =>
        `${d.labels[v.rank]}:${v.cause}:${v.residMm.toFixed(1)}${v.excused ? ':brk' : ''}${v.ownAtPrediction != null ? `:own${Math.round(100 * v.ownAtPrediction)}` : ''}`;
      const rec = {
        prefix,
        seed: d.seed,
        ranks: d.ranks,
        breaks: Object.fromEntries([...g.breaks].map(([r, b]) => [d.labels[r] ?? r, +b.toFixed(2)])),
        run: run.map((p) => `${p.kind}:${p.keys.join('+')}`),
        hold: vs.filter((v) => v.hold).map(tag),
        warn: vs.filter((v) => !v.hold).map(tag),
        ms: g.ms,
      };
      out.push(rec);
      console.log(JSON.stringify(rec));
    }
  }
  if (args[2]) writeFileSync(args[2], JSON.stringify(out, null, 1));
  return 0;
}

/** `coin <dir>`: per family, adjacent closed sizes — area change % and the coincidence share. */
export async function coin(dir: string): Promise<void> {
  const { onShare, ringArea } = await import('lib/pattern-import/pieces/gfit/silent');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
    const d = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as Dump;
    const cs = d.cands
      .filter((c) => 'NCD'.includes(c.o) && c.outer.length > 2)
      .sort((a, b) => a.rank - b.rank)
      .map((c) => ({ rank: c.rank, ring: P(c.outer) }));
    const res: string[] = [];
    for (let i = 1; i < cs.length; i++) {
      const a = ringArea(cs[i - 1].ring);
      const b = ringArea(cs[i].ring);
      const sh = Math.min(onShare(cs[i - 1].ring, cs[i].ring, 1), onShare(cs[i].ring, cs[i - 1].ring, 1));
      res.push(`${(((b - a) / a) * 100).toFixed(2)}%/${sh.toFixed(2)}`);
    }
    console.log(`${f.slice(0, 36)} s${d.seed} ${d.ranks} ${res.join(' ')}`);
  }
}
