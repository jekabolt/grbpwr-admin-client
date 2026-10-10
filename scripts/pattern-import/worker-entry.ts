// PATTERN-IMPORT · F13b/F13c probe — the worker SESSION (lib/pattern-import/worker/session.ts)
// driven stage by stage in node, exactly as the worker entry drives it: open → extract → scale →
// assemble → chains → sizes → pieces (+ the operator's bridge / ignore-line) → semantics → write +
// gate, on PDFs and on the DXF fast path; the honest placeholder (fabrics), refusals, cancel, and
// memory (RSS / heap after each stage; docs dropped after assembly).
//   node scripts/pattern-import/worker.mjs            (bundled by worker.mjs, like the other probes)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { setPdfjsLoader, type PdfjsModule } from 'lib/pattern-import/adapters/pdf';
import {
  extractRasterImageDetailed,
  setRasterPdfjsLoader,
} from 'lib/pattern-import/adapters/raster';
import type {
  CardSize,
  DraftScopeTarget,
  PieceEdit,
  StageIO,
  StageName,
} from 'lib/pattern-import/types';
import { ImportError, toWireError } from 'lib/pattern-import/worker/errors';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';
import { guardPdfjs } from 'lib/pattern-import/worker/pdf-guard';
import { checkInputSet, imageSize, imagePixelsRefusal } from 'lib/pattern-import/worker/limits';
import { buildErrorReport, ImportLog } from 'lib/pattern-import/worker/report';
import { zipEntryNames } from 'lib/pattern-import/adapters/sniff/native';
import { PATIMPORT, type ImportSession } from 'lib/pattern-import/types';
import { readManifest } from 'lib/pattern-import/manifest';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
const loadLegacy = () => import(LEGACY) as Promise<PdfjsModule>;
// The worker entry hands both adapters the guarded module (M6); the probe does the same.
const loadGuarded = () => loadLegacy().then((m) => guardPdfjs(m));
setPdfjsLoader(loadGuarded);
setRasterPdfjsLoader(loadGuarded);

