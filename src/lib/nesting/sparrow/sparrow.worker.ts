// One sparrow run, then the parent terminates this worker (runtime.ts). Lives in its own worker
// because `solve` is synchronous: the nesting worker above stays free to hear «stop» and to
// terminate this one mid-run.
import { initSync, solve } from './pkg/sparrow_wasm';
import type { WorkerOut } from './runtime';

const post = (m: WorkerOut) =>
  (self as unknown as { postMessage: (m: WorkerOut) => void }).postMessage(m);

self.onmessage = (
  ev: MessageEvent<{
    instanceJson: string;
    seconds: number;
    seed: number;
    module: WebAssembly.Module;
  }>,
) => {
  const { instanceJson, seconds, seed, module } = ev.data;
  try {
    initSync({ module });
    const json = solve(instanceJson, seconds, seed, (report) =>
      post({ type: 'report', json: report }),
    );
    post({ type: 'done', json });
  } catch (e) {
    post({ type: 'error', message: e instanceof Error ? e.message : String(e) });
  }
};
