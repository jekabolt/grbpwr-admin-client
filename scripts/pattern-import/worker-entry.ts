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
import { setRasterPdfjsLoader } from 'lib/pattern-import/adapters/raster';
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
  opt: { mustPass?: boolean } = { mustPass: true },
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
    dialect: 'r12',
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
