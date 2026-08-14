// Per-file pipeline: bytes → dxf-parser → block expansion → loop chaining/filtering →
// raw pieces in absolute cm coordinates, then the normalization into PieceDTO.
import type { ParseOpts, PieceDTO, Unit } from '../types';
import { parseDxf } from '../dxf/parse';
import { expandGroups } from '../dxf/transform';
import { groupToPieces, type RawPiece } from '../dxf/pieces';
import { area, bounds } from '../geom/polygon';

export function parseFiles(
  buf: ArrayBuffer,
  opts: ParseOpts,
  warnings: string[],
): {
  raws: RawPiece[];
  unit: Exclude<Unit, 'auto'>;
  unitGuessed: boolean;
  // Вставки блоков, не доехавшие до геометрии в УСПЕШНО прочитанном файле (см. SkipTally в
  // dxf/transform.ts). Едет отдельным числом рядом с `raws`, потому что «файл прочитан» и «в файле
  // прочитано всё» — разные утверждения, а судящий об ОТСУТСТВИИ блока опирается на второе.
  skippedBlocks: number;
} {
  const parsed = parseDxf(buf, opts.unit);
  const { groups, skippedBlocks } = expandGroups(
    parsed.dxf.entities ?? [],
    parsed.dxf.blocks ?? {},
    parsed.cmPerUnit,
    opts.tol,
    warnings,
  );
  const raws: RawPiece[] = [];
  for (const g of groups) {
    raws.push(...groupToPieces(g, opts.tolChain, warnings));
  }
  return { raws, unit: parsed.unit, unitGuessed: parsed.unitGuessed, skippedBlocks };
}

// One uploaded sheet, decoupled from the browser's File so the same pipeline runs off the
// main thread AND in the node probe (scripts/nest-probe.mjs). The probe is the only place
// the engine's promises get measured against true geometry, so it has to walk the code path
// the worker walks — a probe that rebuilt its own pieces would be measuring a second
// implementation.
//
// The bytes arrive through a THUNK rather than as an ArrayBuffer, and both halves of that
// matter. Reading them inside this function keeps a failed read as ONE failed sheet (a
// rejected read hoisted to the caller took the whole batch down with it, where before it
// cost one warning and the other sheets still parsed); and reading them one at a time keeps
// worker memory at one sheet instead of all of them — these files run 0.5–1.7 MB each, and
// nothing here needs two at once.
export type SheetBytes = { name: string; open: () => Promise<ArrayBuffer> };

export type ParsedSheets = {
  pieces: PieceDTO[];
  detectedUnit: Exclude<Unit, 'auto'>;
  warnings: string[];
  // Files whose parse threw. The caller decides what «all of them» means: the worker
  // turns it into an error rather than an empty piece list with notes.
  failedFiles: number;
  // ВТОРАЯ ПОЛОВИНА НЕПОЛНОТЫ, суммарно по пачке: блоки, пропущенные ВНУТРИ файлов, которые
  // прочитались (отсутствующее определение, вложенность глубже предела, исчерпанный бюджет
  // инстансов). Без неё «failedFiles === 0» читалось как «разобрано всё», а разобрано было не всё —
  // и потребитель, выносящий приговор по ОТСУТСТВИЮ блока, выносил его по дырявому набору.
  skippedBlocks: number;
};

// Parse a batch of sheets into placement-ready pieces. Ids are minted across the batch
// (1-based) because everything downstream — the marker blob, the cut-piece aliases, the
// nest config — addresses a piece by that id.
export async function parseSheets(
  sheets: readonly SheetBytes[],
  opts: ParseOpts,
): Promise<ParsedSheets> {
  const warnings: string[] = [];
  const pieces: PieceDTO[] = [];
  let detectedUnit: Exclude<Unit, 'auto'> = 'mm';
  let nextId = 1;
  let failedFiles = 0;
  let skippedBlocks = 0;
  let fileIndex = 0;

  for (const sheet of sheets) {
    try {
      const {
        raws,
        unit,
        unitGuessed,
        skippedBlocks: skipped,
      } = parseFiles(await sheet.open(), opts, warnings);
      skippedBlocks += skipped;
      detectedUnit = unit;
      if (unitGuessed) warnings.push(`${sheet.name}: единицы не заданы в файле — принято ${unit}`);
      for (const raw of raws) {
        const bb = bounds(raw.poly);
        // Normalize: local origin at bbox min corner — placement x/y then read naturally.
        const poly = raw.poly.map((p) => ({ x: p.x - bb.minX, y: p.y - bb.minY }));
        pieces.push({
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
          source: sheet.name,
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
      warnings.push(`${sheet.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    fileIndex++;
  }

  return { pieces, detectedUnit, warnings, failedFiles, skippedBlocks };
}
