// The nesting engine since nest-sparrow: sparrow (https://github.com/JeroenGar/sparrow, built to
// WebAssembly, one thread, solver unchanged) behind our own job export and our own check.
//
//   job → instance.ts → sparrow (runtime.ts: own worker in the browser, in-process in Node)
//       → every report → solution.ts (true contours, gap, edges) → progress / result
//
// FALLBACK. The old engine (nest/index.ts, nestLegacy) stays for one version and runs only when
// sparrow left us NO layout that passed our check:
//   • the sparrow module cannot be loaded, or
//   • sparrow ended without a single checked layout (it refused the job, its worker died, or
//     every layout it reported broke the gap).
// One checked sparrow layout is enough to never call it. It gets only what is left of the run's
// time (plus the acceptance slack, LEGACY_SLACK_*), and its result always carries a warning saying
// so. A cancelled run never falls back: «stop» returns the best checked layout so far, or nothing.
import type { NestConfig, NestResult, PieceDTO, Placement, UnplacedPiece } from '../types';
import type { NestProgress } from '../nest';
import { buildSparrowJob, type SparrowJob } from './instance';
import { convertSolution, type SparrowReport, type SppSolution } from './solution';
import { loadSparrow } from './runtime';

type Legacy = (
  pieces: readonly PieceDTO[],
  config: NestConfig,
  isCancelled: () => boolean,
  onProgress: (p: NestProgress) => void,
) => Promise<NestResult>;

// BUDGET. Sparrow overshoots the seconds it is given (it reads the clock between separator
// strikes; the probe measured 20 s → 22–24 s in the browser), while the screen promises the
// operator's number and acceptance allows 20 s → 23 s wall at most. So sparrow gets a share of
// what is left. Measured on the owner's two files (see the nest-sparrow ledger).
export const SPARROW_BUDGET_FACTOR = 0.95;
const MIN_SOLVE_SEC = 0.5;

// The fallback's deadline: the operator's budget plus the slack acceptance allows (20 s → 23 s),
// never more than LEGACY_SLACK_MAX_MS. The old engine always gets at least LEGACY_MIN_MS — it
// cannot return anything sooner — so a fallback at the very end may run that much over.
const LEGACY_SLACK_SHARE = 0.15;
const LEGACY_SLACK_MAX_MS = 3_000;
const LEGACY_MIN_MS = 250;

type Best = { placements: Placement[]; usedLengthCm: number; overflow: UnplacedPiece[] };
// Progress frames at most this often. Every report is still CHECKED as it arrives (a narrower but
// broken layout must never hide a valid one); only the frames sent to the screen are throttled.
// Sparrow's first feasible layout arrives after 0.03–0.11 s and is always shown at once.
const PROGRESS_MIN_MS = 200;

// Better = fewer pieces left off the table first, then shorter. Without a table length nothing
// overflows and this is just «shorter».
function better(a: Best, b: Best | null): boolean {
  if (!b) return true;
  if (a.overflow.length !== b.overflow.length) return a.overflow.length < b.overflow.length;
  return a.usedLengthCm < b.usedLengthCm - 1e-9;
}

// The operator's budget plus the slack acceptance allows (20 s → 23 s).
export function acceptanceDeadlineMs(timeBudgetMs: number): number {
  return timeBudgetMs + Math.min(LEGACY_SLACK_MAX_MS, timeBudgetMs * LEGACY_SLACK_SHARE);
}

export function legacyBudgetMs(timeBudgetMs: number, elapsedMs: number): number {
  return Math.max(LEGACY_MIN_MS, acceptanceDeadlineMs(timeBudgetMs) - elapsedMs);
}

