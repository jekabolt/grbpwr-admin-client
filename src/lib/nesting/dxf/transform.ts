// INSERT/block expansion. AAMA/ASTM garment DXF puts each pattern piece in its own BLOCK
// with one INSERT in model space — the block name IS the piece name — so expansion keeps
// entities grouped per INSERT instance instead of flattening the file.
import type { IBlock, IEntity, IInsertEntity } from 'dxf-parser';
import type { Pt } from '../types';
import { entityToChain } from './entities';
import { carrySampleNotches } from './notch';

// `notch` — see Chain in entities.ts: an AAMA POINT notch, kept out of grain and contour logic.
export type LayeredChain = { pts: Pt[]; closed: boolean; layer: string; notch?: true };

export type EntityGroup = {
  // Block name when the group came from an INSERT; null for loose model-space entities.
  blockName: string | null;
  chains: LayeredChain[];
};

type Xform = {
  // p' = Flip?·[R(rotRad)·S(sx,sy)·(p − base) + pos], per AutoCAD INSERT + OCS semantics:
  // extrusion (0,0,−1) expresses the WHOLE insert (rotation and position included) in the
  // mirrored OCS, so the flip applies AFTER rotation and to pos too — folding it into sx
  // yields Flip·R(−θ) and comes out rotated by 2θ on rotated mirrored inserts. base/pos
  // are stored in cm — every coordinate is scaled to cm at tessellation time.
  baseX: number;
  baseY: number;
  posX: number;
  posY: number;
  sx: number;
  sy: number;
  rotRad: number;
  mirror: boolean;
};

function applyXform(p: Pt, t: Xform): Pt {
  const x0 = (p.x - t.baseX) * t.sx;
  const y0 = (p.y - t.baseY) * t.sy;
  const c = Math.cos(t.rotRad);
  const s = Math.sin(t.rotRad);
  const x = x0 * c - y0 * s + t.posX;
  const y = x0 * s + y0 * c + t.posY;
  return t.mirror ? { x: -x, y } : { x, y };
}

function insertXform(
  ins: IInsertEntity,
  block: IBlock,
  u: number,
  col: number,
  row: number,
): Xform {
  return {
    baseX: (block.position?.x ?? 0) * u,
    baseY: (block.position?.y ?? 0) * u,
    posX: ((ins.position?.x ?? 0) + col * (ins.columnSpacing || 0)) * u,
    posY: ((ins.position?.y ?? 0) + row * (ins.rowSpacing || 0)) * u,
    sx: ins.xScale || 1,
    sy: ins.yScale || 1,
    rotRad: ((ins.rotation || 0) * Math.PI) / 180,
    mirror: !!ins.extrusionDirection && ins.extrusionDirection.z === -1,
  };
}

// Total block-instance budget per file: column/row arrays multiply at every nesting
// level, so depth alone does not bound work (a nested 100×100 is 10⁸ instances).
const MAX_INSTANCES = 10_000;

type Budget = { left: number; warned: boolean };

const MAX_DEPTH = 8;

// СТРУКТУРНЫЙ УЧЁТ ТИХО ПРОПУЩЕННЫХ ВСТАВОК (находка 1 второго адверсарного ревью).
//
// Файл может прочитаться ЦЕЛИКОМ и всё равно недосчитаться отдельных блоков: INSERT ссылается на
// определение, которого в файле нет; вложенность глубже MAX_DEPTH; выбран бюджет инстансов. Каждый
// такой пропуск отмечался ТОЛЬКО предупреждением (а вложенный отсутствующий блок — вообще ничем), и
// снаружи разбор выглядел успешным. Для потребителя, который делает вывод ИЗ ОТСУТСТВИЯ блока
// (модалка «детали кроя из DXF» → кандидаты на удаление → каскад сервера по строкам рецепта и
// замеренным площадям), это неотличимо от «детали в чертеже больше нет», и восстанавливать потерю
// нечем.
//
// Поэтому пропуск считается ЧИСЛОМ и едет наружу тем же путём, что failedFiles, — полем, а не
// догадкой по тексту предупреждения: формулировку однажды перепишут, и защита отвалится молча.
//
// ЧТО СЮДА НЕ ВХОДИТ и не должно: блок, прочитанный полностью и не давший геометрии (пустое
// определение, штамп, аннотация), и блок, чей контур не замкнулся. Это ВЫВОДЫ из прочитанного, а не
// пропуски; записав их в неполноту, мы объявили бы неполным почти каждый реальный чертёж и запретили
// бы удаление исчезнувших деталей навсегда.
type SkipTally = {
  // Сколько вставок блоков не доехало до геометрии.
  blocks: number;
  // Имена, о которых уже предупредили. Вложенный INSERT живёт внутри массива (columnCount ×
  // rowCount), так что без дедупликации ОДНО отсутствующее определение даёт тысячи одинаковых строк
  // в панели предупреждений модалки.
  warnedMissing: Set<string>;
};

