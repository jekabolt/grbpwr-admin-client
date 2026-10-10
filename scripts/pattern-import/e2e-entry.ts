// PATTERN-IMPORT · E2E probe — every corpus sample through the worker SESSION the way the wizard
// drives it (read → scale → sheet → legend/sizes → pieces → semantics → fabrics → write → gate),
// with NO geometry clicks on the automatic pass. What the wizard would stop on is recorded as an
// operator action; the run then simulates the cheapest operator answer (confirm the scale, accept
// the size guesses, pick the model, "not a piece" on open regions, two grain clicks, a typed code)
// so every sample reaches the gate, and the record says which answers it took.
//   node --expose-gc scripts/pattern-import/e2e.mjs [case…]   (one child process per case)
//   env PATIMPORT_CORPUS, E2E_OUT (default tmp/plans/pdf-to-dxf/reports/E2E-out)
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import { setPdfjsLoader, type PdfjsModule } from 'lib/pattern-import/adapters/pdf';
import { setRasterPdfjsLoader } from 'lib/pattern-import/adapters/raster';
import { planScopes } from 'lib/pattern-import/fabrics/scope';
import { contourMm, roundTrip } from 'lib/pattern-import/gate/roundtrip';
import type {
  CardSize,
  DraftScopeTarget,
  PieceEdit,
  PieceFamily,
  PtMm,
  Seed,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { toWireError } from 'lib/pattern-import/worker/errors';
import { guardPdfjs } from 'lib/pattern-import/worker/pdf-guard';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';

import { PALETTE, renderPng, type Label, type Stroke } from './sizes-render';
import { splitSize } from './worker-entry';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const OUT =
  process.env.E2E_OUT ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/E2E-out';
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
const loadGuarded = () => (import(LEGACY) as Promise<PdfjsModule>).then((m) => guardPdfjs(m));
setPdfjsLoader(loadGuarded);
setRasterPdfjsLoader(loadGuarded);

// ── cases ───────────────────────────────────────────────────────────────────────────────

type TruthRef = { id: string; variant?: number; expect?: number; note?: string };
type Case = {
  id: string;
  group: 'pdf' | 'dxf' | 'synthetic' | 'refusal';
  files: string[]; // corpus-relative, or 'split:<size>' for the per-size DXF set
  card: string[];
  /** The model the operator picks when the sheet offers several (regex on the variant label). */
  variant?: RegExp;
  sheet?: number;
  truth?: TruthRef;
  /** F4 click fixture id (scripts/pattern-import/fixtures/pieces-clicks.json) for the operator pass. */
  clicks?: string;
};

const NUM = (a: number, b: number, step = 2) =>
  Array.from({ length: (b - a) / step + 1 }, (_, i) => String(a + i * step));
const LETTERS = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL'];
const W = (s: string) => `pdf/wm_kka_15_01_${s}_wykroj.pdf`;

export const CASES: Case[] = [
  // vector / raster PDF
  { id: 'robe', group: 'pdf', files: ['pdf/robe.pdf'], card: NUM(36, 46), truth: { id: 'robe' } },
  {
    id: 'palto',
    group: 'pdf',
    files: ['pdf/palto.pdf'],
    card: NUM(72, 88, 4),
    variant: /125/,
    truth: { id: 'palto', expect: 7, note: '9 listed, 2 are "trace from 21" (no own outline)' },
  },
  {
    id: 'kombinezon-A',
    group: 'pdf',
    files: ['pdf/kombinezon.pdf'],
    card: NUM(6, 20),
    variant: /A/,
    truth: { id: 'kombinezon', variant: 0 },
  },
  {
    id: 'kombinezon-B',
    group: 'pdf',
    files: ['pdf/kombinezon.pdf'],
    card: NUM(6, 20),
    variant: /B/,
    truth: { id: 'kombinezon', variant: 1 },
  },
  {
    id: 'viola',
    group: 'pdf',
    files: ['pdf/viola.pdf'],
    card: NUM(34, 48),
    truth: { id: 'viola' },
  },
  {
    id: 'reef',
    group: 'pdf',
    files: ['pdf/reef.pdf'],
    card: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'],
    truth: { id: 'reef' },
  },
  {
    id: 'zhaket',
    group: 'pdf',
    files: ['pdf/zhaket.pdf'],
    card: NUM(36, 44),
    truth: { id: 'zhaket' },
  },
  {
    id: 'leonie',
    group: 'pdf',
    files: ['pdf/leonie.pdf'],
    card: NUM(36, 46),
    truth: { id: 'leonie' },
  },
  {
    id: 'blazer',
    group: 'pdf',
    files: ['pdf/blazer.pdf'],
    card: ['M'],
    truth: { id: 'blazer' },
    clicks: 'blazer',
  },
  {
    id: 'r4454',
    group: 'pdf',
    files: ['pdf/r4454.pdf'],
    card: NUM(44, 54),
    truth: {
      id: 'r4454',
      expect: 13,
      note: '11 main (9, 11 cut by measurement, no outline) + 4 interfacing',
    },
    clicks: 'r4454',
  },
  {
    id: 'redcafe',
    group: 'pdf',
    files: ['44', '46', '48', '50', '52', '54'].map((n) => `pdf/${n}.pdf`),
    card: NUM(44, 54),
    truth: { id: 'redcafe_tolstovka' },
    clicks: 'redcafe',
  },
  {
    id: 'wm',
    group: 'pdf',
    files: ['xs', 's', 'm', 'l', 'xl', 'xxl', 'xxxl'].map(W),
    card: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'],
    truth: { id: 'wm_kka_15_01' },
    clicks: 'wm',
  },
  {
    id: 'polupalto-sheetA',
    group: 'pdf',
    files: ['pdf/polupalto.pdf'],
    card: NUM(44, 54),
    sheet: 0,
    variant: /A/,
    truth: { id: 'polupalto' },
  },
  {
    id: 'polupalto-sheetB',
    group: 'pdf',
    files: ['pdf/polupalto.pdf'],
    card: NUM(44, 54),
    sheet: 1,
    variant: /B/,
    truth: { id: 'polupalto' },
  },
  // DXF (CLO, lekalo, Gerber) — fast path
  ...[
    'allsizes.dxf',
    'allsizes-merged.dxf',
    'ALLSIZES_DXF.dxf',
    'Allsizes_with_notches.dxf',
    'POCKETS.dxf',
    'blazer.dxf',
    'summer men.dxf',
    'summer men_ganjubas_gerber.dxf',
    'RC28-RC28-001-test-2.dxf',
    'RC28-RC28-001-test-3.dxf',
    'RC28-RC28-001-Shell_Fabric_-_Alt_(substitute).dxf',
  ].map(
    (f): Case => ({
      id: `dxf:${f.replace(/\.dxf$/, '')}`,
      group: 'dxf',
      files: [`dxf-clo/${f}`],
      card: [...LETTERS, ...NUM(32, 60)],
    }),
  ),
  {
    id: 'dxf-set:allsizes-merged×5',
    group: 'dxf',
    files: ['XS', 'S', 'M', 'L', 'XL'].map((s) => `split:${s}`),
    card: ['XS', 'S', 'M', 'L', 'XL'],
  },
  // synthetic HPGL / SVG / AI (one size, truth = f12-truth.json)
  ...[
    'gerber-front.plt',
    'optitex-hpgl2-pe.plt',
    'lectra-back-sc.plt',
    'pe-malformed.plt',
    'inkscape-pieces-mm.svg',
    'illustrator-back-72dpi.svg',
    'seamly2d-qt-collar.svg',
    'px-only-square.svg',
    'pdf-compatible.ai',
    'ps-wrapped-pdf.ai',
    'illustrator8-postscript.ai',
  ].map(
    (f): Case => ({ id: `syn:${f}`, group: 'synthetic', files: [`synthetic/${f}`], card: ['M'] }),
  ),
  ...['binary-garbage.plt', 'not-really.svg', 'postscript-only.eps', 'dos-binary-header.eps'].map(
    (f): Case => ({ id: `syn:${f}`, group: 'refusal', files: [`synthetic/${f}`], card: ['M'] }),
  ),
];

// ── helpers ─────────────────────────────────────────────────────────────────────────────

const mb = (n: number) => Math.round(n / 1048576);
const peakMb = () => Math.round(process.resourceUsage().maxRSS / 1024);
const ctx = (): StageCtx => ({ checkCancel: () => {}, progress: () => {} });
const card = (tokens: string[]): CardSize[] =>
  tokens.map((t, i) => ({ sizeId: 100 + i, name: t, token: t, rank: i, spellings: [t] }));
const SCOPES: DraftScopeTarget[] = [
  {
    scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
    fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
    bomLineKey: 'L1',
    label: 'main',
    isInterlining: false,
    sections: ['TECH_CARD_BOM_SECTION_FABRIC'],
  },
  {
    scopeKey: 'TECH_CARD_BOM_PURPOSE_LINING',
    fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING',
    bomLineKey: 'L2',
    label: 'lining',
    isInterlining: false,
    sections: ['TECH_CARD_BOM_SECTION_LINING'],
  },
  {
    scopeKey: 'TECH_CARD_BOM_PURPOSE_INTERLINING',
    fabricPurpose: 'TECH_CARD_BOM_PURPOSE_INTERLINING',
    bomLineKey: 'L3',
    label: 'interlining',
    isInterlining: true,
    sections: ['TECH_CARD_BOM_SECTION_INTERLINING'],
  },
];

function filesOf(c: Case): { name: string; bytes: ArrayBuffer }[] {
  const enc = (b: Buffer) =>
    b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  if (c.files[0]?.startsWith('split:')) {
    const graded = readFileSync(resolve(CORPUS, 'dxf-clo/allsizes-merged.dxf')).toString('latin1');
    return c.files.map((f) => {
      const s = f.slice(6);
      return {
        name: `coat_${s.toLowerCase()}.dxf`,
        bytes: enc(Buffer.from(splitSize(graded, s), 'latin1')),
      };
    });
  }
  return c.files.map((f) => ({ name: basename(f), bytes: enc(readFileSync(resolve(CORPUS, f))) }));
}

const OC: Record<string, string> = { closed: 'C', leak: 'L', merged: 'M', tiny: 't' };

function famStats(
  fams: PieceFamily[],
  exported: Set<number> | null,
  label: (seed: number) => string,
) {
  const inScope = (r: number) => !exported || exported.has(r);
  const per = fams.map((f) => {
    const cs = f.candidates.filter((c) => inScope(c.rank));
    return {
      seed: f.seed,
      label: label(f.seed),
      outcomes: cs.map((c) => OC[c.outcome] ?? '?').join(''),
      monotone: f.monotone,
      closed: cs.length > 0 && cs.every((c) => c.outcome === 'closed'),
      derived: cs.flatMap((c) => (c.derived ?? []).map((d) => d.kind)),
      rankFrom: [...new Set(cs.map((c) => c.rankFrom ?? '-'))].join(','),
      areasCm2: cs.map((c) => Math.round(c.areaMm2 / 100)),
    };
  });
  const cands = per.flatMap((p) => p.outcomes.split(''));
  return {
    families: fams.length,
    closedFamilies: per.filter((p) => p.closed).length,
    nonMonotone: per.filter((p) => !p.monotone).length,
    candidates: cands.length,
    closedCandidates: cands.filter((x) => x === 'C').length,
    leak: cands.filter((x) => x === 'L').length,
    merged: cands.filter((x) => x === 'M').length,
    tiny: cands.filter((x) => x === 't').length,
    per,
  };
}

function nearestChain(preview: Float32Array[], at: PtMm): number {
  let best = -1;
  let bd = Infinity;
  preview.forEach((a, id) => {
    for (let i = 0; i + 3 < a.length; i += 2) {
      const ax = a[i],
        ay = a[i + 1],
        bx = a[i + 2],
        by = a[i + 3];
      const dx = bx - ax,
        dy = by - ay;
      const L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((at.x - ax) * dx + (at.y - ay) * dy) / L2));
      const d = Math.hypot(ax + t * dx - at.x, ay + t * dy - at.y);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
  });
  return best;
}

