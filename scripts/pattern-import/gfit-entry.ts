// PATTERN-IMPORT · GRADE P0 probe entry (bundled by gfit.mjs) — tolerance calibration on CAD-graded
// DXF sources: every identity with ≥ 3 sizes, every size checked leave-one-out against the grade
// model of the others (interpolation for inner sizes, extrapolation for the extreme ones), raw
// residuals per grade point and per edge. No robust removal (this is the calibration).
//   node scripts/pattern-import/gfit.mjs cad [file.dxf …]     (default: the corpus CAD DXFs)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { readDxf, segmentDxf } from 'lib/pattern-import/adapters/dxf';
import {
  fitFamily,
  GFIT_TOL_CAD,
  GFIT_TOL_DEFAULT,
  GFIT_TOL_P0,
  type GfitSizeIn,
} from 'lib/pattern-import/pieces/gfit';
import type { PtMm } from 'lib/pattern-import/types';

import { renderGfit } from './gfit-archive';

const CORPUS = '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/dxf-clo';
export const CAD_FILES = [
  `${CORPUS}/ALLSIZES_DXF.dxf`,
  `${CORPUS}/Allsizes_with_notches.dxf`,
  `${CORPUS}/allsizes-merged.dxf`,
  `${CORPUS}/summer men.dxf`,
  `${CORPUS}/summer men_ganjubas_gerber.dxf`,
  `${CORPUS}/RC28-RC28-001-test-2.dxf`,
  // our own writer's export (recognised from the Ulmus PDF, not CAD-graded): a separate row
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/probes/ulmus-owner-export-4dfbd71e.dxf',
];

const OPTS = { sagittaMm: 0.05, keepFills: true };

type Row = {
  file: string;
  identity: string;
  rank: number;
  how: 'interp' | 'extrap' | 'break';
  kind: 'pt' | 'edge';
  strong?: boolean;
  resid: number;
  step: number;
  len?: number;
};

const q = (a: number[], p: number) => {
  if (!a.length) return NaN;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};
const r2 = (x: number) => Math.round(x * 100) / 100;

async function cadFile(
  path: string,
  rows: Row[],
  fams: Record<string, unknown>[],
  png: string | null,
) {
  const bytes = readFileSync(path);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const read = await readDxf({ id: '0', name: basename(path), bytes: ab }, OPTS);
  const seg = segmentDxf(read);
  const file = basename(path);
  // our own writer's export: its cut is the seam offset with round joins — the seam is the drawn line
  const isOurs = /ulmus-owner-export/.test(file);
  if (!seg.presegmented) {
    fams.push({
      file,
      note: `not block-per-size (${seg.dialect}); ${seg.warnings.slice(0, 2).join('; ')}`,
    });
    return;
  }
  for (const id of seg.identities) {
    const ps = id.pieces.map((i) => seg.pieces[i]);
    // the graded line: mode A (layer 1 ungraded) → the seam (L14); else the cut (L1)
    const sizes: GfitSizeIn[] = [];
    ps.forEach((p, rank) => {
      const c = id.mode === 'A' || isOurs ? p.seam ?? p.cut : p.cut ?? p.seam;
      if (c && c.pts.length > 2) sizes.push({ rank, outer: c.pts as PtMm[], anchor: true });
    });
    if (sizes.length < 2) continue;
    const fam = fitFamily(sizes, { robust: false, tol: GFIT_TOL_DEFAULT });
    fams.push({
      file,
      identity: id.identity,
      sizes: id.sizes,
      mode: id.mode,
      model: fam.model,
      why: fam.why ?? null,
      frame: fam.frame,
      gradePoints: fam.gradePoints,
      strong: fam.strongGradePoints,
      topoSkips: fam.topoSkips,
      minRatio: Number.isFinite(fam.minRatio) ? r2(fam.minRatio) : null,
      notches: fam.notches.map((x) => `e${x.e}:${x.kind}`).join(' '),
      perSize: fam.sizes.map((v) => ({
        r: v.rank,
        st: v.status,
        how: v.how,
        score: r2(v.score),
        ptMax: r2(Math.max(0, ...v.points.filter((x) => x.strong).map((x) => x.resid))),
        edgeMax: r2(Math.max(0, ...v.edges.map((x) => x.p95))),
        exc: v.excursions.length,
        cs: `${v.corners.strong}/${v.corners.weak}`,
      })),
    });
    if (png && fam.model)
      renderGfit(
        resolve(png, `${file.replace(/[^\w.-]+/g, '_')}__${id.identity}.png`),
        sizes.map((s) => ({ rank: s.rank, outer: s.outer as PtMm[], outcome: 'closed' })),
        fam,
        `${file} ${id.identity} ${id.sizes.join(' ')}`,
        id.sizes,
      );
    if (!fam.model) continue;
    for (const v of fam.sizes) {
      if (v.status !== 'ok' && v.status !== 'disagrees') continue;
      for (const p of v.points)
        rows.push({
          file,
          identity: id.identity,
          rank: v.rank,
          how: v.how!,
          kind: 'pt',
          strong: p.strong,
          resid: p.resid,
          step: p.step,
        });
      for (const e of v.edges)
        rows.push({
          file,
          identity: id.identity,
          rank: v.rank,
          how: v.how!,
          kind: 'edge',
          resid: e.p95,
          step: e.step,
          len: e.len,
        });
    }
  }
}