// Отсутствующее определение блока: считаем ВСЕГДА, предупреждаем ОДИН раз на имя.
function noteMissingBlock(name: string, warnings: string[], tally: SkipTally): void {
  tally.blocks++;
  const key = String(name ?? '');
  if (tally.warnedMissing.has(key)) return;
  tally.warnedMissing.add(key);
  warnings.push(`INSERT references a missing block “${key}”`);
}

function expandInto(
  entities: IEntity[],
  blocks: Record<string, IBlock>,
  u: number,
  tolCm: number,
  transforms: Xform[],
  group: EntityGroup,
  warnings: string[],
  depth: number,
  budget: Budget,
  tally: SkipTally,
): void {
  for (const e of entities) {
    if (e.type === 'INSERT') {
      const ins = e as IInsertEntity;
      const block = blocks[ins.name];
      if (!block || !block.entities) {
        // Раньше здесь не оставалось ВООБЩЕ НИЧЕГО — ни предупреждения, ни следа: геометрия внутри
        // успешно прочитанного файла исчезала бесшумно.
        noteMissingBlock(ins.name, warnings, tally);
        continue;
      }
      if (depth >= MAX_DEPTH) {
        tally.blocks++;
        warnings.push(`block “${ins.name}” is nested deeper than ${MAX_DEPTH} levels — skipped`);
        continue;
      }
      const cols = Math.max(1, ins.columnCount || 1);
      const rows = Math.max(1, ins.rowCount || 1);
      let placed = 0;
      for (let ci = 0; ci < cols; ci++) {
        for (let ri = 0; ri < rows; ri++) {
          if (budget.left <= 0) {
            if (!budget.warned) {
              budget.warned = true;
              warnings.push(
                `too many nested block inserts (> ${MAX_INSTANCES}) — some are skipped`,
              );
            }
            // Управление тем же `return`, что и раньше (бросаем и остаток сущностей этого уровня);
            // добавлен только счёт неразвёрнутых инстансов ЭТОЙ вставки.
            tally.blocks += cols * rows - placed;
            return;
          }
          placed++;
          budget.left--;
          const t = insertXform(ins, block, u, ci, ri);
          expandInto(
            block.entities,
            blocks,
            u,
            tolCm,
            [...transforms, t],
            group,
            warnings,
            depth + 1,
            budget,
            tally,
          );
        }
      }
      continue;
    }
    const chain = entityToChain(e, u, tolCm);
    if (!chain || chain.pts.length < 2) continue;
    // Innermost transform first — the chain lives in the deepest block's coordinates.
    let pts = chain.pts;
    for (let i = transforms.length - 1; i >= 0; i--) {
      const t = transforms[i];
      pts = pts.map((p) => applyXform(p, t));
    }
    group.chains.push({
      pts,
      closed: chain.closed,
      layer: String(e.layer ?? '0'),
      ...(chain.notch ? { notch: true as const } : {}),
    });
  }
}