// ── one case ────────────────────────────────────────────────────────────────────────────

type Rec = Record<string, unknown> & { id: string; ops: string[]; ms: Record<string, number> };

export async function runCase(c: Case): Promise<Rec> {
  const rec: Rec = { id: c.id, group: c.group, files: c.files, ops: [], ms: {} };
  const dir = resolve(OUT, c.id.replace(/[^\w.-]+/g, '_'));
  mkdirSync(dir, { recursive: true });
  const T0 = Date.now();
  const timed = async <X>(k: string, f: () => Promise<X>) => {
    const t = Date.now();
    const x = await f();
    rec.ms[k] = (rec.ms[k] ?? 0) + Date.now() - t;
    return x;
  };
  let s: Session;
  try {
    s = new Session(1, filesOf(c));
  } catch (e) {
    rec.refused = toWireError(e);
    rec.verdict = 'refused';
    return rec;
  }
  const run = <S extends StageName>(st: S, input: StageIO[S]['in']) =>
    timed(st, () => s.runStage(st, input, ctx()));
  try {
    // 1 · files
    const ex = await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
    const pageCls: Record<string, number> = {};
    for (const p of ex.pages) pageCls[p.cls] = (pageCls[p.cls] ?? 0) + 1;
    const best = ex.scale[0];
    rec.read = {
      kinds: [...new Set(ex.files.map((f) => f.kind))].join(','),
      pages: ex.pages.length,
      pageCls,
      presegmented: !!ex.presegmented,
      scanPages: ex.calibrations?.length ?? 0,
      warnings: ex.warnings.slice(0, 6),
      scale: best
        ? { factor: +best.factor.toFixed(5), method: best.method, confidence: best.confidence }
        : null,
      tileSheets: new Set(ex.pages.filter((p) => p.cls === 'tile').map((p) => p.sheet)).size,
    };
    rec.rssAfterExtractMb = mb(process.memoryUsage().rss);
    if (!best) throw new Error('no scale candidate');
    // 2 · scale (the wizard asks for a confirmation when the detection is not certain)
    const needsHuman =
      best.confidence < 0.9 || Math.abs(best.factor - 1) > PATIMPORT.scaleWarnRatio;
    if (needsHuman && !ex.presegmented)
      rec.ops.push(
        `confirm scale (${best.method}, conf ${best.confidence.toFixed(2)}, ×${best.factor.toFixed(4)})`,
      );
    await run('scale', {
      decision: { factor: best.factor, method: best.method, operatorConfirmed: needsHuman },
    });
    // 3 · sheet
    const as = await run('assemble', { sheet: c.sheet ?? 0 });
    const worst = Math.max(0, ...as.sheet.poses.map((p) => p.residualMm));
    rec.sheet = {
      tiles: as.sheet.poses.length,
      missing: as.sheet.missing.length,
      worstResidualMm: +worst.toFixed(3),
      bboxMm: [
        Math.round(as.sheet.bbox.maxX - as.sheet.bbox.minX),
        Math.round(as.sheet.bbox.maxY - as.sheet.bbox.minY),
      ],
    };
    if (as.sheet.missing.length)
      rec.ops.push(`BLOCKER: ${as.sheet.missing.length} pages missing → set the grid by hand`);
    if (worst > PATIMPORT.registrationMaxResidualMm)
      rec.ops.push(`accept tile residual ${worst.toFixed(2)} mm`);
    // 4 · legend + sizes
    const ch = await run('chains', {
      opts: {
        joinGapMm: PATIMPORT.joinGapMm,
        joinAngleDeg: PATIMPORT.joinAngleDeg,
        joinLateralMm: PATIMPORT.joinLateralMm,
      },
    });
    const roles: Record<string, number> = {};
    for (const k of ch.classes) roles[k.role] = (roles[k.role] ?? 0) + 1;
    const pending = ch.classes.filter((k) => k.confidence < 0.6);
    rec.legend = {
      classes: ch.classes.length,
      roles,
      sizeRows: ch.classes.filter((k) => k.role === 'size').map((k) => k.sizeLabel ?? '?'),
      lowConfidence: pending.length,
      flags: ch.ambiguities?.length ?? 0,
      chains: ch.chainPreview.length,
    };
    if (pending.length) rec.ops.push(`confirm ${pending.length} legend rows`);
    const CARD = card(c.card);
    let sz = await run('sizes', { card: CARD });
    const guesses = sz.map.entries.filter(
      (e) => e.origin === 'auto' && !!e.card && (e.confidence ?? 1) < 0.9,
    );
    rec.sizes = {
      encoding: sz.run.encoding,
      found: sz.run.sizes.map((x) => x.label),
      map: sz.map.entries.map(
        (e) =>
          `${e.source.label}→${e.card?.token ?? '—'}${e.origin === 'auto' && e.card && (e.confidence ?? 1) < 0.9 ? '?' : ''}`,
      ),
      unmappedCard: sz.map.unmapped.length,
    };
    if (guesses.length) {
      rec.ops.push(`confirm ${guesses.length} size guesses`);
      sz = await run('sizes', {
        card: CARD,
        operatorMap: sz.map.entries.map((e) => ({ ...e, origin: e.card ? 'operator' : e.origin })),
      });
    }
    if (!sz.map.entries.some((e) => e.card) && sz.map.entries.length) {
      // the operator maps the source sizes to the card by hand, in rank order
      const n = Math.min(sz.map.entries.length, CARD.length);
      rec.ops.push(
        `map ${n} of ${sz.map.entries.length} source sizes to the card by hand (labels: [${sz.map.entries.map((e) => e.source.label || '∅').join(',')}])`,
      );
      sz = await run('sizes', {
        card: CARD,
        operatorMap: sz.map.entries.map((e, i) => ({
          ...e,
          card: i < n ? CARD[i] : null,
          origin: 'operator',
        })),
      });
    }
    if (!sz.map.entries.some((e) => e.card)) {
      rec.ops.push('BLOCKER: no source size maps to the card');
      rec.verdict = 'fails';
      rec.reason = 'no size maps to the card';
      return rec;
    }
    const exported = new Set(sz.map.entries.flatMap((e) => (e.card ? [e.source.rank] : [])));
    // 5 · pieces — automatic seeds (text / DXF blocks), first run shows every model
    const FILL = { cellMm: PATIMPORT.fillCellMm, snapMm: PATIMPORT.snapMm };
    let pc = await run('pieces', { edits: [], opts: { ...FILL, variant: null } });
    const textSeeds = pc.seeds;
    const labelOf = (seeds: Seed[]) => (seed: number) => {
      const sd = seeds.find((x) => x.id === seed);
      return (sd?.text?.text ?? sd?.origin ?? String(seed)).slice(0, 24);
    };
    rec.seeds = {
      count: pc.seeds.length,
      byOrigin: pc.seeds.reduce<Record<string, number>>(
        (a, x) => ((a[x.origin] = (a[x.origin] ?? 0) + 1), a),
        {},
      ),
      variants: pc.variants ?? [],
    };
    let variant: string | null = null;
    const variants = pc.variants ?? [];
    if (variants.length > 1) {
      variant = variants.find((v) => c.variant?.test(v)) ?? variants[0];
      rec.ops.push(`pick model "${variant}" of [${variants.join(' | ')}]`);
      pc = await run('pieces', { edits: [], opts: { ...FILL, variant } });
    } else if (variants.length === 1) variant = null;
    rec.variant = variant;
    let seedsNow = pc.seeds;
    rec.auto = famStats(pc.families, exported, labelOf(seedsNow));
    let seedsIn: Seed[] | undefined;
    let wallEdits: PieceEdit[] = [];
    // operator pass: the F4 click fixture where there is one, else "click inside every outline"
    // (an oracle: one click inside the innermost of each nest of closed lines) when the sheet gave
    // no seed at all. Text seeds that the clicks supersede are answered "not a piece".
    let clickList: { label: string; at: [number, number] }[] | null = null;
    let fxOps: { op: string; near?: [number, number]; rank?: number | null }[] = [];
    if (c.clicks) {
      const fx = JSON.parse(
        readFileSync(resolve(REPO, 'scripts/pattern-import/fixtures/pieces-clicks.json'), 'utf8'),
      )[c.clicks] as {
        clicks: { label: string; at: [number, number] }[];
        operator?: { op: string; near?: [number, number]; rank?: number | null }[];
      };
      clickList = fx.clicks;
      fxOps = fx.operator ?? [];
    } else if (!pc.families.length && !ex.presegmented) {
      clickList = oracleClicks(ch.chainPreview);
    }
    let textDrops: PieceEdit[] = [];
    if (clickList) {
      const base = Math.max(0, ...textSeeds.map((x) => x.id)) + 1;
      const clickSeeds: Seed[] = clickList.map((k, i) => ({
        id: base + i,
        at: { x: k.at[0], y: k.at[1] },
        origin: 'click',
        variant,
        text: {
          id: -1 - i,
          text: k.label,
          anchor: { x: k.at[0], y: k.at[1] },
          bbox: { minX: k.at[0], minY: k.at[1], maxX: k.at[0], maxY: k.at[1] },
          fontSizeMm: 0,
          rotationDeg: 0,
          layer: null,
          src: { file: 'click', page: -1, op: -1, sub: 0 },
        },
      }));
      seedsIn = process.env.E2E_CLICKS_ONLY ? clickSeeds : [...textSeeds, ...clickSeeds];
      textDrops = (process.env.E2E_CLICKS_ONLY ? [] : textSeeds).map(
        (x): PieceEdit => ({ kind: 'not-a-piece', seed: x.id }),
      );
      wallEdits = fxOps.flatMap((o): PieceEdit[] =>
        o.op === 'setWall' && o.near
          ? [
              {
                kind: 'set-wall',
                chain: nearestChain(ch.chainPreview, { x: o.near[0], y: o.near[1] }),
                rank: o.rank ?? null,
              },
            ]
          : o.op === 'ignoreChain' && o.near
            ? [
                {
                  kind: 'ignore-line',
                  chain: nearestChain(ch.chainPreview, { x: o.near[0], y: o.near[1] }),
                },
              ]
            : [],
      );
      pc = await run('pieces', {
        seeds: seedsIn,
        edits: [...textDrops, ...wallEdits],
        opts: { ...FILL, variant },
      });
      seedsNow = pc.seeds;
      rec.ops.push(
        `${clickSeeds.length} seed clicks${c.clicks ? ' (F4 fixture)' : ' (oracle: one per closed outline)'}${wallEdits.length ? ` + ${wallEdits.length} "use line"` : ''}${textDrops.length ? ` + "not a piece" on ${textDrops.length} text seeds` : ''}`,
      );
      rec.withClicks = famStats(pc.families, exported, labelOf(seedsNow));
      wallEdits = [...textDrops, ...wallEdits];
    }
    const lastStats = (rec.withClicks ?? rec.auto) as ReturnType<typeof famStats>;
    renderPieces(dir, ch.chainPreview, pc.families, seedsNow, exported, as.sheet.bbox);
    if (!pc.families.length) {
      rec.verdict = 'fails';
      rec.reason =
        'no pieces seeded automatically (no text seeds) — operator must click every piece';
      rec.ops.push('BLOCKER: click inside every piece');
      return rec;
    }
    // open regions → "not a piece" (the cheapest answer that lets the wizard move on)
    const open = lastStats.per.filter((p) => !p.closed);
    let edits: PieceEdit[] = [...wallEdits];
    if (open.length) {
      rec.ops.push(
        `"not a piece" on ${open.length} open regions (${open.map((p) => `${p.label}:${p.outcomes}`).join(' ')})`,
      );
      edits = [...edits, ...open.map((p): PieceEdit => ({ kind: 'not-a-piece', seed: p.seed }))];
      pc = await run('pieces', { seeds: seedsIn ?? pc.seeds, edits, opts: { ...FILL, variant } });
    }
    if (!pc.families.length) {
      rec.verdict = 'fails';
      rec.reason = 'no region closes';
      return rec;
    }
    // 6 · meaning (no AI names in a headless run: printed text names only)
    const fileAllowance = {
      meaning: 'seam' as const,
      allowanceMm: PATIMPORT.defaultAllowanceMm,
      origin: 'default' as const,
      evidence: [],
    };
    const overrides: StageIO['semantics']['in']['pieceOverrides'] = {};
    const grain: StageIO['semantics']['in']['operatorGrain'] = {};
    const foldPick: NonNullable<StageIO['semantics']['in']['operatorFold']> = {};
    let foldListChecked = false;
    // E1a: the simulated operator answers fold questions from K0 truth (corpus/truth.json) — the
    // person at the wizard knows the garment; a piece truth does not list is "not a fold"
    const truthFold = (() => {
      if (!c.truth) return () => null;
      try {
        const t = JSON.parse(readFileSync(resolve(CORPUS, 'truth.json'), 'utf8')) as {
          samples: { id: string; variants: { pieces: { label: string; fold: unknown }[] }[] }[];
        };
        const sample = t.samples.find((x) => x.id === c.truth!.id);
        const pieces = sample?.variants[c.truth!.variant ?? 0]?.pieces ?? [];
        return (label: string): boolean | null => {
          const p = pieces.find((x) => x.label === label);
          return p ? p.fold === true : null;
        };
      } catch {
        return () => null;
      }
    })();
    let sem = await run('semantics', {
      fileAllowance,
      pieceOverrides: overrides,
      operatorGrain: grain,
      operatorFold: foldPick,
    });
    // the wizard's details step shows the allowance it read; a found one becomes the file decision
    const found = sem.pieces.find(
      (p) => p.allowance.origin === 'text' || p.allowance.origin === 'measured',
    )?.allowance;
    rec.semAuto = {
      pieces: new Set(sem.pieces.map((p) => p.seed)).size,
      identities: sem.pieces.map((p) => p.identity),
      nameOrigin: sem.pieces.reduce<Record<string, number>>(
        (a, p) => ((a[p.nameOrigin] = (a[p.nameOrigin] ?? 0) + 1), a),
        {},
      ),
      blocked: sem.blocked.map((b) => `${b.reason}:${labelOf(seedsNow)(b.seed)}`),
      allowance: [
        ...new Set(
          sem.pieces.map(
            (p) => `${p.allowance.meaning}/${p.allowance.allowanceMm}/${p.allowance.origin}`,
          ),
        ),
      ],
      warnings: sem.warnings.slice(0, 5),
      // E1a: the fold questions the wizard asks before any answer
      folds: (sem.folds ?? []).map((q) => ({
        piece: labelOf(seedsNow)(q.seed),
        why: q.why,
        evidence: q.evidence,
        edges: q.edges.length,
        suggested: q.suggested,
        truthFold: truthFold(labelOf(seedsNow)(q.seed)),
      })),
      foldList: sem.foldList ?? null,
      unfolded: sem.pieces.filter((p) => p.unfoldedFold).map((p) => p.identity),
    };
    const fams = pc.families;
    const dropped: string[] = [];
    for (let pass = 0; pass < 5 && (sem.blocked.length || sem.foldList); pass++) {
      const byReason = new Map<string, number[]>();
      for (const b of sem.blocked)
        byReason.set(b.reason, [...(byReason.get(b.reason) ?? []), b.seed]);
      const noGrain = byReason.get('no-grain') ?? [];
      for (const sd of noGrain) {
        const f = fams.find((x) => x.seed === sd);
        if (!f) continue;
        const bb = f.candidates[0].bbox;
        const cx = (bb.minX + bb.maxX) / 2;
        grain[sd] = { a: { x: cx, y: bb.minY + 30 }, b: { x: cx, y: bb.maxY - 30 } };
      }
      if (noGrain.length) rec.ops.push(`draw grain on ${noGrain.length} pieces (2 clicks each)`);
      const named = [
        ...(byReason.get('grammar') ?? []),
        ...(byReason.get('duplicate-identity') ?? []),
      ];
      named.forEach((sd, i) => {
        overrides[sd] = {
          ...(overrides[sd] ?? {}),
          code: 'BP',
          mods: [String(50 + pass * 20 + i)],
          displayName: `piece ${sd}`,
          nameOrigin: 'operator',
        };
      });
      if (named.length) rec.ops.push(`type a code for ${named.length} pieces (grammar/duplicate)`);
      // E1a fold question: a fold piece (truth) takes the suggested edge, anything else "not a fold"
      const asks = sem.folds ?? [];
      for (const q of asks) {
        const lab = labelOf(seedsNow)(q.seed);
        const fold = truthFold(lab) === true;
        const e = fold && q.suggested != null ? q.edges[q.suggested] : null;
        if (e) foldPick[q.seed] = { a: e.a, b: e.b };
        else overrides[q.seed] = { ...(overrides[q.seed] ?? {}), unfoldedFold: false };
        rec.ops.push(
          `fold? ${lab}: ${e ? `pick the suggested ${e.lenMm.toFixed(0)} mm edge` : fold ? 'fold, but NO suggested edge → "not a fold"' : '"not a fold"'}`,
        );
      }
      // E1a cutting list: mark the list's pieces (truth) as fold — they come back as questions
      if (sem.foldList && !foldListChecked) {
        const marked = fams.filter(
          (f) =>
            truthFold(labelOf(seedsNow)(f.seed)) === true &&
            overrides[f.seed]?.unfoldedFold === undefined &&
            !foldPick[f.seed] &&
            !sem.pieces.some((p) => p.seed === f.seed && p.unfoldedFold),
        );
        for (const f of marked)
          overrides[f.seed] = { ...(overrides[f.seed] ?? {}), unfoldedFold: true };
        foldListChecked = true;
        rec.ops.push(
          `cutting list names ${sem.foldList.entries.length} fold pieces, ${sem.foldList.unfolded} unfolded → mark ${marked.map((f) => labelOf(seedsNow)(f.seed)).join(',') || 'none'}, confirm the list`,
        );
      }
      const other = sem.blocked.filter(
        (b) => !['no-grain', 'grammar', 'duplicate-identity', 'fold-question'].includes(b.reason),
      );
      if (other.length) {
        dropped.push(...other.map((b) => `${b.reason}:${labelOf(seedsNow)(b.seed)}`));
        rec.ops.push(
          `drop ${other.length} blocked pieces (${[...new Set(other.map((b) => b.reason))].join(',')})`,
        );
        edits = [...edits, ...other.map((b): PieceEdit => ({ kind: 'not-a-piece', seed: b.seed }))];
        pc = await run('pieces', { seeds: seedsIn ?? pc.seeds, edits, opts: { ...FILL, variant } });
      }
      sem = await run('semantics', {
        fileAllowance: found ?? fileAllowance,
        pieceOverrides: overrides,
        operatorGrain: grain,
        operatorFold: foldPick,
        foldListChecked,
      });
    }
    rec.droppedAtMeaning = dropped;
    rec.semFinal = {
      pieces: new Set(sem.pieces.map((p) => p.seed)).size,
      specs: sem.pieces.length,
      blocked: sem.blocked.map((b) => `${b.reason}:${b.detail.slice(0, 80)}`),
      foldList: sem.foldList ?? null,
      pieceInfo: sem.pieces.map((p) => ({
        label: labelOf(seedsNow)(p.seed),
        identity: p.identity,
        name: p.displayName,
        nameOrigin: p.nameOrigin,
        ppg: p.piecesPerGarment,
        pair: p.pairHand,
        fold: p.unfoldedFold,
        fabrics: p.fabrics,
        allowance: `${p.allowance.meaning}/${p.allowance.allowanceMm}/${p.allowance.origin}`,
        sizes: p.sizes.map((z) => z.sizeToken),
        areasCm2: p.sizes.map((z) => Math.round(z.areaMm2 / 100)),
        bboxLargest: (() => {
          const z = p.sizes[p.sizes.length - 1];
          return z
            ? [Math.round(z.bbox.maxX - z.bbox.minX), Math.round(z.bbox.maxY - z.bbox.minY)]
            : null;
        })(),
      })),
    };
    if (sem.blocked.length) {
      rec.verdict = 'fails';
      rec.reason = `semantics still blocked: ${sem.blocked.map((b) => b.reason).join(',')}`;
      return rec;
    }
    if (!sem.pieces.length) {
      rec.verdict = 'fails';
      rec.reason = 'no pieces left after the meaning step';
      return rec;
    }
    // 7 · fabrics
    let fab = await run('fabrics', { bom: SCOPES });
    const plan = planScopes(sem.pieces, fab, SCOPES);
    rec.fabrics = {
      byPurpose: Object.fromEntries(
        Object.entries(fab.byPurpose).map(([k, v]) => [
          k.replace('TECH_CARD_BOM_PURPOSE_', ''),
          v.length,
        ]),
      ),
      refused: (fab.refused ?? []).map((r) => `${r.label}:${r.seeds.length}`),
      proposals: fab.proposals.length,
      problems: plan.problems.map((p) => p.message),
    };
    if (plan.problems.length) {
      rec.ops.push(
        `fabrics step blocks: ${plan.problems[0].message.slice(0, 80)} → all pieces to main`,
      );
      fab = {
        ...fab,
        byPurpose: { TECH_CARD_BOM_PURPOSE_MAIN: [...new Set(sem.pieces.map((p) => p.seed))] },
      };
    }
    // 8 · write + gate
    const wr = await run('write', {
      scopes: SCOPES,
      assignment: fab,
      sizes: sz.map.entries.flatMap((e) =>
        e.card
          ? [
              {
                token: e.card.token,
                sizeId: e.card.sizeId,
                name: e.card.name,
                sourceLabel: e.source.label,
                rank: e.source.rank,
              },
            ]
          : [],
      ),
      dialect: 'r12',
      generator: 'e2e-probe',
    });
    const scopes = [];
    for (const sc of wr.scopes) {
      const g = wr.gate[sc.target.scopeKey];
      const blocking = g?.checks.filter((k) => !k.ok && k.severity === 'block') ?? [];
      const warns = g?.checks.filter((k) => !k.ok && k.severity === 'warn') ?? [];
      const blocks = sc.manifest.blocks.map((b) => b.block);
      const bad = new Set<string>();
      for (const k of blocking)
        for (const b of k.blocks) {
          if (blocks.includes(b)) bad.add(b);
          else for (const x of blocks) if (x.startsWith(`${b}_`) || x === b) bad.add(x);
        }
      const allBad = blocking.some((k) => !k.blocks.length);
      const file = resolve(dir, sc.filename.replace(/[^\w.-]+/g, '_'));
      writeFileSync(file, sc.dxfText);
      const png = file.replace(/\.dxf$/i, '') + '.png';
      const rt = await renderDxf(sc.dxfText, png);
      scopes.push({
        scope: sc.target.label,
        file,
        png,
        identities: sc.identities.length,
        blocks: blocks.length,
        blocksPassing: allBad ? 0 : blocks.length - bad.size,
        passed: !!g?.passed,
        blocking: blocking.map(
          (k) =>
            `${k.id}[${k.blocks.slice(0, 6).join(',')}${k.blocks.length > 6 ? `,+${k.blocks.length - 6}` : ''}] ${k.note.slice(0, 160)}`,
        ),
        warns: warns.map((k) => `${k.id}: ${k.note.slice(0, 120)}`),
        roundtripPieces: rt,
        manifestBlocks: sc.manifest.blocks.map((b) => ({
          block: b.block,
          size: b.sizeToken,
          area: Math.round(b.areaMm2 / 100),
          bbox: [Math.round(b.bboxMm[2] - b.bboxMm[0]), Math.round(b.bboxMm[3] - b.bboxMm[1])],
        })),
      });
    }
    rec.write = scopes;
    const allPassed = scopes.length > 0 && scopes.every((x) => x.passed);
    const hard = rec.ops.filter((o) => o.startsWith('BLOCKER'));
    rec.verdict = !allPassed
      ? 'fails'
      : rec.ops.length === 0
        ? 'auto'
        : hard.length
          ? 'fails'
          : 'needs operator';
    if (!allPassed)
      rec.reason = `gate blocks: ${scopes.flatMap((x) => x.blocking.map((b) => b.split('[')[0])).join(',')}`;
  } catch (e) {
    rec.verdict = 'fails';
    rec.error = String((e as Error)?.stack ?? e).slice(0, 600);
  } finally {
    rec.totalMs = Date.now() - T0;
    rec.peakRssMb = peakMb();
    s.close();
  }
  return rec;
}

