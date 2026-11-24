// Offline. vite-node scripts/pattern-import/single-reference-check.ts <M2 shot> <WD_ALL shot> <new JSONL> [fresh graded rows directory]
// Hide every outline except the reference during reconstruction. Read target and rival rings only
// for scoring after the walk. Sample one closed target per affected family, oriented toward an edge.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { nestWalk, NestLineIndex, ringDistance } from 'lib/pattern-import/pieces/gfit/nest-walk';
import type { RepairProbe } from 'lib/pattern-import/pieces/gfit/repair-hook';
import { resample } from 'lib/pattern-import/pieces/geom';
import type { PtMm } from 'lib/pattern-import/types';

type Pair = [number, number];
type Cell = {
  size: string;
  outcome: string;
  from?: string;
  derivedMm?: number;
  outer?: Pair[];
  refusal?: string;
};
type Family = { seed: number; label: string | null; cells: Cell[] };
type Dump = {
  byRank: number[][];
  common: number[];
  chains: Record<number, { pts: Pair[]; closed: boolean }>;
};
const [shot, walls, output, freshDir] = process.argv.slice(2);
if (!output) throw new Error('Expected shot directory, WD_ALL directory and JSONL output path');
const read = <T>(dir: string, file: string): T => JSON.parse(readFileSync(join(dir, file), 'utf8'));
const points = (pairs: Pair[]): PtMm[] => pairs.map(([x, y]) => ({ x, y }));
const direct = (c: Cell) =>
  c.outcome === 'closed' && c.from === 'class' && c.derivedMm === 0 && !!c.outer?.length;