// Model space → groups. INSERTs become one group per instance (piece identity); loose
// entities pool into a single fallback group split later by containment analysis.
//
// Возвращает ещё `skippedBlocks` — см. SkipTally выше: «файл прочитан» и «в файле прочитано всё»
// это разные утверждения, и второе обязано доезжать до того, кто судит об ОТСУТСТВИИ блока.
//
// И `blockNames` — ИМЕНА ВСТРЕЧЕННЫХ ВСТАВОК, независимо от того, дожила ли их геометрия до контура
// (находка 1 третьего адверсарного ревью). Между «блок встречен» и «блок стал деталью» лежит весь
// геометрический путь — сшивка разомкнутых цепочек, порог площади, отбор внешнего контура,
// `sanitizeLoop` (dxf/pieces.ts): любой его шаг может НЕ выдать ни одной детали по блоку, который в
// файле есть. Для раскладки это правильный ответ («считать нечего»), а для вопроса «детали больше
// нет в чертеже» — ложь, и цена лжи — предложенное по умолчанию удаление детали кроя вместе со
// строками рецепта и замеренными площадями. Поэтому присутствие берётся ОТСЮДА, а геометрия —
// оттуда, и это намеренно два разных ответа.
//
// Только ВЕРХНЕУРОВНЕВЫЕ вставки: имя детали — это имя блока, вставленного в модельное
// пространство (`EntityGroup.blockName` берётся здесь же), а вложенные блоки — внутренности одной
// детали. Записав и их, мы позволили бы служебному вложенному блоку с именем детали замаскировать
// её настоящее исчезновение.
export function expandGroups(
  modelEntities: IEntity[],
  blocks: Record<string, IBlock>,
  u: number,
  tolCm: number,
  warnings: string[],
  // The file was written by our converter (its manifest prologue was found): its blocks' AAMA
  // `QUANTITY:` labels are the cut count — see `labelCopies`.
  opts: { converter?: boolean } = {},
): { groups: EntityGroup[]; skippedBlocks: number; blockNames: string[] } {
  const groups: EntityGroup[] = [];
  const loose: EntityGroup = { blockName: null, chains: [] };
  const budget: Budget = { left: MAX_INSTANCES, warned: false };
  const tally: SkipTally = { blocks: 0, warnedMissing: new Set<string>() };
  const seenBlocks = new Set<string>();

  for (const e of modelEntities) {
    if (e.type === 'INSERT') {
      const ins = e as IInsertEntity;
      // Записывается ДО всех проверок: вставка на отсутствующее определение — это тоже «имя в
      // чертеже есть», а не «детали не стало». Ни одна ветка ниже не имеет права молча вычесть
      // блок из набора присутствия.
      if (ins.name) seenBlocks.add(String(ins.name));
      const block = blocks[ins.name];
      if (!block || !block.entities) {
        // Верхнеуровневый INSERT — это РОВНО одна деталь чертежа: пропустив его, разбор теряет
        // деталь целиком, а модалка увидит ту же пустоту, что и от настоящего удаления блока.
        noteMissingBlock(ins.name, warnings, tally);
        continue;
      }
      const cols = Math.max(1, ins.columnCount || 1);
      const rows = Math.max(1, ins.rowCount || 1);
      let placed = 0;
      // Бюджет проверяется УСЛОВИЕМ цикла, а не `break` изнутри: прежний внутренний `break` выходил
      // только из ri-цикла, внешний тут же входил снова и упирался в тот же ноль. Результат был тот
      // же (групп не создаётся), но посчитать неразвёрнутые инстансы РОВНО один раз так нельзя —
      // счётчик пришлось бы двоить на каждом обороте ci.
      for (let ci = 0; ci < cols && budget.left > 0; ci++) {
        for (let ri = 0; ri < rows && budget.left > 0; ri++) {
          placed++;
          budget.left--;
          const group: EntityGroup = { blockName: ins.name, chains: [] };
          expandInto(
            block.entities,
            blocks,
            u,
            tolCm,
            [insertXform(ins, block, u, ci, ri)],
            group,
            warnings,
            1,
            budget,
            tally,
          );
          if (group.chains.length > 0) groups.push(group);
        }
      }
      // Развёрнуто меньше, чем нарисовано, — остаток пропущен из-за бюджета. Предупреждение одно на
      // файл (budget.warned), а счёт полный: `complete` смотрит на число, а не на текст.
      if (placed < cols * rows) {
        if (!budget.warned) {
          budget.warned = true;
          warnings.push(`too many block inserts (> ${MAX_INSTANCES}) — some are skipped`);
        }
        tally.blocks += cols * rows - placed;
      }
      continue;
    }
    const chain = entityToChain(e, u, tolCm);
    if (!chain || chain.pts.length < 2) continue;
    loose.chains.push({
      pts: chain.pts,
      closed: chain.closed,
      layer: String(e.layer ?? '0'),
      ...(chain.notch ? { notch: true as const } : {}),
    });
  }

  // AAMA R12 draws notches in the sample-size block only (K2 pitfall 3) — needs every block of the
  // file at once, which is here.
  carrySampleNotches(groups, warnings);
  if (opts.converter || modelEntities.some(isConverterAuthor)) labelCopies(groups, blocks);
  if (loose.chains.length > 0) groups.push(loose);
  return { groups, skippedBlocks: tally.blocks, blockNames: [...seenBlocks] };
}