/** One interior point per nest of closed lines (the innermost loop of the nest ≥ 50 % of its area). */
function oracleClicks(preview: Float32Array[]): { label: string; at: [number, number] }[] {
  type L = {
    pts: PtMm[];
    area: number;
    box: { minX: number; minY: number; maxX: number; maxY: number };
  };
  const loops: L[] = [];
  for (const a of preview) {
    if (a.length < 8) continue;
    const n = a.length / 2;
    if (Math.hypot(a[0] - a[2 * n - 2], a[1] - a[2 * n - 1]) > 1) continue;
    const pts: PtMm[] = [];
    for (let i = 0; i < n; i++) pts.push({ x: a[2 * i], y: a[2 * i + 1] });
    let s = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      s += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    const area = Math.abs(s) / 2;
    if (area < 2000) continue; // 20 cm²
    const box = {
      minX: Math.min(...pts.map((p) => p.x)),
      minY: Math.min(...pts.map((p) => p.y)),
      maxX: Math.max(...pts.map((p) => p.x)),
      maxY: Math.max(...pts.map((p) => p.y)),
    };
    loops.push({ pts, area, box });
  }
  const inside = (p: PtMm, poly: PtMm[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i],
        b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  loops.sort((x, y) => y.area - x.area);
  const outer = loops.filter(
    (l, i) =>
      !loops
        .slice(0, i)
        .some((o) => inside(l.pts[0], o.pts) && inside(l.pts[Math.floor(l.pts.length / 2)], o.pts)),
  );
  const out: { label: string; at: [number, number] }[] = [];
  outer.forEach((o, k) => {
    const nest = loops.filter(
      (l) => (l.area >= 0.5 * o.area && l.area <= o.area && inside(l.pts[0], o.pts)) || l === o,
    );
    const inner = nest[nest.length - 1];
    // a point inside the innermost loop: scan rows of its box
    for (let r = 1; r < 20; r++) {
      const y = inner.box.minY + ((inner.box.maxY - inner.box.minY) * r) / 20;
      const xs: number[] = [];
      for (let i = 0, j = inner.pts.length - 1; i < inner.pts.length; j = i++) {
        const a = inner.pts[i],
          b = inner.pts[j];
        if (a.y > y !== b.y > y) xs.push(((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x);
      }
      xs.sort((p, q) => p - q);
      if (xs.length >= 2 && xs[1] - xs[0] > 20 && r >= 8) {
        out.push({ label: `click ${k + 1}`, at: [(xs[0] + xs[1]) / 2, y] });
        return;
      }
    }
  });
  return out;
}

// ── renders ─────────────────────────────────────────────────────────────────────────────

function renderPieces(
  dir: string,
  preview: Float32Array[],
  fams: PieceFamily[],
  seeds: Seed[],
  exported: Set<number>,
  sheetBox: { minX: number; minY: number; maxX: number; maxY: number },
) {
  const chains: Stroke[] = preview.map((a) => {
    const pts: PtMm[] = [];
    for (let i = 0; i + 1 < a.length; i += 2) pts.push({ x: a[i], y: a[i + 1] });
    return { pts, color: '#c8c8c8', width: 0.6 };
  });
  const sheetStrokes: Stroke[] = [...chains];
  const sheetLabels: Label[] = [];
  fams.forEach((f, i) => {
    const sd = seeds.find((x) => x.id === f.seed);
    const lab = (sd?.text?.text ?? sd?.origin ?? '?').slice(0, 20);
    const strokes: Stroke[] = [...chains];
    const labels: Label[] = [];
    let box = null as null | { minX: number; minY: number; maxX: number; maxY: number };
    for (const c of f.candidates) {
      if (!exported.has(c.rank)) continue;
      const col = PALETTE[c.rank % PALETTE.length];
      if (c.outcome === 'leak' && c.leakAt)
        labels.push({ at: c.leakAt, text: `LEAK r${c.rank}`, color: '#d00', size: 12 });
      if (c.outer.length < 3) continue;
      const st = {
        pts: c.outer,
        closed: true,
        color: c.outcome === 'closed' ? col : '#d00',
        width: 1.4,
        dash: c.outcome === 'closed' ? undefined : '6 3',
      };
      strokes.push(st);
      sheetStrokes.push({ ...st, width: 1 });
      const top = c.outer.reduce((a, b) => (b.y > a.y ? b : a));
      labels.push({
        at: { x: top.x + 2 + c.rank * 10, y: top.y + 4 },
        text: String(c.rank),
        color: col,
        size: 11,
      });
      if (c.outcome === 'closed') {
        const b = c.bbox;
        box = box
          ? {
              minX: Math.min(box.minX, b.minX),
              minY: Math.min(box.minY, b.minY),
              maxX: Math.max(box.maxX, b.maxX),
              maxY: Math.max(box.maxY, b.maxY),
            }
          : { ...b };
      }
    }
    if (sd) {
      labels.push({
        at: sd.at,
        text: `● ${lab}${f.monotone ? '' : ' NOT-MONO'}`,
        color: '#000',
        size: 16,
      });
      sheetLabels.push({ at: sd.at, text: lab, color: '#000', size: 16 });
    }
    if (!box) return;
    const pad = 25;
    const bx = {
      minX: box.minX - pad,
      minY: box.minY - pad,
      maxX: box.maxX + pad,
      maxY: box.maxY + pad,
    };
    const span = Math.max(bx.maxX - bx.minX, bx.maxY - bx.minY);
    const px = Math.min(3, 1400 / span);
    try {
      renderPng(
        resolve(dir, `piece-${String(i + 1).padStart(2, '0')}-${lab.replace(/[^\w]+/g, '_')}.png`),
        bx,
        strokes,
        labels,
        px,
      );
    } catch {
      /* rsvg missing: renders are optional */
    }
  });
  const span = Math.max(sheetBox.maxX - sheetBox.minX, sheetBox.maxY - sheetBox.minY);
  try {
    renderPng(
      resolve(dir, 'sheet.png'),
      sheetBox,
      sheetStrokes,
      sheetLabels,
      Math.min(1, 2400 / span),
    );
  } catch {
    /* optional */
  }
}

/** The written DXF through the CARD's parser (G1's view), drawn as the card would see it. */
async function renderDxf(text: string, png: string) {
  const rt = await roundTrip(text);
  const strokes: Stroke[] = [];
  const labels: Label[] = [];
  let box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const sizesSeen: string[] = [];
  const largest = new Map<string, { at: PtMm; area: number }>();
  for (const p of rt.pieces) {
    const pts = contourMm(p);
    const name = p.blockName ?? p.name;
    const tok = name.split('_').pop() ?? '';
    if (!sizesSeen.includes(tok)) sizesSeen.push(tok);
    const col = PALETTE[sizesSeen.indexOf(tok) % PALETTE.length];
    strokes.push({ pts, closed: true, color: col, width: 1 });
    for (const q of pts) {
      box = {
        minX: Math.min(box.minX, q.x),
        minY: Math.min(box.minY, q.y),
        maxX: Math.max(box.maxX, q.x),
        maxY: Math.max(box.maxY, q.y),
      };
    }
    const id = name.slice(0, name.lastIndexOf('_')) || name;
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
    const cy = pts.reduce((s, q) => s + q.y, 0) / pts.length;
    if (!largest.has(id) || Math.abs(a) > largest.get(id)!.area)
      largest.set(id, { at: { x: cx, y: cy }, area: Math.abs(a) });
  }
  for (const [id, v] of largest) labels.push({ at: v.at, text: id, color: '#000', size: 14 });
  if (Number.isFinite(box.minX)) {
    const pad = 20;
    const bx = {
      minX: box.minX - pad,
      minY: box.minY - pad,
      maxX: box.maxX + pad,
      maxY: box.maxY + pad,
    };
    const span = Math.max(bx.maxX - bx.minX, bx.maxY - bx.minY);
    try {
      renderPng(
        png,
        bx,
        strokes,
        labels,
        Math.min(2, 2000 / span),
        sizesSeen.map((t, i) => ({ color: PALETTE[i % PALETTE.length], text: t })),
      );
    } catch {
      /* optional */
    }
  }
  return {
    pieces: rt.pieces.length,
    blocks: rt.blockNames?.length ?? null,
    failedFiles: rt.failedFiles ?? 0,
    warnings: (rt.warnings ?? []).slice(0, 3),
  };
}

// ── f17 sweep: every odd input is refused at open with a typed reason (or read) ──────────

export function f17Sweep() {
  const dir = resolve(CORPUS, 'synthetic/f17');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).map((f) => {
    const b = readFileSync(resolve(dir, f));
    try {
      new Session(1, [
        {
          name: f,
          bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
        },
      ]).close();
      return { file: f, opened: true };
    } catch (e) {
      const w = toWireError(e);
      return { file: f, opened: false, code: w.code, message: w.message.slice(0, 140) };
    }
  });
}

export async function main(args: string[]): Promise<number> {
  if (args[0] === 'list') {
    console.log(JSON.stringify(CASES.map((c) => c.id)));
    return 0;
  }
  if (args[0] === 'cmp') {
    for (const r of await cmpDxf(args[1], args[2])) console.log(r);
    return 0;
  }
  if (args[0] === 'f17') {
    console.log(`@@RESULT ${JSON.stringify({ id: 'f17', sweep: f17Sweep() })}`);
    return 0;
  }
  const want = args.length ? CASES.filter((c) => args.includes(c.id)) : CASES;
  for (const c of want) {
    const r = await runCase(c);
    console.log(`@@RESULT ${JSON.stringify(r)}`);
  }
  return 0;
}

/**
 * `cmp <source.dxf> <written.dxf>`: per block name and layer, the source contour area vs the written
 * one, through the card's parser — catches a cut line that moved (allowance added twice, wrong layer).
 */
export async function cmpDxf(src: string, out: string) {
  const area = (pts: PtMm[]) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    }
    return Math.abs(a) / 2 / 100;
  };
  const read = async (p: string) => {
    const r = await roundTrip(readFileSync(p).toString('latin1'), basename(p));
    const m = new Map<string, Record<string, number>>();
    for (const q of r.pieces) {
      const k = (q.blockName ?? q.name).toUpperCase();
      const e = m.get(k) ?? {};
      e[q.layer ?? '?'] = Math.round(area(contourMm(q)));
      m.set(k, e);
    }
    return m;
  };
  const a = await read(src);
  const b = await read(out);
  const rows: string[] = [];
  for (const [k, v] of b) {
    const s =
      a.get(k) ??
      [...a.entries()].find(
        ([n]) => n.replace(/[^A-Z0-9]/g, '') === k.replace(/[^A-Z0-9]/g, ''),
      )?.[1];
    rows.push(`${k.padEnd(24)} out ${JSON.stringify(v)}  src ${JSON.stringify(s ?? null)}`);
  }
  return rows;
}
