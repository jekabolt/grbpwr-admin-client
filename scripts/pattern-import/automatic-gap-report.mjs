// Read saved dxf-shot output. Give each scan a disjoint list of shot directories.
// node scripts/pattern-import/automatic-gap-report.mjs <set40-shot> <holdout40-shot> [--json]
// JSON includes the candidate list and repeated leak sites within individual pieces.
// Historical shots lack legacy wall / source IDs. A leak site can also be a fallback seed.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sameSite = (a, b) => distance(a.at, b.at) <= 0.5;
const sameStrokeEnds = (a, b) =>
  a.chains.length === b.chains.length &&
  a.chains.every((id, i) => id === b.chains[i]) &&
  ((distance(a.ends[0], b.ends[0]) <= 0.5 && distance(a.ends[1], b.ends[1]) <= 0.5) ||
    (distance(a.ends[0], b.ends[1]) <= 0.5 && distance(a.ends[1], b.ends[0]) <= 0.5));

function repeated(cells, matches) {
  const groups = [];
  for (const cell of cells) {
    const same = groups.find((group) => group.every((other) => matches(other, cell)));
    if (same) same.push(cell);
    else groups.push([cell]);
  }
  return groups.filter((group) => new Set(group.map((cell) => cell.size)).size > 1);
}

const newCounts = () => ({
  files: 0,
  filesWithDxf: 0,
  filesAtApply: 0,
  filesAtApplyWithEveryCellClosed: 0,
  cells: 0,
  closed: 0,
  leaks: 0,
  automaticClosures: 0,
  cellsWithContourChoices: 0,
  paired: 0,
  facing: 0,
  facingWithin12mm: 0,
  shortlisted: 0,
  measuredLegacyWallLists: 0,
  emptyLegacyWallLists: 0,
  legacyWallPairs: 0,
  measuredSourcePairs: 0,
  repeatedSites: 0,
  repeatedSiteCells: 0,
  repeatedStrokePairs: 0,
  repeatedStrokePairCells: 0,
});

export function gapReport(roots) {
  const total = newCounts();
  const scans = [];
  const shortlist = [];
  const families = [];
  const seen = new Set();
  for (const dir of roots) {
    const counts = newCounts();
    const input = resolve(dir);
    const entries = readdirSync(input, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(resolve(input, entry.name, 'run.json')))
      .map((entry) => entry.name)
      .sort();
    if (!entries.length) throw new Error(`No completed shot in ${input}`);
    if (existsSync(resolve(input, 'shot.json'))) {
      const expected = read(resolve(input, 'shot.json'));
      for (const row of expected) {
        const id = row.id.replace(/\.pdf$/i, '');
        if (!entries.includes(id) || !['stopped', 'apply'].includes(row.verdict))
          throw new Error(`Incomplete shot: ${input}/${row.id} (${row.verdict})`);
      }
    }
    for (const entry of entries) {
      const file = resolve(input, entry);
      const run = read(resolve(file, 'run.json'));
      if (run.error || !['stopped', 'apply'].includes(run.verdict))
        throw new Error(`Incomplete shot: ${file} (${run.verdict})`);
      if (seen.has(run.id)) throw new Error(`Repeated PDF: ${run.id}`);
      seen.add(run.id);
      counts.files++;
      if (run.verdict === 'apply') counts.filesAtApply++;
      const dxf = resolve(file, 'dxf');
      if (existsSync(dxf) && readdirSync(dxf).some((name) => /\.dxf$/i.test(name)))
        counts.filesWithDxf++;
      const pieceFamilies = read(resolve(file, 'cells.json'));
      const cells = pieceFamilies.flatMap((family) => family.cells);
      if (run.verdict === 'apply' && cells.length && cells.every((c) => c.outcome === 'closed'))
        counts.filesAtApplyWithEveryCellClosed++;
      for (const family of pieceFamilies) {
        const key = { pdf: run.id, seed: family.seed, label: family.label };
        const leaks = [];
        for (const cell of family.cells) {
          counts.cells++;
          if (cell.outcome === 'closed') counts.closed++;
          if (cell.outcome === 'closed' && cell.gapRecovery?.chains?.length)
            counts.automaticClosures++;
          if (cell.gapChoices > 1) counts.cellsWithContourChoices++;
          if (cell.outcome !== 'leak') continue;
          counts.leaks++;
          const g = cell.gap;
          const row = { size: cell.size, at: cell.leakAt, refusal: cell.refusal };
          leaks.push(row);
          if (g?.candidateWalls != null) {
            counts.measuredLegacyWallLists++;
            if (!g.candidateWalls) counts.emptyLegacyWallLists++;
            if (g.legacyWallPair) counts.legacyWallPairs++;
          }
          if (!g?.found) continue;
          counts.paired++;
          if (g.chains?.length && g.ends?.length === 2) {
            counts.measuredSourcePairs++;
            row.chains = [...g.chains].sort((a, b) => a - b);
            row.ends = g.ends.map((p) => [p.x, p.y]);
          }
          if (!g.facing) continue;
          counts.facing++;
          if (g.mm > 12) continue;
          counts.facingWithin12mm++;
          if (!g.bracketed || g.predMm == null || g.predMm > 1.5) continue;
          counts.shortlisted++;
          shortlist.push({ ...key, ...row, gapMm: g.mm, predictionErrorMm: g.predMm });
        }
        if (leaks.length < 2) continue;
        const sites = repeated(
          leaks.filter((c) => c.at),
          sameSite,
        );
        const strokePairs = repeated(
          leaks.filter((c) => c.ends),
          sameStrokeEnds,
        );
        counts.repeatedSites += sites.length;
        counts.repeatedSiteCells += sites.flat().length;
        counts.repeatedStrokePairs += strokePairs.length;
        counts.repeatedStrokePairCells += strokePairs.flat().length;
        families.push({
          ...key,
          leaks,
          sites: sites.map(sizes),
          strokePairs: strokePairs.map(sizes),
        });
      }
    }
    scans.push({ input, counts });
    for (const k of Object.keys(total)) total[k] += counts[k];
  }
  for (const counts of [...scans.map((scan) => scan.counts), total]) {
    if (counts.leaks && !counts.measuredLegacyWallLists) {
      counts.emptyLegacyWallLists = null;
      counts.legacyWallPairs = null;
    }
    if (counts.paired && !counts.measuredSourcePairs) {
      counts.repeatedStrokePairs = null;
      counts.repeatedStrokePairCells = null;
    }
  }
  families.sort((a, b) => b.leaks.length - a.leaks.length);
  return { total, scans, shortlist, families };
}

function sizes(group) {
  return group.map((c) => c.size);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const json = process.argv.includes('--json');
  const roots = process.argv.slice(2).filter((arg) => arg !== '--json');
  if (!roots.length)
    throw new Error('Usage: automatic-gap-report.mjs <shot> [<shot> ...] [--json]');
  const report = gapReport(roots);
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    const table = {};
    for (const [name, total] of Object.entries(report.total)) {
      table[name] = Object.fromEntries(
        report.scans.map((scan, i) => [`${i + 1} ${basename(scan.input)}`, scan.counts[name]]),
      );
      table[name].total = total;
    }
    console.table(table);
    console.log(
      'The shortlist is a geometric screen. Repeated sites include fallback seed locations.',
    );
    console.log('Wall and source counts are measured only on shots with the corresponding fields.');
  }
}
