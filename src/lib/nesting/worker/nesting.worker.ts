// Worker entry: owns the parsed pieces (keyed by parse job) so re-nesting with new
// settings never re-parses, and the GA runs off the main thread with cooperative yields
// so cancel/progress messages drain mid-run.
import type {
  NestConfig,
  ParseOpts,
  PieceDTO,
  Unit,
  WorkerRequest,
  WorkerResponse,
} from '../types';
import { area, bounds } from '../geom/polygon';
import { parseFiles } from './parse-files';
import { orientToGrain } from '../geom/grain-orient';
import { applySeamAllowance } from '../geom/seam-allowance';
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

  let fileIndex = 0;
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
          // Two different questions, answered from the SOURCE rather than from each other:
          // what to show (a placeholder when the file carried no block), and which block this
          // came from (the alias key — '' only when there genuinely is none). Testing the label
          // against 'модель' would misread a DXF whose block is literally named that.
          name: raw.blockName == null ? `деталь ${nextId - 1}` : raw.name,
          blockName: raw.blockName ?? '',
          layer: raw.layer,
          grain: raw.grain,
          // Тем же сдвигом, что и контур: внутренняя геометрия обязана оставаться на своём
          // месте ОТНОСИТЕЛЬНО детали, иначе на раскладке надсечки уедут от неё.
          inner: raw.inner.map((p) => ({
            layer: p.layer,
            closed: p.closed,
            pts: p.pts.map((q) => ({ x: q.x - bb.minX, y: q.y - bb.minY })),
          })),
          source: file.name,
          fileIndex,
          poly,
          bboxW: bb.maxX - bb.minX,
          bboxH: bb.maxY - bb.minY,
          areaCm2: area(poly),
          originX: bb.minX,
          originY: bb.minY,
        });
      }
    } catch (e) {
      failedFiles++;
      warnings.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    fileIndex++;
  }

  // Every file failed → that's an error, not a note with an empty piece list.
  if (files.length > 0 && failedFiles === files.length) {
    post({ type: 'error', id, message: warnings.join('; ') || 'не удалось разобрать DXF' });
    return;
  }

  if (out.length === 0 && warnings.length === 0)
    warnings.push('в файлах не нашлось замкнутых контуров деталей');
  // Commit only when no newer parse started while this one awaited.
  if (seq === parseSeq) currentParse = { id, pieces: out };
  post({ type: 'parsed', id, pieces: out, detectedUnit: detected, warnings });
}

async function handleNest(id: number, parseId: number, config: NestConfig): Promise<void> {
  if (!currentParse || currentParse.id !== parseId) {
    post({ type: 'error', id, message: 'данные деталей устарели — обновите разбор DXF' });
    return;
  }
  // Разворот по долевой и ПРИПУСК НА ШОВ делаются ЗДЕСЬ, на той же геометрии, которую увидит
  // движок. Раньше разворот жил на главном потоке и сюда не доезжал: через NestConfig едут
  // только идентификаторы и числа, так что детали укладывались как нарисованы, а экран
  // показывал повёрнутые контуры с чужими размещениями. Обе функции чистые и вызываются с теми
  // же аргументами на главном потоке — значит обе стороны получают побайтово одно и то же.
  //
  // Порядок тот же, что на экране: сначала развернуть по долевой, потом раздуть. Раздуваются
  // ТОЛЬКО детали из задания — в разборе лежит вся градация на всех слоях, и раздувать сотню
  // лишних контуров значило бы платить за них временем на каждом прогоне.
  const wanted = new Set(config.pieces.map((p) => p.pieceId));
  const oriented = orientToGrain(currentParse.pieces, config.grainLayer).pieces;
  const seam = applySeamAllowance(
    oriented.filter((p) => wanted.has(p.id)),
    config.seamAllowanceCm,
  );
  const result = await nest(
    seam.pieces,
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
  // Оболочка вместо детали — В ПРЕДУПРЕЖДЕНИЯ РЕЗУЛЬТАТА, а не только в левую панель.
  //
  // Когда обход внешней грани срывается (после лестницы попыток это стало редкостью, но не
  // невозможностью), контур заменяется выпуклой оболочкой: у полочки это заливает пройму и
  // горловину. Расход при этом завышен — то есть по ткани безопасно, — но плоттерный файл
  // отдаёт оболочку на слое CUT, и резак режет ПО НЕЙ. «Безопасно по расходу» и «безопасно
  // резать» здесь расходятся, и второе важнее.
  //
  // Предупреждения результата едут в сохранённый маркер, поэтому это увидит и тот, кто откроет
  // раскладку завтра, а не только тот, кто смотрел на панель в момент прогона.
  if (seam.hulled.length > 0) {
    result.warnings = [
      ...(result.warnings ?? []),
      `контур заменён выпуклой оболочкой (припуск не сошёлся): ${seam.hulled.join(', ')} — РЕЗАТЬ ПО ЭТОМУ ФАЙЛУ НЕЛЬЗЯ, силуэт детали искажён`,
    ];
  }
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
