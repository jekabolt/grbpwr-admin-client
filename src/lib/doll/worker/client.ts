// Main-thread handle on the doll worker (same discipline as lib/nesting/worker/client.ts): lazy
// spawn, one promise per request, mesh + frames through callbacks, terminate() to cancel.
import type { PomReport } from 'lib/pom/types';
import type { DollMesh, DollReport } from '../types';
import type { DollWorkerRequest, DollWorkerResponse } from './doll.worker';

type DollRequest = Exclude<DollWorkerRequest, { kind: 'pom' }>;
type PomRequest = Extract<DollWorkerRequest, { kind: 'pom' }>;

export type DollSolved = { report: DollReport; thumb: Blob | null; graphMs: number };
export type DollSolveHooks = {
  onMesh?: (mesh: DollMesh) => void;
  onFrame?: (positions: Float32Array, pass: number) => void;
};

type Pending = {
  resolve: (r: never) => void;
  reject: (e: Error) => void;
  hooks?: DollSolveHooks;
};

export class DollWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private spawn(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./doll.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<DollWorkerResponse>) => {
      const msg = ev.data;
      const h = this.pending.get(msg.id);
      if (!h) return;
      if (msg.type === 'mesh') return h.hooks?.onMesh?.(msg.mesh);
      if (msg.type === 'frame') return h.hooks?.onFrame?.(msg.positions, msg.pass);
      this.pending.delete(msg.id);
      if (msg.type === 'error') h.reject(new Error(msg.message));
      else if (msg.type === 'pom') (h.resolve as (r: PomReport) => void)(msg.report);
      else
        (h.resolve as (r: DollSolved) => void)({
          report: msg.report,
          thumb: msg.thumb,
          graphMs: msg.graphMs,
        });
    };
    w.onerror = (e) => {
      for (const h of this.pending.values()) h.reject(new Error(e.message || 'doll worker error'));
      this.pending.clear();
      this.worker?.terminate();
      this.worker = null;
    };
    this.worker = w;
    return w;
  }

  solve(
    input: DollRequest['input'],
    hooks?: DollSolveHooks,
    thumb?: { w: number; h: number },
  ): Promise<DollSolved> {
    const id = this.nextId++;
    return new Promise<DollSolved>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (r: never) => void, reject, hooks });
      this.spawn().postMessage({
        id,
        kind: 'doll',
        input,
        ...(thumb ? { thumb } : {}),
      } satisfies DollWorkerRequest);
    });
  }

  /** POM values of every size (lib/pom measurePattern), off the main thread. */
  measure(input: PomRequest['input']): Promise<PomReport> {
    const id = this.nextId++;
    return new Promise<PomReport>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (r: never) => void, reject });
      this.spawn().postMessage({ id, kind: 'pom', input } satisfies DollWorkerRequest);
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const h of this.pending.values()) h.reject(new Error('cancelled'));
    this.pending.clear();
  }
}
