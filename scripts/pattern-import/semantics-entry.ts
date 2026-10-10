// F5 probe — piece semantics + proposeSizeMap (08-CONTRACT §7). Sections:
//   A  offsetContour: analytic square, slit, concave bodice (no hull), inset, split → topology
//   B  allowance text: multilingual statements + the sheet text of every corpus PDF vs truth.json
//   C  proposeSizeMap: every corpus size run × typical card runs
//   D  synthetic families → buildPieceSpecs → writeAndGate: seam-only offset (G6 ±0.2), forced
//      hull (negative), fold → unfold (area ×2 ±0.1 %), "cut 2" pair → `_R` mirror (G12), grain gate,
//      PDF-style features (notches, drill, labelled grain, dart), names / UNI / duplicates
//   E  every CLO DXF of the corpus via the fast path → buildPieceSpecs → writeAndGate G1–G13
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as blockCode from 'components/managers/tech-card/components/nesting/block-code';
import { readDxf, segmentDxf, dxfFastPath } from 'lib/pattern-import/adapters/dxf';
import type { DxfPieceCandidate } from 'lib/pattern-import/adapters/dxf';
import { extractPdf, DEFAULT_EXTRACT_OPTS, setPdfjsLoader } from 'lib/pattern-import/adapters/pdf';
import type { PdfjsModule } from 'lib/pattern-import/adapters/pdf';
import { type CardBlockRules, writeAndGate } from 'lib/pattern-import/gate';
import {
  allowanceFromTexts,
  buildPieceSpecsDetailed,
  detectAllowance,
  offsetContour,
  readAllowanceText,
  unfoldAreaError,
} from 'lib/pattern-import/semantics';
import {
  SegIndex,
  areaOf,
  bboxOf,
  convexHull,
  hullRatio,
  reflection,
  applyAffine,
  sampleAlong,
} from 'lib/pattern-import/semantics/geom';
import { isTitleLabel } from 'lib/pattern-import/semantics/names';
import {
  createProposeSizeMap,
  needsConfirmation,
  proposeSizeMap,
} from 'lib/pattern-import/sizes/map';
import type {
  AllowanceDecision,
  CardSize,
  Chain,
  ChainSet,
  GateCheckId,
  GateReport,
  IRText,
  LineClass,
  ManifestSize,
  ManifestSource,
  PieceCandidate,
  PieceFamily,
  PieceSpec,
  PtMm,
  SemanticsInput,
  Sheet,
  SizeMap,
  SizeRun,
  WriteJob,
} from 'lib/pattern-import/types';

const rules: CardBlockRules = blockCode;
const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
setPdfjsLoader(
  () =>
    import(
      pathToFileURL(path.resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href
    ) as Promise<PdfjsModule>,
);

// ── harness ─────────────────────────────────────────────────────────────────────────────────
type Row = { section: string; what: string; ok: boolean; detail: string };
const rows: Row[] = [];
let section = '';
const ck = (ok: boolean, what: string, detail = '') => {
  rows.push({ section, what, ok, detail });
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
  return ok;
};
const head = (s: string) => {
  section = s;
  console.log(`\n${s}`);
};
const failing = (r: GateReport) =>
  r.checks.filter((c) => !c.ok && c.severity === 'block').map((c) => c.id);
const checkOf = (r: GateReport, id: GateCheckId) => r.checks.find((c) => c.id === id);
const gateLine = (r: GateReport) =>
  r.checks
    .map((c) => `${c.id.split('-')[0]}${c.ok ? '✓' : c.severity === 'block' ? '✗' : '!'}`)
    .join(' ');
const ab = (p: string) => {
  const b = fs.readFileSync(p);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

// ── shapes ──────────────────────────────────────────────────────────────────────────────────
function arc(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  n: number,
): PtMm[] {
  const out: PtMm[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) });
  }
  return out;
}
/** Front bodice (CCW): concave armhole and neckline — the shapes a hull would fill. */
function bodice(k = 1): PtMm[] {
  const s = (p: PtMm) => ({ x: p.x * k, y: p.y * k });
  return [
    { x: 0, y: 0 },
    { x: 250, y: 0 },
    ...arc(250, 560, 70, 180, -90, -180, 40),
    { x: 70, y: 600 },
    ...arc(0, 600, 70, 80, 0, -90, 30).slice(1),
  ].map(s);
}
/** Back half against a fold at x = 0 (CCW), fold edge (0,540)→(0,0). */
function backHalf(k = 1): PtMm[] {
  const s = (p: PtMm) => ({ x: p.x * k, y: p.y * k });
  return [
    { x: 0, y: 0 },
    { x: 220, y: 0 },
    ...arc(220, 560, 60, 180, -90, -180, 40),
    { x: 60, y: 600 },
    ...arc(0, 600, 60, 60, 0, -90, 30).slice(1),
  ].map(s);
}

// ── a tiny synthetic sheet + chain set builder ──────────────────────────────────────────────
type Fx = {
  chains: Chain[];
  classes: LineClass[];
  texts: IRText[];
  families: PieceFamily[];
};
function fx(): Fx & {
  cls: (role: LineClass['role'], label?: string | null) => number;
  chain: (pts: PtMm[], closed: boolean, cls: number) => number;
  text: (s: string, at: PtMm) => number;
} {
  const f: Fx = { chains: [], classes: [], texts: [], families: [] };
  const lengthOf = (pts: PtMm[], closed: boolean) => {
    let L = 0;
    for (let i = 0; i < (closed ? pts.length : pts.length - 1); i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      L += Math.hypot(b.x - a.x, b.y - a.y);
    }
    return L;
  };
  return {
    ...f,
    get chains() {
      return f.chains;
    },
    get classes() {
      return f.classes;
    },
    get texts() {
      return f.texts;
    },
    get families() {
      return f.families;
    },
    cls(role, label = null) {
      const id = f.classes.length;
      f.classes.push({
        id,
        role,
        sizeLabel: label,
        chains: [],
        totalLengthMm: 0,
        evidence: [],
        confidence: 1,
      });
      return id;
    },
    chain(pts, closed, cls) {
      const id = f.chains.length;
      const lengthMm = lengthOf(pts, closed);
      f.chains.push({
        id,
        pts,
        closed,
        ranges: [{ path: id, from: 0, to: pts.length }],
        motif: null,
        style: 0,
        lengthMm,
      });
      f.classes[cls].chains.push(id);
      f.classes[cls].totalLengthMm += lengthMm;
      return id;
    },
    text(s, at) {
      const id = f.texts.length;
      f.texts.push({
        id,
        text: s,
        anchor: at,
        bbox: { minX: at.x, minY: at.y, maxX: at.x + 30, maxY: at.y + 5 },
        fontSizeMm: 5,
        rotationDeg: 0,
        layer: null,
        src: { file: '0', page: 0, op: 0, sub: 0 },
      });
      return id;
    },
  };
}

const RUN3: SizeRun = {
  encoding: 'declared-dash',
  sizes: ['S', 'M', 'L'].map((label, rank) => ({ label, rank, classId: null, file: null })),
  evidence: [],
};
const CARD3: CardSize[] = [
  { sizeId: 11, name: 's_46ta_m', token: 'S', rank: 0 },
  { sizeId: 12, name: 'm_48ta_m', token: 'M', rank: 1 },
  { sizeId: 13, name: 'l_50ta_m', token: 'L', rank: 2 },
];
const SCALE3 = [0.96, 1, 1.04];

function sheetOf(texts: IRText[]): Sheet {
  return {
    id: 0,
    poses: [],
    pairs: [],
    bbox: { minX: -1000, minY: -1000, maxX: 5000, maxY: 5000 },
    missing: [],
    paths: [],
    texts,
    rasters: [],
    styles: [],
    warnings: [],
  };
}
const inside = (p: PtMm, poly: PtMm[]) => {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) r = !r;
  }
  return r;
};

/** One family × 3 sizes: each rank's outline is its own size-class chain; extras are shared. */
function addFamily(
  F: ReturnType<typeof fx>,
  seed: number,
  shape: (k: number) => PtMm[],
  dx: number,
  extras: { pts: PtMm[]; closed: boolean; role: LineClass['role'] }[] = [],
  texts: string[] = [],
  ranks = [0, 1, 2],
) {
  const sizeCls = RUN3.sizes.map(
    (s) =>
      F.classes.find((c) => c.role === 'size' && c.sizeLabel === s.label)?.id ??
      F.cls('size', s.label),
  );
  const move = (p: PtMm) => ({ x: p.x + dx, y: p.y });
  const extraIds = extras.map((e) => {
    const k = F.classes.find((c) => c.role === e.role && c.sizeLabel == null)?.id ?? F.cls(e.role);
    return F.chain(e.pts.map(move), e.closed, k);
  });
  const textIds = texts.map((t, i) => F.text(t, move({ x: 60, y: 200 + i * 12 })));
  const cands: PieceCandidate[] = ranks.map((r) => {
    const outer = shape(SCALE3[r]).map(move);
    const wall = F.chain(outer, true, sizeCls[r]);
    return {
      seed,
      rank: r,
      outer,
      walls: [wall],
      inside: extraIds.filter((id) => F.chains[id].pts.every((p) => inside(p, outer))),
      textsInside: textIds,
      outcome: 'closed',
      areaMm2: areaOf(outer),
      bbox: bboxOf(outer),
      sourceCoverage: 1,
      p95Mm: 0,
    };
  });
  F.families.push({ seed, candidates: cands, monotone: true });
}

