// Compare a single native Pieces state before/after automatic recovery using the saved size card.
// node automatic-gap-replay.mjs <PDF archive or path map> <shortlist-report.json> <output> <shot> [<shot> ...] [--all | --files <list>]
// A path map maps run IDs to original PDFs if the archive has duplicate filenames.
// Each PDF runs in a separate process, serially. REPLAY_FIRST_PDF runs that document first.
// Saves the last PieceSession and original wizard stop (V8 serialization retains Sets and Maps).
// Reuse an output to compare recovery implementations on fixed inputs. Start a fresh output when
// changing PDF extraction, seeds, fill or another stage that supplied the native snapshot.
// --snapshot-root <old-output> reads only captured inputs and writes fresh comparisons to a
// separate output. The geometry basis is final when the capture includes structural edits.
// AUTOPILOT_OUTLINES=1 also saves the wizard's final cells and gate results for comparisons.
// REPLAY_TIMEOUT_MS=0 disables the per-document wall-clock deadline across laptop sleep.
// Summarize a completed or in-progress run with --summary <output>.
// --try-bridges <output> tries the historical shortlist's exact proposed operator bridges on
// cached input. A resulting closure still requires an independent check against the original PDF.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deserialize, getHeapStatistics, serialize } from 'node:v8';
import { gunzipSync, gzipSync } from 'node:zlib';
import { build } from 'esbuild';

const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
function save(path, data) {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, data);
  renameSync(temp, path);
}

function pdfPaths(input) {
  if (!statSync(input).isDirectory())
    return Object.fromEntries(
      Object.entries(read(input)).map(([id, path]) => [id, resolve(dirname(input), path)]),
    );
  const paths = new Map();
  for (const item of readdirSync(input, { recursive: true, withFileTypes: true })) {
    if (!item.isFile() || !/\.pdf$/i.test(item.name)) continue;
    const id = item.name.replace(/\.pdf$/i, '');
    paths.set(id, paths.has(id) ? null : resolve(item.parentPath, item.name));
  }
  return Object.fromEntries(paths);
}
const self = fileURLToPath(import.meta.url);
const scripts = dirname(self);
const repo = resolve(scripts, '../..');
const workerFlags = ['--expose-gc', '--max-old-space-size=4096'];

function projection(families, run, cases) {
  return cases.map((item) => {
    const family = families.find((f) => f.seed === item.seed);
    const cell = family?.candidates.find((c) => run.sizes[c.rank]?.label === item.size);
    return {
      seed: item.seed,
      size: item.size,
      label: item.label,
      outcome: cell?.outcome ?? 'absent',
      rawWalls: cell?.walls?.length ?? null,
      extrapolated: cell?.gradeHint ? !!cell.gradeHint.extrapolated : null,
      leakAt: cell?.leakAt ?? null,
      historicalSiteDistanceMm:
        cell?.leakAt && item.at
          ? Math.hypot(cell.leakAt.x - item.at[0], cell.leakAt.y - item.at[1])
          : null,
      bridge: cell?.gapRecovery ?? null,
      choices: cell?.gapOptions?.length ?? 0,
    };
  });
}

function closureCounts(families) {
  const cells = families.flatMap((f) => f.candidates);
  return {
    total: cells.length,
    closed: cells.filter((c) => c.outcome === 'closed').length,
    leaks: cells.filter((c) => c.outcome === 'leak').length,
    choices: cells.filter((c) => c.gapOptions?.length > 1).length,
  };
}

function changedClosed(before, after) {
  const changed = [];
  for (const family of before) {
    const next = after.find((f) => f.seed === family.seed);
    if (next === family) continue;
    for (const cell of family.candidates) {
      if (cell.outcome !== 'closed') continue;
      const other = next?.candidates.find((c) => c.rank === cell.rank);
      if (other?.outcome !== 'closed' || JSON.stringify(cell.outer) !== JSON.stringify(other.outer))
        changed.push({ seed: family.seed, rank: cell.rank });
    }
  }
  return changed;
}