const ab = (rel: string) => {
  const b = readFileSync(resolve(CORPUS, rel));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const fileOf = (rel: string) => ({ name: rel.split('/').pop()!, bytes: ab(rel) });
const mb = (n: number) => Math.round(n / 1048576);
const gc = () => (globalThis as { gc?: () => void }).gc?.();

type Row = { case: string; check: string; ok: boolean; got: string };
const rows: Row[] = [];
const check = (c: string, name: string, ok: boolean, got: unknown) => {
  rows.push({ case: c, check: name, ok, got: typeof got === 'string' ? got : JSON.stringify(got) });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${c} · ${name} · ${typeof got === 'string' ? got : JSON.stringify(got)}`,
  );
};

function ctx(stopAfter?: number): StageCtx {
  let ticks = 0;
  let stop = false;
  const checkCancel = () => {
    if (stop) throw new ImportError('cancelled', 'stopped by the operator');
  };
  return {
    checkCancel,
    progress: () => {
      ticks++;
      if (stopAfter != null && ticks >= stopAfter) stop = true;
      checkCancel();
    },
  };
}

/** A one-page PDF painting a w × h image XObject (8-bit gray, no data: pdf.js drops it for its
 * size before decoding), optionally with a stroked vector line. `dims`: the size written directly,
 * as indirect integer objects (`/Width 6 0 R`, F14 R8), or indirect with a comment inside the
 * integer object (`6 0 obj % …` — pdf.js reads it, the raw byte scan cannot: the backstop). */
function pdfWithImage(
  w: number,
  h: number,
  vectors: boolean,
  dims: 'direct' | 'indirect' | 'hidden' = 'direct',
): ArrayBuffer {
  const content = `${vectors ? '10 10 m 500 500 l S\n' : ''}q 595 0 0 842 0 0 cm /Im1 Do Q\n`;
  const size = dims === 'direct' ? `/Width ${w} /Height ${h}` : '/Width 6 0 R /Height 7 0 R';
  const data = w * h <= 1e6 ? '\x80'.repeat(w * h) : '\x00';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    `<< /Type /XObject /Subtype /Image ${size} /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${data.length} >>\nstream\n${data}\nendstream`,
    ...(dims === 'direct'
      ? []
      : dims === 'indirect'
        ? [`${w}`, `${h}`]
        : [`% width\n${w}`, `% height\n${h}`]),
  ];
  let pdf = '%PDF-1.4\n';
  const offs: number[] = [];
  objs.forEach((o, i) => {
    offs.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offs) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const b = Buffer.from(pdf, 'latin1');
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

/** A PNG signature + IHDR claiming w × h (no pixel data: for the header readers). */
const pngOf = (w: number, h: number) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};

const errCode = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === 'function' ? p() : p);
    return null;
  } catch (e) {
    return toWireError(e).code;
  }
};

const pointsOf = (a: Float32Array[]) => a.reduce((n, x) => n + x.length / 2, 0);

async function vectorCase(
  name: string,
  files: string[],
  expect: { tiles?: number; kind?: string; scan?: boolean; sheets?: number },
) {
  if (process.env.PI_ONLY && process.env.PI_ONLY !== name) return null;
  const s = new Session(1, files.map(fileOf));
  const run = <S extends StageName>(st: S, input: StageIO[S]['in']) => s.runStage(st, input, ctx());
  const t0 = Date.now();
  const ex = await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
  const tEx = Date.now() - t0;
  const rssEx = mb(process.memoryUsage().rss);
  if (expect.kind)
    check(
      name,
      'sniffed kind',
      ex.files.every((f) => f.kind === expect.kind),
      ex.files.map((f) => f.kind).join(','),
    );
  if (expect.scan != null)
    check(
      name,
      'scan routed to the raster adapter',
      !!ex.calibrations?.length === expect.scan,
      `${ex.calibrations?.length ?? 0} calibrated pages`,
    );
  const sheets = new Set(ex.pages.filter((p) => p.cls === 'tile').map((p) => p.sheet));
  if (expect.sheets) check(name, 'tile sheets', sheets.size === expect.sheets, sheets.size);
  const best = ex.scale[0];
  await run('scale', {
    decision: { factor: best.factor, method: best.method, operatorConfirmed: true },
  });
  const t1 = Date.now();
  const as = await run('assemble', { sheet: 0 });
  const tAs = Date.now() - t1;
  gc();
  const after = process.memoryUsage();
  if (expect.tiles != null)
    check(
      name,
      'tiles placed',
      as.sheet.poses.length === expect.tiles,
      `${as.sheet.poses.length} (missing ${as.sheet.missing.length}, worst residual ${Math.max(0, ...as.sheet.poses.map((p) => p.residualMm)).toFixed(3)} mm)`,
    );
  check(
    name,
    'preview within budget',
    pointsOf(as.previewPaths) <= 250_000,
    `${as.previewPaths.length} lines, ${pointsOf(as.previewPaths)} pts`,
  );
  const t3 = Date.now();
  const ch = await run('chains', { opts: CHAIN_OPTS });
  check(
    name,
    'chains traced, preview one line per chain',
    ch.classes.length > 0,
    `${ch.classes.length} classes, ${ch.chainPreview.length} chains, ${ch.ambiguities?.length ?? 0} flags, ${Date.now() - t3} ms`,
  );
  // A second sheet / a hand grid re-reads the dropped docs.
  if (sheets.size > 1) {
    const t2 = Date.now();
    const as2 = await run('assemble', { sheet: [...sheets][1]! });
    check(
      name,
      'second sheet re-reads the files',
      as2.sheet.poses.length > 0,
      `${as2.sheet.poses.length} tiles in ${Date.now() - t2} ms`,
    );
  }
  console.log(
    `      ${name}: extract ${tEx} ms (rss ${rssEx} MB) · assemble ${tAs} ms · after assemble rss ${mb(after.rss)} MB heap ${mb(after.heapUsed)} MB · process peak rss ${Math.round(process.resourceUsage().maxRSS / 1024)} MB`,
  );
  s.close();
  return {
    name,
    extractMs: tEx,
    assembleMs: tAs,
    rssAfterExtractMb: rssEx,
    rssAfterAssembleMb: mb(after.rss),
    heapAfterAssembleMb: mb(after.heapUsed),
    processPeakRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
  };
}

export async function main(): Promise<number> {
  const perf: unknown[] = [];
  // the per-size DXF set alone (no report file: the full run owns F13c-<date>.json)
  if (process.env.PI_RT_ONLY) {
    await roundTripCase();
    const failed = rows.filter((r) => !r.ok).length;
    console.log(`\n${rows.length - failed}/${rows.length} PASS`);
    return failed ? 1 : 0;
  }
  if (process.env.PI_SET_ONLY) {
    await dxfSetCase();
    const failed = rows.filter((r) => !r.ok).length;
    console.log(`\n${rows.length - failed}/${rows.length} PASS`);
    return failed ? 1 : 0;
  }
  if (!process.env.PI_SKIP_E2E) {
    await pipelineCase('robe', ['pdf/robe.pdf'], {
      sizes: ['36', '38', '40', '42', '44', '46'],
      variant: null,
      mustPass: true,
    });
    await pipelineCase('palto', ['pdf/palto.pdf'], {
      sizes: ['72', '76', '80', '84', '88'],
      variant: 'Mod. 125',
      // palto BP_3 at 84 runs 0.3–1 mm off its wall for a stretch: G3 blocks it, honestly
      mustPass: false,
    });
    await operatorBridgeGateCase();
  }
  await guardsCase();
  if (process.env.PI_E2E_ONLY) return report([]);
  perf.push(await vectorCase('kombinezon', ['pdf/kombinezon.pdf'], { tiles: 44 }));
  perf.push(await vectorCase('palto', ['pdf/palto.pdf'], { tiles: 35 }));
  perf.push(await vectorCase('reef', ['pdf/reef.pdf'], { tiles: 32 }));
  perf.push(await vectorCase('leonie', ['pdf/leonie.pdf'], { tiles: 27, scan: true }));
  perf.push(
    await vectorCase(
      'redcafe 44–54',
      ['44', '46', '48', '50', '52', '54'].map((n) => `pdf/${n}.pdf`),
      { kind: 'pdf' },
    ),
  );
  perf.push(
    await vectorCase('gerber plt', ['synthetic/gerber-front.plt'], { tiles: 1, kind: 'hpgl' }),
  );
  perf.push(
    await vectorCase('inkscape svg', ['synthetic/inkscape-pieces-mm.svg'], {
      tiles: 1,
      kind: 'svg',
    }),
  );
  perf.push(await vectorCase('pdf-compatible ai', ['synthetic/pdf-compatible.ai'], { kind: 'ai' }));
  perf.push(await vectorCase('polupalto', ['pdf/polupalto.pdf'], { tiles: 50, sheets: 2 }));

  if (process.env.PI_ONLY) return 0;
  // DXF fast path
  {
    const s = new Session(1, [fileOf('dxf-clo/allsizes.dxf')]);
    const run = <S extends StageName>(st: S, input: StageIO[S]['in']) =>
      s.runStage(st, input, ctx());
    const ex = await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
    check('allsizes.dxf', 'presegmented', ex.presegmented === true, String(ex.presegmented));
    check(
      'allsizes.dxf',
      'units certain',
      ex.scale[0].confidence >= 0.9 && ex.scale[0].factor === 1,
      ex.scale[0],
    );
    await run('scale', {
      decision: { factor: 1, method: ex.scale[0].method, operatorConfirmed: false },
    });
    const as = await run('assemble', { sheet: 0 });
    check('allsizes.dxf', 'sheet = the DXF', as.sheet.poses.length === 1, as.sheet.poses.length);
    const ch = await run('chains', {
      opts: { joinGapMm: 3, joinAngleDeg: 15, joinLateralMm: 0.15 },
    });
    check(
      'allsizes.dxf',
      'chains from the blocks',
      ch.classes.length > 0,
      `${ch.classes.length} classes`,
    );
    const pc = await run('pieces', {
      edits: [],
      opts: { cellMm: 0.5, snapMm: 0.3, variant: null },
    });
    const feats = pc.families.flatMap((f) => f.candidates.flatMap((c) => c.features ?? []));
    check(
      'allsizes.dxf',
      'pieces from the blocks',
      pc.families.length === 9,
      `${pc.families.length} families, ${feats.filter((f) => f.kind === 'notch').length} notches, ${feats.filter((f) => f.kind === 'grain').length} grains`,
    );
    check(
      'allsizes.dxf',
      'write needs semantics',
      (await errCode(
        run('write', {
          scopes: [],
          assignment: { byPurpose: {}, interliningInBom: false, proposals: [] },
          sizes: [],
          dialect: 'r12',
          generator: 'probe',
        }),
      )) === 'out-of-order',
      'out-of-order',
    );
    // F7: sizes → semantics → fabrics → write through the session itself (the wizard's DXF path)
    check(
      'allsizes.dxf',
      'semantics before the size map',
      (await errCode(
        run('semantics', {
          fileAllowance: { meaning: 'cut', allowanceMm: 0, origin: 'default', evidence: [] },
          pieceOverrides: {},
          operatorGrain: {},
        }),
      )) === 'out-of-order',
      'out-of-order',
    );
    const CARD = ['xs', 's', 'm', 'l', 'xl'].map((n, rank) => ({
      sizeId: 500 + rank,
      name: `${n}_${44 + rank * 2}ta_m`,
      token: n.toUpperCase(),
      rank,
    }));
    const sz = await run('sizes', { card: CARD });
    check(
      'allsizes.dxf',
      'sizes mapped (fast path run)',
      sz.map.entries.some((e) => e.card),
      sz.map.entries.map((e) => `${e.source.label}→${e.card?.token ?? '—'}`).join(' '),
    );
    await run('pieces', { edits: [], opts: { cellMm: 0.5, snapMm: 0.3, variant: null } });
    const sem = await run('semantics', {
      fileAllowance: { meaning: 'cut', allowanceMm: 0, origin: 'default', evidence: [] },
      pieceOverrides: {},
      operatorGrain: {},
    });
    check(
      'allsizes.dxf',
      'semantics: 9 pieces',
      sem.pieces.length === 9,
      `${sem.pieces.length} pieces, ${sem.blocked.length} blocked`,
    );
    const bom = [
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
    ];
    const fab = await run('fabrics', { bom });
    check(
      'allsizes.dxf',
      'fabrics: every piece main (no fabric named)',
      (fab.byPurpose['TECH_CARD_BOM_PURPOSE_MAIN'] ?? []).length === 9,
      JSON.stringify(
        Object.fromEntries(Object.entries(fab.byPurpose).map(([k, v]) => [k, v.length])),
      ),
    );
    const fronts = sem.pieces.filter((p) => p.identity.startsWith('FP')).map((p) => p.seed);
    const wr = await run('write', {
      scopes: bom,
      assignment: { ...fab, byPurpose: { ...fab.byPurpose, TECH_CARD_BOM_PURPOSE_LINING: fronts } },
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
      generator: 'probe',
    });
    check(
      'allsizes.dxf',
      'write: main + lining files, gate passes (F5 walls)',
      wr.scopes.length === 2 &&
        Object.values(wr.gate).every((g) => g.passed) &&
        wr.scopes[1].identities.every((i) => i.startsWith('LIN_')),
      wr.scopes
        .map(
          (x) =>
            `${x.target.label}: ${x.identities.join(',')} gate ${
              wr.gate[x.target.scopeKey].passed
                ? '✓'
                : '✗ ' +
                  wr.gate[x.target.scopeKey].checks
                    .filter((c) => !c.ok && c.severity === 'block')
                    .map((c) => c.id)
                    .join(' ')
            }`,
        )
        .join(' · '),
    );
    check(
      'allsizes.dxf',
      'pieces of a DXF are not edited',
      (await errCode(
        run('pieces', {
          edits: [{ kind: 'not-a-piece', seed: 0 }],
          opts: { cellMm: 0.5, snapMm: 0.3, variant: null },
        }),
      )) === 'out-of-order',
      'out-of-order',
    );
    await run('pieces', { edits: [], opts: { cellMm: 0.5, snapMm: 0.3, variant: null } });
    const szM = await run('sizes', { card: card(['S', 'M', 'L']) });
    check(
      'allsizes.dxf',
      'size map: M → card M',
      szM.map.entries.length === 1 && szM.map.entries[0].card?.token === 'M',
      szM.map.entries.map((e) => `${e.source.label}→${e.card?.token ?? '—'}`).join(' '),
    );
    await run('pieces', { edits: [], opts: { cellMm: 0.5, snapMm: 0.3, variant: null } });
    const semM = await run('semantics', {
      ...SEM_DEFAULT,
      fileAllowance: { meaning: 'cut', allowanceMm: 0, origin: 'default', evidence: [] },
    });
    check(
      'allsizes.dxf',
      'semantics: every piece specced',
      semM.pieces.length >= 9 && !semM.blocked.length,
      `${semM.pieces.length} specs, ${semM.blocked.length} blocked`,
    );
    await writeCase('allsizes.dxf', run, semM, szM.map);
    s.close();
  }

  // Placeholders on a vector source
  {
    const s = new Session(1, [fileOf('pdf/reef.pdf')]);
    check(
      'reef',
      'sizes before the lines are traced',
      (await errCode(s.runStage('sizes', { card: [] }, ctx()))) === 'out-of-order',
      'out-of-order',
    );
    // F7: the fabrics stage exists; before the pieces it says what is missing
    check(
      'reef',
      'fabrics before the pieces',
      (await errCode(s.runStage('fabrics', { bom: [] }, ctx()))) === 'out-of-order',
      'out-of-order',
    );
    check(
      'reef',
      'assemble before scale',
      (await errCode(s.runStage('assemble', { sheet: 0 }, ctx()))) === 'out-of-order',
      'out-of-order',
    );
    check(
      'reef',
      'cancel at a progress tick',
      (await errCode(
        s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx(3)),
      )) === 'cancelled',
      'cancelled',
    );
    const ex = await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx());
    check(
      'reef',
      'session usable after a cancel',
      ex.pages.length === 35,
      `${ex.pages.length} pages`,
    );
    s.close();
  }

  // Refusals at open
  const refusal = (files: string[]) => errCode(() => new Session(1, files.map(fileOf)));
  check(
    'eps',
    'refused at open',
    (await refusal(['synthetic/postscript-only.eps'])) === 'unsupported-format',
    'unsupported-format',
  );
  check(
    'plt + svg',
    'mixed formats refused',
    (await refusal(['synthetic/gerber-front.plt', 'synthetic/inkscape-pieces-mm.svg'])) ===
      'unsupported-format',
    'unsupported-format',
  );
  check(
    '2 × dxf',
    'a per-size DXF set of two size-M files refused (one file per size)',
    (await refusal(['dxf-clo/allsizes.dxf', 'dxf-clo/POCKETS.dxf'])) === 'unsupported-format',
    'unsupported-format',
  );
  await dxfSetCase();
  await roundTripCase();
  check(
    'garbage plt',
    'refused at open',
    (await refusal(['synthetic/binary-garbage.plt'])) === 'unsupported-format',
    'unsupported-format',
  );

  return report(perf);
}

function report(perf: unknown[]): number {
  const failed = rows.filter((r) => !r.ok);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  writeFileSync(resolve(REPORTS, `F13c-${date}.json`), JSON.stringify({ rows, perf }, null, 1));
  console.log(`\n${rows.length - failed.length}/${rows.length} PASS`);
  return failed.length ? 1 : 0;
}

// ── F13c: the whole core through the session ──────────────────────────────────────────────

const CHAIN_OPTS = { joinGapMm: 3, joinAngleDeg: 15, joinLateralMm: 0.15 };
const FILL = { cellMm: 0.5, snapMm: 0.3 };
const SEM_DEFAULT: StageIO['semantics']['in'] = {
  fileAllowance: { meaning: 'seam', allowanceMm: 10, origin: 'default', evidence: [] },
  pieceOverrides: {},
  operatorGrain: {},
};
const card = (tokens: string[]): CardSize[] =>
  tokens.map((t, i) => ({ sizeId: 100 + i, name: t, token: t, rank: i, spellings: [t] }));
const MAIN: DraftScopeTarget = {
  scopeKey: 'TECH_CARD_BOM_PURPOSE_MAIN',
  fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
  bomLineKey: '',
  label: 'main',
  isInterlining: false,
};

type Run = <S extends StageName>(st: S, input: StageIO[S]['in']) => Promise<StageIO[S]['out']>;

async function writeCase(
  name: string,
  run: Run,
  sem: StageIO['semantics']['out'],
  map: StageIO['sizes']['out']['map'],
  opt: { mustPass?: boolean; dialect?: 'r12' | 'r2000' } = { mustPass: true },
) {
  const seeds = [...new Set(sem.pieces.map((p) => p.seed))];
  const w = await run('write', {
    scopes: [MAIN],
    assignment: { byPurpose: { [MAIN.scopeKey]: seeds }, interliningInBom: false, proposals: [] },
    sizes: map.entries.flatMap((e) =>
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
    dialect: opt.dialect ?? 'r12',
    generator: 'probe',
  });
  const g = w.gate[MAIN.scopeKey];
  const blocking = g?.checks.filter((c) => !c.ok && c.severity === 'block') ?? [];
  check(
    name,
    opt.mustPass ? 'write + gate: no blocking check' : 'write + gate: a real report',
    !!g && w.scopes.length === 1 && (!opt.mustPass || !blocking.length),
    g
      ? `${w.scopes[0]?.identities.length} identities · ${g.checks.filter((c) => c.ok).length}/${g.checks.length} ok${blocking.length ? ` · BLOCK ${blocking.map((c) => `${c.id}[${c.blocks.slice(0, 4).join(',')}] ${c.note ?? ''}`).join(' | ')}` : ''}`
      : 'no report',
  );
  // M7: G3's denominator comes from the source chain topology (walls-used.ts); print what it read.
  const g3 = g?.checks.find((c) => c.id === 'G3-coverage');
  console.log(
    `      ${name}: G3 ${g3?.value} · ${g3?.ok ? 'ok' : g3?.severity} · ${g3?.note ?? '—'}`,
  );
  const g4 = g?.checks.find((c) => c.id === 'G4-hausdorff');
  check(name, 'G4 against the semantics walls (closing edge kept)', !!g4?.ok, g4?.note ?? '—');
  const g1 = g?.checks.find((c) => c.id === 'G1-roundtrip');
  check(name, 'G1 the card parser reads it back', !!g1?.ok, g1?.note ?? '—');
  return w;
}

/**
 * M7 negative control on real data: the written seam of one drawn piece (its outline votes, so the
 * vote does not see the edit) runs 1.5 mm inside its wall for 20 mm. G3 must block that block.
 */
async function skipControl(
  name: string,
  s: Session,
  run: Run,
  map: StageIO['sizes']['out']['map'],
) {
  const inner = s as unknown as { semantics: StageIO['semantics']['out'] };
  const saved = inner.semantics;
  const bySeed = new Map<number, number>();
  for (const p of saved.pieces) bySeed.set(p.seed, (bySeed.get(p.seed) ?? 0) + 1);
  const target = saved.pieces.find(
    (p) => !p.unfoldedFold && bySeed.get(p.seed) === 1 && p.allowance.meaning === 'seam',
  );
  if (!target) {
    check(name, 'M7 negative control: a drawn seam piece to edit', false, 'none');
    return;
  }
  const z = target.sizes[Math.floor(target.sizes.length / 2)];
  const line = z.seam!;
  const cx = line.reduce((a, q) => a + q.x, 0) / line.length;
  const cy = line.reduce((a, q) => a + q.y, 0) / line.length;
  // resample every 0.5 mm, then pull the stretch [40, 60] mm toward the centroid by 1.5 mm
  const pts: { x: number; y: number }[] = [];
  let arc = 0;
  for (let i = 0; i < line.length; i++) {
    const a = line[i];
    const b = line[(i + 1) % line.length];
    const L = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(L / 0.5));
    for (let k = 0; k < n; k++) {
      const q = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
      const sArc = arc + (L * k) / n;
      if (sArc >= 40 && sArc <= 60) {
        const d = Math.hypot(cx - q.x, cy - q.y) || 1;
        q.x += ((cx - q.x) / d) * 1.5;
        q.y += ((cy - q.y) / d) * 1.5;
      }
      pts.push(q);
    }
    arc += L;
  }
  inner.semantics = {
    ...saved,
    pieces: saved.pieces.map((p) =>
      p === target ? { ...p, sizes: p.sizes.map((q) => (q === z ? { ...q, seam: pts } : q)) } : p,
    ),
  };
  const seeds = [...new Set(saved.pieces.map((p) => p.seed))];
  const w = await run('write', {
    scopes: [MAIN],
    assignment: { byPurpose: { [MAIN.scopeKey]: seeds }, interliningInBom: false, proposals: [] },
    sizes: map.entries.flatMap((e) =>
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
    generator: 'probe',
  });
  inner.semantics = saved;
  const block = `${target.identity}_${z.sizeToken}`;
  const g3 = w.gate[MAIN.scopeKey]?.checks.find((c) => c.id === 'G3-coverage');
  check(
    name,
    `M7 negative control: ${block}'s seam skips 20 mm of its wall (1.5 mm inside) → G3 blocks it`,
    !!g3 && !g3.ok && g3.severity === 'block' && g3.blocks.includes(block),
    `${g3?.value} · ${g3?.note}`,
  );
}