const ids = read<{ id: string }[]>(shot, 'shot.json');
writeFileSync(output, '', { flag: 'wx' });
for (const { id } of ids) {
  const families = read<Family[]>(join(shot, id), 'cells.json');
  const dumps = read<Dump[]>(join(walls, id), 'walls-dump.json');
  const fresh =
    freshDir && existsSync(join(freshDir, id + '.json'))
      ? read<{ id: string; card: string[]; rows: Dump }>(freshDir, id + '.json')
      : undefined;
  if (
    fresh &&
    (fresh.id !== id ||
      JSON.stringify(fresh.card) !==
        JSON.stringify(read<{ card: string[] }>(join(shot, id), 'run.json').card))
  )
    throw new Error('Fresh rows differ from accepted card ' + id);
  const probePath = join(shot, id, 'probes.json');
  const saved = existsSync(probePath)
    ? read<{ probes: RepairProbe[] }>(join(shot, id), 'probes.json').probes
    : [];
  const original = read<Family[]>(join(walls, id), 'cells.json');
  for (const family of families) {
    const prior = original.find((f) => f.seed === family.seed && f.label === family.label);
    const cells = family.cells;
    const edge = cells.flatMap((c, i) =>
      c.outcome !== 'closed' && c.refusal?.split('|')[0] === 'not-bracketed' ? [i] : [],
    );
    if (!edge.length) continue;
    const refs = cells.flatMap((c, i) => (direct(c) ? [i] : []));
    const dump =
      dumps.length === 1 && dumps[0].byRank.length === cells.length
        ? fresh?.rows ?? dumps[0]
        : undefined;
    const emit = (row: object) =>
      appendFileSync(
        output,
        JSON.stringify({ id, seed: family.seed, label: family.label, ...row }) + '\n',
      );
    const nearest = (r: number) =>
      refs.filter((j) => j !== r).sort((a, b) => Math.abs(a - r) - Math.abs(b - r) || a - b)[0];
    const lines = (ids: number[]) =>
      ids.map((i) => {
        const c = dump!.chains[i];
        if (!c) throw new Error('Missing recorded chain ' + i);
        const pts = points(c.pts);
        if (pts.length && c.closed) pts.push(pts[0]);
        return pts;
      });
    // Cache the raw chains only. The selection window and reconstructed outline depend on the
    // reference, never on the target ring. Distance to a vertex alone misses long straight lines.
    const raw = new Map<number, PtMm[][]>();
    const own = (r: number) => {
      if (!raw.has(r)) raw.set(r, lines(dump!.byRank[r]));
      return raw.get(r)!;
    };
    const common = dump ? lines(dump.common) : [];
    // A cut independently recovered from the PDF can become a new reference. Count only ranks
    // strictly between that new edge and the nearest direct reference; this does not assert that
    // the grade fitter would trust it, or that any newly bracketed outline would pass its checks.
    if (refs.length) {
      const low = edge.filter((r) => r < refs[0]),
        high = edge.filter((r) => r > refs[refs.length - 1]);
      for (const side of [low, high]) {
        if (side.length < 2) continue;
        const anchor = side === low ? side[0] : side[side.length - 1];
        const reference = nearest(anchor);
        const samples = resample(points(cells[reference].outer!), 5, true);
        const ink = fresh && dump ? new NestLineIndex(own(anchor)) : null;
        emit({
          referenceSize: cells[reference].size,
          referenceSamples: samples.length,
          within5: ink ? samples.filter((p) => ink.nearest(p, 5)).length : null,
          within20: ink ? samples.filter((p) => ink.nearest(p, 20)).length : null,
          mode: 'bracket-priority',
          sourceAnchor: cells[anchor].size,
          interior: side.filter((r) => r !== anchor).map((r) => cells[r].size),
        });
      }
    }
    const test = (r: number, mode: 'hidden' | 'open') => {
      const a = nearest(r);
      const meta = {
        mode,
        size: cells[r].size,
        rank: r,
        reference: a ?? null,
        distance: a === undefined ? null : Math.abs(a - r),
      };
      if (a === undefined || !dump)
        return emit({ ...meta, result: a === undefined ? 'no-reference' : 'missing-walls' });
      const matchesDump = (i: number) =>
        prior?.cells[i]?.size === cells[i].size &&
        JSON.stringify(prior.cells[i].outer) === JSON.stringify(cells[i].outer);
      const active =
        mode === 'open' ? saved.find((p) => p.seed === family.seed && p.rank === r) : undefined;
      if (!fresh && ((!active && !matchesDump(a)) || (mode === 'hidden' && !matchesDump(r))))
        return emit({ ...meta, result: 'snapshot-mismatch' });
      const anchor = points(cells[a].outer!);
      const anchorLine = new NestLineIndex([[...anchor, anchor[0]]]);
      // Include crossing segments even when none of their vertices is near the anchor.
      const xs = anchor.map((p) => p.x),
        ys = anchor.map((p) => p.y);
      const x0 = Math.min(...xs) - 20,
        x1 = Math.max(...xs) + 20,
        y0 = Math.min(...ys) - 20,
        y1 = Math.max(...ys) + 20;
      const nearby = (line: PtMm[]) =>
        line.some((p, i) => {
          const q = line[i - 1] ?? p;
          return (
            Math.min(p.x, q.x) <= x1 &&
            Math.max(p.x, q.x) >= x0 &&
            Math.min(p.y, q.y) <= y1 &&
            Math.max(p.y, q.y) >= y0
          );
        });
      const targetInk = new NestLineIndex(
        (active
          ? active.walls.filter((w) => w.kind === 'own').map((w) => Array.from(w.pts))
          : own(r)
        ).filter(nearby),
      );
      const commonIdx = new NestLineIndex(
        (active
          ? active.walls.filter((w) => w.kind === 'common').map((w) => Array.from(w.pts))
          : common
        ).filter(nearby),
      );
      const distinct = targetInk.pts.some(
        (p) => !anchorLine.nearest(p, 1) && !commonIdx.nearest(p, 1) && anchorLine.nearest(p, 20),
      );
      if (!distinct)
        return emit({
          ...meta,
          source: active ? 'current' : fresh ? 'fresh' : 'archive',
          result: 'no-distinct-ink',
        });
      if (mode === 'open')
        return emit({
          ...meta,
          source: active ? 'current' : fresh ? 'fresh' : 'archive',
          result: 'candidate',
        });
      const low = Math.min(a, r),
        high = Math.max(a, r);
      const sizes = cells
        .slice(low, high + 1)
        .map((_, i) => ({ rank: i, outer: low + i === a ? anchor : null }));
      const out = nestWalk({
        sizes,
        own: (i) => own(low + i),
        common,
        etalon: a - low,
        only: new Set([r - low]),
      }).sizes.get(r - low);
      if (!out || out.refused || out.outer.length < 3)
        return emit({ ...meta, result: out?.refused ?? 'no-ring' });
      const refDistance = ringDistance(out.outer, anchor);
      const truth = ringDistance(out.outer, points(cells[r].outer!));
      const rivals = [...new Set([a, r - 1, r + 1])].filter(
        (i) => i >= 0 && i < cells.length && i !== r && direct(cells[i]),
      );
      const rival = rivals.some(
        (i) =>
          (i === a ? refDistance : ringDistance(out.outer, points(cells[i].outer!))).p95 <
          truth.p95,
      );
      emit({
        ...meta,
        result: 'ring',
        derivedMm: out.derivedMm,
        p95: truth.p95,
        max: truth.max,
        closerToNeighbour: rival,
      });
    };
    for (const r of edge) test(r, 'open');
    // Pick the witness nearest an actual open size. Stable rank
    // order resolves ties. No geometry or reconstruction score participates in this selection.
    const cases = refs.filter((r) => nearest(r) !== undefined);
    const distance = (r: number) => Math.min(...edge.map((e) => Math.abs(r - e)));
    cases.sort((a, b) => distance(a) - distance(b) || a - b);
    if (cases.length) test(cases[0], 'hidden');
  }
}