async function worker(bundle, info, out) {
  const { pdf, card, id, cases, snapshotRoot } = read(info);
  const input = snapshotRoot ? join(snapshotRoot, id) : out;
  const snapshot = join(input, 'session.v8.gz');
  const baseline = join(input, 'native.json');
  const resultPath = join(out, 'result.json');
  const { runCase, recoverAutomaticGaps, finalizePieces } = await import(
    pathToFileURL(bundle).href
  );
  const compare = (ps, native) => {
    delete process.env.AUTO_GAP_OFF;
    const finalize =
      finalizePieces && Array.isArray(native.structuralEdits)
        ? (state) => finalizePieces(state, native.structuralEdits)
        : undefined;
    const initial = finalize ? finalize(ps) : ps.families;
    const before = projection(initial, ps.run, cases);
    const metric = { eligiblePairs: 0, nativeRefills: 0 };
    globalThis.countGapTrials = (name, n) => {
      metric[name] += n;
    };
    const t0 = performance.now();
    const cpuStart = process.cpuUsage();
    const after = recoverAutomaticGaps(ps, undefined, finalize);
    const cpu = process.cpuUsage(cpuStart);
    metric.recoveryCpuMs = Math.round((cpu.user + cpu.system) / 1000);
    metric.recoveryMs = Math.round(performance.now() - t0);
    const gains = [];
    for (const family of initial) {
      const next = after.find((f) => f.seed === family.seed);
      if (next === family) continue;
      for (const cell of family.candidates) {
        if (cell.outcome === 'closed') continue;
        const other = next?.candidates.find((c) => c.rank === cell.rank);
        if (other?.outcome === 'closed')
          gains.push({
            seed: family.seed,
            size: ps.run.sizes[cell.rank]?.label,
            bridge: other.gapRecovery,
            outer: other.outer,
          });
      }
    }
    const result = {
      id,
      native,
      metric,
      basis: finalize ? 'final' : 'raw',
      countsBefore: closureCounts(initial),
      countsAfter: closureCounts(after),
      before,
      after: projection(after, ps.run, cases),
      gains,
      changedClosed: changedClosed(initial, after),
    };
    save(resultPath, JSON.stringify(result, null, 2));
  };
  if (existsSync(snapshot) && existsSync(baseline)) {
    compare(deserialize(gunzipSync(readFileSync(snapshot))), read(baseline));
    return;
  }
  if (snapshotRoot) {
    if (!existsSync(baseline)) throw new Error('Missing captured input: ' + id);
    const native = read(baseline);
    if (native.exportedCells)
      throw new Error(
        'Missing native PieceSession for ' + native.exportedCells + ' exported cells: ' + id,
      );
    save(
      resultPath,
      JSON.stringify({
        id,
        native,
        countsBefore: null,
        countsAfter: null,
        before: [],
        after: [],
        gains: [],
        changedClosed: [],
      }),
    );
    return;
  }
  let last, structuralEdits;
  globalThis.captureGapSession = (ps, edits) => {
    last = ps;
    structuralEdits = edits;
  };
  process.env.PATIMPORT_REPO = repo;
  process.env.AUTO_GAP_OFF = '1';
  delete process.env.PIECES_OPEN_PASS;
  process.env.AUTOPILOT_ORACLE_PAGES = '1';
  process.env.AUTOPILOT_DXF_OUT = join(out, 'baseline-dxf');
  process.env.GOLDEN_ANSWERS = JSON.stringify({ pages: true, asides: true, outline: 'seam' });
  const record = await runCase({ id, group: 'pdf', files: [pdf], card }, null);
  if (record.error) throw new Error(record.error);
  if (process.env.AUTOPILOT_OUTLINES === '1') {
    save(join(out, 'cells.json'), JSON.stringify(record.families));
    save(
      join(out, 'run.json'),
      JSON.stringify({
        id,
        card,
        verdict: record.verdict,
        stop: record.stop,
        write: record.write,
        ms: record.ms,
      }),
    );
  }
  const cells = record.families.flatMap((f) => f.cells);
  const native = {
    verdict: record.verdict,
    stop: record.stop ?? null,
    nativeMs: record.ms,
    structuralEdits,
    exportedCells: cells.length,
    closed: cells.filter((c) => c.outcome === 'closed').length,
    leaks: cells.filter((c) => c.outcome === 'leak').length,
    emptyWallLists: cells.filter((c) => c.gap?.candidateWalls === 0).length,
    oldWallPairs: cells.filter((c) => c.gap?.legacyWallPair).length,
    writtenScopes: record.write?.length ?? 0,
  };
  if (!last) {
    if (cells.length) throw new Error('Wizard returned pieces without a captured fill: ' + id);
    save(baseline, JSON.stringify(native, null, 2));
    save(
      resultPath,
      JSON.stringify({
        id,
        native,
        countsBefore: null,
        countsAfter: null,
        before: [],
        after: [],
        gains: [],
        changedClosed: [],
      }),
    );
    return;
  }
  // The optional fill diagnostic can contain a grade hook closure. A replay reads only
  // native geometry, wall edits and candidates, all of which are serializable.
  const { diag: _diagnostic, ...geometry } = last;
  save(snapshot, gzipSync(serialize(geometry), { level: 1 }));
  save(baseline, JSON.stringify(native, null, 2));
  compare(last, native);
}

