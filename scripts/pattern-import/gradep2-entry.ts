// PATTERN-IMPORT · GRADE P2 probe entry (bundled by gradep2.mjs) — the synthetic honesty probe of the
// repair the pipeline runs (pieces/gfit/repair.ts `repairSize`, hook A in pieces/fill.ts): closed
// sizes of CAD-graded DXF (corpus dxf-clo, block per size) and of kombinezon (PDF read by the
// pipeline, family dump) with 10–30 mm of their own line deleted (also: short deletions, a hidden
// bump under the deletion, a stretch swapped for the neighbour's line); every accept is compared
// with the real size; LEAKS-D adds a stretch drawn once for the size and a neighbour (a 'shared'
// wall) and its mutations (the neighbour's line there, the own line stopping short, the stretch
// moved off). EXIT 1 when any accepted repair is beyond tolerance (a wrong repair) or a mutation's
// shared line is run on.
//   node scripts/pattern-import/gradep2.mjs [honesty] [<e2e case>|mood:<id> …]
//   (GRADEP2_OUT, GRADEP2_PNG, GRADEP2_TRIALS, GRADEP2_ONLY)
// A case runs the pipeline twice (GRADE_P2_OFF=1, then on): which sizes the hook repaired (or held
// back with a grade hint), whether the run got further, and a before/after picture per repair.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { readDxf, segmentDxf } from 'lib/pattern-import/adapters/dxf';
import { bboxOf } from 'lib/pattern-import/pieces/geom';
import {
  GFIT_TOL_CAD,
  GFIT_TOL_P0,
  type GfitSizeIn,
  type GfitTol,
} from 'lib/pattern-import/pieces/gfit/fit';
import { analyseOutline, ringOf } from 'lib/pattern-import/pieces/gfit/outline';
import {
  repairSize,
  type GfitRepair,
  type GfitWall,
  type RepairOpts,
} from 'lib/pattern-import/pieces/gfit/repair';
import {
  chordBumps,
  cutSlits,
  notchBumps,
  ringDistance,
} from 'lib/pattern-import/pieces/gfit/checks';
import type { ChainSet, PieceCandidate, PieceFamily, PtMm } from 'lib/pattern-import/types';
import type { Session } from 'lib/pattern-import/worker/session';

import { CASES, runCase } from './e2e-entry';
import { MOOD_DIR, SAMPLE } from './mood-entry';
import { PALETTE, renderPng, type Label, type Stroke } from './sizes-render';

const CORPUS = '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/dxf-clo';
const CAD_FILES = [
  'ALLSIZES_DXF.dxf',
  'Allsizes_with_notches.dxf',
  'allsizes-merged.dxf',
  'allsizes.dxf',
  'summer men.dxf',
  'summer men_ganjubas_gerber.dxf',
  'blazer.dxf',
  'POCKETS.dxf',
  'RC28-RC28-001-Shell_Fabric_-_Alt_(substitute).dxf',
  'RC28-RC28-001-test-3.dxf',
].map((f) => `${CORPUS}/${f}`);
const KOMB_DUMP =
  process.env.GFIT_KOMB ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/auto/grade-p23/komb-dump.json';

type Fam = {
  src: 'CAD' | 'komb';
  file: string;
  id: string;
  labels: string[];
  sizes: GfitSizeIn[];
  tol: GfitTol;
};

const mx = (a: readonly number[]) => a.reduce((m, x) => (x > m ? x : m), -Infinity);
const r2 = (x: number) => Math.round(x * 100) / 100;
const q = (a: number[], p: number) => {
  if (!a.length) return NaN;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
};

async function loadCad(path: string, out: Fam[], notes: string[]) {
  const bytes = readFileSync(path);
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const read = await readDxf(
    { id: '0', name: basename(path), bytes: ab },
    { sagittaMm: 0.05, keepFills: true },
  );
  const seg = segmentDxf(read);
  const file = basename(path);
  if (!seg.presegmented) {
    notes.push(`${file}: not block-per-size (${seg.dialect})`);
    return;
  }
  for (const id of seg.identities) {
    const sizes: GfitSizeIn[] = [];
    id.pieces.forEach((pi, rank) => {
      const p = seg.pieces[pi];
      const c = id.mode === 'A' ? p.seam ?? p.cut : p.cut ?? p.seam;
      if (c && c.pts.length > 2) sizes.push({ rank, outer: c.pts as PtMm[], anchor: true });
    });
    if (sizes.length >= 3)
      out.push({ src: 'CAD', file, id: id.identity, labels: id.sizes, sizes, tol: GFIT_TOL_CAD });
    else notes.push(`${file} ${id.identity}: ${sizes.length} sizes`);
  }
}

function loadKomb(path: string, out: Fam[]) {
  const d = JSON.parse(readFileSync(path, 'utf8')) as {
    labels: string[];
    families: { seed: number; cands: { rank: number; o: string; outer: [number, number][] }[] }[];
  };
  for (const f of d.families) {
    const sizes = f.cands
      .filter((c) => c.o === 'N' && c.outer.length > 2)
      .map((c) => ({ rank: c.rank, outer: c.outer.map(([x, y]) => ({ x, y })), anchor: true }));
    if (sizes.length >= 3)
      out.push({
        src: 'komb',
        file: 'kombinezon.pdf',
        id: `seed${f.seed}`,
        labels: d.labels,
        sizes,
        tol: GFIT_TOL_P0,
      });
  }
}

