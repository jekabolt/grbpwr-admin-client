// Per-file pipeline: bytes → dxf-parser → block expansion → loop chaining/filtering →
// raw pieces in absolute cm coordinates, then the normalization into PieceDTO.
import type { ParseOpts, PieceDTO, PieceManifestFacts, Unit } from '../types';
import type { ConversionManifest } from 'lib/pattern-import/types';
import { readManifestBytes } from 'lib/pattern-import/manifest';
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
  // Имена ВСТРЕЧЕННЫХ верхнеуровневых вставок — набор присутствия, независимый от `raws`. Деталь
  // может не построиться из блока, который в файле есть (порог площади, незамкнутый контур,
  // sanitizeLoop), и тогда `raws` про этот блок молчит, а чертёж — нет. Кто спрашивает «есть ли
  // блок в чертеже», обязан спрашивать здесь; кому нужна геометрия — у `raws`.
  blockNames: string[];
} {
  const parsed = parseDxf(buf, opts.unit);
  const { groups, skippedBlocks, blockNames } = expandGroups(
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
  return { raws, unit: parsed.unit, unitGuessed: parsed.unitGuessed, skippedBlocks, blockNames };
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
  // НАБОР ПРИСУТСТВИЯ по всей пачке: имена верхнеуровневых вставок, встреченных разбором, в
  // написании файла и без дублей. Отвечает на вопрос «этот блок в чертеже есть?» — единственный
  // вопрос, по которому деталь кроя предлагается удалить. `pieces` на него отвечать не может: между
  // блоком и деталью лежит геометрия, и она законно возвращает ноль контуров.
  blockNames: string[];
  // МАНИФЕСТ КОНВЕРТАЦИИ по индексу файла (F6b, 08-CONTRACT §3.1); null — файл без манифеста.
  // Детали такого файла уже несут `manifest` — массив здесь для тех, кому нужен файл целиком
  // (значок «сконвертировано» на вкладке выкроек), а не для разбора деталей.
  manifests: (ConversionManifest | null)[];
  // Codex C3: почему манифест файла НЕ принят (геометрия или ворота не сошлись), по индексу файла;
  // null — принят или его нет. Детали такого файла разобраны как у любого DXF.
  manifestDistrust: (string | null)[];
};

// Факты манифеста по имени блока (ci). Манифест обязан описывать файл ЦЕЛИКОМ: каждый
// встреченный блок есть в манифесте и каждый блок манифеста встречен. Иначе файл правили после
// конвертера (или манифест от другого файла), и доверять ему частично нельзя — карточка тогда
// смешала бы заявленное с угаданным внутри одной ткани. Расхождение — отказ файла, а не тихий
// откат к угадыванию: то же правило «всё или ничего», что у readManifest.
function manifestFactsByBlock(
  m: ConversionManifest,
  seenBlocks: readonly string[],
  geometryBlocks: readonly string[],
): Map<string, PieceManifestFacts> {
  const declared = new Map(m.blocks.map((b) => [b.block.trim().toLowerCase(), b]));
  const seen = new Set(seenBlocks.map((b) => b.trim().toLowerCase()).filter(Boolean));
  const extra = [...seen].filter((b) => !declared.has(b));
  const absent = [...declared.keys()].filter((b) => !seen.has(b));
  if (extra.length > 0 || absent.length > 0) {
    throw new Error(
      `the conversion manifest does not describe this drawing (${[
        extra.length > 0 ? `blocks not in the manifest: ${extra.join(', ')}` : '',
        absent.length > 0 ? `manifest blocks missing from the drawing: ${absent.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('; ')}) — the file was edited after conversion; re-export it from the converter`,
    );
  }
  if (geometryBlocks.some((b) => !b.trim() || !declared.has(b.trim().toLowerCase()))) {
    throw new Error(
      'the conversion manifest does not describe this drawing (it carries geometry outside its blocks) — re-export it from the converter',
    );
  }
  const pieceOf = new Map(m.pieces.map((p) => [p.identity.trim().toLowerCase(), p]));
  const out = new Map<string, PieceManifestFacts>();
  for (const [ci, b] of declared) {
    const piece = pieceOf.get(b.identity.trim().toLowerCase())!;
    const raw = b.block.trim();
    const tail = `_${b.sizeToken}`;
    // Хвост берётся В НАПИСАНИИ ФАЙЛА, как его берёт и разбор имён (deriveBlockSizes отдаёт хвост
    // как написан). Неградуируемая деталь размера не несёт, даже если блок назван по базовому.
    const size =
      piece.ungraded || !raw.toLowerCase().endsWith(tail.toLowerCase())
        ? ''
        : raw.slice(raw.length - b.sizeToken.length);
    if (!piece.ungraded && !size) {
      throw new Error(
        `the conversion manifest does not describe this drawing (block “${raw}” does not end with its size “${b.sizeToken}”) — re-export it from the converter`,
      );
    }
    const hand = piece.pairHand;
    const mods = hand ? piece.mods.filter((x) => x.toUpperCase() !== hand) : piece.mods;
    out.set(ci, {
      identity: piece.identity.trim(),
      size,
      sizeId: piece.ungraded ? 0 : b.sizeId,
      cardName: hand
        ? [piece.code, ...mods].filter(Boolean).join('_') || piece.identity.trim()
        : piece.identity.trim(),
      pairHand: hand,
      pairOf: piece.pairOf ? piece.pairOf.trim() : null,
      unfolded: piece.unfoldedFold,
      cutLayer: m.layers.cut,
      seamLayer: m.layers.seam,
      grainLayer: m.layers.grain,
      cutAllowanceCm: m.allowanceMm / 10,
    });
  }
  return out;
}

// МАНИФЕСТ ПРИВЯЗАН К ГЕОМЕТРИИ (Codex C3). Совпадение ИМЁН блоков (manifestFactsByBlock) подделать
// легко: манифест одного листа, вклеенный в другой с теми же именами, или лист, правленный после
// конвертации, — и карточка поверит чужим размерам, слою кроя и парам. Поэтому факты принимаются,
// только если отчёт ворот конвертера прошёл (`gate.passed`) и КАЖДЫЙ блок нарисован таким, каким он
// заявлен: габарит на слое кроя (±0.5 мм, у одной из вставок — и положение), площадь (±0.5 %),
// число надсечек и свёрл. Любое расхождение — манифест для этого листа считается отсутствующим
// (разбор как у любого DXF) и причина едет в `manifestDistrust` (значок на вкладке выкроек).
const GEOM_TOL_MM = 0.5;
const AREA_TOL = 0.005;
const DRILL_MM = 10; // write/plan.ts DRILL_SQUARE_MM — свёрла пишутся квадратом 10×10 на слое 8
export function manifestGeometryProblems(
  m: ConversionManifest,
  raws: readonly RawPiece[],
): string[] {
  const out: string[] = [];
  if (m.gate?.passed !== true)
    out.push(m.gate ? 'its conversion gate did not pass' : 'it carries no conversion gate report');
  const byBlock = new Map<string, RawPiece[]>();
  for (const r of raws) {
    if (r.layer !== m.layers.cut || !r.blockName) continue;
    const k = r.blockName.trim().toLowerCase();
    byBlock.set(k, [...(byBlock.get(k) ?? []), r]);
  }
  for (const b of m.blocks) {
    if (out.length >= 4) break;
    const inst = byBlock.get(b.block.trim().toLowerCase()) ?? [];
    if (inst.length === 0) {
      out.push(`${b.block}: no contour on layer ${m.layers.cut}`);
      continue;
    }
    const [x0, y0, x1, y1] = b.bboxMm;
    let placed = false;
    let bad = '';
    for (const r of inst) {
      const bb = bounds(r.poly);
      const w = (bb.maxX - bb.minX) * 10;
      const h = (bb.maxY - bb.minY) * 10;
      if (Math.abs(w - (x1 - x0)) > GEOM_TOL_MM || Math.abs(h - (y1 - y0)) > GEOM_TOL_MM) {
        bad = `size ${w.toFixed(1)}×${h.toFixed(1)} mm, declared ${(x1 - x0).toFixed(1)}×${(y1 - y0).toFixed(1)}`;
        break;
      }
      if (Math.abs(bb.minX * 10 - x0) <= GEOM_TOL_MM && Math.abs(bb.minY * 10 - y0) <= GEOM_TOL_MM)
        placed = true;
      const a = area(r.poly) * 100;
      if (Math.abs(a - b.areaMm2) > Math.max(AREA_TOL * b.areaMm2, 1)) {
        bad = `area ${a.toFixed(0)} mm², declared ${b.areaMm2}`;
        break;
      }
      const notches = r.inner.filter((p) => p.layer === m.layers.notch).length;
      if (notches !== b.notches) {
        bad = `${notches} notches, declared ${b.notches}`;
        break;
      }
      const drills = r.inner.filter((p) => {
        if (p.layer !== m.layers.internal || !p.closed || p.pts.length !== 4) return false;
        const q = bounds(p.pts);
        return (
          Math.abs((q.maxX - q.minX) * 10 - DRILL_MM) <= GEOM_TOL_MM &&
          Math.abs((q.maxY - q.minY) * 10 - DRILL_MM) <= GEOM_TOL_MM
        );
      }).length;
      if (drills !== b.drills) {
        bad = `${drills} drills, declared ${b.drills}`;
        break;
      }
    }
    if (!bad && !placed) bad = 'not at its declared position';
    if (bad) out.push(`${b.block}: ${bad}`);
  }
  return out;
}

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
  // Набор на всю пачку: один и тот же блок лежит в каждом размерном листе, и присутствие — это
  // вопрос про ткань целиком, а не про отдельный лист.
  const blockNames = new Set<string>();
  const manifests: (ConversionManifest | null)[] = [];
  const manifestDistrust: (string | null)[] = [];
  let fileIndex = 0;

  for (const sheet of sheets) {
    manifests.push(null);
    manifestDistrust.push(null);
    try {
      const buf = await sheet.open();
      // МАНИФЕСТ ЧИТАЕТСЯ ДО РАЗБОРА и по тем же байтам. Битый манифест — отказ ЭТОГО листа, а не
      // тихий null: файл, про который конвертер что-то заявил, но прочитать заявление не удалось,
      // разобранный «как обычный» молча вернул бы карточку к угадыванию размеров и слоя кроя.
      const manifest = readManifestBytes(buf);
      const {
        raws,
        unit,
        unitGuessed,
        skippedBlocks: skipped,
        blockNames: seen,
      } = parseFiles(buf, opts, warnings);
      const named = manifest
        ? manifestFactsByBlock(
            manifest,
            seen,
            raws.map((r) => r.blockName ?? ''),
          )
        : null;
      const distrust = manifest ? manifestGeometryProblems(manifest, raws) : [];
      const facts = distrust.length > 0 ? null : named;
      if (distrust.length > 0) {
        manifestDistrust[fileIndex] = distrust.join('; ');
        // A file with no gate report at all is the converter's own pre-gate round trip (the gate
        // parses the file before it can embed its verdict): distrusted and badged, but not a parser
        // warning that would land in the gate's own G1 note.
        if (manifest!.gate !== null || distrust.length > 1)
          warnings.push(
            `${sheet.name}: the conversion manifest is not trusted (${distrust.join('; ')}) — sizes, cut layer and pairs are read as for any DXF`,
          );
      }
      manifests[fileIndex] = manifest;
      skippedBlocks += skipped;
      for (const b of seen) blockNames.add(b);
      detectedUnit = unit;
      if (unitGuessed)
        warnings.push(`${sheet.name}: units are not set in the file — ${unit} assumed`);
      for (const raw of raws) {
        const bb = bounds(raw.poly);
        // Normalize: local origin at bbox min corner — placement x/y then read naturally.
        const poly = raw.poly.map((p) => ({ x: p.x - bb.minX, y: p.y - bb.minY }));
        pieces.push({
          id: nextId++,
          // Two different questions, answered from the SOURCE rather than from each other:
          // what to show (a placeholder when the file carried no block), and which block this
          // came from (the alias key — '' only when there genuinely is none). Testing the label
          // against 'model' would misread a DXF whose block is literally named that.
          name: raw.blockName == null ? `piece ${nextId - 1}` : raw.name,
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
          // Есть у КАЖДОЙ детали файла с манифестом (manifestFactsByBlock проверил это до цикла).
          ...(facts ? { manifest: facts.get((raw.blockName ?? '').trim().toLowerCase())! } : {}),
        });
      }
    } catch (e) {
      failedFiles++;
      warnings.push(`${sheet.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    fileIndex++;
  }

  return {
    pieces,
    detectedUnit,
    warnings,
    failedFiles,
    skippedBlocks,
    blockNames: [...blockNames],
    manifests,
    manifestDistrust,
  };
}