const shaOf = new Map<string, string[]>();

/**
 * I2: the operator's "close gap" through the F4b API, end to end on palto (Mod. 125, size 72 not
 * exported — its raster neck splits under the offset): one 4.7 mm bridge "for all sizes" at piece
 * 27's corner closes the region in every size, the two foreign-model leaks are "not a piece", and
 * the gate passes. F14b (Codex C1): the bridge is NOT a wall — G4 measures against the drawn
 * walls only and leaves out just the written stretch on the bridge, which G15 audits (lands on
 * drawn lines, short) and the manifest lists. Negative control: the same gap closed by a 44.7 mm
 * line drawn across it (the bridge carried 20 mm past each end) must block on G15.
 */
async function operatorBridgeGateCase() {
  const name = 'palto bridge';
  if (process.env.PI_ONLY && process.env.PI_ONLY !== name) return;
  const s = new Session(1, ['pdf/palto.pdf'].map(fileOf));
  const run: Run = (st, input) => s.runStage(st, input, ctx());
  const ex = await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
  await run('scale', {
    decision: { factor: ex.scale[0].factor, method: ex.scale[0].method, operatorConfirmed: true },
  });
  await run('assemble', { sheet: 0 });
  await run('chains', { opts: CHAIN_OPTS });
  const cardSizes = card(['72', '76', '80', '84', '88']);
  const sz0 = await run('sizes', { card: cardSizes });
  const sz = await run('sizes', {
    card: cardSizes,
    operatorMap: [{ ...sz0.map.entries[0], card: null, origin: 'operator' }],
  });
  const opts = { ...FILL, variant: 'Mod. 125' };
  const pc0 = await run('pieces', { edits: [], opts });
  const open0 = pc0.families.filter((f) => f.candidates.some((c) => c.outcome !== 'closed'));
  const corner = pc0.families.find((f) =>
    f.candidates.some((c) => c.leakAt && Math.hypot(c.leakAt.x - 997.5, c.leakAt.y - 1190.5) < 5),
  );
  const edits: PieceEdit[] = [
    {
      kind: 'bridge',
      seed: null,
      rank: null,
      from: { x: 996.6, y: 1194.1 },
      to: { x: 997.7, y: 1189.5 },
    },
  ];
  const pc1 = await run('pieces', { seeds: pc0.seeds, edits, opts });
  const fixed = pc1.families.find((f) => f.seed === corner?.seed);
  check(
    name,
    'one bridge "all sizes" closes the corner piece in every size (refill of the seeds it reaches)',
    !!fixed &&
      fixed.candidates.every((c) => c.outcome === 'closed') &&
      fixed.candidates.some((c) => c.derived?.some((d) => d.kind === 'operator-bridge')),
    fixed?.candidates.map((c) => c.outcome[0]).join('') ?? 'no corner leak found',
  );
  const drop = pc1.families
    .filter((f) => f.candidates.some((c) => c.outcome !== 'closed'))
    .map((f): PieceEdit => ({ kind: 'not-a-piece', seed: f.seed }));
  const pc = await run('pieces', { seeds: pc0.seeds, edits: [...edits, ...drop], opts });
  const codes = ['FAC', 'FP', 'PCK', 'BP', 'SL', 'CLR', 'LAP'];
  const names = Object.fromEntries(
    pc.families.map((f, i) => [
      f.seed,
      {
        code: codes[i] ?? 'BP',
        mods: [],
        displayName: `p${i + 1}`,
        nameOrigin: 'operator' as const,
      },
    ]),
  );
  const sem = await run('semantics', {
    fileAllowance: { meaning: 'seam', allowanceMm: 15, origin: 'operator', evidence: [] },
    pieceOverrides: names,
    operatorGrain: {},
  });
  check(
    name,
    'semantics: every piece specced (72 not exported)',
    sem.blocked.length === 0 && sem.pieces.length === pc.families.length,
    `${open0.length} open before, ${drop.length} dropped, ${sem.pieces.length} specs, ${sem.blocked.length} blocked`,
  );
  const w = await writeCase(name, run, sem, sz.map, { mustPass: true });
  const g = w.gate[MAIN.scopeKey];
  const g4 = g?.checks.find((c) => c.id === 'G4-hausdorff');
  const g15 = g?.checks.find((c) => c.id === 'G15-derived');
  const audited = (g?.derived ?? []).filter((d) => d.kind === 'operator-bridge');
  const inFile = readManifest(w.scopes[0]?.dxfText ?? '')?.gate?.derived?.length ?? 0;
  check(
    name,
    'G4 on drawn walls only passes; G15 audits the 4.7 mm bridge; the manifest lists it',
    !!g4?.ok && !!g15?.ok && audited.length > 0 && inFile === (g?.derived?.length ?? -1),
    `G4 ${g4?.value} · ${g4?.note} · G15 ${g15?.value} · audited ${audited.map((d) => `${d.block} ${d.lengthMm}/${d.offSourceMm} mm`).join(', ')} · in file ${inFile}`,
  );

  // negative control: the same gap closed by a long line drawn across it
  const ux = 1.1 / Math.hypot(1.1, 4.6);
  const uy = -4.6 / Math.hypot(1.1, 4.6);
  const long: PieceEdit[] = [
    {
      kind: 'bridge',
      seed: null,
      rank: null,
      from: { x: 996.6 - 20 * ux, y: 1194.1 - 20 * uy },
      to: { x: 997.7 + 20 * ux, y: 1189.5 + 20 * uy },
    },
  ];
  const pl1 = await run('pieces', { seeds: pc0.seeds, edits: long, opts });
  const dropL = pl1.families
    .filter((f) => f.candidates.some((c) => c.outcome !== 'closed'))
    .map((f): PieceEdit => ({ kind: 'not-a-piece', seed: f.seed }));
  const pl = await run('pieces', { seeds: pc0.seeds, edits: [...long, ...dropL], opts });
  const longUsed = pl.families.some((f) =>
    f.candidates.some((c) =>
      c.derived?.some(
        (d) =>
          d.kind === 'operator-bridge' &&
          Math.hypot(d.pts[1].x - d.pts[0].x, d.pts[1].y - d.pts[0].y) > 30,
      ),
    ),
  );
  const semL = await run('semantics', {
    fileAllowance: { meaning: 'seam', allowanceMm: 15, origin: 'operator', evidence: [] },
    pieceOverrides: Object.fromEntries(
      pl.families.map((f, i) => [
        f.seed,
        {
          code: codes[i] ?? 'BP',
          mods: [],
          displayName: `p${i + 1}`,
          nameOrigin: 'operator' as const,
        },
      ]),
    ),
    operatorGrain: {},
  });
  const seedsL = [...new Set(semL.pieces.map((p) => p.seed))];
  const wl = await run('write', {
    scopes: [MAIN],
    assignment: { byPurpose: { [MAIN.scopeKey]: seedsL }, interliningInBom: false, proposals: [] },
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
    generator: 'probe',
  });
  const gl = wl.gate[MAIN.scopeKey];
  const g15l = gl?.checks.find((c) => c.id === 'G15-derived');
  check(
    name,
    'negative: a 44.7 mm line across the same gap is outlined on, and G15 blocks the export',
    longUsed && !!gl && !gl.passed && !!g15l && !g15l.ok && g15l.severity === 'block',
    `outline uses it ${longUsed} · passed ${gl?.passed} · G15 ${g15l?.note?.slice(0, 240)}`,
  );
}

