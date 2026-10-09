// Main-thread handle on the pattern-import worker (08-CONTRACT §2 `worker/`), modelled on
// lib/nesting/worker/client.ts: lazy spawn, one promise per request id, progress callbacks,
// cancel by message with terminate + respawn as the hard fallback.
//
// This file and types.ts are all the main thread imports from lib/pattern-import (besides
// manifest/): everything heavy — pdf.js, the adapters, assembly, the writer — lives behind the
// worker. File bytes go in TRANSFERRED; preview polylines come back transferred.
import type {
  ImportErrorCode,
  ImportWorkerRequest,
  ImportWorkerResponse,
  SourceFileInfo,
  StageIO,
  StageName,
} from '../types';

/** The wire plus the worker's JS heap after each answer (Chrome `performance.memory`). */
export type WorkerMessage = ImportWorkerResponse & { heapMb?: number };

export type StageProgress = { done: number; total: number; note?: string };

/** A failed request, with the code the wizard branches on (types.ts `ImportErrorCode`). */
export class ImportWorkerError extends Error {
  readonly code: ImportErrorCode;
  readonly stage?: StageName;
  constructor(code: ImportErrorCode, message: string, stage?: StageName) {
    super(message);
    this.name = 'ImportWorkerError';
    this.code = code;
    this.stage = stage;
  }
}

export const importErrorCode = (e: unknown): ImportErrorCode | null =>
  e instanceof ImportWorkerError ? e.code : null;

/** How long a soft cancel may take before the worker is terminated (sync stages never yield). */
const HARD_CANCEL_MS = 1200;

type Pending = {
  resolve: (m: WorkerMessage) => void;
  reject: (e: Error) => void;
  onProgress?: (p: StageProgress) => void;
  stage?: StageName;
};

export class ImportWorkerClient {
  readonly kind = 'worker' as const;
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  /** Sessions of the CURRENT worker; a respawn empties it (their state died with the worker). */
  private live = new Set<number>();
  private running: number | null = null;
  /** Worker JS heap after the last answer, and the peak over the client's life (MB). */
  heapMb: number | null = null;
  peakHeapMb: number | null = null;

  constructor() {
    // Dev builds: the live client is reachable from the console (heap numbers, `cancel()`).
    if (import.meta.env.DEV)
      (globalThis as { __patternImport?: ImportWorkerClient }).__patternImport = this;
  }

  private spawn(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./pattern-import.worker.ts', import.meta.url), {
      type: 'module',
      name: 'pattern-import',
    });
    w.onmessage = (ev: MessageEvent<WorkerMessage>) => {
      const msg = ev.data;
      if (msg.heapMb != null) {
        this.heapMb = msg.heapMb;
        this.peakHeapMb = Math.max(this.peakHeapMb ?? 0, msg.heapMb);
      }
      const h = this.pending.get(msg.id);
      if (!h) return;
      if (msg.type === 'progress') {
        h.onProgress?.({ done: msg.done, total: msg.total, note: msg.note });
        return;
      }
      this.pending.delete(msg.id);
      if (msg.type === 'error')
        h.reject(new ImportWorkerError(msg.code ?? 'internal', msg.message, msg.stage));
      else h.resolve(msg);
    };
    w.onerror = (e) => {
      // A crashed worker (out of memory, a throw outside any request) fails every pending job;
      // its sessions are gone, the next call respawns clean.
      e.preventDefault?.();
      this.kill(
        new ImportWorkerError(
          'crashed',
          `the importer stopped${e.message ? `: ${e.message}` : ''} — most likely out of memory on this file`,
        ),
      );
    };
    this.worker = w;
    return w;
  }

  private kill(err: ImportWorkerError) {
    this.worker?.terminate();
    this.worker = null;
    this.live.clear();
    this.running = null;
    // Reject, never abandon: an unsettled promise pins its closure (and the bytes it holds).
    for (const h of this.pending.values()) h.reject(err);
    this.pending.clear();
  }

  private request(
    msg: ImportWorkerRequest,
    transfer: Transferable[] = [],
    onProgress?: (p: StageProgress) => void,
  ): Promise<WorkerMessage> {
    const w = this.spawn();
    return new Promise<WorkerMessage>((resolve, reject) => {
      this.pending.set(msg.id, {
        resolve,
        reject,
        onProgress,
        stage: msg.type === 'run' ? msg.stage : undefined,
      });
      w.postMessage(msg, transfer);
    });
  }

  async open(
    files: { name: string; bytes: ArrayBuffer }[],
  ): Promise<{ sessionId: number; files: SourceFileInfo[] }> {
    const id = this.nextId++;
    // Transferred: the bytes leave the main thread (the wizard keeps the File objects).
    const msg = await this.request(
      { type: 'open', id, files },
      files.map((f) => f.bytes),
    );
    if (msg.type !== 'opened') throw new ImportWorkerError('internal', 'unexpected worker reply');
    this.live.add(msg.sessionId);
    return { sessionId: msg.sessionId, files: msg.files };
  }

  async run<S extends StageName>(
    sessionId: number,
    stage: S,
    input: StageIO[S]['in'],
    onProgress?: (p: StageProgress) => void,
  ): Promise<StageIO[S]['out']> {
    if (!this.live.has(sessionId))
      throw new ImportWorkerError(
        'no-session',
        'the importer was restarted — read the files again',
        stage,
      );
    const id = this.nextId++;
    this.running = id;
    try {
      const msg = await this.request(
        { type: 'run', id, sessionId, stage, input } as ImportWorkerRequest,
        [],
        onProgress,
      );
      if (msg.type !== 'result' || msg.stage !== stage)
        throw new ImportWorkerError('internal', 'unexpected worker reply', stage);
      return msg.output as StageIO[S]['out'];
    } finally {
      if (this.running === id) this.running = null;
    }
  }

  /**
   * Stops the running stage. Soft first (the stage throws at its next progress tick, the session
   * survives); a stage that does not yield in time (assembly is synchronous) is killed with the
   * worker — its sessions are lost and the wizard reads the files again.
   */
  cancel(): void {
    const id = this.running;
    if (id == null || !this.worker) return;
    this.worker.postMessage({ type: 'cancel', id } satisfies ImportWorkerRequest);
    setTimeout(() => {
      if (this.pending.has(id))
        this.kill(
          new ImportWorkerError(
            'cancelled',
            'stopped — the importer was restarted (the stage could not pause)',
          ),
        );
    }, HARD_CANCEL_MS);
  }

  /** True while the session's state is still in the worker. */
  alive(sessionId: number): boolean {
    return this.live.has(sessionId);
  }

  async close(sessionId: number): Promise<void> {
    if (!this.live.delete(sessionId) || !this.worker) return;
    const id = this.nextId++;
    await this.request({ type: 'close', id, sessionId }).catch(() => undefined);
  }

  /** Ends the worker for good (the wizard unmounted). */
  dispose(): void {
    this.kill(new ImportWorkerError('cancelled', 'the import was closed'));
  }
}
