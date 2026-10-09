// PATTERN-IMPORT · F13b probe — the worker SESSION (lib/pattern-import/worker/session.ts) driven
// stage by stage in node, exactly as the worker entry drives it: open → extract → scale →
// assemble (+ the DXF fast path: chains, pieces), the honest placeholders, refusals, cancel, and
// memory (RSS / heap after each stage; docs dropped after assembly).
//   node scripts/pattern-import/worker.mjs            (bundled by worker.mjs, like the other probes)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { setPdfjsLoader, type PdfjsModule } from 'lib/pattern-import/adapters/pdf';
import { setRasterPdfjsLoader } from 'lib/pattern-import/adapters/raster';
import type { StageIO, StageName } from 'lib/pattern-import/types';
import { ImportError, toWireError } from 'lib/pattern-import/worker/errors';
import { Session, type StageCtx } from 'lib/pattern-import/worker/session';

const REPO = process.env.PATIMPORT_REPO ?? process.cwd();
const CORPUS =
  process.env.PATIMPORT_CORPUS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/corpus/';
const REPORTS =
  process.env.PATIMPORT_REPORTS ??
  '/Users/jekabolt/go/src/github.com/jekabolt/tmp/plans/pdf-to-dxf/reports/';
const LEGACY = pathToFileURL(resolve(REPO, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href;
const loadLegacy = () => import(LEGACY) as Promise<PdfjsModule>;
setPdfjsLoader(loadLegacy);
setRasterPdfjsLoader(loadLegacy);

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
  check(
    name,
    'chains = placeholder',
    (await errCode(
      run('chains', { opts: { joinGapMm: 3, joinAngleDeg: 15, joinLateralMm: 0.15 } }),
    )) === 'stage-unavailable',
    'stage-unavailable',
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
      'pieces edits = placeholder (F4)',
      (await errCode(
        run('pieces', {
          edits: [{ kind: 'not-a-piece', seed: 0 }],
          opts: { cellMm: 0.5, snapMm: 0.3, variant: null },
        }),
      )) === 'stage-unavailable',
      'stage-unavailable',
    );
    s.close();
  }

  // Placeholders on a vector source
  {
    const s = new Session(1, [fileOf('pdf/reef.pdf')]);
    check(
      'reef',
      'sizes = placeholder (the PDF size run is F3b)',
      (await errCode(s.runStage('sizes', {} as never, ctx()))) === 'stage-unavailable',
      'stage-unavailable',
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
    'several DXF refused',
    (await refusal(['dxf-clo/allsizes.dxf', 'dxf-clo/POCKETS.dxf'])) === 'unsupported-format',
    'unsupported-format',
  );
  check(
    'garbage plt',
    'refused at open',
    (await refusal(['synthetic/binary-garbage.plt'])) === 'unsupported-format',
    'unsupported-format',
  );

  const failed = rows.filter((r) => !r.ok);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  writeFileSync(resolve(REPORTS, `F13b-${date}.json`), JSON.stringify({ rows, perf }, null, 1));
  console.log(`\n${rows.length - failed.length}/${rows.length} PASS`);
  return failed.length ? 1 : 0;
}