async function pipelineCase(
  name: string,
  files: string[],
  o: { sizes: string[]; variant: string | null; mustPass: boolean },
) {
  const s = new Session(1, files.map(fileOf));
  const run: Run = (st, input) => s.runStage(st, input, ctx());
  const t0 = Date.now();
  const ex = await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
  const { createHash } = await import('node:crypto');
  const want = files.map((f) =>
    createHash('sha256')
      .update(readFileSync(resolve(CORPUS, f)))
      .digest('hex'),
  );
  check(
    name,
    'M5: sha256 of every source file (WebCrypto in the session = node crypto)',
    ex.files.every((f, i) => f.sha256 === want[i]),
    ex.files.map((f) => f.sha256.slice(0, 12)).join(','),
  );
  shaOf.set(name, want);
  await run('scale', {
    decision: { factor: ex.scale[0].factor, method: ex.scale[0].method, operatorConfirmed: true },
  });
  await run('assemble', { sheet: 0 });
  const ch = await run('chains', { opts: CHAIN_OPTS });
  const sizeRows = ch.classes.filter((c) => c.role === 'size');
  check(
    name,
    'legend: size rows',
    sizeRows.length === o.sizes.length,
    `${sizeRows.map((c) => c.sizeLabel).join(' ')} · ${ch.ambiguities?.length ?? 0} flags`,
  );
  const cardSizes = card(o.sizes);
  const sz = await run('sizes', { card: cardSizes });
  check(
    name,
    'size map: every source size → its card size',
    sz.map.entries.every((e) => e.card && e.card.token === e.source.label),
    sz.map.entries.map((e) => `${e.source.label}→${e.card?.token ?? '—'}`).join(' '),
  );
  // operator remap round-trips
  const remap = await run('sizes', {
    card: cardSizes,
    operatorMap: [{ ...sz.map.entries[0], card: null, origin: 'operator' }],
  });
  check(
    name,
    'operator map: first size unmapped',
    remap.map.entries[0].card === null && remap.map.unmapped.length === 1,
    remap.map.unmapped.map((c) => c.token).join(','),
  );
  await run('sizes', { card: cardSizes });
  const opts = { ...FILL, variant: o.variant };
  const pc = await run('pieces', { edits: [], opts });
  const closed = (f: (typeof pc.families)[number]) =>
    f.candidates.every((c) => c.outcome === 'closed');
  const full = pc.families.filter(closed);
  check(
    name,
    'pieces from text seeds',
    full.length > 0,
    `${pc.seeds.length} seeds, ${pc.families.length} families, ${full.length} fully closed`,
  );
  // ignore-line → the piece leaks; bridges along the same line → it closes again.
  const f = full[0];
  const c = f.candidates[f.candidates.length - 1];
  const fam = pc.families;
  // the longest own wall of that candidate (by chain length on the preview)
  const wall = [...c.walls].sort(
    (a, b) => (ch.chainPreview[b]?.length ?? 0) - (ch.chainPreview[a]?.length ?? 0),
  )[0];
  const ignore: PieceEdit = { kind: 'ignore-line', chain: wall };
  const leak = await run('pieces', { seeds: pc.seeds, edits: [ignore], opts });
  const lf = leak.families.find((x) => x.seed === f.seed)!;
  check(
    name,
    'ignore-line opens the piece',
    lf.candidates.some((x) => x.outcome !== 'closed'),
    `wall ${wall}: ${lf.candidates.map((x) => x.outcome[0]).join('')}${lf.candidates.find((x) => x.leakAt)?.leakAt ? ` leak@${lf.candidates.find((x) => x.leakAt)!.leakAt!.x.toFixed(0)},${lf.candidates.find((x) => x.leakAt)!.leakAt!.y.toFixed(0)}` : ''}`,
  );
  // F4b operator API (I2): an appended wall edit refills only the seeds it can reach — the other
  // families come back exactly as before.
  const same = leak.families.filter((x) => {
    const was = pc.families.find((y) => y.seed === x.seed);
    return !!was && JSON.stringify(was) === JSON.stringify(x);
  });
  check(
    name,
    'ignore-line refills only the seeds it reaches',
    same.length < leak.families.length && !same.some((x) => x.seed === f.seed),
    `${leak.families.length - same.length} of ${leak.families.length} families refilled`,
  );
  // "use line" (setWall) on the ignored chain makes it a wall again: the piece closes as before.
  const setBack = await run('pieces', {
    seeds: pc.seeds,
    edits: [ignore, { kind: 'set-wall', chain: wall, rank: null }],
    opts,
  });
  const sf = setBack.families.find((x) => x.seed === f.seed)!;
  const sa = sf.candidates[sf.candidates.length - 1].areaMm2;
  check(
    name,
    'set-wall on the ignored line closes the piece again',
    closed(sf) && Math.abs(sa - c.areaMm2) <= 0.01 * c.areaMm2,
    `${sf.candidates.map((x) => x.outcome[0]).join('')} area ${(sa / 100).toFixed(0)} vs ${(c.areaMm2 / 100).toFixed(0)} cm²`,
  );
  const a = ch.chainPreview[wall];
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < a.length; i += 2) pts.push({ x: a[i], y: a[i + 1] });
  const step = Math.max(1, Math.floor(pts.length / 40));
  const bridges: PieceEdit[] = [];
  for (let i = 0; i + step < pts.length + step - 1; i += step) {
    const j = Math.min(pts.length - 1, i + step);
    if (j === i) break;
    bridges.push({ kind: 'bridge', seed: f.seed, rank: null, from: pts[i], to: pts[j] });
    if (j === pts.length - 1) break;
  }
  const back = await run('pieces', { seeds: pc.seeds, edits: [ignore, ...bridges], opts });
  const bf = back.families.find((x) => x.seed === f.seed)!;
  check(
    name,
    'bridges along the line close it again',
    closed(bf),
    `${bridges.length} bridges: ${bf.candidates.map((x) => x.outcome[0]).join('')} area ${(bf.candidates[bf.candidates.length - 1].areaMm2 / 100).toFixed(0)} vs ${(c.areaMm2 / 100).toFixed(0)} cm²`,
  );
  // the export: only fully closed families, named by the operator
  const drop: PieceEdit[] = fam
    .filter((x) => !closed(x))
    .map((x) => ({ kind: 'not-a-piece', seed: x.seed }));
  const fin = await run('pieces', { seeds: pc.seeds, edits: drop, opts });
  const names = Object.fromEntries(
    fin.families.map((x, i) => [
      x.seed,
      {
        code: 'BP',
        mods: [String(i + 1)],
        displayName: `piece ${i + 1}`,
        nameOrigin: 'operator' as const,
      },
    ]),
  );
  const sem = await run('semantics', { ...SEM_DEFAULT, pieceOverrides: names });
  const reasons = [...new Set(sem.blocked.map((b) => b.reason))];
  check(
    name,
    'semantics: specs built',
    sem.pieces.length > 0,
    `${sem.pieces.length} specs, ${sem.blocked.length} blocked (${reasons.join(', ')})`,
  );
  // grain by two clicks for the pieces without one
  const grain: StageIO['semantics']['in']['operatorGrain'] = {};
  for (const b of sem.blocked.filter((x) => x.reason === 'no-grain')) {
    const ff = fin.families.find((x) => x.seed === b.seed)!;
    const bb = ff.candidates[0].bbox;
    const cx = (bb.minX + bb.maxX) / 2;
    grain[b.seed] = { a: { x: cx, y: bb.minY + 30 }, b: { x: cx, y: bb.maxY - 30 } };
  }
  const sem2 = await run('semantics', {
    ...SEM_DEFAULT,
    pieceOverrides: names,
    operatorGrain: grain,
  });
  check(
    name,
    'semantics: grain clicks unblock',
    !sem2.blocked.some((b) => b.reason === 'no-grain'),
    `${sem2.pieces.length} specs, ${sem2.blocked.length} blocked (${[...new Set(sem2.blocked.map((b) => b.reason))].join(', ')})`,
  );
  const w = await writeCase(name, run, sem2, sz.map, { mustPass: o.mustPass });
  check(
    name,
    'M5: the manifest carries the source sha256 (provenance)',
    w.scopes.every(
      (x) => x.manifest.source.files.map((f) => f.sha256).join() === shaOf.get(name)?.join(),
    ),
    w.scopes[0]?.manifest.source.files.map((f) => f.sha256.slice(0, 12)).join(',') ?? '—',
  );
  if (name === 'robe') {
    const g3 = w.gate[MAIN.scopeKey]?.checks.find((c) => c.id === 'G3-coverage');
    check(name, 'M7 positive control: G3 passes on every closed piece', !!g3?.ok, `${g3?.value}`);
    await skipControl(name, s, run, sz.map);
  }
  if (name === 'palto') {
    // M7: with the denominator from source topology the two size-72 pieces whose outline leaves
    // its wall for 5–10 mm (the raster necks F13c saw at 72/76) block; BP_3_84's earlier block
    // came from the sheet frame line counted as its wall and is gone.
    const g3 = w.gate[MAIN.scopeKey]?.checks.find((c) => c.id === 'G3-coverage');
    check(
      name,
      'M7: G3 blocks only size-72 blocks (outline leaves its wall there)',
      !!g3 && !g3.ok && g3.blocks.length > 0 && g3.blocks.every((b) => b.endsWith('_72')),
      `${g3?.value} [${g3?.blocks.join(',')}]`,
    );
  }
  console.log(`      ${name}: pipeline ${Date.now() - t0} ms`);
  s.close();
}

