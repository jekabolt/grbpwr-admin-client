// DXF SHOT — the acceptance picture of the open-lines work (owner, 11 Nov 2026): a PDF goes through
// the REAL wizard hook with the autopilot answering (autopilot-entry.ts `runCase`, 0 clicks) up to
// the written DXF, which is kept on disk. The card's sizes are the sheet's own legend sizes (the
// operator would create the card with them): a first pass reads them, a second runs with them.
//   bundled and driven by dxf-shot.mjs (one PDF per process)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { setRepairProbeSink, type RepairProbe } from 'lib/pattern-import/pieces/gfit/repair-hook';
import { liteProbe } from 'lib/pattern-import/sizes/corner-probe';
import { setCornerProbeSink, type CornerProbe } from 'lib/pattern-import/sizes/corners';

import { runCase } from './autopilot-entry';
import { captureSession } from './pieces-bench-lib';
import { setPiecesSnapshotSink } from 'lib/pattern-import/worker/session';

type Rec = Record<string, unknown> & {
  verdict?: string;
  stop?: { step: string; reason: string };
  sizesRead?: { labels: string[] } | null;
};

export async function main(args: string[]): Promise<number> {
  const [pdf, out, caseFile] = args;
  const id = basename(pdf).replace(/\.pdf$/i, '');
  mkdirSync(out, { recursive: true });
  const base = { id, group: 'pdf' as const, files: [resolve(pdf)] };
  const run = async (card: string[], dir: string | null) => {
    if (dir) process.env.AUTOPILOT_DXF_OUT = dir;
    else delete process.env.AUTOPILOT_DXF_OUT;
    return (await runCase({ ...base, card } as never, null)) as Rec;
  };
  // the questions that are not geometry are answered as an operator would (pattern pages kept,
  // guessed asides accepted, a bare outline read as the seam line) — so the picture shows where the
  // GEOMETRY stops, not where a page-role question does. Env overrides win.
  process.env.AUTOPILOT_ORACLE_PAGES ??= '1';
  process.env.GOLDEN_ANSWERS ??= JSON.stringify({ pages: true, asides: true, outline: 'seam' });
  process.env.AUTOPILOT_OUTLINES ??= '1';
  const t0 = Date.now();
  // A saved card keeps both sides of a corpus comparison on the same size selection.
  const saved = caseFile ? JSON.parse(readFileSync(caseFile, 'utf8')) : null;
  if (
    caseFile &&
    (saved?.id !== id ||
      !Array.isArray(saved.card) ||
      !saved.card.every((s: unknown) => typeof s === 'string'))
  )
    throw new Error(`Invalid saved size card for ${id}: ${caseFile}`);
  async function sizeCard(): Promise<Rec> {
    if (saved) return { sizesRead: { labels: saved.card } };
    const first = await run([], null);
    return first;
  }
  const discovery = await sizeCard();
  const labels = discovery.sizesRead?.labels ?? [];
  // GFIT_PROBES=1: every repair try of the final pass as a replayable case (probes.json, read by
  // gfit-replay.ts) — the dev loop for pieces/gfit without re-running the corpus
  const probes: RepairProbe[] = [];
  if (process.env.GFIT_PROBES) setRepairProbeSink((p) => probes.push(p));
  // CORNER_PROBES=1: every closeCorners call of the final pass (the exact input + the output), read by
  // corner-replay.ts. 1 = chains no loop of the corner step reaches are dropped when a replay of the
  // smaller probe gives the same output (else the full probe is kept); full = never dropped
  const cornerCalls: CornerProbe[] = [];
  if (process.env.CORNER_PROBES)
    setCornerProbeSink((p) =>
      cornerCalls.push(process.env.CORNER_PROBES === 'full' ? p : liteProbe(p)),
    );
  // PIECES_SNAPSHOT=1: the session as it enters every pieces call of the final pass
  // (pieces-<n>.snap.gz, read by pieces-bench.ts) — the pieces step replayed without the PDF
  let piecesCalls = 0;
  if (process.env.PIECES_SNAPSHOT && (saved || labels.length))
    setPiecesSnapshotSink((session, input) => {
      piecesCalls++;
      writeFileSync(
        resolve(out, `pieces-${piecesCalls}.snap.gz`),
        captureSession(id, piecesCalls, session, input),
      );
    });
  const rec = saved || labels.length ? await run(labels, resolve(out, 'dxf')) : discovery;
  setPiecesSnapshotSink(null);
  setRepairProbeSink(null);
  setCornerProbeSink(null);
  // full precision: rounded to 0.01 mm, 1 of 19 Leah tries replayed differently (F · 30, an
  // E2-hole-end on its threshold) — a replay that is not bit-exact cannot judge a patch
  if (process.env.GFIT_PROBES)
    writeFileSync(resolve(out, 'probes.json'), JSON.stringify({ card: labels, probes }));
  if (process.env.CORNER_PROBES)
    writeFileSync(
      resolve(out, 'corner-probes.json'),
      JSON.stringify({ card: labels, calls: cornerCalls }),
    );
  const summary = {
    id,
    card: labels,
    verdict: rec.verdict,
    stop: rec.stop ?? null,
    blocked: rec.blocked ?? null,
    write: rec.write ?? null,
    sizesRead: rec.sizesRead ?? null,
    // the matrix without the geometry (that goes to cells.json, for the picture)
    families: ((rec.families ?? []) as { cells: Record<string, unknown>[] }[]).map((f) => ({
      ...f,
      cells: f.cells.map(({ outer: _o, leakAt: _l, pred: _p, derived: _d, ...c }) => c),
    })),
    setAside: rec.setAside ?? null,
    trace: rec.trace ?? null,
    error: rec.error ?? null,
    ms: Date.now() - t0,
  };
  writeFileSync(resolve(out, 'run.json'), JSON.stringify(summary, null, 1));
  writeFileSync(resolve(out, 'cells.json'), JSON.stringify(rec.families ?? []));
  // short: the child exits right after, and a long line to a pipe is cut at 8 KB — the parent
  // reads run.json
  console.log('@@RESULT run.json');
  return 0;
}
