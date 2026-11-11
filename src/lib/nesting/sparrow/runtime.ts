// Where sparrow runs.
//
// `solve` is synchronous: once it is entered, the thread belongs to it until the time is up, and
// no message (cancel included) gets through. So:
//
//   • BROWSER — the nesting worker spawns a module worker of its own for every run
//     (./sparrow.worker.ts) and hands it the compiled module. Reports arrive as messages; cancel
//     is `terminate()`, and the run's answer is then the best layout already reported. The module
//     is compiled once per nesting worker; a fresh worker per run is what makes terminate safe.
//   • NODE (probes, the golden runner — esbuild with `--loader:.wasm=binary`) — `initSync` and a
//     synchronous `solve` in-process. Nothing can cancel it, and nothing needs to.
//
// The same import tells the two apart: Vite turns `…wasm?url` into the asset's URL (a string);
// esbuild strips the query and its binary loader inlines the bytes (a Uint8Array).
import wasmAsset from './pkg/sparrow_wasm_bg.wasm?url';
import { initSync, solve } from './pkg/sparrow_wasm';

export type SolveOutcome = {
  // The solver's own return JSON ({solution, elapsed_sec}); null when the run was cancelled or
  // the solver died — the reports already delivered are then all there is.
  resultJson: string | null;
  cancelled: boolean;
  // The run was ended at the operator's deadline with a checked layout already in hand.
  stoppedAtDeadline?: boolean;
  error?: string;
};

// Browser only (the in-process solve cannot be interrupted). Two thresholds:
//   • at `deadlineMs` (the operator's budget + the acceptance slack) the worker is ended IF
//     `hasLayout()` says a checked layout is already in hand — that layout is the answer;
//   • without one, the run waits for sparrow's first checked layout (and ends on it) up to the
//     watchdog (seconds + 8 s); past that it is an error (the caller then falls back to the old engine).
export type SolveLimits = { deadlineMs: number; hasLayout: () => boolean };

export type SparrowRuntime = {
  kind: 'worker' | 'in-process';
  solve(
    instanceJson: string,
    seconds: number,
    seed: number,
    onReport: (reportJson: string) => void,
    isCancelled: () => boolean,
    limits?: SolveLimits,
  ): Promise<SolveOutcome>;
};

// What the worker path needs from a Worker — a seam for tests.
export type WorkerLike = {
  onmessage: ((ev: MessageEvent<WorkerOut>) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
  postMessage(msg: unknown): void;
  terminate(): void;
};

type WorkerIn = { instanceJson: string; seconds: number; seed: number; module: WebAssembly.Module };
export type WorkerOut =
  | { type: 'report'; json: string }
  | { type: 'done'; json: string }
  | { type: 'error'; message: string };

const CANCEL_POLL_MS = 50;
// A worker that outlives its budget by this much is stuck, not slow: sparrow checks the clock
// between separator strikes, and those take well under a second on our jobs.
const WATCHDOG_EXTRA_MS = 8_000;

function inProcess(): SparrowRuntime {
  return {
    kind: 'in-process',
    async solve(instanceJson, seconds, seed, onReport) {
      try {
        const resultJson = solve(instanceJson, seconds, seed, onReport);
        return { resultJson, cancelled: false };
      } catch (e) {
        return {
          resultJson: null,
          cancelled: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    },
  };
}

const spawnSparrowWorker = (): WorkerLike =>
  new Worker(new URL('./sparrow.worker.ts', import.meta.url), { type: 'module' });

export function inWorker(
  module: WebAssembly.Module,
  spawn: () => WorkerLike = spawnSparrowWorker,
): SparrowRuntime {
  return {
    kind: 'worker',
    solve(instanceJson, seconds, seed, onReport, isCancelled, limits) {
      return new Promise<SolveOutcome>((resolve) => {
        const worker = spawn();
        let settled = false;
        const finish = (out: SolveOutcome) => {
          if (settled) return;
          settled = true;
          clearInterval(poll);
          clearTimeout(watchdog);
          clearTimeout(deadline);
          worker.terminate();
          resolve(out);
        };
        const poll = setInterval(() => {
          if (isCancelled()) finish({ resultJson: null, cancelled: true });
        }, CANCEL_POLL_MS);
        const watchdog = setTimeout(
          () =>
            finish({
              resultJson: null,
              cancelled: false,
              error: 'the solver did not stop in time',
            }),
          seconds * 1000 + WATCHDOG_EXTRA_MS,
        );
        let pastDeadline = false;
        const stopIfReady = () => {
          if (pastDeadline && limits?.hasLayout()) {
            finish({ resultJson: null, cancelled: false, stoppedAtDeadline: true });
          }
        };
        const deadline = limits
          ? setTimeout(
              () => {
                pastDeadline = true;
                stopIfReady();
              },
              Math.max(0, limits.deadlineMs),
            )
          : undefined;
        worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
          const m = ev.data;
          if (m.type === 'report') {
            onReport(m.json);
            stopIfReady(); // past the deadline, the first checked layout ends the run
          } else if (m.type === 'done') finish({ resultJson: m.json, cancelled: false });
          else finish({ resultJson: null, cancelled: false, error: m.message });
        };
        worker.onerror = (ev) => {
          ev.preventDefault();
          finish({
            resultJson: null,
            cancelled: false,
            error: ev.message || 'the solver worker failed',
          });
        };
        const msg: WorkerIn = { instanceJson, seconds, seed, module };
        worker.postMessage(msg);
      });
    },
  };
}

let loading: Promise<SparrowRuntime> | null = null;

// Rejects when the module cannot be loaded — the caller then falls back to the old engine.
export function loadSparrow(): Promise<SparrowRuntime> {
  if (!loading) {
    loading = load();
    // A failed load is retried on the next run (a flaky network must not disable sparrow for the
    // life of the worker).
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

async function load(): Promise<SparrowRuntime> {
  const asset = wasmAsset as unknown as string | Uint8Array;
  if (typeof asset !== 'string') {
    initSync({ module: asset });
    return inProcess();
  }
  const url = new URL(asset, self.location.href);
  let module: WebAssembly.Module;
  try {
    module = await WebAssembly.compileStreaming(fetch(url));
  } catch {
    // compileStreaming needs `application/wasm`; a server that sends anything else still serves
    // the bytes.
    const res = await fetch(url);
    if (!res.ok) throw new Error(`sparrow module: HTTP ${res.status}`);
    module = await WebAssembly.compile(await res.arrayBuffer());
  }
  if (typeof Worker === 'undefined') {
    // No nested workers here: solve on this thread. Progress still flows; cancel waits for the
    // budget to run out.
    initSync({ module });
    return inProcess();
  }
  return inWorker(module);
}