function stats(xs: Row[]) {
  const r = xs.map((x) => x.resid);
  const ex = xs.map((x) => x.resid - 0.15 * x.step);
  const st = xs.map((x) => x.step);
  return {
    n: xs.length,
    p50: r2(q(r, 0.5)),
    p95: r2(q(r, 0.95)),
    p99: r2(q(r, 0.99)),
    max: r2(Math.max(0, ...r)),
    stepP50: r2(q(st, 0.5)),
    stepP95: r2(q(st, 0.95)),
    /** residual minus the design's 0.15·step slope */
    exP99: r2(q(ex, 0.99)),
  };
}

export async function main(args: string[]): Promise<number> {
  const mode = args[0] ?? 'cad';
  if (mode === 'fam') return famMode(args[1], args[2] ?? null);
  if (mode !== 'cad') {
    console.error(`unknown mode ${mode}`);
    return 2;
  }
  const files = args.length > 1 ? args.slice(1) : CAD_FILES;
  const out = process.env.GFIT_OUT ?? '/private/tmp/patimport-runs/gradep0/cad';
  mkdirSync(out, { recursive: true });
  const png = process.env.GFIT_PNG ?? null;
  if (png) mkdirSync(png, { recursive: true });
  const rows: Row[] = [];
  const fams: Record<string, unknown>[] = [];
  for (const f of files) {
    try {
      await cadFile(f, rows, fams, png);
    } catch (e) {
      fams.push({ file: basename(f), error: String((e as Error)?.stack ?? e).slice(0, 400) });
    }
  }
  writeFileSync(resolve(out, 'cad-families.json'), JSON.stringify(fams, null, 1));
  writeFileSync(resolve(out, 'cad-rows.json'), JSON.stringify(rows));
  const ours = (r: Row) => /ulmus-owner-export/.test(r.file);
  const groups: [string, Row[]][] = [];
  for (const src of ['CAD', 'ours'] as const) {
    const R = rows.filter((r) => (src === 'CAD' ? !ours(r) : ours(r)));
    for (const how of ['interp', 'extrap'] as const) {
      groups.push([
        `${src} ${how} pt strong`,
        R.filter((r) => r.how === how && r.kind === 'pt' && r.strong),
      ]);
      groups.push([
        `${src} ${how} pt weak`,
        R.filter((r) => r.how === how && r.kind === 'pt' && !r.strong),
      ]);
      groups.push([`${src} ${how} edge p95`, R.filter((r) => r.how === how && r.kind === 'edge')]);
    }
  }
  const table = groups.map(([k, xs]) => ({ k, ...stats(xs) }));
  writeFileSync(resolve(out, 'cad-stats.json'), JSON.stringify(table, null, 1));
  for (const t of table) console.log(JSON.stringify(t));
  for (const f of fams)
    console.log(
      JSON.stringify({ ...f, perSize: undefined }) +
        (f.perSize ? ` ${JSON.stringify(f.perSize)}` : ''),
    );
  return 0;
}