// ── MF-B: input guards (M6) and the error report (M5) ─────────────────────────────────────

async function guardsCase() {
  const C = 'guards';
  const tiny = () => new ArrayBuffer(16);
  // files per run, bytes per run
  check(
    C,
    `${PATIMPORT.maxInputFiles + 1} files → too-large before reading`,
    checkInputSet(
      Array.from({ length: PATIMPORT.maxInputFiles + 1 }, (_, i) => ({
        name: `${i}.pdf`,
        bytes: 1,
      })),
    )?.code === 'too-large',
    checkInputSet(
      Array.from({ length: PATIMPORT.maxInputFiles + 1 }, (_, i) => ({
        name: `${i}.pdf`,
        bytes: 1,
      })),
    )?.message ?? '',
  );
  const huge = checkInputSet([{ name: 'scan.pdf', bytes: PATIMPORT.maxInputBytes + 1 }]);
  check(
    C,
    '150 MB + 1 byte → too-large, the message names the file',
    huge?.code === 'too-large' && huge.message.includes('scan.pdf'),
    huge?.message ?? '',
  );
  check(
    C,
    'a corpus-size set passes',
    checkInputSet([{ name: 'polupalto.pdf', bytes: 40e6 }]) === null,
    'ok',
  );
  check(
    C,
    'the worker re-checks: Session refuses 41 files (typed too-large)',
    (await errCode(
      () =>
        new Session(
          9,
          Array.from({ length: PATIMPORT.maxInputFiles + 1 }, (_, i) => ({
            name: `${i}.pdf`,
            bytes: tiny(),
          })),
        ),
    )) === 'too-large',
    'too-large',
  );
  // PDF page cap: palto (35 tile pages) against a guard of 3 pages
  setPdfjsLoader(() => loadLegacy().then((m) => guardPdfjs(m, { maxPages: 3 })));
  try {
    const s = new Session(1, [fileOf('pdf/palto.pdf')]);
    let msg = '';
    let code: string | null = null;
    try {
      await s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx());
    } catch (e) {
      const w = toWireError(e);
      code = w.code;
      msg = w.message;
    }
    check(
      C,
      'PDF over the page cap → too-large before any page is parsed, named',
      code === 'too-large' && msg.startsWith('palto.pdf'),
      msg,
    );
  } finally {
    setPdfjsLoader(loadGuarded);
  }
  // the guard forces no-eval and keeps the caller's params
  let seen: Record<string, unknown> = {};
  const spy = {
    getDocument: (p: Record<string, unknown>) => {
      seen = p;
      return { promise: Promise.resolve({ numPages: 1 }), destroy: async () => {} };
    },
  } as unknown as PdfjsModule;
  await guardPdfjs(spy).getDocument({ data: new Uint8Array(4), isEvalSupported: true } as never)
    .promise;
  check(
    C,
    'pdf.js guard: isEvalSupported false, XFA off, maxImageSize set, caller params kept',
    seen.isEvalSupported === false &&
      seen.enableXfa === false &&
      seen.maxImageSize === PATIMPORT.maxRasterPixels &&
      seen.data instanceof Uint8Array,
    JSON.stringify({ eval: seen.isEvalSupported, xfa: seen.enableXfa, max: seen.maxImageSize }),
  );
  // raster pixels: a PNG header claiming 20000 × 20000 px is refused before decoding
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(png.buffer).setUint32(16, 20000);
  new DataView(png.buffer).setUint32(20, 20000);
  check(
    C,
    'image header reader (PNG)',
    JSON.stringify(imageSize(png.buffer)) === '{"width":20000,"height":20000}',
    JSON.stringify(imageSize(png.buffer)),
  );
  const scan = new Session(2, [{ name: 'giant.png', bytes: png.buffer.slice(0) }]);
  const scanErr = await errCode(
    scan.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx()),
  );
  check(
    C,
    '400-megapixel PNG → too-large before decoding',
    scanErr === 'too-large' && !!imagePixelsRefusal(png.buffer, 'giant.png'),
    imagePixelsRefusal(png.buffer, 'giant.png')?.message ?? String(scanErr),
  );
  // C5 negative controls: no header → refused, never decoded on trust; a header past the first
  // MiB is still read; the decoder's own answer is checked again before the tracer allocates
  const deep = new Uint8Array((1 << 20) + 70000);
  deep.set([0xff, 0xd8]);
  let at = 2;
  for (; at < 1 << 20; at += 2 + 65533) {
    deep.set([0xff, 0xe1], at); // APP1 segments (EXIF/XMP) pushing SOF past 1 MiB
    new DataView(deep.buffer).setUint16(at + 2, 65533);
  }
  deep.set([0xff, 0xc0, 0, 17, 8], at);
  new DataView(deep.buffer).setUint16(at + 5, 20000);
  new DataView(deep.buffer).setUint16(at + 7, 20000);
  const deepErr = await errCode(
    new Session(3, [{ name: 'deep.jpg', bytes: deep.buffer.slice(0) }]).runStage(
      'extract',
      { opts: { sagittaMm: 0.05, keepFills: true } },
      ctx(),
    ),
  );
  check(
    C,
    `C5: JPEG whose SOF (20000 × 20000) sits at ${(at / 1048576).toFixed(2)} MiB → too-large before decoding`,
    deepErr === 'too-large' &&
      imageSize(deep.buffer)?.width === 20000 &&
      imageSize(deep.buffer)?.height === 20000,
    `${deepErr} · ${JSON.stringify(imageSize(deep.buffer))}`,
  );
  const blind = png.slice(0);
  blind.set([0x69, 0x48, 0x44, 0x52], 12); // not an IHDR chunk: the size is unknown
  const blindErr = await errCode(
    new Session(4, [{ name: 'blind.png', bytes: blind.buffer.slice(0) }]).runStage(
      'extract',
      { opts: { sagittaMm: 0.05, keepFills: true } },
      ctx(),
    ),
  );
  check(
    C,
    'C5: PNG whose size cannot be read from its header → refused, not decoded',
    blindErr === 'unsupported-format' &&
      imagePixelsRefusal(blind.buffer, 'blind.png')?.code === 'unsupported-format',
    `${blindErr} · ${imagePixelsRefusal(blind.buffer, 'blind.png')?.message ?? 'accepted'}`,
  );
  let decoderAsked = 0;
  const lying = await errCode(
    extractRasterImageDetailed(
      { id: '0', name: 'lying.png', bytes: png.buffer.slice(0) },
      { sagittaMm: 0.05, keepFills: true },
      {
        dpi: 300,
        // a decoder that answers more pixels than the limit (a header that lied); it hands no
        // pixel buffer: the check must come before anything reads one
        decode: async () => {
          decoderAsked++;
          return { data: new Uint8Array(0), width: 6000, height: 6000, channels: 4 };
        },
      },
    ),
  );
  check(
    C,
    `C5: decoded 6000 × 6000 (> ${PATIMPORT.maxRasterPixels / 1e6} MP) → too-large before tracing`,
    lying === 'too-large' && decoderAsked === 1,
    `${lying}, decoder called ${decoderAsked}×`,
  );
  check(
    C,
    'C5: limit ≤ 18 MP (345 MB measured peak, patimport:raster limit) and A1 @ 150 dpi fits',
    PATIMPORT.maxRasterPixels <= 18e6 &&
      imagePixelsRefusal(pngOf(3508, 4967).buffer, 'a1-150.png') === null,
    `${PATIMPORT.maxRasterPixels / 1e6} MP; A1@150 ${imagePixelsRefusal(pngOf(3508, 4967).buffer, 'a1-150.png')?.message ?? 'accepted'}`,
  );
  // C5 follow-up: pdf.js drops an image over the limit without a trace — a 6000 × 6000 scan
  // (36 MP) must not import as an empty page. Alone on its page → too-large; next to vectors →
  // the vectors are kept and a visible note names the skipped image.
  const scanOnly = await errCode(
    new Session(5, [{ name: 'scan36.pdf', bytes: pdfWithImage(6000, 6000, false) }]).runStage(
      'extract',
      { opts: { sagittaMm: 0.05, keepFills: true } },
      ctx(),
    ),
  );
  const mixed = new Session(6, [{ name: 'mixed36.pdf', bytes: pdfWithImage(6000, 6000, true) }]);
  const mixedOut = await mixed
    .runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx())
    .catch((e: unknown) => toWireError(e));
  const note =
    'warnings' in mixedOut ? mixedOut.warnings.find((w) => /6000 × 6000/.test(w)) : undefined;
  check(
    C,
    'C5: raster PDF whose 36 MP image pdf.js would drop → too-large; with vectors → kept + visible note',
    scanOnly === 'too-large' && !!note,
    `${scanOnly} · ${note ?? JSON.stringify(mixedOut).slice(0, 120)}`,
  );
  // F14 R8: the same images with an INDIRECT size (`/Width 6 0 R`) — the raw scan resolves the
  // integer objects; with a size the scan cannot read (a comment inside the object) the backstop
  // refuses the empty result; a small image of unreadable size is drawn, so it is NOT refused.
  const extractOf = (name: string, bytes: ArrayBuffer) =>
    new Session(7, [{ name, bytes }])
      .runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx())
      .catch((e: unknown) => toWireError(e));
  const indOnly = await extractOf('ind36.pdf', pdfWithImage(6000, 6000, false, 'indirect'));
  const indMixed = await extractOf('indmixed36.pdf', pdfWithImage(6000, 6000, true, 'indirect'));
  const indNote =
    'warnings' in indMixed ? indMixed.warnings.find((w) => /6000 × 6000/.test(w)) : undefined;
  check(
    C,
    'R8: indirect /Width /Height, image only → too-large naming 6000 × 6000 and the dpi guidance',
    'code' in indOnly &&
      indOnly.code === 'too-large' &&
      /6000 × 6000/.test(indOnly.message) &&
      /dpi/.test(indOnly.message),
    'code' in indOnly ? `${indOnly.code}: ${indOnly.message.slice(0, 140)}` : 'read',
  );
  check(
    C,
    'R8: indirect /Width /Height + vectors → vectors kept + the visible note',
    'pages' in indMixed && indMixed.pages.length === 1 && !!indNote,
    'pages' in indMixed
      ? `${indMixed.pages.map((p) => p.cls).join(',')} · ${indNote ?? 'no note'}`
      : JSON.stringify(indMixed).slice(0, 140),
  );
  const hidden = await extractOf('hidden36.pdf', pdfWithImage(6000, 6000, false, 'hidden'));
  const hiddenSmall = await extractOf('hidden-small.pdf', pdfWithImage(64, 64, false, 'hidden'));
  check(
    C,
    'R8 backstop: size unreadable by the scan, image dropped, page empty → too-large; a small one is drawn → not refused',
    'code' in hidden &&
      hidden.code === 'too-large' &&
      /dpi/.test(hidden.message) &&
      !('code' in hiddenSmall && hiddenSmall.code === 'too-large'),
    `${'code' in hidden ? `${hidden.code}: ${hidden.message.slice(0, 100)}` : 'read'} · small: ${'code' in hiddenSmall ? hiddenSmall.code : 'read'}`,
  );
  // zip listing: a forged central directory count cannot make the walk unbounded
  const z = new Uint8Array(22 + 46 * 3 + 9);
  const dv = new DataView(z.buffer);
  for (let k = 0; k < 3; k++) {
    const p = k * 49;
    dv.setUint32(p, 0x02014b50, true);
    dv.setUint16(p + 28, 3, true);
    z.set([0x61, 0x2e, 0x62], p + 46);
  }
  const eocd = z.length - 22;
  dv.setUint32(eocd, 0x06054b50, true);
  dv.setUint16(eocd + 10, 0xfffe, true); // claims 65534 entries
  dv.setUint32(eocd + 16, 0, true);
  const t0 = Date.now();
  const names = zipEntryNames(z);
  check(
    C,
    'zip listing: a forged entry count reads only what is there',
    names?.length === 3 && Date.now() - t0 < 100,
    `${names?.length} names`,
  );
  // error report: no contents, files with sha, the gate, the timeline
  const log = new ImportLog();
  log.push({ event: 'start', stage: 'write' });
  log.push({ event: 'error', stage: 'write', code: 'internal', message: 'probe' });
  const sess = {
    sessionId: 1,
    step: 'check',
    files: [
      { id: '0', name: 'robe.pdf', bytes: 123, sha256: 'ab'.repeat(32), kind: 'pdf', pages: 9 },
    ],
    pages: [],
    scale: { candidates: [], decision: null },
    sheet: null,
    chains: null,
    sizes: null,
    pieces: null,
    names: [],
    semantics: null,
    fabrics: null,
    variant: null,
    draft: {
      scopes: [
        {
          target: {
            scopeKey: 'MAIN',
            fabricPurpose: 'MAIN',
            bomLineKey: '',
            label: 'main',
            isInterlining: false,
          },
          filename: 'robe-main.dxf',
          name: '',
          dxfText: 'SECRET-DXF-CONTENTS',
          manifest: { blocks: [{}, {}] },
          identities: [],
        },
      ],
      downloads: [],
    },
    gate: { MAIN: { passed: false, checks: [], durationMs: 1 } },
    busy: null,
    error: 'probe failure',
  } as unknown as ImportSession;
  const rep = buildErrorReport({
    session: sess,
    operator: {
      files: [{ name: 'robe.pdf', bytes: 123 }],
      blob: new Uint8Array(1000),
      edits: [{ kind: 'bridge' }],
    },
    failure: { stage: 'write', code: 'internal', message: 'probe failure' },
    generator: 'probe',
    log: log.events,
  });
  const json = JSON.stringify(rep);
  check(
    C,
    'M5 error report: files + sha256, stage, gate, timeline, operator edits; no DXF text, no bytes',
    rep.files[0].sha256 === 'ab'.repeat(32) &&
      rep.failure?.stage === 'write' &&
      !!rep.gate.MAIN &&
      rep.timeline.length === 2 &&
      rep.written[0].bytes === 19 &&
      !json.includes('SECRET-DXF-CONTENTS') &&
      json.includes('"bytes":1000') &&
      json.includes('bridge'),
    `${json.length} bytes of JSON`,
  );
}

