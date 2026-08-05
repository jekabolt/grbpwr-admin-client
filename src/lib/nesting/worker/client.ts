// Main-thread handle on the nesting worker: spawn lazily, promise-based parse/nest with
// live progress, cancel via message + terminate() as the hard fallback, safe respawn.
import type { NestConfig, NestResult, ParseOpts, PieceDTO, Unit, WorkerResponse } from '../types';

export type ParseOutcome = {
  pieces: PieceDTO[];
  detectedUnit: Exclude<Unit, 'auto'>;
  warnings: string[];
};

export class NestingWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private handlers = new Map<
    number,
    {
      resolve: (msg: WorkerResponse) => void;
      reject: (e: Error) => void;
      onProgress?: (msg: Extract<WorkerResponse, { type: 'progress' }>) => void;
    }
  >();

  private spawn(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./nesting.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const h = this.handlers.get(msg.id);
      if (!h) return;
      if (msg.type === 'progress') {
        h.onProgress?.(msg);
        return;
      }
      this.handlers.delete(msg.id);
      if (msg.type === 'error') h.reject(new Error(msg.message));
      else h.resolve(msg);
    };
    w.onerror = (e) => {
      // A crashed worker fails every pending job; the next call respawns clean.
      const err = new Error(e.message || 'worker error');
      for (const h of this.handlers.values()) h.reject(err);
      this.handlers.clear();
      this.terminate();
    };
    this.worker = w;
    return w;
  }

  parse(files: File[], opts: ParseOpts): Promise<ParseOutcome> {
    const id = this.nextId++;
    const w = this.spawn();
    return new Promise<ParseOutcome>((resolve, reject) => {
      this.handlers.set(id, {
        resolve: (msg) => {
          if (msg.type === 'parsed') {
            resolve({ pieces: msg.pieces, detectedUnit: msg.detectedUnit, warnings: msg.warnings });
          } else reject(new Error('unexpected worker reply'));
        },
        reject,
      });
      w.postMessage({ type: 'parse', id, files, opts });
    });
  }

  nest(
    config: NestConfig,
    onProgress: (generation: number, best: NestResult) => void,
  ): { id: number; done: Promise<NestResult> } {
    const id = this.nextId++;
    const w = this.spawn();
    const done = new Promise<NestResult>((resolve, reject) => {
      this.handlers.set(id, {
        resolve: (msg) => {
          if (msg.type === 'result') resolve(msg.result);
          else reject(new Error('unexpected worker reply'));
        },
        reject,
        onProgress: (msg) => {
          if (msg.generation != null && msg.best) onProgress(msg.generation, msg.best);
        },
      });
      w.postMessage({ type: 'nest', id, config });
    });
    return { id, done };
  }

  // Soft cancel: the GA checks between individuals and returns its best-so-far.
  cancel(id: number): void {
    this.worker?.postMessage({ type: 'cancel', id });
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
    // Pieces lived in the terminated worker — pending handlers are already rejected by
    // callers of terminate (onerror) or abandoned deliberately (modal close).
    this.handlers.clear();
  }
}