export async function nestWithSparrow(
  pieces: readonly PieceDTO[],
  config: NestConfig,
  isCancelled: () => boolean,
  onProgress: (p: NestProgress) => void,
  legacy: Legacy,
): Promise<NestResult> {
  const started = Date.now();
  const job = buildSparrowJob(pieces, config);

  let reports = 0;
  const result = (
    placements: Placement[],
    usedLengthCm: number,
    overflow: UnplacedPiece[],
    cancelled: boolean,
  ): NestResult =>
    finalize(job, config, placements, usedLengthCm, overflow, reports, started, cancelled);

  const fallback = async (why: string): Promise<NestResult> => {
    if (isCancelled()) return result([], 0, [], true);
    const res = await legacy(
      pieces,
      { ...config, timeBudgetMs: legacyBudgetMs(config.timeBudgetMs, Date.now() - started) },
      isCancelled,
      onProgress,
    );
    return {
      ...res,
      elapsedMs: Date.now() - started,
      warnings: [
        `${why} — this marker was computed by the previous nesting engine and is looser than usual`,
        ...res.warnings,
      ],
    };
  };

  let runtime;
  try {
    runtime = await loadSparrow();
  } catch (e) {
    return fallback(`the sparrow nesting module failed to load (${errorText(e)})`);
  }

  // A stop raised before the solver starts: in Node the solve could not hear it once entered.
  if (job.items.length === 0 || isCancelled()) return result([], 0, [], isCancelled());

  // Seed: random per run. With a time stop sparrow is not reproducible run to run anyway.
  const seed = Math.floor(Math.random() * 0xffffffff);
  const seconds = Math.max(
    MIN_SOLVE_SEC,
    (config.timeBudgetMs * SPARROW_BUDGET_FACTOR - (Date.now() - started)) / 1000,
  );

  // With a table length a WIDER sparrow strip can leave fewer pieces off the table, so every report
  // is worth checking; without one, a strip no narrower than the best checked one cannot win.
  const capped =
    config.maxLengthCm !== undefined &&
    Number.isFinite(config.maxLengthCm) &&
    config.maxLengthCm > 0;
  let best: Best | null = null;
  let bestStrip = Infinity;
  let shown = false; // the current best has been sent to the screen
  let lastFrame = -Infinity;
  let lastReject = '';

  const consider = (sol: SppSolution | undefined) => {
    if (!sol) return;
    if (!capped && sol.strip_width >= bestStrip - 1e-9) return;
    const c = convertSolution(sol, job, pieces, config);
    if (!c.ok) {
      lastReject = c.why;
      return;
    }
    if (!better(c, best)) return;
    best = { placements: c.placements, usedLengthCm: c.usedLengthCm, overflow: c.overflow };
    bestStrip = Math.min(bestStrip, sol.strip_width);
    shown = false;
  };

  const emit = () => {
    const b = best as Best | null;
    if (!b || shown) return;
    shown = true;
    lastFrame = Date.now();
    onProgress({
      phase: 'ga',
      generation: reports,
      best: result(b.placements, b.usedLengthCm, b.overflow, false),
    });
  };

  const outcome = await runtime.solve(
    JSON.stringify(job.instance),
    seconds,
    seed,
    (json) => {
      reports++;
      let sol: SppSolution | undefined;
      try {
        sol = (JSON.parse(json) as SparrowReport).solution;
      } catch {
        return;
      }
      const first = best === null;
      consider(sol);
      if (first || Date.now() - lastFrame >= PROGRESS_MIN_MS) emit();
    },
    isCancelled,
    // Browser: past the operator's deadline a checked layout in hand ends the run (runtime.ts).
    {
      deadlineMs: acceptanceDeadlineMs(config.timeBudgetMs) - (Date.now() - started),
      hasLayout: () => best !== null,
    },
  );

  if (outcome.resultJson) {
    try {
      consider((JSON.parse(outcome.resultJson) as { solution: SppSolution }).solution);
    } catch {
      /* the reports already delivered stand */
    }
  }

  const cancelled = outcome.cancelled || isCancelled();
  // (assigned inside callbacks — TypeScript's narrowing cannot see that)
  const b = best as Best | null;
  if (b) return result(b.placements, b.usedLengthCm, b.overflow, cancelled);
  if (cancelled) return result([], 0, [], true);
  return fallback(
    outcome.error
      ? `the sparrow nesting engine failed (${outcome.error})`
      : `the sparrow nesting engine returned no valid layout${lastReject ? ` (${lastReject})` : ''}`,
  );
}

function finalize(
  job: SparrowJob,
  config: NestConfig,
  placements: Placement[],
  usedLengthCm: number,
  overflow: UnplacedPiece[],
  reports: number,
  started: number,
  cancelled: boolean,
): NestResult {
  // Area of what is ACTUALLY on the fabric (see nest/index.ts finalize).
  const areaSum = placements.reduce((s, pl) => s + (job.areaById.get(pl.pieceId) ?? 0), 0);
  return {
    placements,
    usedLengthCm,
    efficiency: usedLengthCm > 0 ? areaSum / (config.fabricWidthCm * usedLengthCm) : 0,
    placedCount: placements.length,
    totalCount: job.totalCount,
    unplaced: [...job.unplacedUpFront, ...overflow],
    generation: reports,
    elapsedMs: Date.now() - started,
    cancelled,
    warnings: [...job.warnings],
    telemetry: {
      nfpDone: 0,
      nfpTotal: 0,
      evaluated: reports,
      // True contours: sparrow gets the seam-allowance contour as is, and our check runs on it.
      rdpEpsCm: 0,
      requestedRdpEpsCm: config.rdpEpsCm,
      predictedHulls: 0,
      predictedPrepassMs: 0,
      prepassMs: 0,
    },
  };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
