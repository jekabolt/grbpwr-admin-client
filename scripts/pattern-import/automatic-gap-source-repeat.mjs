// Summarize the native source chain IDs in gap-evidence-check.ts JSONL reports.
// A chain ID has meaning within one PDF. A gain is a complete closed outline.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reports = process.argv.slice(2);
assert(reports.length, 'Expected one or more gap-evidence-check.ts JSONL reports');
const open = new Set();
const matches = new Map();
for (const report of reports) {
  for (const line of readFileSync(report, 'utf8').split('\n').filter(Boolean)) {
    const cell = JSON.parse(line);
    if (cell.mode !== 'open-holes') continue;
    const cellKey = JSON.stringify([cell.id, cell.seed, cell.size]);
    assert(!open.has(cellKey), 'Duplicate case ' + cellKey);
    open.add(cellKey);
    for (const [i, gap] of cell.holes.entries()) {
      for (const candidate of gap.raw ?? []) {
        if (candidate.role !== 'unassigned') continue;
        const key = JSON.stringify([cell.id, cell.seed, candidate.id]);
        if (!matches.has(key))
          matches.set(key, { pdf: cell.id, seed: cell.seed, chain: candidate.id, hits: [] });
        matches.get(key).hits.push({
          size: cell.size,
          gap: i + 1,
          totalGaps: cell.holes.length,
          mm: gap.lengthMm,
          competitors: gap.raw.length - 1,
        });
      }
    }
  }
}
function recurs(hits) {
  return new Set(hits.map((h) => h.size)).size > 1;
}
const repeated = [...matches.values()].filter((m) => recurs(m.hits));
const cells = new Set(
  repeated.flatMap((m) => m.hits.map((h) => JSON.stringify([m.pdf, m.seed, h.size]))),
);
console.log(
  JSON.stringify(
    {
      evaluatedCells: open.size,
      matchedSeedChains: matches.size,
      repeatedSeedChains: repeated.length,
      repeatedCells: cells.size,
      repeatedWithoutCompetition: repeated.filter((m) =>
        recurs(m.hits.filter((h) => !h.competitors)),
      ).length,
      repeated,
    },
    null,
    2,
  ),
);