// ── J4: a per-size DXF set (owner decision 5: file per size → one DXF) ─────────────────────

/**
 * One size of a graded R2000 drawing as its own file — what CLO gives out per size. Blocks of other
 * sizes leave with their BLOCK_RECORD and INSERT; `stripTail` also drops `_<size>` from the names
 * (an exporter that names pieces without the size); `drop` removes pieces (negative control).
 */
function splitSize(
  text: string,
  size: string,
  opt: { stripTail?: boolean; drop?: string[]; as?: string } = {},
): string {
  const lines = text.split('\n');
  type Ent = { section: string; tags: [string, string][] };
  const ents: Ent[] = [];
  let section = '';
  let cur: Ent | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = lines[i].trim();
    const value = lines[i + 1].replace(/\r$/, '');
    if (code === '0') {
      cur = { section, tags: [] };
      ents.push(cur);
    }
    if (!cur) {
      cur = { section, tags: [] };
      ents.push(cur);
    }
    cur.tags.push([lines[i], value]);
    if (code === '2' && cur.tags[0][1] === 'SECTION') section = value;
    if (code === '0' && value === 'ENDSEC') section = '';
  }
  const nameOf = (e: Ent) => e.tags.find(([c]) => c.trim() === '2')?.[1] ?? '';
  const tail = (b: string) => b.split('_').pop()!.toUpperCase();
  const keep = (b: string) =>
    b.startsWith('*') || (tail(b) === size && !(opt.drop ?? []).includes(b));
  const rename = (b: string) => {
    if (b.startsWith('*')) return b;
    const stem = b.slice(0, b.lastIndexOf('_'));
    return opt.stripTail ? stem : opt.as ? `${stem}_${opt.as}` : b;
  };
  const out: string[] = [];
  let inDropped = false;
  for (const e of ents) {
    const kind = e.tags[0][1];
    if (e.section === 'BLOCKS' && kind === 'BLOCK') inDropped = !keep(nameOf(e));
    const dropped =
      (e.section === 'BLOCKS' && inDropped && (kind === 'BLOCK' || kind !== 'ENDSEC')) ||
      (e.section === 'TABLES' && kind === 'BLOCK_RECORD' && !keep(nameOf(e))) ||
      (kind === 'INSERT' && !keep(nameOf(e)));
    if (e.section === 'BLOCKS' && kind === 'ENDBLK') {
      const was = inDropped;
      inDropped = false;
      if (was) continue;
    }
    if (dropped) continue;
    for (const [c, v] of e.tags) {
      const code = c.trim();
      const isName =
        (code === '2' && (kind === 'INSERT' || kind === 'BLOCK_RECORD')) ||
        ((code === '2' || code === '3') && kind === 'BLOCK');
      out.push(c.replace(/\r$/, ''), isName ? rename(v) : v);
    }
  }
  return out.join('\r\n') + '\r\n';
}

const errOf = async (f: () => unknown) => {
  try {
    await f();
    return { code: null as string | null, message: '' };
  } catch (e) {
    return toWireError(e);
  }
};