async function replay([pdfMap, source, destination, ...shotDirs]) {
  const timeout = Number(process.env.REPLAY_TIMEOUT_MS ?? 1200000);
  if (!Number.isSafeInteger(timeout) || timeout < 0) throw new Error('Invalid REPLAY_TIMEOUT_MS');
  if (!shotDirs.length)
    throw new Error('Expected PDF map, shortlist report, output, and shot directories');
  const all = shotDirs.includes('--all');
  shotDirs = shotDirs.filter((dir) => dir !== '--all');
  const at = shotDirs.indexOf('--files');
  let selected;
  if (at !== -1) {
    const [, list] = shotDirs.splice(at, 2);
    if (all || !list) throw new Error('Use --all or --files <list>');
    selected = new Set(
      readFileSync(list, 'utf8')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith('#'))
        .map((s) => s.replace(/\.pdf$/i, '')),
    );
    if (!selected.size) throw new Error('Empty PDF list');
  }
  const captureAt = shotDirs.indexOf('--snapshot-root');
  let snapshotRoot;
  if (captureAt !== -1) {
    const [, captured] = shotDirs.splice(captureAt, 2);
    snapshotRoot = resolve(captured);
    if (snapshotRoot === resolve(destination))
      throw new Error('Choose a separate output for the snapshot replay');
  }
  const paths = snapshotRoot ? {} : pdfPaths(pdfMap);
  const shortlist = read(source).shortlist;
  const casesById = Map.groupBy(shortlist, (c) => c.pdf);
  const wanted = selected ?? (all ? null : new Set(casesById.keys()));
  const jobs = [];
  for (const dir of shotDirs) {
    for (const entry of readdirSync(dir)) {
      if (wanted && !wanted.has(entry)) continue;
      if (!existsSync(join(dir, entry, 'run.json'))) continue;
      const { id, card, ms } = read(join(dir, entry, 'run.json'));
      if (snapshotRoot && !existsSync(join(snapshotRoot, id, 'native.json')))
        throw new Error('Missing original wizard result: ' + id);
      if (!snapshotRoot && (!paths[id] || !existsSync(paths[id])))
        throw new Error('Missing or ambiguous source PDF: ' + id);
      jobs.push({ pdf: paths[id], id, card, ms, cases: casesById.get(id) ?? [], snapshotRoot });
    }
  }
  const seen = new Set(jobs.map((job) => job.id));
  if (jobs.length !== seen.size) throw new Error('Duplicate PDFs in input shots');
  const missing = [...(wanted ?? [])].filter((id) => !seen.has(id));
  if (missing.length) throw new Error('Missing baseline: ' + missing.join(', '));
  const first = process.env.REPLAY_FIRST_PDF;
  if (first && !seen.has(first)) throw new Error('Missing priority PDF: ' + first);
  const dest = resolve(destination);
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, 'documents.json'), JSON.stringify(jobs.map((job) => job.id)));
  const scratch = mkdtempSync(join(tmpdir(), 'automatic-gap-replay-'));
  try {
    const bundle = join(scratch, 'replay.mjs');
    await build({
      stdin: {
        contents: [
          "export {runCase} from './scripts/pattern-import/autopilot-entry';",
          "export {recoverAutomaticGaps} from './src/lib/pattern-import/pieces/automatic-gap';",
          "export {finalizePieces} from './src/lib/pattern-import/pieces/finalize';",
          "export {applyWallEdits} from './src/lib/pattern-import/pieces/operator';",
          "export {findGap} from './src/lib/pattern-import/pieces/gap';",
          "export {chainPreviewOf} from './src/lib/pattern-import/worker/preview';",
        ].join('\n'),
        resolveDir: repo,
      },
      outfile: bundle,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      external: ['pdfjs-dist', 'pdfjs-dist/*'],
      alias: { react: join(scripts, 'react-hook-shim.ts') },
      plugins: [
        {
          name: 'capture-native-gap-input',
          setup(b) {
            b.onLoad({ filter: /pieces[/\\]automatic-gap\.ts$/ }, ({ path }) => {
              const code = readFileSync(path, 'utf8');
              const pairs = 'if (!pairs.length) return c;';
              const refill = 'const trial = applyWallEdits(session, [';
              if (!code.includes(pairs) || !code.includes(refill))
                throw new Error('Gap trial counter moved');
              return {
                loader: 'ts',
                contents: code
                  .replace(
                    pairs,
                    "(globalThis as any).countGapTrials?.('eligiblePairs', pairs.length); " + pairs,
                  )
                  .replace(
                    refill,
                    "(globalThis as any).countGapTrials?.('nativeRefills', 1); " + refill,
                  ),
              };
            });
            b.onLoad({ filter: /pattern-import[/\\]worker[/\\]session\.ts$/ }, ({ path }) => {
              const code = readFileSync(path, 'utf8');
              const marker = 'this.pieceSession = ps;';
              if (!code.includes(marker)) throw new Error('Native Pieces capture point moved');
              return {
                loader: 'ts',
                contents: code.replace(
                  marker,
                  '(globalThis as any).captureGapSession(ps, input.edits.filter((e) => !isWallEdit(e)));\n    ' +
                    marker,
                ),
              };
            });
          },
        },
      ],
    });
    copyFileSync(bundle, join(dest, 'replay-runtime.mjs'));
    const digest = createHash('sha256').update(readFileSync(bundle)).digest('hex');
    writeFileSync(join(dest, 'replay-bundle.sha256'), digest + '\n');
    const failed = [];
    for (const job of jobs.sort(
      (a, b) =>
        Number(b.id === first) - Number(a.id === first) ||
        Number(Boolean(b.cases.length)) - Number(Boolean(a.cases.length)) ||
        a.ms - b.ms,
    )) {
      const out = join(dest, job.id);
      mkdirSync(out, { recursive: true });
      const info = join(out, 'case.json');
      writeFileSync(info, JSON.stringify(job));
      const r = spawnSync(process.execPath, [...workerFlags, self, '--worker', bundle, info, out], {
        encoding: 'utf8',
        timeout,
        maxBuffer: 32 * 1024 * 1024,
      });
      writeFileSync(join(out, 'replay.log'), (r.stdout ?? '') + (r.stderr ?? ''));
      if (r.status !== 0) {
        failed.push(job.id);
        console.error(job.id, r.error?.message ?? r.stderr?.slice(-800));
      } else {
        const result = read(join(out, 'result.json'));
        console.log(
          job.id,
          result.native?.stop?.step ?? result.native?.verdict,
          'gains',
          result.gains?.length,
          result.after.map((c) => c.outcome + (c.bridge ? '/auto' : '')).join(','),
        );
      }
    }
    if (failed.length) throw new Error('Incomplete replays: ' + failed.join(', '));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function tryBridges(dir) {
  const { applyWallEdits, findGap, chainPreviewOf } = await import(
    pathToFileURL(resolve(dir, 'replay-runtime.mjs')).href
  );
  for (const id of readdirSync(dir).sort()) {
    const file = join(dir, id);
    const snapshot = join(file, 'session.v8.gz');
    if (!existsSync(snapshot)) continue;
    const cases = read(join(file, 'case.json')).cases;
    if (!cases.length) continue;
    const ps = deserialize(gunzipSync(readFileSync(snapshot)));
    const box = ps.sheet.bbox;
    const pv = chainPreviewOf(ps.set.chains, Math.max(box.maxX - box.minX, box.maxY - box.minY));
    const results = cases.map((item) => {
      const rank = ps.run.sizes.findIndex((s) => s.label === item.size);
      const family = ps.families.find((f) => f.seed === item.seed);
      const cell = family?.candidates.find((c) => c.rank === rank);
      const result = { seed: item.seed, size: item.size, before: cell?.outcome ?? 'absent' };
      if (cell?.outcome !== 'leak' || !cell.leakAt) return result;
      const allowed = ps.set.classes.filter(
        (row) => row.role === 'common' || (row.role === 'size' && row.sizeLabel === item.size),
      );
      const pair = findGap(
        cell.leakAt,
        pv,
        new Set(ps.walls.exclude),
        40,
        new Set(allowed.flatMap((row) => row.chains)),
      );
      const sameSite =
        item.at && Math.hypot(cell.leakAt.x - item.at[0], cell.leakAt.y - item.at[1]) <= 0.5;
      if (!sameSite || !pair?.facing || Math.round(pair.mm * 10) / 10 !== item.gapMm)
        return { ...result, refusal: 'historical candidate not reproduced' };
      const next = applyWallEdits(ps, [
        { kind: 'bridge', seed: item.seed, rank, from: pair.from, to: pair.to },
      ]).families;
      const updated = next
        .find((f) => f.seed === item.seed)
        ?.candidates.find((c) => c.rank === rank);
      return {
        ...result,
        pair,
        after: updated?.outcome ?? 'absent',
        source: updated?.rankFrom,
        sourceCoverage: updated?.sourceCoverage,
        p95Mm: updated?.p95Mm,
        walls: updated?.walls,
        changedClosed: changedClosed(ps.families, next),
        derived: updated?.derived,
        outer: updated?.outer,
      };
    });
    writeFileSync(join(file, 'operator-bridges.json'), JSON.stringify(results));
    console.log(id, results.map((r) => r.refusal ?? r.after ?? r.before).join(','));
  }
}

function summarize(dir) {
  const ids = existsSync(join(dir, 'documents.json')) ? read(join(dir, 'documents.json')) : null;
  const rows = (ids ?? readdirSync(dir)).flatMap((id) => {
    const file = join(dir, id, 'result.json');
    if (!existsSync(file)) return [];
    const result = read(file);
    return result.native ? [result] : [];
  });
  const sum = (fn) => rows.reduce((n, row) => n + (fn(row) ?? 0), 0);
  const stops = {};
  for (const { native } of rows) {
    const step = native.stop?.step ?? native.verdict;
    stops[step] = (stops[step] ?? 0) + 1;
  }
  return {
    requested: ids?.length ?? null,
    completed: rows.length,
    reachedNativePieces: rows.filter((r) => r.countsBefore ?? r.rawBefore).length,
    stops,
    nativeWrittenDocuments: rows.filter((r) => r.native.writtenScopes > 0).length,
    nativeWrittenScopes: sum((r) => r.native.writtenScopes),
    nativeExportedCells: sum((r) => r.native.exportedCells),
    nativeClosed: sum((r) => r.native.closed),
    nativeLeaks: sum((r) => r.native.leaks),
    nativeLeaksWithoutWalls: sum((r) => r.native.emptyWallLists),
    nativeLegacyPairs: sum((r) => r.native.oldWallPairs),
    shortlistedChecked: sum((r) => r.before.filter((c) => c.outcome !== 'absent').length),
    eligiblePairs: sum((r) => r.metric?.eligiblePairs),
    nativeRefills: sum((r) => r.metric?.nativeRefills),
    recoveryMs: sum((r) => r.metric?.recoveryMs),
    finalGeometryComparisons: rows.filter((r) => r.basis === 'final').length,
    newClosures: sum((r) => r.gains.length),
    contourChoices: sum((r) => (r.countsAfter ?? r.rawAfter)?.choices),
    previouslyClosedChanged: sum((r) => r.changedClosed.length),
  };
}

// Direct retries and the operator probe also process complete tiled sheets. The
// default 2 GB Node heap can run out while the wizard is still building the DXF.
if (
  ['--worker', '--try-bridges'].includes(process.argv[2]) &&
  getHeapStatistics().heap_size_limit < 4096 * 1024 ** 2
) {
  const retry = spawnSync(process.execPath, [...workerFlags, self, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  if (retry.error) throw retry.error;
  process.exitCode = retry.status ?? 1;
} else if (process.argv[2] === '--worker') await worker(...process.argv.slice(3));
else if (process.argv[2] === '--try-bridges') await tryBridges(process.argv[3]);
else if (process.argv[2] === '--summary')
  console.log(JSON.stringify(summarize(process.argv[3]), null, 2));
else await replay(process.argv.slice(2));
