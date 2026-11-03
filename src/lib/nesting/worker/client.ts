// Main-thread handle on the nesting worker: spawn lazily, promise-based parse/nest with
// live progress, cancel via message + terminate() as the hard fallback, safe respawn.
import type {
  NestConfig,
  NestResult,
  ParseOpts,
  PieceDTO,
  Unit,
  WorkerRequest,
  WorkerResponse,
} from '../types';
import type { ConversionManifest } from 'lib/pattern-import/types';
import type {
  RollSearchJob,
  RollSearchPlan,
  RollSearchResult,
} from 'lib/pattern-export/roll-search';
import { workerLoadFailed } from 'lib/stale-reload';
import { classifyWorkerError } from 'lib/worker-load';
import { unpackPieces } from './piece-transfer';

export type ParseOutcome = {
  // Names this parse inside the worker — nest() must present it back (stale-parse guard).
  parseId: number;
  pieces: PieceDTO[];
  detectedUnit: Exclude<Unit, 'auto'>;
  warnings: string[];
  // Листы, которые разобрать не удалось. См. WorkerResponse['parsed'].failedFiles: потребитель,
  // который делает выводы ИЗ ОТСУТСТВИЯ блока, обязан знать, что набор неполон.
  failedFiles: number;
  // Блоки, пропущенные ВНУТРИ прочитавшихся листов (находка 1 второго адверсарного ревью). Неполнота
  // бывает двух видов, и вторая молчаливее первой: файл прочитан целиком, а блока в наборе нет.
  skippedBlocks: number;
  // Имена встреченных блоков — набор ПРИСУТСТВИЯ, отдельный от `pieces` (находка 1 третьего ревью).
  // «Блок есть в чертеже» и «из блока построился контур» — разные факты, и второй молчит там, где
  // геометрия не сошлась.
  blockNames: string[];
  // Манифест конвертации по индексу файла пачки (F6b); null — файл без манифеста. Детали несут
  // свои факты сами (PieceDTO.manifest) — это для тех, кому нужен файл целиком.
  manifests: (ConversionManifest | null)[];
  // Codex C3: почему манифест файла не принят, по индексу (null — принят или его нет).
  manifestDistrust: (string | null)[];
  /** Present for URL-backed parsing: original indices in compacted parse order. */
  sourceIndices?: number[];
  /** Present for URL-backed parsing: original indices whose download failed. */
  downloadFailedIndices?: number[];
};

export type SourceParseOutcome = ParseOutcome & {
  sourceIndices: number[];
  downloadFailedIndices: number[];
};

export type NestProgressMsg = {
  phase: 'nfp' | 'ga';
  generation?: number;
  best?: NestResult;
  nfpDone?: number;
  nfpTotal?: number;
};