async function dxfSetCase() {
  const C = 'dxf set';
  const graded = readFileSync(resolve(CORPUS, 'dxf-clo/allsizes-merged.dxf')).toString('latin1');
  const SIZES = ['XS', 'S', 'M', 'L', 'XL'];
  const enc = (t: string) => {
    const b = Buffer.from(t, 'latin1');
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  const set = (
    named: (s: string, i: number) => string,
    opt: Parameters<typeof splitSize>[2] = {},
    sizes = SIZES,
  ) => sizes.map((s, i) => ({ name: named(s, i), bytes: enc(splitSize(graded, s, opt)) }));
  const CARD5 = card(SIZES);

  /** open → … → write + gate through the session, as the wizard drives a DXF. */
  async function walk(
    label: string,
    files: { name: string; bytes: ArrayBuffer }[],
    operatorMap?: (map: StageIO['sizes']['out']['map']) => StageIO['sizes']['in']['operatorMap'],
  ) {
    const s = new Session(1, files);
    const run: Run = (st, input) => s.runStage(st, input, ctx());
    const ex = await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
    await run('scale', {
      decision: {
        factor: ex.scale[0].factor,
        method: ex.scale[0].method,
        operatorConfirmed: false,
      },
    });
    await run('assemble', { sheet: 0 });
    await run('chains', { opts: CHAIN_OPTS });
    const sz0 = await run('sizes', { card: CARD5 });
    const sz = operatorMap
      ? await run('sizes', { card: CARD5, operatorMap: operatorMap(sz0.map) })
      : sz0;
    const pc = await run('pieces', { edits: [], opts: { ...FILL, variant: null } });
    const sem = await run('semantics', {
      fileAllowance: { meaning: 'cut', allowanceMm: 0, origin: 'default', evidence: [] },
      pieceOverrides: {},
      operatorGrain: {},
    });
    const w = await writeCase(label, run, sem, sz.map);
    s.close();
    return { ex, sz0, sz, pc, sem, w };
  }

  // control: the graded drawing as one file
  const one = await walk(`${C} · control allsizes-merged.dxf`, [
    { name: 'allsizes-merged.dxf', bytes: enc(graded) },
  ]);
  const blocksOf = (w: Awaited<ReturnType<typeof walk>>['w']) =>
    w.scopes.flatMap((x) => x.manifest.blocks.map((b) => b.block)).sort();

  // A: five CLO per-size files (sizes in the block names), dropped in shuffled order
  {
    const files = set((s) => `coat_${s.toLowerCase()}.dxf`);
    const shuffled = [files[3], files[0], files[4], files[1], files[2]];
    const r = await walk(`${C} · 5 files`, shuffled);
    check(
      `${C} · 5 files`,
      'opens as one presegmented drawing; 5 files, one page each',
      !!r.ex.presegmented && r.ex.files.length === 5 && r.ex.pages.length === 5,
      `${r.ex.files.map((f) => f.name).join(',')} · ${r.ex.pages.map((p) => p.why).join(' | ')}`,
    );
    check(
      `${C} · 5 files`,
      'file sha256 kept per source file',
      r.ex.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)) &&
        new Set(r.ex.files.map((f) => f.sha256)).size === 5,
      r.ex.files.map((f) => f.sha256.slice(0, 8)).join(','),
    );
    const run = r.sz.run;
    const fileOfSize = run.sizes.map(
      (x) => `${x.label}←${r.ex.files.find((f) => f.id === x.file)?.name}`,
    );
    check(
      `${C} · 5 files`,
      'run = one file per size, XS…XL in rank order, each size from its own file',
      run.encoding === 'file-per-size' &&
        run.sizes.map((x) => x.label).join() === SIZES.join() &&
        run.sizes.every(
          (x) =>
            r.ex.files.find((f) => f.id === x.file)?.name === `coat_${x.label.toLowerCase()}.dxf`,
        ),
      fileOfSize.join(' '),
    );
    check(
      `${C} · 5 files`,
      'every size auto-mapped to the same card size, no guess',
      r.sz.map.entries.every(
        (e) =>
          e.card?.token === e.source.label && e.origin === 'auto' && (e.confidence ?? 1) >= 0.9,
      ),
      r.sz.map.entries.map((e) => `${e.source.label}→${e.card?.token ?? '—'}`).join(' '),
    );
    check(
      `${C} · 5 files`,
      '9 pieces × 5 sizes, as the single graded file',
      r.pc.families.length === 9 &&
        r.pc.families.every((f) => f.candidates.length === 5) &&
        r.sem.pieces.length === one.sem.pieces.length &&
        !r.sem.blocked.length,
      `${r.pc.families.length} families × ${r.pc.families.map((f) => f.candidates.length).join('')}, ${r.sem.pieces.length} specs (control ${one.sem.pieces.length})`,
    );
    check(
      `${C} · 5 files`,
      'written blocks = the control (allsizes-merged.dxf) block for block',
      blocksOf(r.w).join() === blocksOf(one.w).join() && blocksOf(r.w).length === 45,
      `${blocksOf(r.w).length} blocks, control ${blocksOf(one.w).length}`,
    );
    check(
      `${C} · 5 files`,
      'manifest source names the 5 files, not the merged drawing',
      r.w.scopes[0].manifest.source.files.map((f) => f.name).join() ===
        shuffled.map((f) => f.name).join(),
      r.w.scopes[0].manifest.source.files.map((f) => f.name).join(','),
    );
  }

  // B: pieces named without the size, the size only in the file names
  {
    const r = await walk(
      `${C} · sizes in file names`,
      set((s) => `jacket ${s}.dxf`, { stripTail: true }),
    );
    check(
      `${C} · sizes in file names`,
      'sizes read from the file names, mapped to the card',
      r.sz.map.entries.map((e) => `${e.source.label}→${e.card?.token}`).join(' ') ===
        SIZES.map((s) => `${s}→${s}`).join(' ') &&
        r.ex.pages.every((p) => /, from the file name$/.test(p.why)),
      r.sz.map.entries.map((e) => `${e.source.label}→${e.card?.token ?? '—'}`).join(' '),
    );
    check(
      `${C} · sizes in file names`,
      'written blocks = the control',
      blocksOf(r.w).join() === blocksOf(one.w).join(),
      `${blocksOf(r.w).length} blocks`,
    );
  }

  // C: no size anywhere — the operator assigns each file on the sizes step
  {
    const names = ['part a.dxf', 'part b.dxf', 'part c.dxf', 'part d.dxf', 'part e.dxf'];
    let before = '';
    const r = await walk(
      `${C} · operator assigns`,
      set((_, i) => names[i], { stripTail: true }),
      (map) => {
        before = map.entries
          .map((e) => `${e.source.label}→${e.card?.token ?? '—'}@${(e.confidence ?? 1).toFixed(1)}`)
          .join(' ');
        // the operator's answer: file i is SIZES[i] (the guess is confirmed by setting it)
        return map.entries.map((e, i) => ({ ...e, card: CARD5[i], origin: 'operator' as const }));
      },
    );
    check(
      `${C} · operator assigns`,
      'no size readable: every row is a guess the wizard makes the operator confirm',
      r.sz0.map.entries.length === 5 &&
        r.sz0.map.entries.every((e) => e.origin === 'auto' && (e.confidence ?? 1) < 0.9) &&
        r.sz0.map.entries.every((e) =>
          e.evidence?.some((x) => /no size in the block names/.test(x)),
        ),
      before,
    );
    check(
      `${C} · operator assigns`,
      'each file shows on its size row (legend evidence = the file)',
      r.sz0.run.sizes.every(
        (x) => r.ex.files.find((f) => f.id === x.file)?.name === names[Number(x.label) - 1],
      ),
      r.sz0.run.sizes
        .map((x) => `${x.label}←${r.ex.files.find((f) => f.id === x.file)?.name}`)
        .join(' '),
    );
    check(
      `${C} · operator assigns`,
      "operator's map wins; written blocks = the control",
      r.sz.map.entries.every((e) => e.origin === 'operator') &&
        blocksOf(r.w).join() === blocksOf(one.w).join(),
      r.sz.map.entries.map((e) => `${e.source.label}→${e.card?.token}`).join(' '),
    );
  }

  // negative controls — refused at open, the reason in words
  const refusedBy = async (
    label: string,
    files: { name: string; bytes: ArrayBuffer }[],
    re: RegExp,
  ) => {
    const e = await errOf(() => new Session(1, files));
    check(
      `${C} · refuse`,
      label,
      e.code === 'unsupported-format' && re.test(e.message),
      `${e.code}: ${e.message}`,
    );
  };
  await refusedBy(
    'the files do not carry the same pieces',
    SIZES.map((s) => ({
      name: `coat_${s}.dxf`,
      bytes: enc(splitSize(graded, s, s === 'L' ? { drop: ['CLR_4_L'] } : {})),
    })),
    /coat_L\.dxf has no CLR_4/,
  );
  await refusedBy(
    'two files of one size (CLO repeating the previous size)',
    [
      { name: 'coat_m.dxf', bytes: enc(splitSize(graded, 'M')) },
      { name: 'coat_l.dxf', bytes: enc(splitSize(graded, 'M')) },
    ],
    /coat_m\.dxf and coat_l\.dxf are both size M\. A set is one file per size/,
  );
  await refusedBy(
    'a duplicate size spelled in the file names only',
    [
      { name: 'jacket M.dxf', bytes: enc(splitSize(graded, 'M', { stripTail: true })) },
      { name: 'jacket M (1).dxf', bytes: enc(splitSize(graded, 'L', { stripTail: true })) },
    ],
    /are both size M/,
  );
  await refusedBy(
    'an all-sizes file inside a set',
    [fileOf('dxf-clo/ALLSIZES_DXF.dxf'), fileOf('dxf-clo/allsizes.dxf')],
    /ALLSIZES_DXF\.dxf carries several sizes/,
  );
  await refusedBy(
    'R12 files (the merger does not invent R2000 handles)',
    [fileOf('dxf-clo/blazer.dxf'), fileOf('dxf-clo/summer men.dxf')],
    /R2000/,
  );
  // post-check on what the reader saw: one piece per file and numeric sizes from the file names —
  // the DXF reader takes a number for a size only when two pieces share it, so the merged drawing
  // reads with no sizes at all. Opening is fine; reading refuses instead of guessing.
  {
    const files = ['XS', 'S'].map((s, i) => ({
      name: `coat ${44 + i * 2}.dxf`,
      bytes: enc(
        splitSize(graded, s, {
          stripTail: true,
          drop: ['FP_R', 'SL_R', 'SL_L', 'BP_1', 'CLR_3', 'FP_L', 'BP_2', 'CLR_4'].map(
            (b) => `${b}_${s}`,
          ),
        }),
      ),
    }));
    const opened = await errOf(() => new Session(1, files));
    const s = opened.code ? null : new Session(1, files);
    const e = s
      ? await errOf(() =>
          s.runStage('extract', { opts: { sagittaMm: 0.05, keepFills: true } }, ctx()),
        )
      : opened;
    check(
      `${C} · refuse`,
      'the merged drawing must READ as one size per file (checked after reading)',
      e.code === 'unsupported-format' && /did not read as one size/.test(e.message),
      `${e.code}: ${e.message}`,
    );
  }
  await refusedBy(
    'DXF + PDF in one run',
    [fileOf('dxf-clo/allsizes.dxf'), fileOf('pdf/robe.pdf')],
    /one run reads one format/,
  );
}

// ── F14 R5: our own DXF re-imports as written ─────────────────────────────────────────────

/**
 * The writer inserts a block once per cut piece (F14 MAJOR 3). Re-importing that file must read
 * the copies as ONE piece × size cut n times — not as size candidates [S,S,M,M] (non-monotone) and,
 * in a single-size file, not as "the same outline in every size" (→ `_UNI`). write → re-import →
 * write must be identical, for a pair drawn twice per hand (SL_L/SL_R × 2 = 2 pairs), a «cut 2»
 * single (BP_1 × 2) and the ×1 pieces, in a multi-size and a single-size file, both dialects.
 */