// ── P2 ──────────────────────────────────────────────────────────────────────────────────────────

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Variant =
  | 'delete'
  | 'short'
  | 'bump'
  | 'swap'
  | 'shared'
  | 'shared-swap'
  | 'shared-gap'
  | 'shared-shift'
  | 'local'
  | 'local-shared';
/** LEAKS-D mutations: a shared run must never be taken there. */
const MUST_REFUSE_SHARED: readonly Variant[] = ['shared-gap', 'shared-shift'];
type RepRow = {
  src: string;
  fam: string;
  rank: number;
  variant: Variant;
  k: number;
  delMm: number[];
  ok: boolean;
  refusals: string[];
  /** Real-size error of the repaired canonical outline (both ways), mm. */
  errMax: number;
  /** The same with notch zones included (reader differences on notches show up here). */
  errMaxRaw: number;
  errP95: number;
  /** Error on derived samples only (the gap fills). */
  errDerivedMax: number;
  holes: number;
  holeMax: number;
  holeAt: string[];
  cover: number;
  offRun: number;
  bridges: number;
  falseNotch: number;
  tolPt: number;
  /** LEAKS-D: runs taken on shared lines. */
  sharedRuns: number;
};

/** Deletion intervals [a, b) in samples on a ring of n samples, non-overlapping. */
function pickDeletions(n: number, k: number, R: () => number, minMm = 10, maxMm = 30) {
  const out: [number, number][] = [];
  const used = new Uint8Array(n);
  for (let tries = 0; out.length < k && tries < 200; tries++) {
    const len = Math.round((minMm + (maxMm - minMm) * R()) / 0.5);
    const a = Math.floor(R() * n);
    let clash = false;
    for (let j = a - 10; j < a + len + 10 && !clash; j++) if (used[((j % n) + n) % n]) clash = true;
    if (clash) continue;
    for (let j = a; j < a + len; j++) used[j % n] = 1;
    out.push([a, a + len]);
  }
  return out;
}