/** Offline replay of a GFIT_DUMP (families as the archive check read them): verdicts + PNGs. */
function famMode(dump: string, png: string | null): number {
  const d = JSON.parse(readFileSync(dump, 'utf8')) as {
    labels: string[];
    families: { seed: number; cands: { rank: number; o: string; outer: [number, number][] }[] }[];
  };
  if (png) mkdirSync(png, { recursive: true });
  const res: Record<string, number[]> = {};
  const put = (k: string, v: number) => (res[k] ??= []).push(v);
  for (const f of d.families) {
    const cands = f.cands.map((c) => ({
      rank: c.rank,
      outcome: c.o,
      outer: c.outer.map(([x, y]) => ({ x, y })),
    }));
    const closed = cands.filter((c) => /[NCD]/.test(c.outcome) && c.outer.length > 2);
    const sizesIn = closed.map((c) => ({
      rank: c.rank,
      outer: c.outer,
      anchor: c.outcome === 'N',
    }));
    const tolName = process.env.GFIT_FAM_TOL ?? 'P0';
    const fam = fitFamily(sizesIn, {
      tol: tolName === 'CAD' ? GFIT_TOL_CAD : tolName === 'DESIGN' ? GFIT_TOL_DEFAULT : GFIT_TOL_P0,
      // GFIT_FAM_NEIGH=1: the other sizes' outlines stand in for their drawn lines (timing / causes)
      ...(process.env.GFIT_FAM_NEIGH
        ? {
            neighbourLines: (r: number) =>
              cands
                .filter((c) => c.rank !== r && c.outer.length > 2)
                .map((c) => [...c.outer, c.outer[0]]),
          }
        : {}),
    });
    // the plain leave-one-out residuals (calibration: no robust removal, no break fallback)
    const plain = fitFamily(sizesIn, { robust: false });
    console.log(
      `seed ${f.seed} ${cands.map((c) => c.outcome).join('')} model ${fam.model}${fam.why ? ` (${fam.why})` : ''} gp ${fam.gradePoints}/${fam.strongGradePoints} skips ${fam.topoSkips} uniq ${r2(fam.minRatio)} trusted ${fam.trusted.join(',')}`,
    );
    for (const v of fam.sizes)
      console.log(
        `   r${v.rank} ${d.labels[v.rank] ?? ''} ${v.status}${v.cause ? `/${v.cause}` : ''} score ${r2(v.score)} ${v.how ?? ''} corners ${v.corners.strong}/${v.corners.weak} exc ${v.excursions.map((x) => `e${x.e}@${r2(x.t)}:${r2(x.depth)}`).join(' ')} pt ${r2(Math.max(0, ...v.points.filter((x) => x.strong).map((x) => x.resid)))} edge ${r2(Math.max(0, ...v.edges.map((x) => x.p95)))}`,
      );
    if (fam.notches.length) console.log(`   notches ${JSON.stringify(fam.notches)}`);
    if (plain.model)
      for (const v of plain.sizes) {
        if (!v.how) continue;
        for (const x of v.points) if (x.strong) put(`${v.how} pt strong`, x.resid);
        for (const x of v.edges) put(`${v.how} edge p95`, x.p95);
      }
    if (png)
      renderGfit(
        resolve(png, `seed${f.seed}.png`),
        cands,
        fam,
        `${basename(dump)} seed ${f.seed}`,
        d.labels,
      );
  }
  for (const [k, xs] of Object.entries(res))
    console.log(
      `residuals ${k}: n ${xs.length} p50 ${r2(q(xs, 0.5))} p95 ${r2(q(xs, 0.95))} p99 ${r2(q(xs, 0.99))} max ${r2(Math.max(...xs))}`,
    );
  return 0;
}
