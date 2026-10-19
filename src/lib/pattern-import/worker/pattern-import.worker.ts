// The pattern-import worker (08-CONTRACT §4.1): one module worker, one session per wizard run.
//
//   open{files}                          → opened{sessionId, files}
//   run{sessionId, stage, input}         → progress* → result{stage, output} | error{code, message}
//   cancel{id}                           soft: the running stage throws at its next progress tick
//                                        (the client terminates + respawns when that never comes)
//   close{sessionId}                     → closed
//
// Messages are handled one at a time (a queue), so a stage never sees half of another stage's
// state; `cancel` jumps the queue — it is read while a stage awaits (page by page, file by file).
import type { ImportWorkerRequest, StageIO, StageName } from '../types';
import type { WorkerMessage } from './client';
import { ImportError, cancelled, toWireError } from './errors';
import { buffersOf } from './preview';
import { Session } from './session';
import { setPdfjsLoader } from '../adapters/pdf';
import { setRasterPdfjsLoader } from '../adapters/raster';
import { guardPdfjs } from './pdf-guard';

// pdf.js runs IN this worker, not in a nested one: we are already off the main thread, and a
// nested worker would hold a second copy of every PDF it parses. pdf.js takes its in-thread
// handler from `globalThis.pdfjsWorker` (its "fake worker"), which a bundled import provides —
// no workerSrc URL to resolve (that URL is what breaks under a symlinked node_modules / a CDN CSP).
const loadPdfjsInThread = async () => {
  const [pdfjs, handler] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs'),
  ]);
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = handler;
  return pdfjs;
};
// Both adapters get the guarded module (M6, pdf-guard.ts): page cap, no eval, image size cap.
const loadGuarded = () => loadPdfjsInThread().then((m) => guardPdfjs(m));
setPdfjsLoader(loadGuarded);
setRasterPdfjsLoader(loadGuarded);

const scope = self as unknown as {
  postMessage: (m: WorkerMessage, transfer?: Transferable[]) => void;
  onmessage: ((ev: MessageEvent<ImportWorkerRequest>) => void) | null;
};

const sessions = new Map<number, Session>();
let nextSession = 1;
/** The request currently running and whether the operator asked to stop it. */
let current: { id: number; stop: boolean } | null = null;

const heapMb = (): number | undefined => {
  const m = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return m ? Math.round(m.usedJSHeapSize / 1048576) : undefined;
};

const post = (m: WorkerMessage, transfer: Transferable[] = []) => scope.postMessage(m, transfer);

function transferOf(stage: StageName, out: StageIO[StageName]['out']): Transferable[] {
  if (stage === 'assemble') {
    const a = out as StageIO['assemble']['out'];
    return buffersOf([...a.previewPaths, ...(a.clean?.masked.flatMap((m) => m.lines) ?? [])]);
  }
  if (stage === 'clean')
    return buffersOf(
      (out as StageIO['clean']['out']).previews.flatMap((p) => [
        ...p.live,
        ...p.masked.flatMap((m) => m.lines),
      ]),
    );
  if (stage === 'chains') return buffersOf((out as StageIO['chains']['out']).chainPreview);
  return [];
}

async function handle(msg: ImportWorkerRequest): Promise<void> {
  switch (msg.type) {
    case 'open': {
      const id = nextSession++;
      const s = new Session(id, msg.files);
      sessions.set(id, s);
      post({ type: 'opened', id: msg.id, sessionId: id, files: s.files });
      return;
    }
    case 'close': {
      sessions.get(msg.sessionId)?.close();
      sessions.delete(msg.sessionId);
      post({ type: 'closed', id: msg.id, sessionId: msg.sessionId, heapMb: heapMb() });
      return;
    }
    case 'run': {
      const s = sessions.get(msg.sessionId);
      if (!s)
        throw new ImportError(
          'no-session',
          'the importer was restarted — read the files again',
          msg.stage,
        );
      const run = { id: msg.id, stop: false };
      current = run;
      let last = 0;
      const checkCancel = () => {
        if (run.stop) throw cancelled(msg.stage);
      };
      try {
        const out = await s.runStage(msg.stage, msg.input as never, {
          checkCancel,
          progress: (done, total, note) => {
            checkCancel();
            // Throttled: a 91-page file would otherwise post thousands of ticks.
            const now = Date.now();
            if (done < total && now - last < 60) return;
            last = now;
            post({ type: 'progress', id: msg.id, stage: msg.stage, done, total, note });
          },
        });
        post(
          {
            type: 'result',
            id: msg.id,
            stage: msg.stage,
            output: out,
            heapMb: heapMb(),
          } as WorkerMessage,
          transferOf(msg.stage, out),
        );
      } finally {
        if (current === run) current = null;
      }
      return;
    }
    case 'cancel':
      return;
  }
}

// One at a time; `cancel` is handled on arrival.
let queue: Promise<void> = Promise.resolve();
scope.onmessage = (ev) => {
  const msg = ev.data;
  if (msg.type === 'cancel') {
    if (current && (current.id === msg.id || msg.id < 0)) current.stop = true;
    return;
  }
  queue = queue.then(async () => {
    try {
      await handle(msg);
    } catch (e) {
      const stage = msg.type === 'run' ? msg.stage : undefined;
      const w = toWireError(e, stage);
      post({
        type: 'error',
        id: msg.id,
        stage,
        code: w.code,
        message: w.message,
        heapMb: heapMb(),
      });
    }
  });
};