export class NestingWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  // The current worker's script ran; a worker that did not load was already recreated, and none has
  // loaded since.
  private ran = false;
  private loadRetried = false;
  private handlers = new Map<
    number,
    {
      // Kept to go out again if the worker turns out never to have loaded.
      request: WorkerRequest;
      resolve: (msg: WorkerResponse) => void;
      reject: (e: Error) => void;
      onProgress?: (msg: Extract<WorkerResponse, { type: 'progress' }>) => void;
      onRollSeed?: (seed: RollSearchPlan) => void;
    }
  >();

  private spawn(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./nesting.worker.ts', import.meta.url), { type: 'module' });
    this.ran = false;
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      this.ran = true;
      this.loadRetried = false;
      const msg = ev.data;
      const h = this.handlers.get(msg.id);
      if (!h) return;
      if (msg.type === 'progress') {
        h.onProgress?.(msg);
        return;
      }
      if (msg.type === 'roll-seed') {
        h.onRollSeed?.(msg.seed);
        return;
      }
      this.handlers.delete(msg.id);
      if (msg.type === 'error') h.reject(new Error(msg.message));
      else h.resolve(msg);
    };
    w.onerror = (e) => {
      const failure = classifyWorkerError(e, this.ran, this.loadRetried);
      if (failure === 'retry') {
        // Nothing ran, so nothing repeats: the same requests go to one recreated worker.
        this.loadRetried = true;
        w.terminate();
        this.worker = null;
        const next = this.spawn();
        for (const h of this.handlers.values()) next.postMessage(h.request);
        return;
      }
      // A crashed worker fails every pending job; the next call respawns clean.
      const err = failure === 'load' ? workerLoadFailed() : new Error(e.message || 'worker error');
      for (const h of this.handlers.values()) h.reject(err);
      this.handlers.clear();
      this.terminate();
    };
    this.worker = w;
    return w;
  }

  private parseRequest(request: Extract<WorkerRequest, { type: 'parse' | 'parse-sources' }>) {
    const { id } = request;
    const w = this.spawn();
    return new Promise<ParseOutcome>((resolve, reject) => {
      this.handlers.set(id, {
        request,
        resolve: (msg) => {
          if (msg.type === 'parsed') {
            resolve({
              parseId: id,
              pieces: unpackPieces(msg.packedPieces),
              detectedUnit: msg.detectedUnit,
              warnings: msg.warnings,
              failedFiles: msg.failedFiles,
              skippedBlocks: msg.skippedBlocks,
              blockNames: msg.blockNames,
              manifests: msg.manifests,
              manifestDistrust: msg.manifestDistrust ?? [],
              sourceIndices: msg.sourceIndices,
              downloadFailedIndices: msg.downloadFailedIndices,
            });
          } else reject(new Error('unexpected worker reply'));
        },
        reject,
      });
      w.postMessage(request);
    });
  }

  parse(files: File[], opts: ParseOpts): Promise<ParseOutcome> {
    const id = this.nextId++;
    return this.parseRequest({ type: 'parse', id, files, opts });
  }

  parseSources(
    sources: Array<{ name: string; url: string }>,
    opts: ParseOpts,
  ): Promise<SourceParseOutcome> {
    const id = this.nextId++;
    return this.parseRequest({ type: 'parse-sources', id, sources, opts }).then((out) => ({
      ...out,
      sourceIndices: out.sourceIndices ?? [],
      downloadFailedIndices: out.downloadFailedIndices ?? [],
    }));
  }

  nest(
    parseId: number,
    config: NestConfig,
    onProgress: (p: NestProgressMsg) => void,
  ): { id: number; done: Promise<NestResult> } {
    const id = this.nextId++;
    const w = this.spawn();
    const request: WorkerRequest = { type: 'nest', id, parseId, config };
    const done = new Promise<NestResult>((resolve, reject) => {
      this.handlers.set(id, {
        request,
        resolve: (msg) => {
          if (msg.type === 'result') resolve(msg.result);
          else reject(new Error('unexpected worker reply'));
        },
        reject,
        onProgress: (msg) => {
          onProgress({
            phase: msg.phase,
            generation: msg.generation,
            best: msg.best,
            nfpDone: msg.nfpDone,
            nfpTotal: msg.nfpTotal,
          });
        },
      });
      w.postMessage(request);
    });
    return { id, done };
  }

  /** Roll print layout: `onSeed` gets the deterministic plan before the budgeted GA starts. */
  rollSearch(
    job: RollSearchJob,
    onSeed: (seed: RollSearchPlan) => void,
  ): { id: number; done: Promise<RollSearchResult> } {
    const id = this.nextId++;
    const w = this.spawn();
    const request: WorkerRequest = { type: 'roll-search', id, job };
    const done = new Promise<RollSearchResult>((resolve, reject) => {
      this.handlers.set(id, {
        request,
        resolve: (msg) => {
          if (msg.type === 'roll-result') resolve(msg.result);
          else reject(new Error('unexpected worker reply'));
        },
        reject,
        onRollSeed: onSeed,
      });
      w.postMessage(request);
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
    // Reject (never abandon) pending jobs: a cleared-but-unsettled promise pins its async
    // closure — and the fetched DXF buffers it holds — for the page's life.
    const err = new Error('nesting worker terminated');
    for (const h of this.handlers.values()) h.reject(err);
    this.handlers.clear();
  }
}
