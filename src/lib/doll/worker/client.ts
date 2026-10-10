// Main-thread handle on the doll worker (same discipline as lib/nesting/worker/client.ts): lazy
// spawn, one promise per solve, frames through a callback, terminate() to cancel.
import type { DollInput, DollReport } from '../types';
import type { DollWorkerRequest, DollWorkerResponse } from './doll.worker';

export class DollWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (r: DollReport) => void;
      reject: (e: Error) => void;
      onFrame?: (p: Float32Array, pass: number) => void;
    }
  >();

  private spawn(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./doll.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<DollWorkerResponse>) => {
      const msg = ev.data;
      const h = this.pending.get(msg.id);
      if (!h) return;
      if (msg.type === 'frame') return h.onFrame?.(msg.positions, msg.pass);
      this.pending.delete(msg.id);
      if (msg.type === 'error') h.reject(new Error(msg.message));
      else h.resolve(msg.report);
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
    input: DollWorkerRequest['input'],
    onFrame?: (positions: Float32Array, pass: number) => void,
  ): Promise<DollReport> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onFrame });
      this.spawn().postMessage({ id, input } satisfies DollWorkerRequest);
    });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const h of this.pending.values()) h.reject(new Error('cancelled'));
    this.pending.clear();
  }
}

export type { DollInput };
