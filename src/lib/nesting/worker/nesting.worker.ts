// Worker entry: owns the parsed pieces (keyed by parse job) so re-nesting with new
// settings never re-parses, and the GA runs off the main thread with cooperative yields
// so cancel/progress messages drain mid-run.
import type { NestConfig, ParseOpts, PieceDTO, Unit, WorkerRequest, WorkerResponse } from '../types';
import { area, bounds } from '../geom/polygon';
import { parseFiles } from './parse-files';
import { nest } from '../nest';

const post = (msg: WorkerResponse) => {
  (self as unknown as { postMessage: (m: WorkerResponse) => void }).postMessage(msg);
};

// The live parse, keyed by its job id — a nest request must name the parse it was
// configured against, so a job racing a newer parse is rejected instead of silently
// nesting the wrong geometry. parseSeq guards the commit: two overlapping parses (awaits
// interleave) resolve last-started-wins.
let currentParse: { id: number; pieces: PieceDTO[] } | null = null;
let parseSeq = 0;
const cancelled = new Set<number>();

async function handleParse(id: number, files: File[], opts: ParseOpts): Promise<void> {
  const seq = ++parseSeq;
  const warnings: string[] = [];
  const out: PieceDTO[] = [];
  let detected: Exclude<Unit, 'auto'> = 'mm';
  let nextId = 1;
  let failedFiles = 0;

  for (const file of files) {
    try {
      const buf = await file.arrayBuffer();
      const { raws, unit, unitGuessed } = parseFiles(buf, opts, warnings);
      detected = unit;
      if (unitGuessed) warnings.push(`${file.name}: единицы не заданы в файле — принято ${unit}`);
      for (const raw of raws) {
        const bb = bounds(raw.poly);
        // Normalize: local origin at bbox min corner — placement x/y then read naturally.
        const poly = raw.poly.map((p) => ({ x: p.x - bb.minX, y: p.y - bb.minY }));
        out.push({
          id: nextId++,
          name: raw.name === 'модель' ? `деталь ${nextId - 1}` : raw.name,
          source: file.name,
          poly,
          bboxW: bb.maxX - bb.minX,
          bboxH: bb.maxY - bb.minY,
          areaCm2: area(poly),
        });
      }
    } catch (e) {
      failedFiles++;
      warnings.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Every file failed → that's an error, not a note with an empty piece list.
  if (files.length > 0 && failedFiles === files.length) {
    post({ type: 'error', id, message: warnings.join('; ') || 'не удалось разобрать DXF' });
    return;
  }

  if (out.length === 0 && warnings.length === 0) warnings.push('в файлах не нашлось замкнутых контуров деталей');
  // Commit only when no newer parse started while this one awaited.
  if (seq === parseSeq) currentParse = { id, pieces: out };
  post({ type: 'parsed', id, pieces: out, detectedUnit: detected, warnings });
}

async function handleNest(id: number, parseId: number, config: NestConfig): Promise<void> {
  if (!currentParse || currentParse.id !== parseId) {
    post({ type: 'error', id, message: 'данные деталей устарели — обновите разбор DXF' });
    return;
  }
  const result = await nest(
    currentParse.pieces,
    config,
    () => cancelled.has(id),
    (p) =>
      post({
        type: 'progress',
        id,
        phase: p.phase,
        generation: p.generation,
        best: p.best,
        nfpDone: p.nfpDone,
        nfpTotal: p.nfpTotal,
      }),
  );
  post({ type: 'result', id, result });
  cancelled.delete(id);
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'parse':
      void handleParse(msg.id, msg.files, msg.opts).catch((e) =>
        post({ type: 'error', id: msg.id, message: e instanceof Error ? e.message : String(e) }),
      );
      break;
    case 'nest':
      void handleNest(msg.id, msg.parseId, msg.config).catch((e) =>
        post({ type: 'error', id: msg.id, message: e instanceof Error ? e.message : String(e) }),
      );
      break;
    case 'cancel':
      cancelled.add(msg.id);
      break;
  }
};