const SCOPE = {
  scopeKey: 'main',
  fabricPurpose: 'main',
  bomLineKey: '',
  label: 'main',
  isInterlining: false,
};
const SOURCE: ManifestSource = {
  files: [{ name: 'probe', sha256: '0'.repeat(64), bytes: 0, kind: 'pdf', pages: 1 }],
  scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
  sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
  sizeEncoding: 'declared-dash',
  variant: null,
};

async function gate(
  pieces: PieceSpec[],
  map: SizeMap,
  wallsOf: (id: string, rank: number) => PtMm[][] | undefined,
  src = SOURCE,
  dialect: WriteJob['dialect'] = 'r2000',
  openFolds?: string[],
) {
  const sizes: ManifestSize[] = map.entries.flatMap((e) =>
    e.card
      ? [
          {
            token: e.card.token,
            sizeId: e.card.sizeId,
            name: e.card.name,
            sourceLabel: e.source.label,
            rank: e.card.rank,
          },
        ]
      : [],
  );
  const job: WriteJob = {
    techCardId: 1,
    scope: SCOPE,
    pieces: pieces.map((p) => ({ ...p, fabrics: ['main'] })),
    sizes,
    source: src,
    generator: 'patimport:semantics',
    dialect,
  };
  const tokens = new Set(
    [
      ...map.entries.flatMap((e) => (e.card ? [e.card.token] : [])),
      ...map.unmapped.map((c) => c.token),
    ].map((t) => t.toLowerCase()),
  );
  return writeAndGate(job, {
    rules,
    sizeTokens: tokens,
    wallsOf,
    now: () => new Date(0),
    ...(openFolds ? { openFolds } : {}),
  });
}

const CUT10: AllowanceDecision = {
  meaning: 'cut',
  allowanceMm: 10,
  origin: 'operator',
  evidence: [],
};
const SEAM10: AllowanceDecision = {
  meaning: 'seam',
  allowanceMm: 10,
  origin: 'operator',
  evidence: [],
};

function input(
  F: ReturnType<typeof fx>,
  fileAllowance: AllowanceDecision,
  extra: Partial<SemanticsInput> = {},
): SemanticsInput {
  const set: ChainSet = {
    chains: F.chains,
    classes: F.classes,
    bundles: [],
    orphans: [],
    warnings: [],
  };
  return {
    sheet: sheetOf(F.texts),
    set,
    run: RUN3,
    sizeMap: proposeSizeMap(RUN3, CARD3),
    families: F.families,
    fileAllowance,
    pieceOverrides: {},
    operatorGrain: {},
    ...extra,
  };
}

const grainLine = (x: number, y0: number, y1: number) => [
  { x, y: y0 },
  { x, y: (y0 + y1) / 2 },
  { x, y: y1 },
];