/** The ring with the deleted intervals removed, as open fragments (each starts after a deletion). */
function fragments(ring: PtMm[], dels: [number, number][]): PtMm[][] {
  const n = ring.length;
  const del = new Uint8Array(n);
  for (const [a, b] of dels) for (let j = a; j < b; j++) del[((j % n) + n) % n] = 1;
  const start = del.findIndex((x, i) => !x && del[(i - 1 + n) % n] === 1);
  const out: PtMm[][] = [];
  let cur: PtMm[] = [];
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    if (del[i]) {
      if (cur.length > 1) out.push(cur);
      cur = [];
    } else cur.push(ring[i]);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

function bumped(ring: PtMm[], c: number, wMm: number, amp: number): PtMm[] {
  const n = ring.length;
  const half = Math.round(wMm / 2 / 0.5);
  const out = ring.slice();
  for (let d = -half; d <= half; d++) {
    const i = (((c + d) % n) + n) % n;
    const a = ring[(i - 2 + n) % n];
    const b = ring[(i + 2) % n];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const L = Math.hypot(tx, ty) || 1;
    // CCW ring: the outward normal is (ty, −tx)
    const s = 0.5 * (1 + Math.cos((Math.PI * d) / half));
    out[i] = { x: ring[i].x + (amp * s * ty) / L, y: ring[i].y - (amp * s * tx) / L };
  }
  return out;
}

function nearestIdx(ring: PtMm[], p: PtMm) {
  let bi = 0;
  let bd = Infinity;
  ring.forEach((x, i) => {
    const d = Math.hypot(x.x - p.x, x.y - p.y);
    if (d < bd) {
      bd = d;
      bi = i;
    }
  });
  return bi;
}

function repRow(
  f: Fam,
  rank: number,
  variant: Variant,
  truth: PtMm[],
  walls: GfitWall[],
  delMm: number[],
  rows: RepRow[],
  extra: RepairOpts = {},
): GfitRepair {
  const others = f.sizes.filter((s) => s.rank !== rank);
  // GRADE_D_OFF=1: the repair as before LEAKS-D (no shared pass, no local grade) — the same trials
  const dOff = !!process.env.GRADE_D_OFF;
  const rep = repairSize(others, rank, walls, {
    tol: f.tol,
    ...extra,
    ...(dOff ? { shared: false, forceLocal: false } : {}),
  });
  let errMax = NaN;
  let errMaxRaw = NaN;
  let errP95 = NaN;
  let errDerivedMax = 0;
  let falseNotch = 0;
  const to = analyseOutline(truth);
  if (rep.outer && to) {
    const ro = analyseOutline(rep.outer);
    if (ro) {
      // notches are marks: slits cut and notch-like bumps chorded on both sides
      const tp = chordBumps(cutSlits(to.pts));
      const rp = chordBumps(cutSlits(ro.pts));
      const da = ringDistance(tp);
      const db = ringDistance(rp);
      const e1 = rp.map((p) => da(p));
      const e2 = tp.map((p) => db(p));
      const all = [...e1, ...e2];
      errMaxRaw = mx(all);
      // the honesty metric: away from notch sites (±12 mm) — the reader chords a notch in one
      // resampling and not in another; that is a notch mark, not geometry
      const tn0 = [...to.excursions.map((x) => x.p), ...notchBumps(to.raw)];
      const sites = [...tn0, ...ro.excursions.map((x) => x.p), ...notchBumps(ro.raw)];
      const far = (p: PtMm) => sites.every((y) => Math.hypot(p.x - y.x, p.y - y.y) > 12);
      const away = [...rp.filter(far).map((p) => da(p)), ...tp.filter(far).map((p) => db(p))];
      errMax = away.length ? mx(away) : 0;
      errP95 = q(away, 0.95);
      rep.outer.forEach((p, i) => {
        if (rep.derived?.[i]) errDerivedMax = Math.max(errDerivedMax, da(p));
      });
      // notch excursions in the repaired ring that the real size does not have
      const tn = [...to.excursions.map((x) => x.p), ...notchBumps(to.raw)];
      for (const p of [...ro.excursions.map((x) => x.p), ...notchBumps(ro.raw)])
        if (!tn.some((y) => Math.hypot(p.x - y.x, p.y - y.y) < 8)) falseNotch++;
    }
  }
  rows.push({
    src: f.src,
    fam: `${f.file}:${f.id}`,
    rank,
    variant,
    k: delMm.length,
    delMm: delMm.map(r2),
    ok: rep.ok,
    refusals: rep.refusals,
    errMax,
    errMaxRaw,
    errP95,
    errDerivedMax,
    holes: rep.holes.length,
    holeMax: mx([0, ...rep.holes.map((h) => h.lenMm)]),
    holeAt: rep.holes.map((h) => `${r2(h.at.x)},${r2(h.at.y)}`),
    cover: rep.cover,
    offRun: rep.offRunMm,
    bridges: rep.wallBridges,
    falseNotch,
    tolPt: f.tol.ptMm,
    sharedRuns: rep.sharedRuns,
  });
  return rep;
}

function p2(fams: Fam[], png: string | null, trials: number) {
  const rows: RepRow[] = [];
  const shots: {
    f: Fam;
    rank: number;
    tag: string;
    truth: PtMm[];
    walls: GfitWall[];
    rep: GfitRepair;
  }[] = [];
  let seed = 1;
  for (const f of fams) {
    const ranks = f.sizes.map((s) => s.rank).sort((a, b) => a - b);
    for (const r of ranks.slice(1, -1)) {
      const real = f.sizes.find((s) => s.rank === r)!;
      const ring = ringOf(real.outer);
      const n = ring.length;
      const shoot = (tag: string, truth: PtMm[], walls: GfitWall[], rep: GfitRepair) => {
        const want = rep.ok ? 'acc' : 'ref';
        // every accept beyond tolerance gets a picture (up to 12)
        const last = rows[rows.length - 1];
        if (rep.ok && !(last.errMax <= Math.max(1, last.tolPt))) {
          if (shots.filter((s) => s.tag.endsWith('BAD')).length < 12)
            shots.push({ f, rank: r, tag: `${tag}-${shots.length}-BAD`, truth, walls, rep });
          return;
        }
        if (
          shots.filter(
            (s) => s.tag.startsWith(tag.split('-')[0]) && s.tag.endsWith(want) && s.f.src === f.src,
          ).length < 1
        )
          shots.push({ f, rank: r, tag: `${tag}-${want}`, truth, walls, rep });
      };
      // delete: k = 1, 2, 3 stretches of 10–30 mm of the own line
      for (let k = 1; k <= 3; k++)
        for (let t = 0; t < trials; t++) {
          const R = rng(seed++);
          const dels = pickDeletions(n, k, R);
          const walls = fragments(ring, dels).map((p) => ({ pts: p, kind: 'own' as const }));
          const rep = repRow(
            f,
            r,
            'delete',
            ring,
            walls,
            dels.map(([a, b]) => (b - a) * 0.5),
            rows,
          );
          shoot('delete', ring, walls, rep);
        }
      // local: the delete k = 1 trials again, the grade from the nearby anchors only (LEAKS-D: the
      // fallback where the family's model fails)
      for (let t = 0; t < trials; t++) {
        const R = rng(seed++);
        const dels = pickDeletions(n, 1, R);
        const walls = fragments(ring, dels).map((p) => ({ pts: p, kind: 'own' as const }));
        const rep = repRow(
          f,
          r,
          'local',
          ring,
          walls,
          dels.map(([a, b]) => (b - a) * 0.5),
          rows,
          { forceLocal: true },
        );
        shoot('local', ring, walls, rep);
      }
      // short: 1–2 stretches of 8–14 mm (inside the E2 hole limit — stresses the accepts)
      for (let k = 1; k <= 2; k++)
        for (let t = 0; t < trials; t++) {
          const R = rng(seed++);
          const dels = pickDeletions(n, k, R, 8, 14);
          const walls = fragments(ring, dels).map((p) => ({ pts: p, kind: 'own' as const }));
          const rep = repRow(
            f,
            r,
            'short',
            ring,
            walls,
            dels.map(([a, b]) => (b - a) * 0.5),
            rows,
          );
          shoot('short', ring, walls, rep);
        }
      // bump: the real size deviates 2–5 mm over 20–40 mm, and the deletion sits on the bump
      for (let t = 0; t < trials; t++) {
        const R = rng(seed++);
        const c = Math.floor(R() * n);
        const w = 20 + 20 * R();
        const amp = (2 + 3 * R()) * (R() < 0.5 ? -1 : 1);
        const truth = bumped(ring, c, w, amp);
        const len = Math.round((10 + 20 * R()) / 0.5);
        const a = c + Math.round((R() - 0.5) * (w / 2 / 0.5)) - (len >> 1);
        const walls = fragments(truth, [[a, a + len]]).map((p) => ({
          pts: p,
          kind: 'own' as const,
        }));
        const rep = repRow(f, r, 'bump', truth, walls, [len * 0.5], rows);
        shoot('bump', truth, walls, rep);
      }
      // swap: a 10–30 mm stretch of the own line replaced by the neighbour size's line (a leak
      // glued onto the neighbour), one closed own wall
      for (let t = 0; t < trials; t++) {
        const R = rng(seed++);
        const nb = f.sizes.find((s) => s.rank === (R() < 0.5 ? r - 1 : r + 1));
        if (!nb) continue;
        const nring = ringOf(nb.outer);
        const [[a, b]] = pickDeletions(n, 1, R);
        const na = nearestIdx(nring, ring[a % n]);
        const nbI = nearestIdx(nring, ring[b % n]);
        const m = nring.length;
        const span = (nbI - na + m) % m;
        if (span > m / 2) continue;
        const pts: PtMm[] = [];
        for (let j = b; j < a + n; j++) pts.push(ring[j % n]);
        for (let j = 0; j <= span; j++) pts.push(nring[(na + j) % m]);
        const walls: GfitWall[] = [{ pts, kind: 'own', closed: true }];
        const rep = repRow(f, r, 'swap', ring, walls, [(b - a) * 0.5], rows);
        shoot('swap', ring, walls, rep);
      }
      // LEAKS-D · shared: a 30–120 mm stretch of the size drawn once for it and a neighbour and
      // credited to the neighbour — the own line ends at both sides of the stretch, the stretch is
      // a 'shared' wall (the true line): the repair runs on it. Mutations, none may be accepted
      // beyond tolerance, gap and shift may take no shared run at all: the neighbour's own line
      // there instead (shared-swap), the own line stopping 4–8 mm short of the stretch
      // (shared-gap), the stretch moved 3–5 mm off (shared-shift).
      for (let t = 0; t < trials; t++) {
        const R = rng(seed++);
        const del = pickDeletions(n, 1, R, 30, 120)[0];
        if (!del || del[1] - del[0] > n / 3) continue;
        const [a, b] = del;
        const at = (j: number) => ring[((j % n) + n) % n];
        const stretch: PtMm[] = [];
        for (let j = a - 2; j <= b + 1; j++) stretch.push(at(j));
        const own = fragments(ring, [[a, b]]).map((p) => ({ pts: p, kind: 'own' as const }));
        const lenMm = [(b - a) * 0.5];
        {
          const walls: GfitWall[] = [...own, { pts: stretch, kind: 'shared' }];
          const rep = repRow(f, r, 'shared', ring, walls, lenMm, rows);
          shoot('shared', ring, walls, rep);
          // the same on the local grade (the two anchors below and above; LEAKS-D fallback)
          const rl = repRow(f, r, 'local-shared', ring, walls, lenMm, rows, { forceLocal: true });
          shoot('local-shared', ring, walls, rl);
        }
        const nb = f.sizes.find((s) => s.rank === (R() < 0.5 ? r - 1 : r + 1));
        if (nb) {
          const nring = ringOf(nb.outer);
          const m = nring.length;
          const na = nearestIdx(nring, at(a));
          const span = (nearestIdx(nring, at(b)) - na + m) % m;
          if (span <= m / 2) {
            const pts: PtMm[] = [];
            for (let j = -2; j <= span + 2; j++) pts.push(nring[(((na + j) % m) + m) % m]);
            const walls: GfitWall[] = [...own, { pts, kind: 'shared' }];
            const rep = repRow(f, r, 'shared-swap', ring, walls, lenMm, rows);
            shoot('shared-swap', ring, walls, rep);
          }
        }
        {
          const g = 8 + Math.floor(9 * R());
          const walls: GfitWall[] = [
            ...fragments(ring, [[a - g, b]]).map((p) => ({ pts: p, kind: 'own' as const })),
            { pts: stretch, kind: 'shared' },
          ];
          const rep = repRow(f, r, 'shared-gap', ring, walls, [(b - a + g) * 0.5], rows);
          shoot('shared-gap', ring, walls, rep);
        }
        {
          const off = (3 + 2 * R()) * (R() < 0.5 ? -1 : 1);
          const pts = stretch.map((p, k) => {
            const u = stretch[Math.max(0, k - 2)];
            const v = stretch[Math.min(stretch.length - 1, k + 2)];
            const L = Math.hypot(v.x - u.x, v.y - u.y) || 1;
            return { x: p.x + (off * (v.y - u.y)) / L, y: p.y - (off * (v.x - u.x)) / L };
          });
          const walls: GfitWall[] = [...own, { pts, kind: 'shared' }];
          const rep = repRow(f, r, 'shared-shift', ring, walls, lenMm, rows);
          shoot('shared-shift', ring, walls, rep);
        }
      }
    }
  }
  if (png)
    for (const s of shots)
      renderRep(
        resolve(png, `p2-${s.f.src}-${s.f.id}-r${s.rank}-${s.tag}.png`),
        s.f,
        s.rank,
        s.truth,
        s.walls,
        s.rep,
      );
  return rows;
}

function sumRep(rows: RepRow[]) {
  const out: Record<string, unknown>[] = [];
  const keys = new Set(
    rows.map((r) => `${r.src} ${r.variant}${r.variant === 'delete' ? ` k${r.k}` : ''}`),
  );
  const all = [...keys].sort();
  for (const src of ['CAD', 'komb']) {
    for (const v of [
      'delete',
      'short',
      'bump',
      'swap',
      'shared',
      'shared-swap',
      'shared-gap',
      'shared-shift',
      'local',
      'local-shared',
    ])
      all.push(`${src} ${v} (all)`);
  }
  for (const k of all) {
    const rs = rows.filter((r) =>
      k.endsWith('(all)')
        ? `${r.src} ${r.variant} (all)` === k
        : `${r.src} ${r.variant}${r.variant === 'delete' ? ` k${r.k}` : ''}` === k,
    );
    if (!rs.length) continue;
    const acc = rs.filter((r) => r.ok);
    const reasons: Record<string, number> = {};
    for (const r of rs.filter((x) => !x.ok))
      for (const x of r.refusals) reasons[x] = (reasons[x] ?? 0) + 1;
    const lim = (r: RepRow) => Math.max(1, r.tolPt);
    out.push({
      group: k,
      n: rs.length,
      accepted: acc.length,
      refused: rs.length - acc.length,
      acceptBeyondTol: acc.filter((r) => !(r.errMax <= lim(r))).length,
      acceptBeyond1mm: acc.filter((r) => !(r.errMax <= 1)).length,
      acceptBeyondTol_raw: acc.filter((r) => !(r.errMaxRaw <= lim(r))).length,
      acc_errMax_p50: r2(
        q(
          acc.map((r) => r.errMax),
          0.5,
        ),
      ),
      acc_errMax_p95: r2(
        q(
          acc.map((r) => r.errMax),
          0.95,
        ),
      ),
      acc_errMax_max: r2(mx([0, ...acc.map((r) => r.errMax)])),
      acc_derivedMax: r2(mx([0, ...acc.map((r) => r.errDerivedMax)])),
      acc_falseNotch: acc.reduce((a, r) => a + r.falseNotch, 0),
      // LEAKS-D: attempts / accepts that ran on a shared line
      sharedTaken: rs.filter((r) => r.sharedRuns > 0).length,
      sharedAccepted: acc.filter((r) => r.sharedRuns > 0).length,
      refused_wouldBe_beyondTol: rs.filter((r) => !r.ok && r.errMax > lim(r)).length,
      // refused ONLY by the end-offset rule: within tolerance (lost) / beyond (caught)
      endOffsetOnly_lost: rs.filter(
        (r) => r.refusals.length === 1 && r.refusals[0] === 'E2-end-offset' && r.errMax <= lim(r),
      ).length,
      endOffsetOnly_caught: rs.filter(
        (r) => r.refusals.length === 1 && r.refusals[0] === 'E2-end-offset' && r.errMax > lim(r),
      ).length,
      reasons,
    });
  }
  return out;
}

// ── pictures ────────────────────────────────────────────────────────────────────────────────────

// ── pictures ──

function frameBox(pts: PtMm[]) {
  const b = bboxOf(pts);
  const m = 15;
  return { minX: b.minX - m, minY: b.minY - m - 60, maxX: b.maxX + m, maxY: b.maxY + m };
}

function renderRep(
  file: string,
  f: Fam,
  rank: number,
  truth: PtMm[],
  walls: GfitWall[],
  rep: GfitRepair,
) {
  const strokes: Stroke[] = [];
  const marks: Label[] = [];
  for (const s of f.sizes)
    if (s.rank !== rank)
      strokes.push({
        pts: s.outer as PtMm[],
        closed: true,
        color: PALETTE[s.rank % PALETTE.length],
        width: 0.6,
      });
  strokes.push({ pts: truth, closed: true, color: '#bbb', width: 4 });
  if (rep.pred)
    strokes.push({ pts: rep.pred, closed: true, color: '#888', width: 0.6, dash: '2 2' });
  for (const w of walls)
    strokes.push({ pts: w.pts as PtMm[], closed: w.closed, color: '#06c', width: 1.4 });
  if (rep.outer && rep.derived) {
    // derived runs in red
    let run: PtMm[] = [];
    rep.outer.forEach((p, i) => {
      if (rep.derived![i]) run.push(p);
      else if (run.length) {
        strokes.push({ pts: run, color: '#e00', width: 2.5 });
        run = [];
      }
    });
    if (run.length) strokes.push({ pts: run, color: '#e00', width: 2.5 });
  }
  for (const h of rep.holes)
    marks.push({
      at: h.at,
      text: `${r2(h.lenMm)}${h.endsOk.every(Boolean) ? '' : ' !end'}`,
      color: '#e00',
      size: 11,
    });
  const legend = [
    {
      color: '#000',
      text: `${f.file} ${f.id}: repair ${f.labels[rank] ?? rank} between ${rep.from?.map((r) => f.labels[r] ?? r).join('+') ?? '-'}`,
    },
    {
      color: rep.ok ? '#2a2' : '#d00',
      text: `${rep.ok ? 'ACCEPTED' : `REFUSED ${rep.refusals.join(',')}`} · cover ${r2(100 * rep.cover)} % · holes ${rep.holes.map((h) => r2(h.lenMm)).join('/') || '-'} · off-corridor ${r2(rep.offRunMm)} mm · score ${rep.score !== undefined ? r2(rep.score) : '-'}`,
    },
    {
      color: '#06c',
      text: 'blue = own walls; grey thick = the real size; grey dashed = prediction; red = derived (gap fill)',
    },
  ];
  // zoomed on the holes (the place the repair decided), else the whole family
  const focus = rep.holes.length ? rep.holes.map((h) => h.at) : null;
  if (focus) {
    const b = bboxOf(focus);
    const m = 45;
    const box = { minX: b.minX - m, minY: b.minY - m - 25, maxX: b.maxX + m, maxY: b.maxY + m };
    const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
    renderPng(file, box, strokes, marks, Math.min(12, 1400 / span), legend);
    return;
  }
  const box = frameBox(f.sizes.flatMap((s) => s.outer as PtMm[]));
  renderPng(
    file,
    box,
    strokes,
    marks,
    Math.min(4, 1800 / Math.max(box.maxX - box.minX, box.maxY - box.minY)),
    legend,
  );
}

// ── cases: the hook in the pipeline ─────────────────────────────────────────────────────────────

type CaseRun = {
  verdict: string;
  reason: string;
  families: PieceFamily[];
  /** The automatic pieces run (before the operator's answers drop open families). */
  auto: PieceFamily[];
  set: ChainSet | null;
  labels: string[];
};

async function runOnce(id: string, off: boolean): Promise<CaseRun | null> {
  let c = CASES.find((x) => x.id === id);
  if (!c && id.startsWith('mood:')) {
    const sm = SAMPLE.find((x) => `mood:${x.id}` === id);
    if (sm)
      c = {
        id,
        group: 'pdf',
        files: [resolve(MOOD_DIR, sm.path)],
        card: sm.key,
      } as unknown as typeof c;
  }
  if (!c) return null;
  if (off) process.env.GRADE_P2_OFF = '1';
  else delete process.env.GRADE_P2_OFF;
  let families: PieceFamily[] = [];
  let set: ChainSet | null = null;
  let labels: string[] = [];
  const grab = (s: Session) => {
    const x = s as unknown as {
      families: PieceFamily[] | null;
      wallSet: ChainSet | null;
      run?: { sizes: { label: string }[] } | null;
    };
    families = x.families ?? [];
    set = x.wallSet ?? null;
    labels = x.run?.sizes?.map((z) => z.label) ?? [];
  };
  let auto: PieceFamily[] = [];
  const rec = await runCase(c, {
    onPieces: grab,
    onAutoPieces: (s) => {
      grab(s);
      auto = families;
    },
  });
  delete process.env.GRADE_P2_OFF;
  return {
    verdict: String(rec.verdict),
    reason: String(rec.reason ?? '').slice(0, 240),
    families,
    auto,
    set,
    labels,
  };
}

const OC: Record<string, string> = {
  closed: 'N',
  leak: 'L',
  merged: 'M',
  tiny: 'T',
  refused: 'R',
};
const famLine = (f: PieceFamily) =>
  f.candidates
    .map((c) => (c.rankFrom === 'repair' ? 'P' : c.gradeHint ? 'h' : OC[c.outcome] ?? '?'))
    .join('');

function renderRepair(
  file: string,
  id: string,
  before: PieceFamily | undefined,
  after: PieceFamily,
  rank: number,
  set: ChainSet | null,
  labels: string[],
) {
  const c = after.candidates.find((x) => x.rank === rank)!;
  const was = before?.candidates.find((x) => x.rank === rank);
  const strokes: Stroke[] = [];
  const marks: Label[] = [];
  const b = bboxOf(c.outer);
  const box = { minX: b.minX - 25, minY: b.minY - 25, maxX: b.maxX + 25, maxY: b.maxY + 60 };
  // the drawing (every chain in the box), light
  for (const ch of set?.chains ?? []) {
    if (ch.pts.length < 2) continue;
    const q = bboxOf(ch.pts);
    if (q.maxX < box.minX || q.minX > box.maxX || q.maxY < box.minY || q.minY > box.maxY) continue;
    strokes.push({ pts: ch.pts, closed: ch.closed, color: '#ccc', width: 0.8 });
  }
  for (const x of after.candidates)
    if (x.rank !== rank && x.outcome === 'closed')
      strokes.push({
        pts: x.outer,
        closed: true,
        color: PALETTE[x.rank % PALETTE.length],
        width: 0.7,
      });
  if (was?.outcome === 'closed')
    strokes.push({ pts: was.outer, closed: true, color: '#999', width: 5, dash: '6 4' });
  for (const w of c.walls) {
    const ch = set?.chains[w];
    if (ch) strokes.push({ pts: ch.pts, closed: ch.closed, color: '#06c', width: 1.2 });
  }
  strokes.push({ pts: c.outer, closed: true, color: '#0a0', width: 2 });
  for (const d of c.derived ?? []) {
    strokes.push({ pts: d.pts, color: '#e00', width: 3.5 });
    marks.push({ at: d.pts[d.pts.length >> 1], text: 'fill', color: '#e00', size: 12 });
  }
  const r = c.repair!;
  const L = (k: number) => labels[k] ?? String(k);
  const legend = [
    {
      color: '#000',
      text: `${id} seed ${after.seed}: size ${L(rank)} ${r.kind === 'leak' ? 'leaked' : "closed on another size's line"} → repaired from ${L(r.from[0])}+${L(r.from[1])}`,
    },
    {
      color: '#0a0',
      text: `green = repaired outline · cover ${(r.cover * 100).toFixed(1)} % · holes ${r.holes} (${r.holesMm} mm, red) · score ${r.score} · dev ${r.devMm} mm`,
    },
    {
      color: '#06c',
      text: `blue = the size's own/common lines it runs on · grey dashed thick = before (${was ? was.outcome : '-'}) · thin colours = other sizes`,
    },
  ];
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  renderPng(file, box, strokes, marks, Math.min(6, 1800 / span), legend);
}

function renderHint(
  file: string,
  id: string,
  f: PieceFamily,
  c: PieceCandidate,
  set: ChainSet | null,
  labels: string[],
) {
  const h = c.gradeHint!;
  const strokes: Stroke[] = [];
  const b = bboxOf(h.pred);
  const box = { minX: b.minX - 25, minY: b.minY - 25, maxX: b.maxX + 25, maxY: b.maxY + 60 };
  for (const ch of set?.chains ?? []) {
    if (ch.pts.length < 2) continue;
    const q = bboxOf(ch.pts);
    if (q.maxX < box.minX || q.minX > box.maxX || q.maxY < box.minY || q.minY > box.maxY) continue;
    strokes.push({ pts: ch.pts, closed: ch.closed, color: '#bbb', width: 0.8 });
  }
  for (const x of f.candidates)
    if (x.rank !== c.rank && x.outcome === 'closed')
      strokes.push({
        pts: x.outer,
        closed: true,
        color: PALETTE[x.rank % PALETTE.length],
        width: 0.7,
      });
  if (c.outcome === 'closed')
    strokes.push({ pts: c.outer, closed: true, color: '#555', width: 3, dash: '6 4' });
  strokes.push({ pts: h.pred, closed: true, color: '#e00', width: 1.6, dash: '4 3' });
  const L = (k: number) => labels[k] ?? String(k);
  const span = Math.max(box.maxX - box.minX, box.maxY - box.minY);
  renderPng(file, box, strokes, [], Math.min(5, 1600 / span), [
    {
      color: '#000',
      text: `${id} seed ${f.seed}: size ${L(c.rank)} ${c.outcome} — repair refused: ${h.refusals.join(', ')}`,
    },
    {
      color: '#e00',
      text: `red dashed = where the grade of ${L(h.from[0])}+${L(h.from[1])} puts it${h.extrapolated ? ' (extrapolated)' : ''}; grey dashed thick = as closed now; colours = other sizes`,
    },
  ]);
}

async function oneCase(id: string, png: string | null) {
  const off = await runOnce(id, true);
  const on = await runOnce(id, false);
  if (!off || !on) return { id, error: 'no case' };
  const rows: string[] = [];
  const repaired: { seed: number; rank: number; kind: string; holesMm: number }[] = [];
  const hints: { seed: number; rank: number; refusals: string[] }[] = [];
  for (const f of on.families) {
    const b = off.families.find((x) => x.seed === f.seed);
    const line = famLine(f);
    const was = b ? famLine(b) : '-';
    if (line !== was) rows.push(`  seed ${String(f.seed).padStart(3)}  ${was} → ${line}`);
    for (const c of f.candidates) {
      if (c.rankFrom === 'repair' && c.repair) {
        repaired.push({
          seed: f.seed,
          rank: c.rank,
          kind: c.repair.kind,
          holesMm: c.repair.holesMm,
        });
        if (png)
          renderRepair(
            resolve(png, `${id.replace(/[^\w.-]+/g, '_')}-seed${f.seed}-r${c.rank}.png`),
            id,
            b,
            f,
            c.rank,
            on.set,
            on.labels,
          );
      } else if (c.gradeHint && png)
        renderHint(
          resolve(png, `${id.replace(/[^\w.-]+/g, '_')}-hint-seed${f.seed}-r${c.rank}.png`),
          id,
          f,
          c,
          on.set,
          on.labels,
        );
      if (c.gradeHint) hints.push({ seed: f.seed, rank: c.rank, refusals: c.gradeHint.refusals });
    }
  }
  // families the run dropped later (open ones answered "not a piece"): their hints from the auto run
  for (const f of on.auto)
    if (!on.families.some((x) => x.seed === f.seed))
      for (const c of f.candidates)
        if (c.gradeHint) {
          hints.push({ seed: f.seed, rank: c.rank, refusals: c.gradeHint.refusals });
          if (png)
            renderHint(
              resolve(
                png,
                `${id.replace(/[^\w.-]+/g, '_')}-auto-hint-seed${f.seed}-r${c.rank}.png`,
              ),
              id,
              f,
              c,
              on.set,
              on.labels,
            );
        }
  const allClosed = (fs: PieceFamily[]) =>
    fs.filter(
      (f) =>
        f.candidates.length && f.candidates.every((c: PieceCandidate) => c.outcome === 'closed'),
    ).length;
  return {
    id,
    before: {
      verdict: off.verdict,
      reason: off.reason,
      families: off.families.length,
      allClosed: allClosed(off.families),
    },
    after: {
      verdict: on.verdict,
      reason: on.reason,
      families: on.families.length,
      allClosed: allClosed(on.families),
    },
    repaired,
    hints,
    rows,
  };
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────
// ── main ────────────────────────────────────────────────────────────────────────────────────────

export async function main(args: string[] = []): Promise<number> {
  const ids = args.filter((a) => a !== 'honesty');
  let rc = 0;
  if (!args.length || args.includes('honesty')) rc = await honesty();
  const png = process.env.GRADEP2_PNG ?? null;
  if (png) mkdirSync(png, { recursive: true });
  for (const id of ids) {
    const r = await oneCase(id, png);
    console.log(`@@CASE ${JSON.stringify(r)}`);
    if ('error' in r || !r.before) {
      console.log(`${id}: ${'error' in r ? r.error : 'error'}`);
      rc = 1;
      continue;
    }
    const rr = r;
    console.log(
      `${id}: before ${rr.before.verdict} (all closed ${rr.before.allClosed}/${rr.before.families}) → after ${rr.after.verdict} (all closed ${rr.after.allClosed}/${rr.after.families}) · repaired ${rr.repaired.length} · hints ${rr.hints.length}`,
    );
    for (const x of rr.rows) console.log(x);
    for (const x of rr.repaired)
      console.log(`  REPAIRED seed ${x.seed} r${x.rank} ${x.kind} holes ${x.holesMm} mm`);
    for (const x of rr.hints)
      console.log(`  HINT seed ${x.seed} r${x.rank}: ${x.refusals.join(',')}`);
    console.log(`  after: ${rr.after.reason}`);
  }
  return rc;
}

async function honesty(): Promise<number> {
  const out = process.env.GRADEP2_OUT ?? '/private/tmp/patimport-runs/gradep2/honesty';
  const png = process.env.GRADEP2_PNG ?? null;
  const trials = Number(process.env.GRADEP2_TRIALS ?? 4);
  mkdirSync(out, { recursive: true });
  if (png) mkdirSync(png, { recursive: true });
  const fams: Fam[] = [];
  const notes: string[] = [];
  for (const f of CAD_FILES) {
    try {
      await loadCad(f, fams, notes);
    } catch (e) {
      notes.push(`${basename(f)}: ${String(e).slice(0, 160)}`);
    }
  }
  loadKomb(KOMB_DUMP, fams);
  const only = process.env.GRADEP2_ONLY;
  const use = only ? fams.filter((f) => new RegExp(only).test(`${f.file}:${f.id}`)) : fams;
  console.log(
    `families ${use.length} (CAD ${use.filter((f) => f.src === 'CAD').length}, komb ${use.filter((f) => f.src === 'komb').length})`,
  );
  for (const n of notes) console.log(`  note: ${n}`);
  const t1 = Date.now();
  const rows = p2(use, png, trials);
  writeFileSync(resolve(out, 'p2-rows.json'), JSON.stringify(rows));
  const s = sumRep(rows);
  writeFileSync(resolve(out, 'p2-summary.json'), JSON.stringify(s, null, 1));
  for (const x of s) console.log(`P2 ${JSON.stringify(x)}`);
  const acc = rows.filter((r) => r.ok);
  const bad = acc.filter((r) => !(r.errMax <= Math.max(1, r.tolPt)));
  // LEAKS-D: a shared run taken where the junction or the corridor says no
  const badShared = rows.filter((r) => MUST_REFUSE_SHARED.includes(r.variant) && r.sharedRuns > 0);
  const sh = rows.filter((r) => r.variant === 'shared');
  console.log(
    `D shared: ${sh.length} true stretches, ${sh.filter((r) => r.ok).length} accepted (${sh.filter((r) => r.ok && r.sharedRuns > 0).length} on the shared line) · mutations taking a shared run: ${badShared.length}`,
  );
  // not vacuous (Codex r1): with D on, true shared stretches are run on and the local grade
  // accepts somewhere — else a broken shared pass / fallback would refuse everything and pass
  const vacuous =
    !process.env.GRADE_D_OFF &&
    (sh.filter((r) => r.ok && r.sharedRuns > 0).length === 0 ||
      rows.filter((r) => r.variant === 'local' && r.ok).length === 0);
  if (vacuous) console.log('FAIL  vacuous: no shared stretch run on, or no local-grade accept');
  const fail = bad.length + badShared.length + (vacuous ? 1 : 0);
  console.log(
    `${fail ? 'FAIL' : 'PASS'}  honesty: ${rows.length} attempts, ${acc.length} accepted, ${bad.length} accepted beyond tolerance (max error of accepts ${r2(mx([0, ...acc.map((r) => r.errMax)]))} mm), ${badShared.length} shared runs taken by a mutation · ${Date.now() - t1} ms`,
  );
  return fail ? 1 : 0;
}