async function roundTripCase() {
  const C = 'R5 round trip';
  const graded = readFileSync(resolve(CORPUS, 'dxf-clo/allsizes-merged.dxf')).toString('latin1');
  const enc = (t: string) => {
    const b = Buffer.from(t, 'latin1');
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  };
  const PPG: Record<string, number> = { SL_L: 2, SL_R: 2, BP_1: 2 };
  const SEM_IN: Omit<StageIO['semantics']['in'], 'pieceOverrides'> = {
    fileAllowance: { meaning: 'cut', allowanceMm: 0, origin: 'default', evidence: [] },
    operatorGrain: {},
  };

  async function importAndWrite(
    label: string,
    name: string,
    text: string,
    sizes: string[],
    dialect: 'r12' | 'r2000',
    ppg: Record<string, number>,
  ) {
    const s = new Session(1, [{ name, bytes: enc(text) }]);
    const run: Run = (st, input) => s.runStage(st, input, ctx());
    const ex = await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
    await run('scale', {
      decision: {
        factor: ex.scale[0].factor,
        method: ex.scale[0].method,
        operatorConfirmed: false,
      },
    });
    await run('assemble', { sheet: 0 });
    await run('chains', { opts: CHAIN_OPTS });
    const sz = await run('sizes', { card: card(sizes) });
    const pc = await run('pieces', { edits: [], opts: { ...FILL, variant: null } });
    let sem = await run('semantics', { ...SEM_IN, pieceOverrides: {} });
    if (Object.keys(ppg).length) {
      const pieceOverrides: StageIO['semantics']['in']['pieceOverrides'] = {};
      for (const p of sem.pieces)
        if (ppg[p.identity]) pieceOverrides[p.seed] = { piecesPerGarment: ppg[p.identity] };
      sem = await run('semantics', { ...SEM_IN, pieceOverrides });
    }
    const w = await writeCase(label, run, sem, sz.map, { mustPass: true, dialect });
    s.close();
    return { ex, pc, sem, w, text: w.scopes[0]?.dxfText ?? '' };
  }

  /** The DXF without the manifest comments and the clock (CREATION DATE / TIME). */
  const body = (t: string) => {
    const L = t.split(/\r?\n/);
    const out: string[] = [];
    for (let i = 0; i + 1 < L.length; i += 2) {
      if (L[i].trim() === '999') continue;
      out.push(L[i], L[i + 1].replace(/^(CREATION (DATE|TIME)): .*/, '$1: —'));
    }
    return out.join('\n');
  };
  const inserts = (t: string) => {
    const L = t.split(/\r?\n/);
    const n = new Map<string, number>();
    for (let i = 0; i + 1 < L.length; i += 2)
      if (L[i].trim() === '0' && L[i + 1] === 'INSERT') {
        for (let j = i + 2; j + 1 < L.length && L[j].trim() !== '0'; j += 2)
          if (L[j].trim() === '2') n.set(L[j + 1], (n.get(L[j + 1]) ?? 0) + 1);
      }
    return n;
  };
  const ppgOf = (sem: StageIO['semantics']['out']) =>
    sem.pieces
      .map((p) => `${p.identity}×${p.piecesPerGarment}`)
      .sort()
      .join(' ');

  const cases: { label: string; text: string; sizes: string[]; dialect: 'r12' | 'r2000' }[] = [
    { label: 'multi-size r12', text: graded, sizes: ['XS', 'S', 'M', 'L', 'XL'], dialect: 'r12' },
    {
      label: 'multi-size r2000',
      text: graded,
      sizes: ['XS', 'S', 'M', 'L', 'XL'],
      dialect: 'r2000',
    },
    { label: 'single-size r12', text: splitSize(graded, 'M'), sizes: ['M'], dialect: 'r12' },
    { label: 'single-size r2000', text: splitSize(graded, 'M'), sizes: ['M'], dialect: 'r2000' },
  ];
  for (const k of cases) {
    const L = `${C} · ${k.label}`;
    const a = await importAndWrite(`${L} · source`, 'src.dxf', k.text, k.sizes, k.dialect, PPG);
    const ia = inserts(a.text);
    const want = Object.entries(PPG).every(([id, n]) =>
      [...ia].some(([b, c]) => b.startsWith(`${id}_`) && c === n),
    );
    check(
      L,
      'first write: SL_L / SL_R / BP_1 inserted twice per size',
      want,
      [...ia]
        .filter(([, c]) => c > 1)
        .map(([b, c]) => `${b}×${c}`)
        .join(' '),
    );
    const b = await importAndWrite(
      `${L} · re-import`,
      'written.dxf',
      a.text,
      k.sizes,
      k.dialect,
      {},
    );
    check(
      L,
      're-import: one candidate per size, nothing blocked, no UNI',
      b.pc.families.every((f) => f.candidates.length === k.sizes.length) &&
        !b.sem.blocked.length &&
        !b.sem.pieces.some((p) => p.ungraded) &&
        !b.w.scopes[0]?.manifest.blocks.some((x) => /_UNI$/.test(x.block)),
      `${b.pc.families.map((f) => f.candidates.length).join('')} · blocked ${b.sem.blocked.map((x) => `${x.seed}:${x.reason}`).join(',') || '—'} · ungraded ${
        b.sem.pieces
          .filter((p) => p.ungraded)
          .map((p) => p.identity)
          .join(',') || '—'
      }`,
    );
    check(
      L,
      're-import: × per garment as written (no operator override)',
      ppgOf(b.sem) === ppgOf(a.sem),
      `${ppgOf(b.sem)}${ppgOf(b.sem) === ppgOf(a.sem) ? '' : ` ≠ ${ppgOf(a.sem)}`}`,
    );
    const c = await importAndWrite(`${L} · twice`, 'written2.dxf', b.text, k.sizes, k.dialect, {});
    // INSERTs (block @ x) and every text value (labels) in order: what R5 is about
    const skeleton = (t: string) => {
      const L2 = t.split(/\r?\n/);
      const out: string[] = [];
      let ent = '';
      for (let q = 0; q + 1 < L2.length; q += 2) {
        const code = L2[q].trim();
        const v = L2[q + 1];
        if (code === '0') ent = v;
        if (code === '999') continue;
        if (ent === 'INSERT' && code === '2') out.push(`INSERT ${v}`);
        if (ent === 'INSERT' && code === '10') out[out.length - 1] += ` @${Number(v).toFixed(1)}`;
        if (code === '1') out.push(v.replace(/^(CREATION (DATE|TIME)): .*/, '$1: —'));
      }
      return out;
    };
    const sa = skeleton(a.text);
    const sb = skeleton(b.text);
    const firstDiff = sa.findIndex((x, q) => x !== sb[q]);
    check(
      L,
      'write → re-import → write: the same INSERTs (block, count, place) and the same labels',
      sa.length === sb.length && firstDiff < 0,
      firstDiff < 0
        ? `${sa.filter((x) => x.startsWith('INSERT')).length} INSERTs, ${sa.length} items`
        : `#${firstDiff}: ${sa[firstDiff]} → ${sb[firstDiff]}`,
    );
    check(
      L,
      'a second re-import writes byte-for-byte the same DXF (fixed point; manifest and clock aside)',
      body(c.text) === body(b.text),
      body(c.text) === body(b.text) ? `${body(b.text).length} chars` : 'differs',
    );
    // the first re-import may re-simplify a nearly collinear seam vertex (≤ 1 µm off its line):
    // geometry is compared through the manifest (bbox, area, feature counts per block) below
    check(
      L,
      'the manifest pieces and blocks are the same',
      JSON.stringify(b.w.scopes[0]?.manifest.pieces) ===
        JSON.stringify(a.w.scopes[0]?.manifest.pieces) &&
        JSON.stringify(b.w.scopes[0]?.manifest.blocks) ===
          JSON.stringify(a.w.scopes[0]?.manifest.blocks),
      `${b.w.scopes[0]?.manifest.pieces.length} pieces · ${b.w.scopes[0]?.manifest.blocks.length} blocks`,
    );
  }
  // controls on BP_1 «cut 2» (single size, R12): (a) without its QUANTITY label the two INSERTs
  // alone carry the cut quantity; (b) the second INSERT mirrored (x scale −1) is NOT a copy — it
  // stays a candidate of its own, as before
  {
    const L = `${C} · control`;
    const a = await importAndWrite(
      `${L} · source`,
      'src.dxf',
      splitSize(graded, 'M'),
      ['M'],
      'r12',
      {
        BP_1: 2,
      },
    );
    const noLabel = a.text.replace(/QUANTITY: 2/g, 'NOTE: copy');
    const lines = noLabel.split(/\r?\n/);
    let seen = 0;
    let at = -1;
    for (let i = 0; i + 1 < lines.length && at < 0; i += 2)
      if (lines[i].trim() === '0' && lines[i + 1] === 'INSERT')
        for (let j = i + 2; j + 1 < lines.length && lines[j].trim() !== '0'; j += 2)
          if (lines[j].trim() === '2' && lines[j + 1] === 'BP_1_M' && ++seen === 2) at = j + 2;
    const mirrored = [...lines.slice(0, at), ' 41', '-1.0', ...lines.slice(at)].join('\r\n');
    const r1 = await importAndWrite(`${L} · no label`, 'w.dxf', noLabel, ['M'], 'r12', {});
    const bp1 = r1.sem.pieces.find((p) => p.identity === 'BP_1');
    check(
      L,
      '(a) no QUANTITY label: two identical INSERTs alone read as cut 2',
      !/QUANTITY: 2/.test(noLabel) && bp1?.piecesPerGarment === 2,
      `BP_1 ×${bp1?.piecesPerGarment}`,
    );
    const s = new Session(1, [{ name: 'm.dxf', bytes: enc(mirrored) }]);
    const run: Run = (st, input) => s.runStage(st, input, ctx());
    const ex = await run('extract', { opts: { sagittaMm: 0.05, keepFills: true } });
    await run('scale', {
      decision: {
        factor: ex.scale[0].factor,
        method: ex.scale[0].method,
        operatorConfirmed: false,
      },
    });
    await run('assemble', { sheet: 0 });
    await run('chains', { opts: CHAIN_OPTS });
    await run('sizes', { card: card(['M']) });
    const pc = await run('pieces', { edits: [], opts: { ...FILL, variant: null } });
    const fam = pc.families.find((f) =>
      f.candidates.some((c) => (c as { dxf?: { identity?: string } }).dxf?.identity === 'BP_1'),
    );
    s.close();
    check(
      L,
      '(b) the second INSERT mirrored: not a copy, two candidates',
      at > 0 && fam?.candidates.length === 2,
      `${fam?.candidates.length} candidate(s)`,
    );
  }
}
