// INSERT/block expansion. AAMA/ASTM garment DXF puts each pattern piece in its own BLOCK
// with one INSERT in model space — the block name IS the piece name — so expansion keeps
// entities grouped per INSERT instance instead of flattening the file.
import type { IBlock, IEntity, IInsertEntity } from 'dxf-parser';
import type { Pt } from '../types';
import { entityToChain } from './entities';

export type LayeredChain = { pts: Pt[]; closed: boolean; layer: string };

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

function insertXform(ins: IInsertEntity, block: IBlock, u: number, col: number, row: number): Xform {
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
              warnings.push(`too many nested block inserts (> ${MAX_INSTANCES}) — some are skipped`);
            }
            // Управление тем же `return`, что и раньше (бросаем и остаток сущностей этого уровня);
            // добавлен только счёт неразвёрнутых инстансов ЭТОЙ вставки.
            tally.blocks += cols * rows - placed;
            return;
          }
          placed++;
          budget.left--;
          const t = insertXform(ins, block, u, ci, ri);
          expandInto(block.entities, blocks, u, tolCm, [...transforms, t], group, warnings, depth + 1, budget, tally);
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
    group.chains.push({ pts, closed: chain.closed, layer: String(e.layer ?? '0') });
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
          expandInto(block.entities, blocks, u, tolCm, [insertXform(ins, block, u, ci, ri)], group, warnings, 1, budget, tally);
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
    loose.chains.push({ pts: chain.pts, closed: chain.closed, layer: String(e.layer ?? '0') });
  }

  if (loose.chains.length > 0) groups.push(loose);
  return { groups, skippedBlocks: tally.blocks, blockNames: [...seenBlocks] };
}