// ═════════════════════════════════════════════════════════════════════════════════════════
export async function main(): Promise<number> {
  const json: Record<string, unknown> = {};

  // ── A ─────────────────────────────────────────────────────────────────────────────────
  head('A  offsetContour (clipper-based)');
  {
    const sq = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const r = offsetContour(sq, 10);
    const want = 100 * 100 + 4 * 100 * 10 + Math.PI * 100;
    const b = bboxOf(r.pts);
    ck(
      Math.abs(areaOf(r.pts) - want) / want < 1e-3 &&
        Math.abs(b.minX + 10) < 1e-3 &&
        Math.abs(b.maxX - 110) < 1e-3,
      'square +10 mm: area & bbox analytic',
      `${areaOf(r.pts).toFixed(2)} vs ${want.toFixed(2)} mm², bbox ${b.minX}..${b.maxX}`,
    );
    const ri = offsetContour(sq, -10);
    ck(
      Math.abs(areaOf(ri.pts) - 6400) < 0.01 && ri.report.ok,
      'square −10 mm: 80×80',
      areaOf(ri.pts).toFixed(3),
    );
    const B = bodice();
    const ro = offsetContour(B, 10);
    ck(
      ro.report.ok && ro.report.loops === 1 && !ro.report.selfIntersects,
      'concave bodice +10: one loop, simple',
      JSON.stringify(ro.report),
    );
    ck(
      ro.report.hullRatio < 0.995 && ro.report.hullRatio < ro.sourceHullRatio + 0.05,
      'concave bodice keeps armhole/neckline (no hull)',
      `hull ratio ${ro.report.hullRatio.toFixed(4)} (source ${ro.sourceHullRatio.toFixed(4)})`,
    );
    ck(
      ro.report.maxDeviationMm <= 0.05,
      'bodice +10 is a true parallel',
      `${ro.report.maxDeviationMm.toFixed(4)} mm`,
    );
    const hull = convexHull(ro.pts);
    ck(
      hullRatio(hull) >= 0.995 && hullRatio(B) < 0.995,
      'negative control: the hull of it would read as collapsed',
      `${hullRatio(hull).toFixed(4)}`,
    );
    ck(
      hullRatio(B) < 0.99,
      'the bodice is concave enough for the hull test (< 0.99)',
      `${hullRatio(B).toFixed(4)}`,
    );
    // I2: a 30 × 200 mm strip with two 6 mm deep V notches cut in (kombinezon's straps, hull ratio
    // between 0.99 and 0.995): the bays are narrower than 2 × 10 mm, so the true +10 parallel fills
    // them and turns convex — not a collapse.
    const strip = [
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 96 },
      { x: 24, y: 100 },
      { x: 30, y: 104 },
      { x: 30, y: 200 },
      { x: 0, y: 200 },
      { x: 0, y: 54 },
      { x: 6, y: 50 },
      { x: 0, y: 46 },
    ];
    const rs = offsetContour(strip, 10);
    ck(
      rs.report.ok &&
        rs.report.maxDeviationMm <= 0.05 &&
        rs.sourceHullRatio < 0.995 &&
        rs.sourceHullRatio >= 0.99,
      'notched strip +10: bays fill, true parallel, not a hull collapse',
      `source hull ${rs.sourceHullRatio.toFixed(4)} → ${rs.report.hullRatio.toFixed(4)}, dev ${rs.report.maxDeviationMm.toFixed(4)} mm${rs.report.reason ? ` · ${rs.report.reason}` : ''}`,
    );
    const rin = offsetContour(B, -10);
    ck(
      rin.report.ok && rin.report.maxDeviationMm <= 0.05,
      'bodice −10 (cut → seam) is a true parallel',
      `${rin.report.maxDeviationMm.toFixed(4)} mm`,
    );
    // a waist: inset by more than half the neck splits the outline → topology
    const waist = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 110, y: 100 },
      { x: 110, y: 150 },
      { x: 200, y: 150 },
      { x: 200, y: 250 },
      { x: 0, y: 250 },
      { x: 0, y: 150 },
      { x: 90, y: 150 },
      { x: 90, y: 100 },
      { x: 0, y: 100 },
    ];
    const rw = offsetContour(waist, -15);
    ck(
      !rw.report.ok && rw.report.loops >= 2,
      'negative control: inset through a 20 mm neck → topology change',
      rw.report.reason ?? '',
    );
    json.offset = { square: r.report, bodice: ro.report, bodiceIn: rin.report, waist: rw.report };
  }

  // ── B ─────────────────────────────────────────────────────────────────────────────────
  head('B  seam allowance from text (EN/DE/RU/FR/NL/PL/DA/ES/IT)');
  {
    const cases: [string, boolean | null, number | null][] = [
      ['1/2" seam allowances (SA\'s) included unless stated otherwise.', true, 12.7],
      ['All Patterns are without seam allowances, unless otherwise indicated', false, null],
      ['1 cm seam allowance included.', true, 10],
      ['Nahtzugaben sind enthalten (1 cm).', true, 10],
      ['Schnitt ohne Nahtzugaben. Nahtzugabe 1,5 cm zugeben, Saum 4 cm.', false, 15],
      ['Припуски на швы включены 1 см', true, 10],
      ['Выкройка без припусков на швы', false, null],
      ['На швы и по срезам — 1,5 см, на подгибку низа ... 4 см', false, 15],
      ['Marges de couture comprises (1 cm)', true, 10],
      ['Patron sans marges de couture', false, null],
      ['Naadtoeslag inbegrepen', true, null],
      ['zonder naadtoeslag', false, null],
      ['Wykrój z zapasami na szwy 1 cm', true, 10],
      ['Resten af mønsteret klippes med 1 cm sømrum. (3 cm hem included)', false, 10],
      ['Margen de costura incluido de 1 cm', true, 10],
      ['Hem 3 cm', null, null],
    ];
    for (const [t, inc, mm] of cases) {
      const d = allowanceFromTexts([t]).decision;
      const r = d && {
        included: d.meaning === 'cut',
        allowanceMm: d.evidence.some((e) => e.startsWith('no amount')) ? null : d.allowanceMm,
      };
      const ok = inc == null ? r == null : !!r && r.included === inc && r.allowanceMm === mm;
      ck(
        ok,
        `«${t.slice(0, 60)}»`,
        r ? `${r.included ? 'included' : 'to add'} ${r.allowanceMm ?? '?'} mm` : 'no statement',
      );
    }
    ck(
      readAllowanceText('Patron sans marges de couture')?.included === false,
      'readAllowanceText: one statement',
    );
    // the real sheets
    const truth = JSON.parse(fs.readFileSync(path.join(CORPUS, 'truth.json'), 'utf8')) as {
      samples: {
        id: string;
        files: string[];
        seam_allowance: { included: boolean | string; mm: unknown; source_quote?: string | null };
      }[];
    };
    const pdfRows: unknown[] = [];
    for (const s of truth.samples) {
      const file = s.files[0];
      const full = path.join(CORPUS, file);
      if (!fs.existsSync(full)) continue;
      let texts: string[] = [];
      try {
        const doc = await extractPdf(
          { id: '0', name: path.basename(file), bytes: ab(full) },
          DEFAULT_EXTRACT_OPTS,
        );
        texts = doc.pages.flatMap((p) => p.texts.map((t) => t.text));
      } catch (e) {
        ck(false, `${s.id}: extract`, String(e));
        continue;
      }
      const got = allowanceFromTexts(texts).decision;
      const inc = s.seam_allowance.included;
      // known only when the sheet itself says it (truth quotes it); conventions are not text
      const wantKnown = (inc === true || inc === false) && !!s.seam_allowance.source_quote;
      const wantMm =
        typeof s.seam_allowance.mm === 'number' ? (s.seam_allowance.mm as number) : null;
      let ok: boolean;
      let detail: string;
      if (!got) {
        ok = !wantKnown || texts.join('').length < 50; // no text layer (leonie scan, wm strokes) is honest
        detail = `no statement found (${texts.length} text items)${wantKnown ? ` — truth: ${inc ? 'included' : 'without'}` : ''}`;
      } else {
        const gotInc = got.meaning === 'cut';
        ok = !wantKnown
          ? true
          : gotInc === inc &&
            (wantMm == null || !gotInc || Math.abs(got.allowanceMm - wantMm) < 0.5) &&
            (wantMm == null || gotInc || Math.abs(got.allowanceMm - wantMm) < 0.5);
        detail = `${got.meaning === 'cut' ? 'included' : 'to add'} ${got.allowanceMm} mm · truth ${String(inc)} ${String(s.seam_allowance.mm)} · ${got.evidence[0].slice(0, 90)}`;
      }
      ck(ok, `${s.id}`, detail);
      pdfRows.push({ id: s.id, got, truth: s.seam_allowance, ok });
    }
    json.allowancePdf = pdfRows;
  }

  // ── C ─────────────────────────────────────────────────────────────────────────────────
  head('C  proposeSizeMap: corpus runs × card runs');
  {
    const card = (names: string[], base = 100): CardSize[] =>
      names.map((n, rank) => ({
        sizeId: base + rank,
        name: n,
        token: n.split('_')[0].toUpperCase(),
        rank,
      }));
    const CARDS: Record<string, CardSize[]> = {
      'letters XS–XXL (RU 44–54)': card(
        ['xs_44ta_m', 's_46ta_m', 'm_48ta_m', 'l_50ta_m', 'xl_52ta_m', 'xxl_54ta_m'],
        100,
      ),
      'letters XS–XL (no numbers)': card(['xs', 's', 'm', 'l', 'xl'], 200),
      'DE 34–46': card(['34', '36', '38', '40', '42', '44', '46'], 300),
      'UK 6–16': card(['6', '8', '10', '12', '14', '16'], 400),
    };
    const run = (labels: string[], enc: SizeRun['encoding'] = 'declared-dash'): SizeRun => ({
      encoding: enc,
      sizes: labels.map((label, rank) => ({ label, rank, classId: null, file: null })),
      evidence: [],
    });
    // corpus runs (truth.json) + the DXF runs
    const RUNS: Record<string, { run: SizeRun; expect: Record<string, string> }> = {
      'reef XS–5XL': {
        run: run(['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL']),
        expect: {
          'letters XS–XXL (RU 44–54)': 'XS:XS S:S M:M L:L XL:XL 2XL:XXL 3XL:- 4XL:- 5XL:-',
        },
      },
      'robe/leonie 36–46': {
        run: run(['36', '38', '40', '42', '44', '46']),
        expect: { 'DE 34–46': '36:36 38:38 40:40 42:42 44:44 46:46' },
      },
      'viola 34–48': {
        run: run(['34', '36', '38', '40', '42', '44', '46', '48']),
        expect: { 'DE 34–46': '34:34 36:36 38:38 40:40 42:42 44:44 46:46 48:-' },
      },
      'palto 72–88 (tall)': {
        run: run(['72', '76', '80', '84', '88']),
        expect: { 'DE 34–46': '72:36 76:38 80:40 84:42 88:44' },
      },
      'kombinezon UK 6–20': {
        run: run(['6', '8', '10', '12', '14', '16', '18', '20']),
        expect: {
          'UK 6–16': '6:6 8:8 10:10 12:12 14:14 16:16 18:- 20:-',
          'letters XS–XL (no numbers)': '6:- 8:- 10:- 12:- 14:- 16:- 18:- 20:-',
        },
      },
      'redcafe/r4454/polupalto 44–54': {
        run: run(['44', '46', '48', '50', '52', '54'], 'file-per-size'),
        expect: {
          'letters XS–XXL (RU 44–54)': '44:XS 46:S 48:M 50:L 52:XL 54:XXL',
          'DE 34–46': '44:44 46:46 48:- 50:- 52:- 54:-',
        },
      },
      'wm XS–XXXL': {
        run: run(['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'], 'file-per-size'),
        expect: { 'letters XS–XXL (RU 44–54)': 'XS:XS S:S M:M L:L XL:XL XXL:XXL XXXL:-' },
      },
      'blazer M': { run: run(['M'], 'single'), expect: { 'letters XS–XL (no numbers)': 'M:M' } },
      'CLO DXF XS–XL': {
        run: run(['XS', 'S', 'M', 'L', 'XL'], 'dxf-block'),
        expect: {
          'letters XS–XL (no numbers)': 'XS:XS S:S M:M L:L XL:XL',
          'letters XS–XXL (RU 44–54)': 'XS:XS S:S M:M L:L XL:XL',
        },
      },
      'zhaket 5 unlabelled': {
        run: run(['1', '2', '3', '4', '5']),
        expect: { 'letters XS–XL (no numbers)': '1:XS 2:S 3:M 4:L 5:XL' },
      },
    };
    const table: unknown[] = [];
    for (const [rn, { run: r, expect }] of Object.entries(RUNS)) {
      for (const [cn, c] of Object.entries(CARDS)) {
        const m = proposeSizeMap(r, c);
        const got = m.entries.map((e) => `${e.source.label}:${e.card?.token ?? '-'}`).join(' ');
        const conf = m.entries
          .map((e) => (e.card ? (e.confidence ?? 0).toFixed(2) : '–'))
          .join(' ');
        const silent = m.entries.some((e) => !e.card && !(e.evidence ?? []).length);
        const injective =
          new Set(m.entries.flatMap((e) => (e.card ? [e.card.sizeId] : []))).size ===
          m.entries.filter((e) => e.card).length;
        const want = expect[cn];
        if (want)
          ck(
            got === want && !silent && injective,
            `${rn} → ${cn}`,
            `${got}  [${conf}]  ask ${needsConfirmation(m).length}`,
          );
        else ck(!silent && injective, `${rn} → ${cn} (explicit, injective)`, `${got}  [${conf}]`);
        table.push({
          run: rn,
          card: cn,
          got,
          conf,
          unmapped: m.unmapped.map((u) => u.token),
          ask: needsConfirmation(m).length,
        });
      }
    }
    // the card's own sizeTokensOf, injected (lib must not import components — the probe may)
    const injected = createProposeSizeMap({
      tokensOf: (c) => [c.token, ...blockCode.sizeTokensOf(c.name)],
    });
    const m = injected(
      RUNS['redcafe/r4454/polupalto 44–54'].run,
      CARDS['letters XS–XXL (RU 44–54)'],
    );
    ck(
      m.entries.every((e) => e.card && e.confidence === 0.9),
      'injected block-code sizeTokensOf: 44 → XS (xs_44ta_m)',
      m.entries.map((e) => `${e.source.label}:${e.card?.token}`).join(' '),
    );
    json.sizeMap = table;
  }

  // ── D ─────────────────────────────────────────────────────────────────────────────────
  head('D1 seam-only concave bodice: cut = seam + 10 mm (G6), no hull');
  {
    const F = fx();
    addFamily(
      F,
      1,
      bodice,
      0,
      [{ pts: grainLine(120, 100, 450), closed: false, role: 'grain' }],
      ['FRONT'],
    );
    // D3: no quantity printed on an asymmetric outline → a PAIR is suggested, unproven
    const d0 = buildPieceSpecsDetailed(input(F, SEAM10));
    const q0 = d0.output.unproven.find((u) => u.kind === 'quantity');
    ck(
      d0.output.pieces.map((x) => x.identity).join(',') === 'FP_L,FP_R' && q0?.shown === 'pair×1',
      'D3: no "cut n", asymmetric outline → pair suggested (FP_L + FP_R), quantity unproven',
      `${d0.output.pieces.map((x) => x.identity)} ${JSON.stringify(q0)}`,
    );
    ck(
      !d0.output.unproven.some((u) => u.kind === 'allowance' || u.kind === 'name'),
      'D3: operator allowance and the title «FRONT» → no allowance / name question',
      JSON.stringify(d0.output.unproven),
    );
    // the operator answers "single": that is the piece's count now (proven)
    const d = buildPieceSpecsDetailed(
      input(F, SEAM10, { pieceOverrides: { 1: { pairHand: null } } }),
    );
    ck(
      d.output.pieces.length === 1 &&
        d.output.blocked.length === 0 &&
        !d.output.unproven.some((u) => u.kind === 'quantity'),
      'one piece, nothing blocked (operator: single — no question left)',
      JSON.stringify(d.output.blocked),
    );
    const p = d.output.pieces[0];
    ck(
      p?.identity === 'FP' && p.allowance.meaning === 'seam',
      'identity FP from «FRONT», meaning seam',
      `${p?.identity} ${p?.allowance.meaning}`,
    );
    ck(
      p.sizes.every((s) => s.offset?.ok && s.offset.hullRatio < 0.995),
      'offset reports ok, hull < 0.995',
      p.sizes.map((s) => s.offset?.hullRatio.toFixed(4)).join(' '),
    );
    const g = await gate(d.output.pieces, input(F, SEAM10).sizeMap, d.wallsOf);
    const g6 = checkOf(g.report, 'G6-offset');
    ck(g.report.passed, 'gate passes', gateLine(g.report));
    ck(!!g6?.ok && Number(g6.value) <= 0.2, 'G6 deviation ≤ 0.2 mm', `${g6?.value}`);
    // negative control: force the convex hull onto the cut line (with a lying OffsetReport)
    const forced = d.output.pieces.map((s) => ({
      ...s,
      sizes: s.sizes.map((z) => ({
        ...z,
        cut: convexHull(z.cut),
        offset: { ...z.offset!, ok: true, hullRatio: 0.98 },
      })),
    }));
    const gh = await gate(forced, input(F, SEAM10).sizeMap, d.wallsOf);
    ck(
      failing(gh.report).includes('G6-offset'),
      'negative control: hull forced onto the cut → G6 blocks',
      checkOf(gh.report, 'G6-offset')?.note.slice(0, 120) ?? '',
    );
    json.d1 = {
      gate: g.report.checks.map((c) => [c.id, c.ok, c.value]),
      forced: failing(gh.report),
    };
  }

  head('D2 fold → unfold (layer-8 fold line, area ×2, symmetric)');
  {
    // a) fold line given (AAMA mirror line / labelled fold), cut meaning: seam = cut − 10
    const F = fx();
    addFamily(
      F,
      1,
      backHalf,
      0,
      [{ pts: grainLine(100, 80, 420), closed: false, role: 'grain' }],
      ['BACK', 'CUT 1 ON FOLD'],
    );
    const inp0 = input(F, CUT10);
    // E1a (D3): a label «CUT 1 ON FOLD» says nothing about WHICH edge — the piece is asked, with
    // the straight edge on x = 0 (along the grain) as the suggestion; the operator's pick unfolds
    const d0 = buildPieceSpecsDetailed(inp0);
    const ask = d0.output.folds?.[0];
    const sug = ask && ask.suggested != null ? ask.edges[ask.suggested] : null;
    ck(
      !d0.output.pieces.length &&
        d0.output.blocked[0]?.reason === 'fold-question' &&
        !!sug &&
        Math.abs(sug.a.x) < 1e-6 &&
        Math.abs(sug.b.x) < 1e-6,
      'label-only «CUT 1 ON FOLD» → fold question, suggested edge x = 0',
      JSON.stringify({ blocked: d0.output.blocked, sug }),
    );
    const inp: typeof inp0 = { ...inp0, operatorFold: sug ? { 1: { a: sug.a, b: sug.b } } : {} };
    const d = buildPieceSpecsDetailed(inp);
    const p = d.output.pieces[0];
    ck(
      !!p && p.unfoldedFold && p.identity === 'BP',
      'BP unfolded across the picked edge',
      `${p?.identity} unfolded=${p?.unfoldedFold} ${JSON.stringify(d.output.blocked)}`,
    );
    // a fold word printed ALONG the edge (rotated 90°, 6 mm off it) is bound: unfolds by itself
    {
      const G = fx();
      addFamily(
        G,
        1,
        backHalf,
        0,
        [{ pts: grainLine(100, 80, 420), closed: false, role: 'grain' }],
        ['BACK'],
      );
      const id = G.text('PLACE ON FOLD', { x: 4, y: 300 });
      G.texts[id] = {
        ...G.texts[id],
        rotationDeg: 90,
        bbox: { minX: 4, minY: 300, maxX: 9, maxY: 360 },
      };
      for (const c of G.families[0].candidates) c.textsInside.push(id);
      const db = buildPieceSpecsDetailed(input(G, CUT10));
      const pb = db.output.pieces[0];
      ck(
        !!pb && pb.unfoldedFold && pb.sizes.every((z) => !!z.fold && Math.abs(z.fold.a.x) < 1e-6),
        'fold word along the x = 0 edge → unfolded without a question',
        `${pb?.unfoldedFold} ${JSON.stringify(db.output.blocked)}`,
      );
    }
    // negative: a fold word that labels ANOTHER line (palto 22) never unfolds by itself
    {
      const G = fx();
      addFamily(
        G,
        1,
        backHalf,
        0,
        [
          { pts: grainLine(100, 80, 420), closed: false, role: 'grain' },
          {
            pts: [
              { x: 160, y: 0 },
              { x: 160, y: 300 },
            ],
            closed: false,
            role: 'internal',
          },
        ],
        ['BACK'],
      );
      const id = G.text('facing fold', { x: 150, y: 120 });
      G.texts[id] = {
        ...G.texts[id],
        rotationDeg: 90,
        bbox: { minX: 150, minY: 120, maxX: 155, maxY: 170 },
      };
      for (const c of G.families[0].candidates) c.textsInside.push(id);
      const dn = buildPieceSpecsDetailed(input(G, CUT10));
      ck(
        !dn.output.pieces.some((x) => x.unfoldedFold),
        'fold word labelling an internal line → not unfolded',
        `${JSON.stringify(dn.output.blocked)} ${dn.output.pieces.map((x) => x.unfoldedFold)}`,
      );
    }
    for (const s of p?.sizes ?? []) {
      const half = backHalf(SCALE3[s.rank]);
      const err = unfoldAreaError(half, s.cut);
      const b = bboxOf(s.cut);
      ck(
        err <= 0.001 && Math.abs(b.minX + b.maxX) < 0.01,
        `${s.sizeToken}: area = 2 × half ±0.1 %, symmetric about the fold`,
        `${(err * 100).toFixed(4)} %, x ${b.minX.toFixed(2)}..${b.maxX.toFixed(2)}`,
      );
      ck(
        !!s.fold && Math.abs(s.fold.a.x) < 1e-6 && Math.abs(s.fold.b.x) < 1e-6,
        `${s.sizeToken}: fold line kept on x = 0`,
        JSON.stringify(s.fold && [s.fold.a, s.fold.b]),
      );
    }
    const g = await gate(d.output.pieces, inp.sizeMap, d.wallsOf);
    ck(
      g.report.passed,
      'gate passes (fold ends on the cut line, written as ≥3-vertex L8)',
      gateLine(g.report),
    );
    // negative controls (E1a): a fold line that is not the mirror axis, and an open fold question
    const skew = d.output.pieces.map((x) => ({
      ...x,
      sizes: x.sizes.map((z) => ({
        ...z,
        fold: z.fold && { ...z.fold, b: { x: z.fold.b.x + 40, y: z.fold.b.y } },
      })),
    }));
    const gs = await gate(skew, inp.sizeMap, d.wallsOf);
    ck(
      failing(gs.report).includes('G6-offset'),
      'negative control: fold line off the mirror axis → G6 blocks',
      checkOf(gs.report, 'G6-offset')?.note.slice(0, 120) ?? '',
    );
    const go = await gate(d.output.pieces, inp.sizeMap, d.wallsOf, SOURCE, 'r2000', [
      'piece 7: «fold» with no edge',
    ]);
    ck(
      failing(go.report).includes('G6-offset'),
      'negative control: an open fold question → G6 blocks the file',
      checkOf(go.report, 'G6-offset')?.note.slice(0, 120) ?? '',
    );
    // b) seam meaning + fold: unfold FIRST, then +10 (fold edge gets 0 allowance)
    const d2 = buildPieceSpecsDetailed({ ...input(F, SEAM10), operatorFold: inp.operatorFold });
    const p2 = d2.output.pieces[0];
    const s2 = p2.sizes[1];
    const seamW = bboxOf(s2.seam!);
    const cutW = bboxOf(s2.cut);
    ck(
      Math.abs(cutW.maxX - cutW.minX - (seamW.maxX - seamW.minX) - 20) < 0.05,
      'seam meaning: unfolded then offset — no allowance at the fold',
      `cut width ${(cutW.maxX - cutW.minX).toFixed(2)} vs seam ${(seamW.maxX - seamW.minX).toFixed(2)}`,
    );
    const g2 = await gate(d2.output.pieces, inp.sizeMap, d2.wallsOf);
    ck(g2.report.passed, 'gate passes (seam meaning + fold)', gateLine(g2.report));
    // c) operator says not on fold → stays half
    const d3 = buildPieceSpecsDetailed({ ...inp, pieceOverrides: { 1: { unfoldedFold: false } } });
    ck(!d3.output.pieces[0].unfoldedFold, 'operator unfoldedFold:false keeps the half');
    json.d2 = {
      gate: g.report.checks.map((c) => [c.id, c.ok, c.value]),
      seamGate: g2.report.passed,
    };
  }

  head('D2l cutting list binds each "cut on fold" entry to ITS piece (Codex S5)');
  {
    // BACK and FRONT drawn as unmarked halves; CUFF and WAISTBAND unfold from a word along their
    // fold edge. The list names 1 BACK and 2 FRONT: 2 entries = 2 unfolds, which the old COUNT
    // check took as satisfied — the halves passed. Bound, BACK and FRONT are asked.
    const build = (docTexts: string[], extra: Partial<SemanticsInput> = {}) => {
      const G = fx();
      // addFamily moves the extras by the family's dx itself
      const grain = (_dx: number) => [
        { pts: grainLine(100, 80, 420), closed: false, role: 'grain' as const },
      ];
      addFamily(G, 1, backHalf, 0, grain(0), ['BACK']);
      addFamily(G, 2, backHalf, 600, grain(600), ['FRONT']);
      addFamily(G, 3, backHalf, 1200, grain(1200), ['CUFF']);
      addFamily(G, 4, backHalf, 1800, grain(1800), ['WAISTBAND']);
      for (const [k, dx] of [
        [2, 1200],
        [3, 1800],
      ] as const) {
        const id = G.text('PLACE ON FOLD', { x: dx + 4, y: 300 });
        G.texts[id] = {
          ...G.texts[id],
          rotationDeg: 90,
          bbox: { minX: dx + 4, minY: 300, maxX: dx + 9, maxY: 360 },
        };
        for (const c of G.families[k].candidates) c.textsInside.push(id);
      }
      return buildPieceSpecsDetailed(input(G, CUT10, { docTexts, ...extra })).output;
    };
    const o = build(['1 BACK cut on fold', '2 FRONT cut on fold']);
    const unfolded = (seed: number) => o.pieces.some((x) => x.seed === seed && x.unfoldedFold);
    const asked = (seed: number) =>
      o.blocked.some((b) => b.seed === seed && b.reason === 'fold-question');
    ck(
      unfolded(3) && unfolded(4),
      'CUFF and WAISTBAND unfold from the word along their edge',
      o.pieces.map((x) => `${x.identity}:${x.unfoldedFold}`).join(' '),
    );
    ck(
      asked(1) && asked(2) && !o.pieces.some((x) => x.seed === 1 || x.seed === 2),
      'BACK and FRONT (listed, drawn as halves) are asked — 2 entries vs 2 other unfolds is no answer',
      JSON.stringify(o.blocked),
    );
    ck(
      (o.folds ?? []).some((q) => q.seed === 1 && q.evidence.some((e) => e.includes('1 BACK'))) &&
        !o.foldList,
      'the question quotes its list entry; every entry is bound, no file-level check',
      JSON.stringify({ folds: o.folds?.map((q) => [q.seed, q.evidence]), list: o.foldList }),
    );
    // an entry no piece on the sheet matches stays a file-level question until seen and checked
    const u = build(['1 BACK cut on fold', '5 COLLAR cut on fold'], {
      operatorFold: {},
      pieceOverrides: { 1: { unfoldedFold: false } },
    });
    ck(
      !!u.foldList &&
        u.foldList.entries.length === 1 &&
        u.foldList.entries[0].includes('COLLAR') &&
        u.foldList.bound.some((b) => b.seed === 1),
      'unbound «5 COLLAR» stays open (named); «1 BACK» answered "not a fold" on its piece',
      JSON.stringify(u.foldList),
    );
    const v = build(['1 BACK cut on fold', '5 COLLAR cut on fold'], {
      pieceOverrides: { 1: { unfoldedFold: false } },
      foldListChecked: ['5 COLLAR cut on fold'],
    });
    ck(!v.foldList, 'checked after seeing «5 COLLAR» named → closed', JSON.stringify(v.foldList));
    const w = build(['1 BACK cut on fold', '5 COLLAR cut on fold', '6 YOKE cut on fold'], {
      pieceOverrides: { 1: { unfoldedFold: false } },
      foldListChecked: ['5 COLLAR cut on fold'],
    });
    ck(
      !!w.foldList && w.foldList.entries.some((e) => e.includes('YOKE')),
      'a new unbound entry asks again',
      JSON.stringify(w.foldList?.entries),
    );
    // T4: a 3-digit piece number (the seeds' grammar) binds; a list-shaped line the grammar
    // cannot read is never dropped — it stays a named file-level entry
    const t3 = build(['123 BACK cut on fold'], { seedLabels: { 1: '123' } });
    ck(
      (t3.folds ?? []).some(
        (q) => q.seed === 1 && q.evidence.some((e) => e.includes('123 BACK')),
      ) && !t3.foldList,
      '«123 BACK cut on fold» binds to the piece labelled 123 (3-digit number, as seeds read it)',
      JSON.stringify({ folds: t3.folds?.map((q) => [q.seed, q.evidence]), list: t3.foldList }),
    );
    const t4 = build(['1234 BACK cut on fold'], { seedLabels: { 1: '1234' } });
    ck(
      !!t4.foldList &&
        t4.foldList.entries.includes('1234 BACK cut on fold') &&
        !t4.foldList.bound.length,
      'an unparseable list-shaped fold line («1234 BACK …») stays an unbound file-level entry',
      JSON.stringify(t4.foldList),
    );
    // R5: bullets and piece words before the number; a structural backstop for the rest
    for (const line of ['• 123 BACK cut on fold', 'Piece 123 BACK cut on fold']) {
      const r = build([line], { seedLabels: { 1: '123' } });
      ck(
        (r.folds ?? []).some((q) => q.seed === 1 && q.evidence.some((e) => e.includes(line))) &&
          !r.foldList,
        `«${line}» binds to the piece labelled 123`,
        JSON.stringify({ folds: r.folds?.map((q) => [q.seed, q.evidence]), list: r.foldList }),
      );
    }
    const nn = build(['Back: cut on fold']);
    ck(
      !!nn.foldList &&
        nn.foldList.entries.includes('Back: cut on fold') &&
        !nn.foldList.bound.length,
      'a fold line with no number («Back: cut on fold») stays an unbound file-level entry',
      JSON.stringify(nn.foldList),
    );
    const cs = build(['PLACE ON FOLD']);
    ck(
      !cs.foldList,
      'a fold line a piece already took as its own evidence («PLACE ON FOLD» on CUFF) is no entry',
      JSON.stringify(cs.foldList),
    );
  }

  head('D2q a pair suggested by asymmetry, with a long straight edge: "cut on fold" offered (E4)');
  {
    const G = fx();
    addFamily(
      G,
      1,
      backHalf,
      0,
      [{ pts: grainLine(100, 80, 420), closed: false, role: 'grain' }],
      ['BACK'],
    );
    const o = buildPieceSpecsDetailed(input(G, CUT10)).output;
    const q = o.unproven.find((u) => u.seed === 1 && u.kind === 'quantity');
    ck(
      !!q && q.shown.startsWith('pair') && q.foldAlt === true && !o.pieces[0]?.unfoldedFold,
      'quantity question suggests a pair, flags "cut on fold" as the alternative, unfolds nothing',
      JSON.stringify(q),
    );
    const f = buildPieceSpecsDetailed(
      input(G, CUT10, { pieceOverrides: { 1: { unfoldedFold: true } } }),
    ).output;
    const ask = f.folds?.find((x) => x.seed === 1);
    const e = ask && ask.suggested != null ? ask.edges[ask.suggested] : null;
    const g = buildPieceSpecsDetailed(
      input(G, CUT10, {
        pieceOverrides: { 1: { unfoldedFold: true } },
        operatorFold: e ? { 1: { a: e.a, b: e.b } } : {},
      }),
    ).output;
    ck(
      !!e &&
        Math.abs(e.a.x) < 1e-6 &&
        !!g.pieces[0]?.unfoldedFold &&
        !g.unproven.some((u) => u.seed === 1 && u.kind === 'quantity'),
      '"cut on fold" → fold question (edge x = 0 suggested) → unfolded, count answered (×1)',
      JSON.stringify({
        e,
        pieces: g.pieces.map((x) => [x.identity, x.unfoldedFold, x.piecesPerGarment]),
      }),
    );
  }

  head('D3 "cut 2" asymmetric piece → _L + mirror _R (G12)');
  {
    const F = fx();
    addFamily(
      F,
      1,
      bodice,
      0,
      [{ pts: grainLine(120, 100, 450), closed: false, role: 'grain' }],
      ['Vorderteil', 'Cut 2'],
    );
    const inp = input(F, CUT10);
    const d = buildPieceSpecsDetailed(inp);
    const ids = d.output.pieces.map(
      (p) => `${p.identity}(${p.pairHand}→${p.pairOf}, ×${p.piecesPerGarment})`,
    );
    ck(
      d.output.pieces.length === 2 &&
        d.output.pieces[0].identity === 'FP_L' &&
        d.output.pieces[1].identity === 'FP_R',
      'two identities FP_L / FP_R',
      ids.join(' '),
    );
    ck(
      d.output.pieces.every((p) => p.piecesPerGarment === 1),
      'ppg 1 per hand',
    );
    const [L, R] = d.output.pieces;
    const mirrorOk = L.sizes.every((s, i) => {
      const T = reflection(s.grain!.a, s.grain!.b);
      const m = s.cut.map((q) => applyAffine(T, q));
      const idx = new SegIndex([{ pts: R.sizes[i].cut, closed: true }], 5);
      return Math.max(...sampleAlong(m, true, 2).map((q) => idx.nearest(q, 5))) < 1e-6;
    });
    ck(mirrorOk, '_R is the exact mirror of _L across the grain');
    const g = await gate(d.output.pieces, inp.sizeMap, d.wallsOf);
    ck(
      g.report.passed && !!checkOf(g.report, 'G12-pair')?.ok,
      'gate passes incl. G12 and G11 (FP_L declared hand vs size L)',
      `${gateLine(g.report)} · ${checkOf(g.report, 'G12-pair')?.value}`,
    );
    // symmetric piece "cut 2" → 2 identical, no pair
    const F2 = fx();
    const rect = (k: number) => [
      { x: 0, y: 0 },
      { x: 160 * k, y: 0 },
      { x: 160 * k, y: 180 * k },
      { x: 0, y: 180 * k },
    ];
    addFamily(
      F2,
      1,
      rect,
      0,
      [{ pts: grainLine(80, 30, 150), closed: false, role: 'grain' }],
      ['POCKET', 'cut 2'],
    );
    const d2 = buildPieceSpecsDetailed(input(F2, CUT10));
    ck(
      d2.output.pieces.length === 1 &&
        d2.output.pieces[0].piecesPerGarment === 2 &&
        !d2.output.pieces[0].pairHand,
      'symmetric "cut 2" → PCK ×2, no pair',
      d2.output.pieces.map((p) => `${p.identity}×${p.piecesPerGarment}`).join(' '),
    );
    // operator declares the drawn hand R
    const d3 = buildPieceSpecsDetailed({
      ...inp,
      pieceOverrides: { 1: { pairHand: 'R', piecesPerGarment: 1 } },
    });
    ck(
      d3.output.pieces.map((p) => p.identity).join(',') === 'FP_R,FP_L',
      'operator pairHand R → drawn FP_R + mirrored FP_L',
    );
    json.d3 = { ids, gate: g.report.checks.map((c) => [c.id, c.ok, c.value]) };
  }

  head('D3q what the drawing does not prove is asked (10.10): allowance, title vs note');
  {
    // title labels vs construction notes, on the corpus' own words
    const T = (text: string, x: number, y: number, f = 3.5) => ({
      text,
      fontSizeMm: f,
      anchor: { x, y },
      bbox: { minX: x, minY: y, maxX: x + text.length * f * 0.6, maxY: y + f },
    });
    const box = { minX: 0, minY: 0, maxX: 400, maxY: 600 };
    const title = (t: ReturnType<typeof T>, all: ReturnType<typeof T>[]) =>
      isTitleLabel(t, all, box);
    const front = [T('FRONT', 150, 300, 14)];
    ck(title(front[0], front), 'D3: «FRONT» alone in the piece → its title');
    const palto = [
      T('Tascheneingriff', 50, 200),
      T('Besatz', 250, 100),
      T('Taschenbeutel', 60, 400),
    ];
    ck(
      !palto.some((t) => title(t, palto)),
      'D3: palto front — «Tascheneingriff» (note), «Besatz» vs «Taschenbeutel» (two pieces named) → no title',
    );
    const cb = [T('ЗАДНЯЯ', 100, 300, 3.3), T('СЕРЕДИНА СГИБ', 100, 304.5, 3.3)];
    ck(
      !title(cb[0], cb),
      'D3: «ЗАДНЯЯ» printed over «СЕРЕДИНА СГИБ» is one note (centre back), not «back»',
    );
    const fac = [T('Besatz Umbruch', 100, 100)];
    ck(!title(fac[0], fac), 'D3: «Besatz Umbruch» (facing fold line) → note');
    const back = [T('Спинка со сгибом', 100, 300, 5)];
    ck(title(back[0], back), 'D3: «Спинка со сгибом» → title (on fold is a cut instruction)');
    const wb = [T('Outer Waistband', 100, 100, 4.7), T('CENTRE BACK FOLD', 100, 200)];
    ck(title(wb[0], wb), 'D3: «Outer Waistband» stays the title next to «CENTRE BACK FOLD»');

    // allowance: nothing on the sheet → every written piece asks; the operator's answer closes it
    const F = fx();
    addFamily(
      F,
      1,
      bodice,
      0,
      [{ pts: grainLine(120, 100, 450), closed: false, role: 'grain' }],
      ['Tascheneingriff'],
    );
    const DEFAULT: AllowanceDecision = { ...SEAM10, origin: 'default' };
    const d = buildPieceSpecsDetailed(input(F, DEFAULT));
    const kinds = d.output.unproven
      .map((u) => u.kind)
      .sort()
      .join(',');
    ck(
      kinds === 'allowance,name,quantity',
      'D3: no allowance evidence, a name off a note, no count → three questions on the piece',
      JSON.stringify(d.output.unproven),
    );
    const d2 = buildPieceSpecsDetailed(
      input(F, SEAM10, { pieceOverrides: { 1: { piecesPerGarment: 1, pairHand: null } } }),
    );
    ck(
      d2.output.unproven.map((u) => u.kind).join(',') === 'name',
      'D3: operator allowance + an operator count → only the note name still asks',
      JSON.stringify(d2.output.unproven),
    );
  }

  head('D4 grain: missing → blocked until two clicks; one per block');
  {
    const F = fx();
    addFamily(F, 1, bodice, 0, [], ['FRONT']);
    const inp = input(F, CUT10);
    const d = buildPieceSpecsDetailed(inp);
    ck(
      d.output.pieces.length === 0 && d.output.blocked[0]?.reason === 'no-grain',
      'no grain → blocked no-grain',
      JSON.stringify(d.output.blocked[0]),
    );
    const d2 = buildPieceSpecsDetailed({
      ...inp,
      pieceOverrides: { 1: { pairHand: null } },
      operatorGrain: { 1: { a: { x: 120, y: 100 }, b: { x: 120, y: 400 } } },
    });
    ck(
      d2.output.pieces.length === 1 &&
        d2.output.pieces[0].sizes.every((s) => s.grain?.origin === 'operator'),
      'operator two-click grain → every size has it',
    );
    const g = await gate(d2.output.pieces, inp.sizeMap, d2.wallsOf);
    ck(
      g.report.passed && !!checkOf(g.report, 'G5-features')?.ok,
      'gate passes, G5 grain exactly one per block',
      gateLine(g.report),
    );
  }

  head(
    'D5 PDF-style features: notches crossing the cut, drill, labelled grain, dart, seam-line measure',
  );
  {
    const F = fx();
    const notchAt = (p: PtMm, nx: number, ny: number) => [
      { x: p.x - nx * 3, y: p.y - ny * 3 },
      { x: p.x + nx * 5, y: p.y + ny * 5 },
    ];
    const extras = [
      // notches: across the side seam (x = 250 at S, M, L) and the hem — drawn across ALL sizes
      {
        pts: [
          { x: 235, y: 200 },
          { x: 265, y: 200 },
        ],
        closed: false,
        role: 'common' as const,
      },
      { pts: notchAt({ x: 125, y: 0 }, 0, 1).reverse(), closed: false, role: 'common' as const },
      // drill: a 4 mm circle
      { pts: arc(150, 300, 2, 2, 0, 350, 12), closed: true, role: 'internal' as const },
      // labelled grain (no grain class): a straight line + text «Fadenlauf» on it
      { pts: grainLine(90, 120, 420), closed: false, role: 'internal' as const },
      // dart
      {
        pts: [
          { x: 160, y: 0.5 },
          { x: 175, y: 120 },
          { x: 190, y: 0.5 },
        ],
        closed: false,
        role: 'internal' as const,
      },
    ];
    addFamily(F, 1, bodice, 0, extras, ['FRONT']);
    F.text('Fadenlauf', { x: 92, y: 250 });
    const inp = input(F, CUT10);
    // the notch across the side seam is 30 mm long (crosses all three nested sizes): too long for a
    // single notch chain → only the hem one (8 mm) counts; make the side one per-size short ones
    const d = buildPieceSpecsDetailed(inp);
    const s = d.output.pieces[0]?.sizes[1];
    ck(!!s, 'piece built', JSON.stringify(d.output.blocked));
    if (s) {
      ck(
        s.notches.length === 1 && Math.abs(s.notches[0].at.y) < 1e-6,
        'hem notch found on the cut line (the 30 mm line is not a notch)',
        `${s.notches.length} notch(es)`,
      );
      ck(s.drills.length === 1, 'drill found', `${s.drills.length}`);
      ck(
        s.grain?.origin === 'detected' && Math.abs(s.grain.a.x - 90) < 1e-6,
        'grain from the «Fadenlauf» label',
        JSON.stringify(s.grain && [s.grain.a, s.grain.b]),
      );
      ck(
        s.internal.length === 1 && s.internal[0].pts.length === 3,
        'dart kept as an internal line',
        `${s.internal.length}`,
      );
    }
    const g = await gate(d.output.pieces, inp.sizeMap, d.wallsOf);
    ck(
      g.report.passed && !!checkOf(g.report, 'G5-features')?.ok,
      'gate passes, G5 counts equal',
      gateLine(g.report),
    );
    // nested seam line of the same size (Redcafe-style double contour) → measured 'both'
    const F2 = fx();
    const seamCls = F2.cls('seam');
    addFamily(
      F2,
      1,
      bodice,
      0,
      [{ pts: grainLine(120, 100, 450), closed: false, role: 'grain' }],
      ['FRONT'],
      [1],
    );
    // re-run as a single-size run: the drawn outline is the CUT, a seam loop 8 mm inside
    const outer = F2.families[0].candidates[0].outer;
    const seamLoop = offsetContour(outer, -8).pts;
    const sid = F2.chain(seamLoop, true, seamCls);
    F2.families[0].candidates[0].inside.push(sid);
    const run1: SizeRun = {
      encoding: 'single',
      sizes: [{ label: 'M', rank: 1, classId: null, file: null }],
      evidence: [],
    };
    const inp2: SemanticsInput = {
      ...input(F2, CUT10),
      run: run1,
      sizeMap: proposeSizeMap(run1, CARD3),
    };
    const dec = detectAllowance(inp2.sheet, inp2.families, inp2.set);
    ck(
      dec.origin === 'measured' && dec.meaning === 'both' && Math.abs(dec.allowanceMm - 8) < 0.1,
      'detectAllowance measures the nested seam loop: both, 8 mm',
      JSON.stringify(dec),
    );
    const d2 = buildPieceSpecsDetailed({ ...inp2, fileAllowance: dec });
    const p2 = d2.output.pieces[0];
    ck(
      !!p2 && p2.allowance.meaning === 'both' && p2.sizes[0].offset == null,
      'drawn seam used as is (no offset)',
      JSON.stringify(d2.output.blocked),
    );
    const g2 = await gate(d2.output.pieces, inp2.sizeMap, d2.wallsOf);
    ck(g2.report.passed, 'gate passes (both drawn)', gateLine(g2.report));
  }

  head('D6 names: AI/operator overrides, size token, duplicates, UNI, lining');
  {
    const F = fx();
    addFamily(F, 1, bodice, 0, [{ pts: grainLine(120, 100, 450), closed: false, role: 'grain' }]);
    addFamily(F, 2, bodice, 600, [{ pts: grainLine(120, 100, 450), closed: false, role: 'grain' }]);
    const rect = (k: number) => [
      { x: 0, y: 0 },
      { x: 160 * k, y: 0 },
      { x: 160 * k, y: 180 * k },
      { x: 0, y: 180 * k },
    ];
    addFamily(
      F,
      3,
      () => rect(1),
      1200,
      [{ pts: grainLine(80, 30, 150), closed: false, role: 'grain' }],
      ['Tasche (Futter)'],
      [1],
    );
    const inp = input(F, CUT10, {
      pieceOverrides: {
        1: {
          code: 'SL',
          mods: ['M'],
          nameOrigin: 'ai-auto',
          aiConfidence: 0.91,
          displayName: 'sleeve M',
        },
        2: { code: 'SL', mods: [], nameOrigin: 'operator', pairHand: null },
      },
    });
    const d = buildPieceSpecsDetailed(inp);
    const b1 = d.output.blocked.find((b) => b.seed === 1);
    ck(b1?.reason === 'grammar', 'AI name ending in a size token (SL_M) → grammar', b1?.detail);
    const p3 = d.output.pieces.find((p) => p.seed === 3);
    ck(
      p3?.ungraded === true && p3.identity === 'LIN_PCK',
      'one contour in a 3-size run → ungraded; «Tasche (Futter)» → LIN_PCK',
      `${p3?.identity} ungraded=${p3?.ungraded}`,
    );
    const p2 = d.output.pieces.find((p) => p.seed === 2);
    ck(p2?.nameOrigin === 'operator' && p2.identity === 'SL', 'operator name taken as given');
    const g = await gate(d.output.pieces, inp.sizeMap, d.wallsOf);
    ck(
      g.report.passed && !!g.detail.plan.blocks.find((b) => b.name === 'LIN_PCK_UNI'),
      'gate passes, UNI written as LIN_PCK_UNI',
      `${gateLine(g.report)} · ${g.detail.plan.blocks.map((b) => b.name).join(',')}`,
    );
    const dd = buildPieceSpecsDetailed({
      ...inp,
      pieceOverrides: { 1: { code: 'SL' }, 2: { code: 'SL' } },
    });
    ck(
      dd.output.blocked.some((b) => b.reason === 'duplicate-identity'),
      'two pieces named SL → duplicate-identity',
    );
    // AI name with an unknown code → grammar (dictionary only for AI names)
    const da = buildPieceSpecsDetailed({
      ...inp,
      pieceOverrides: {
        1: { code: 'XYZ', nameOrigin: 'ai' },
        2: { code: 'XYZ2', nameOrigin: 'operator' },
      },
    });
    ck(
      da.output.blocked.some((b) => b.seed === 1 && b.reason === 'grammar') &&
        da.output.pieces.some((p) => p.seed === 2),
      'unknown code: AI blocked, operator allowed (D2: open list)',
    );
  }

  head('D6b drawn twins: one hand blocked → the other is not written alone');
  {
    const F = fx();
    addFamily(F, 1, bodice, 0, [{ pts: grainLine(120, 100, 450), closed: false, role: 'grain' }]);
    const mirrorBodice = (k: number) =>
      bodice(k)
        .map((q) => ({ x: -q.x, y: q.y }))
        .reverse();
    addFamily(F, 2, mirrorBodice, 900, []); // no grain on the right hand
    const inp = input(F, CUT10, {
      pieceOverrides: { 1: { code: 'FP', mods: ['L'] }, 2: { code: 'FP', mods: ['R'] } },
    });
    const d = buildPieceSpecsDetailed(inp);
    ck(
      d.output.pieces.length === 0 && d.output.blocked.length === 2,
      'FP_R has no grain → FP_L blocked too',
      d.output.blocked.map((b) => `${b.seed}:${b.reason}`).join(' '),
    );
    const d2 = buildPieceSpecsDetailed({
      ...inp,
      operatorGrain: { 2: { a: { x: 780, y: 100 }, b: { x: 780, y: 450 } } },
    });
    const g = await gate(d2.output.pieces, inp.sizeMap, d2.wallsOf);
    ck(
      d2.output.pieces.map((p) => `${p.identity}~${p.pairOf}`).join(',') ===
        'FP_L~FP_R,FP_R~FP_L' && g.report.passed,
      'with a grain click both hands pass (G12)',
      gateLine(g.report),
    );
  }

  head('D7 offset failure blocks the piece (topology)');
  {
    const F = fx();
    const waist = (k: number) =>
      [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 100 },
        { x: 110, y: 100 },
        { x: 110, y: 150 },
        { x: 200, y: 150 },
        { x: 200, y: 250 },
        { x: 0, y: 250 },
        { x: 0, y: 150 },
        { x: 90, y: 150 },
        { x: 90, y: 100 },
        { x: 0, y: 100 },
      ].map((p) => ({ x: p.x * k, y: p.y * k }));
    addFamily(
      F,
      1,
      waist,
      0,
      [{ pts: grainLine(50, 20, 230), closed: false, role: 'grain' }],
      ['FRONT'],
    );
    const d = buildPieceSpecsDetailed(input(F, { ...CUT10, allowanceMm: 15 }));
    ck(
      d.output.blocked[0]?.reason === 'offset-topology',
      'seam = cut − 15 through a 20 mm neck → offset-topology',
      d.output.blocked[0]?.detail,
    );
  }

  // ── E ─────────────────────────────────────────────────────────────────────────────────
  head('E  CLO DXF corpus: fast path → semantics → writeAndGate G1–G13');
  const eRows: unknown[] = [];
  {
    const dir = path.join(CORPUS, 'dxf-clo');
    const CARD5: CardSize[] = ['xs', 's', 'm', 'l', 'xl'].map((n, rank) => ({
      sizeId: 500 + rank,
      name: `${n}_${44 + rank * 2}ta_m`,
      token: n.toUpperCase(),
      rank,
    }));
    for (const f of fs
      .readdirSync(dir)
      .filter((x) => x.toLowerCase().endsWith('.dxf'))
      .sort()) {
      const read = await readDxf(
        { id: '0', name: f, bytes: ab(path.join(dir, f)) },
        { sagittaMm: 0.05, keepFills: true },
      );
      const seg = segmentDxf(read);
      if (!seg.presegmented) {
        ck(true, `${f}: not a garment DXF (no piece blocks) — the fast path is not used`);
        eRows.push({ file: f, presegmented: false });
        continue;
      }
      const fp = dxfFastPath(read, seg);
      const sizeMap = proposeSizeMap(fp.run, CARD5);
      const fileAllowance = fp.allowance ?? detectAllowance(fp.sheet, fp.families, fp.chains);
      const inp: SemanticsInput = {
        sheet: fp.sheet,
        set: fp.chains,
        run: fp.run,
        sizeMap,
        families: fp.families,
        fileAllowance,
        pieceOverrides: {},
        operatorGrain: {},
      };
      const t0 = Date.now();
      const d = buildPieceSpecsDetailed(inp);
      const ms = Date.now() - t0;
      const src: ManifestSource = {
        ...SOURCE,
        files: [{ name: f, sha256: '0'.repeat(64), bytes: 0, kind: 'dxf', pages: 1 }],
        sizeEncoding: fp.run.encoding,
      };
      let report: GateReport | null = null;
      let blocks: string[] = [];
      let err = '';
      if (d.output.pieces.length) {
        try {
          const g = await gate(d.output.pieces, sizeMap, d.wallsOf, src);
          report = g.report;
          blocks = g.detail.plan.blocks.map((b) => b.name);
        } catch (e) {
          err = e instanceof Error ? e.message : String(e);
        }
      }
      const reasons = d.output.blocked.map(
        (b) =>
          `${fp.families.find((x) => x.seed === b.seed)?.candidates[0] ? (fp.families.find((x) => x.seed === b.seed)!.candidates[0] as DxfPieceCandidate).dxf.identity : b.seed}:${b.reason}`,
      );
      // derived cut vs CLO's own cut line at the sample size (mode A: layer 1 is the sample's cut)
      let cloCut: { p95: number; max: number; n: number } | null = null;
      if (seg.mode === 'A' && seg.sampleSize) {
        const dev: number[] = [];
        let n = 0;
        for (const p of d.output.pieces) {
          const fam = fp.families.find((x) => x.seed === p.seed)!;
          const c = fam.candidates.find(
            (x) => (x as DxfPieceCandidate).dxf.size === seg.sampleSize!.token,
          ) as DxfPieceCandidate | undefined;
          const s = p.sizes.find((z) => z.rank === c?.rank);
          const clo = c?.dxf.features.find((x) => x.kind === 'cut');
          if (!c || !s || !clo || clo.kind !== 'cut' || (p.pairHand === 'R' && p.pairOf && false))
            continue;
          if (p.allowance.meaning !== 'seam') continue;
          n++;
          const idx = new SegIndex([{ pts: clo.pts, closed: true }], 5);
          for (const q of sampleAlong(s.cut, true, 2)) dev.push(idx.nearest(q, 30));
        }
        dev.sort((a, b) => a - b);
        if (dev.length)
          cloCut = { p95: dev[Math.floor(dev.length * 0.95)], max: dev[dev.length - 1], n };
      }
      const passed = !!report?.passed;
      const failed = report ? failing(report) : [];
      // acceptance: the written scope passes the gate; whatever semantics blocked has a reason
      const ok =
        (report ? passed : d.output.pieces.length === 0) &&
        !err &&
        d.output.blocked.every((b) => !!b.detail);
      ck(
        ok,
        `${f}: ${d.output.pieces.length} specs → ${blocks.length} blocks, ${d.output.blocked.length} blocked`,
        `${report ? gateLine(report) : err || 'nothing to write'} · ${ms} ms${reasons.length ? ` · blocked ${reasons.join(', ')}` : ''}${cloCut ? ` · derived cut vs CLO L1 at ${seg.sampleSize?.token}: p95 ${cloCut.p95.toFixed(3)} max ${cloCut.max.toFixed(3)} mm (${cloCut.n} pieces)` : ''}`,
      );
      if (report && !passed)
        for (const c of report.checks.filter((x) => !x.ok && x.severity === 'block'))
          console.log(`        ${c.id}: ${c.note.slice(0, 300)}`);
      eRows.push({
        file: f,
        mode: seg.mode,
        sizes: fp.run.sizes.map((s) => s.label),
        allowance: fileAllowance,
        specs: d.output.pieces.map((p) => ({
          identity: p.identity,
          pairOf: p.pairOf,
          ungraded: p.ungraded,
          ppg: p.piecesPerGarment,
          meaning: p.allowance.meaning,
          sizes: p.sizes.length,
          offsetMaxDev: Math.max(0, ...p.sizes.map((s) => s.offset?.maxDeviationMm ?? 0)),
        })),
        blocked: d.output.blocked,
        blocks,
        gate: report?.checks.map((c) => ({
          id: c.id,
          ok: c.ok,
          severity: c.severity,
          value: c.value,
          note: c.ok ? '' : c.note.slice(0, 400),
        })),
        passed,
        failed,
        cloCut,
        ms,
      });
    }
  }
  json.corpus = eRows;

  head('E2 blazer named by the operator (all 46 pieces) · summer men in the R12 dialect');
  {
    const CARD5: CardSize[] = ['xs', 's', 'm', 'l', 'xl'].map((n, rank) => ({
      sizeId: 500 + rank,
      name: `${n}_${44 + rank * 2}ta_m`,
      token: n.toUpperCase(),
      rank,
    }));
    const load = async (f: string) => {
      const read = await readDxf(
        { id: '0', name: f, bytes: ab(path.join(CORPUS, 'dxf-clo', f)) },
        { sagittaMm: 0.05, keepFills: true },
      );
      return dxfFastPath(read, segmentDxf(read));
    };
    const fp = await load('blazer.dxf');
    const sizeMap = proposeSizeMap(fp.run, CARD5);
    const overrides: SemanticsInput['pieceOverrides'] = {};
    fp.families.forEach((f, i) => {
      overrides[f.seed] = {
        code: 'TAB',
        mods: [String(i + 1)],
        nameOrigin: 'operator',
        pairHand: null,
      };
    });
    const d = buildPieceSpecsDetailed({
      sheet: fp.sheet,
      set: fp.chains,
      run: fp.run,
      sizeMap,
      families: fp.families,
      fileAllowance: fp.allowance!,
      pieceOverrides: overrides,
      operatorGrain: {},
    });
    const g = await gate(d.output.pieces, sizeMap, d.wallsOf);
    ck(
      d.output.blocked.length === 0 && g.detail.plan.blocks.length === 46 && g.report.passed,
      'blazer: 46 operator-named pieces → 46 blocks, gate passes',
      `${gateLine(g.report)} · blocked ${d.output.blocked.length}`,
    );
    const fs2 = await load('summer men.dxf');
    const sm = proposeSizeMap(fs2.run, CARD5);
    const d2 = buildPieceSpecsDetailed({
      sheet: fs2.sheet,
      set: fs2.chains,
      run: fs2.run,
      sizeMap: sm,
      families: fs2.families,
      fileAllowance: fs2.allowance!,
      pieceOverrides: {},
      operatorGrain: {},
    });
    const g2 = await gate(d2.output.pieces, sm, d2.wallsOf, SOURCE, 'r12');
    ck(g2.report.passed, 'summer men → R12 (AAMA) dialect, gate passes', gateLine(g2.report));
    json.e2 = {
      blazer: g.report.checks.map((c) => [c.id, c.ok, c.value]),
      summerR12: g2.report.checks.map((c) => [c.id, c.ok, c.value]),
    };
  }

  // ── report ────────────────────────────────────────────────────────────────────────────
  const bad = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - bad.length}/${rows.length} ok`);
  const stamp = '20261009';
  fs.mkdirSync(REPORTS, { recursive: true });
  fs.writeFileSync(
    path.join(REPORTS, `F5-${stamp}.json`),
    JSON.stringify({ rows, ...json }, null, 2),
  );
  return bad.length ? 1 : 0;
}