// ── W1: the AAMA quantity of a converter-written block ─────────────────────────────────────────
//
// Everything downstream of the parse (the piece-match dialog's × per garment, the marker's
// instances per garment, the batch queue) counts a piece by its PieceDTOs — one per top-level
// INSERT. AAMA/ASTM D6673 carries the cut count as the block's `Quantity:` text instead, with ONE
// insert per block; an AAMA importer multiplies the two. Our converter used to insert a block
// × per garment times AND label it `QUANTITY: N` (N×N in every other CAD); since W1 it writes one
// insert and the label only. So for a file WE wrote, a block is cut max(inserts, label) times:
//   • a new file — 1 insert + `QUANTITY: N`  → N   (the missing N − 1 instances are added here);
//   • an old file — N inserts + `QUANTITY: N` → N   (never N×N, never 1);
//   • no label → the inserts, as before.
// The added instances are geometric copies of the first one (same position: the old copy columns
// only ever existed to make the count visible). Foreign files are left exactly as they were read:
// their labels are other CADs' statements (CLO-AAMA writes `QUANTITY: 1` everywhere) and their
// meaning for a pair (one block, ×2 mirrored) is not ours to guess here.
const QUANTITY_LABEL = /^\s*(?:quantity|qty)\s*:\s*(\d+)\s*$/i;
const CONVERTER_AUTHOR = /^\s*author\s*:\s*grbpwr\b/i;
/** Copies a converter label may ask for — a typo'd label must not flood the marker. */
export const MAX_LABEL_COPIES = 100;

function textOf(e: IEntity): string {
  const t = (e as unknown as { text?: unknown }).text;
  return typeof t === 'string' ? t : '';
}

function isConverterAuthor(e: IEntity): boolean {
  return e.type === 'TEXT' && CONVERTER_AUTHOR.test(textOf(e));
}

/** The block's own `QUANTITY: n` label (TEXT directly in the block), or null. */
export function blockQuantityLabel(block: IBlock | undefined): number | null {
  for (const e of block?.entities ?? []) {
    if (e.type !== 'TEXT' && e.type !== 'MTEXT') continue;
    const m = QUANTITY_LABEL.exec(textOf(e));
    if (m) return Number(m[1]);
  }
  return null;
}

function labelCopies(groups: EntityGroup[], blocks: Record<string, IBlock>): void {
  const order: string[] = [];
  const firstOf = new Map<string, EntityGroup>();
  const count = new Map<string, number>();
  for (const g of groups) {
    if (g.blockName == null) continue;
    if (!firstOf.has(g.blockName)) {
      firstOf.set(g.blockName, g);
      order.push(g.blockName);
    }
    count.set(g.blockName, (count.get(g.blockName) ?? 0) + 1);
  }
  const want = new Map<string, number>();
  for (const name of order) {
    const q = blockQuantityLabel(blocks[name]);
    if (q != null && q > (count.get(name) ?? 0)) want.set(name, Math.min(q, MAX_LABEL_COPIES));
  }
  // Appended in rounds, as the old writer's copy columns were (every block's copy 2, then copy 3…),
  // so a file re-read keeps the piece order an old file of the same pieces had.
  const most = Math.max(0, ...want.values());
  for (let k = 1; k < most; k++)
    for (const name of order) {
      const q = want.get(name);
      if (q == null || k < (count.get(name) ?? 0) || k >= q) continue;
      const g = firstOf.get(name)!;
      groups.push({
        blockName: g.blockName,
        chains: g.chains.map((c) => ({ ...c, pts: c.pts.map((p) => ({ x: p.x, y: p.y })) })),
      });
    }
}
