// Worker entry: owns the parsed pieces (keyed by job) so re-nesting with new settings
// never re-parses, and the GA runs off the main thread with cooperative yields so
// cancel/progress messages drain mid-run.
import type { NestConfig, ParseOpts, PieceDTO, Unit, WorkerRequest, WorkerResponse } from '../types';
import { area, bounds } from '../geom/polygon';
import { parseFiles } from './parse-files';
import { nest } from '../nest';

const post = (msg: WorkerResponse) => {
  (self as unknown as { postMessage: (m: WorkerResponse) => void }).postMessage(msg);
};

// One live parse result at a time — the modal owns one worker, jobs supersede each other.
let pieces: PieceDTO[] = [];
const cancelled = new Set<number>();

async function handleParse(id: number, files: File[], opts: ParseOpts): Promise<void> {
  const warnings: string[] = [];
  const out: PieceDTO[] = [];
  let detected: Exclude<Unit, 'auto'> = 'mm';
  let nextId = 1;

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
      warnings.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  pieces = out;
  if (out.length === 0 && warnings.length === 0) warnings.push('в файлах не нашлось замкнутых контуров деталей');
  post({ type: 'parsed', id, pieces: out, detectedUnit: detected, warnings });
}

async function handleNest(id: number, config: NestConfig): Promise<void> {
  const result = await nest(
    pieces,
    config,
    () => cancelled.has(id),
    (p) => post({ type: 'progress', id, phase: 'ga', generation: p.generation, best: p.best }),
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
      void handleNest(msg.id, msg.config).catch((e) =>
        post({ type: 'error', id: msg.id, message: e instanceof Error ? e.message : String(e) }),
      );
      break;
    case 'cancel':
      cancelled.add(msg.id);
      break;
  }
};
