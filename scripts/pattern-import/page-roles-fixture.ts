// A9 · the probes' PageRoleDeps: the RECORDED answers of the AI page-role call
// (fixtures/page-roles.json, filled by eye from the rendered corpus pages) — no picture is drawn or
// uploaded, no network is reached, nothing is paid. Used by the autopilot metric
// (`--page-roles`), the e2e probe (`--page-roles`) and the page-roles probe.
//
// Mutation `tile-instructions` ("the AI was wrong"): the first page of each call the fixture calls
// a tile is answered `instructions` 0.99 instead — a real tile must NOT be set aside by it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  ClassifyPatternPagesRequestWire,
  ClassifyPatternPagesResponseWire,
  PageRoleDeps,
} from 'lib/pattern-import/ai/pages';

type Row = [role: string, confidence: number, evidence: string];
type Fixture = { files: Record<string, Record<string, Row>> };

let FX: Fixture | null = null;
function fixture(): Fixture {
  FX ??= JSON.parse(
    readFileSync(
      resolve(
        process.env.PATIMPORT_REPO ?? process.cwd(),
        'scripts/pattern-import/fixtures/page-roles.json',
      ),
      'utf8',
    ),
  ) as Fixture;
  return FX;
}

/** The recorded answer for one page of a file (1-based), or null (not recorded). */
export function recorded(fileName: string, pageNo: number): Row | null {
  const f = fixture().files[fileName];
  if (!f) return null;
  for (const [k, row] of Object.entries(f)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(k);
    if (!m) continue;
    const a = +m[1];
    const b = m[2] ? +m[2] : a;
    if (pageNo >= a && pageNo <= b) return row;
  }
  return null;
}

export type FixtureCalls = {
  /** One entry per call: the file, the pages sent, the pages answered. */
  calls: { file: string; sent: number[]; answered: number[]; missing: number[] }[];
  /** Mutation: the tile pages answered "instructions" (file, 1-based page). */
  mutated: { file: string; pageNo: number }[];
};

export function fixturePageRoleDeps(mutate: 'tile-instructions' | null = null): {
  deps: PageRoleDeps;
  log: FixtureCalls;
} {
  const log: FixtureCalls = { calls: [], mutated: [] };
  const deps: PageRoleDeps = {
    pictures: false,
    upload: async () => 0,
    classify: async (
      req: ClassifyPatternPagesRequestWire,
    ): Promise<ClassifyPatternPagesResponseWire> => {
      const file = req.fileName ?? '';
      const sent = (req.pages ?? []).map((p) => p.pageNo ?? 0);
      const pages: NonNullable<ClassifyPatternPagesResponseWire['pages']> = [];
      const missing: number[] = [];
      let mutated = false;
      for (const n of sent) {
        const row = recorded(file, n);
        if (!row) {
          missing.push(n);
          continue;
        }
        if (mutate === 'tile-instructions' && !mutated && row[0] === 'pattern_tile') {
          mutated = true;
          log.mutated.push({ file, pageNo: n });
          pages.push({
            pageNo: n,
            role: 'instructions',
            confidence: 0.99,
            evidence: ['MUTATION: a real tile recorded as instructions'],
          });
          continue;
        }
        pages.push({ pageNo: n, role: row[0], confidence: row[1], evidence: [row[2]] });
      }
      log.calls.push({ file, sent, answered: pages.map((p) => p.pageNo ?? 0), missing });
      return { pages, model: 'fixture', costUsd: '0', cached: false, warnings: [] };
    },
  };
  return { deps, log };
}
