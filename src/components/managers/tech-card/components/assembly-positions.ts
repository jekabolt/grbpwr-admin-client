import type { AssemblyResult, AssemblyStep } from './assembly-frontier';
import type { BoxLayout, SchematicLayout, TileLayout } from './assembly-layout';

// Слой ручных позиций и жестов схемы: «куда встала нода», «что под курсором», «можно ли соединить».
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ЧИСТЫЙ МОДУЛЬ. В клиенте нет тест-раннера, и всё, что живёт внутри компонента,
// проверяется только руками. Три решения ниже — арифметические, и каждое ошибается тихо:
// оверрайд, потерявший ноду за краем полотна; hit-test, отдающий не ту цель на пиксель;
// вердикт, разрешающий соединить уже съеденное. Поэтому они вынуты из React до последнего
// пикселя UI и покрыты пробой `scripts/assembly-positions-probe.mjs`.
//
// ОВЕРРАЙД ЗАМЕЩАЕТ КООРДИНАТУ — И ВСЁ. Никакого «умного» перетекания авто-раскладки вокруг
// сдвинутой ноды: три прохода `assemblyLayout` считаются всегда по чистым правилам, а этот слой
// кладётся сверху. Иначе раскладка перестала бы быть детерминированной и проверяемой, а полотно
// начало бы ёрзать под рукой.

/** Ключ ноды → её ручная позиция. Ключ детали — `lineKey`, ключ узла — `outputUnitKey`. */
export type PosOverrides = Record<string, { x: number; y: number }>;

/**
 * Зарезервированный ключ хвостового бокса (шаги вне узлов).
 *
 * Пустая строка безопасна как ключ ноды именно потому, что она невалидна как ключ узла: шаг с
 * пустым `output_unit_key` ничего не собирает. Столкновения с настоящим узлом быть не может.
 */
export const TAIL_KEY = '';

/** Отступы полотна справа и снизу — те же, что закладывает `assemblyLayout`. */
const PAD_RIGHT = 24;
const PAD_BOTTOM = 30;

const clamp = (p: { x: number; y: number }) => ({ x: Math.max(0, p.x), y: Math.max(0, p.y) });

/**
 * Наложить ручные позиции на авто-раскладку.
 *
 * Габариты полотна только РАСТУТ: авто-ширина и авто-высота остаются полом. Так пустой набор
 * оверрайдов даёт точное тождество (полотно не дёргается), сброс в «авто» возвращает исходный
 * размер, а нода, утащенная вправо-вниз, не оказывается за границей прокрутки.
 *
 * Координаты клампятся в `x, y ≥ 0`: испорченное или устаревшее хранилище иначе спрятало бы
 * ноду за верхним или левым краем НАВСЕГДА — `overflow: auto` в минус не прокручивается, и
 * достать её было бы нечем.
 *
 * Вход не мутируется: раскладка мемоизируется выше по дереву.
 */
export function applyOverrides(layout: SchematicLayout, pos: PosOverrides): SchematicLayout {
  const moveBox = (b: BoxLayout): BoxLayout => {
    const o = pos[b.key];
    if (!o) return b;
    const p = clamp(o);
    // stackTop едет вместе с боксом: стопка — его часть, а не самостоятельная нода. Плитки,
    // у которых есть собственный оверрайд, отвяжутся от неё сами — ниже.
    return { ...b, x: p.x, y: p.y, stackTop: b.stackTop + (p.y - b.y) };
  };
  const moveTile = (t: TileLayout): TileLayout => {
    const o = pos[t.key];
    if (!o) return t;
    const p = clamp(o);
    return { ...t, x: p.x, y: p.y };
  };

  const boxes = layout.boxes.map(moveBox);
  const tiles = layout.tiles.map(moveTile);
  const tail = layout.tail ? moveBox(layout.tail) : undefined;

  const byKey = new Map<string, BoxLayout>();
  for (const b of boxes) byKey.set(b.key, b);
  const tileByKey = new Map<string, TileLayout>();
  for (const t of tiles) tileByKey.set(t.key, t);

  let right = 0;
  let bottom = 0;
  for (const n of [...boxes, ...tiles, ...(tail ? [tail] : [])]) {
    if (n.x + n.w > right) right = n.x + n.w;
    if (n.y + n.h > bottom) bottom = n.y + n.h;
  }

  return {
    ...layout,
    boxes,
    byKey,
    tail,
    tiles,
    tileByKey,
    width: Math.max(layout.width, right + PAD_RIGHT),
    height: Math.max(layout.height, bottom + PAD_BOTTOM),
  };
}

export type NodeHit = { kind: 'box' | 'tile'; key: string };

/**
 * Что лежит под точкой полотна.
 *
 * ПЛИТКА ПОБЕЖДАЕТ БОКС при наложении: меньшая цель — намеренная, большая — почти всегда фон.
 * При наложении однородных нод побеждает последняя по порядку раскладки.
 *
 * КОНТРАКТ С РЕНДЕРОМ: раз плитка выигрывает hit-test, она обязана и рисоваться ПОВЕРХ бокса —
 * иначе рука целится в то, чего не видит. В авто-раскладке ноды не пересекаются вовсе, но
 * ручные позиции пересечение разрешают, и порядок отрисовки перестаёт быть безразличным.
 */
export function hitNode(layout: SchematicLayout, x: number, y: number): NodeHit | null {
  const inside = (n: { x: number; y: number; w: number; h: number }) =>
    x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h;

  for (let i = layout.tiles.length - 1; i >= 0; i--) {
    if (inside(layout.tiles[i])) return { kind: 'tile', key: layout.tiles[i].key };
  }
  const boxes = [...layout.boxes, ...(layout.tail ? [layout.tail] : [])];
  for (let i = boxes.length - 1; i >= 0; i--) {
    if (inside(boxes[i])) return { kind: 'box', key: boxes[i].key };
  }
  return null;
}

export type CombineVerdict =
  | { ok: true; absorbInto?: string }
  | { ok: false; reason: string };

/**
 * Можно ли соединить перетаскиваемую ноду с той, на которую её бросили.
 *
 * `null` — НЕ ОТКАЗ, а отсутствие жеста: нода брошена сама на себя или в хвостовой бокс (тот не
 * узел и не деталь, соединять с ним нечего). Разница существенная: отказ обязан объяснить
 * причину, а на «жеста не было» объяснять нечего, и снекбар был бы шумом.
 *
 * Отказ формулируется словами движка — читатель уже выучил их в списке. Номер шага берётся
 * ЭКРАННЫЙ, `(i + 1) * 10`: рельс и строки боксов подписаны именно им, и «шагом 2» указывало бы
 * на строку с подписью «20».
 */
export function combineVerdict(
  dragKey: string,
  targetKey: string,
  res: AssemblyResult,
  steps: AssemblyStep[],
): CombineVerdict | null {
  if (!targetKey || !dragKey) return null; // хвостовой бокс с любой стороны
  if (dragKey === targetKey) return null;

  const eatenReason = (key: string): string | null => {
    const eater = res.consumedBy.get(key);
    if (eater === undefined) return null;
    const into = steps[eater]?.outputUnitKey ?? '';
    const where = into ? ` и лежит внутри узла ${into}` : '';
    return `«${key}» уже съеден шагом ${(eater + 1) * 10}${where}`;
  };

  const dragEaten = eatenReason(dragKey);
  if (dragEaten) return { ok: false, reason: dragEaten };
  const targetEaten = eatenReason(targetKey);
  if (targetEaten) return { ok: false, reason: targetEaten };

  // Нода может быть неизвестной раскладке только на битом состоянии; отказ честнее молчания.
  const known = (key: string) => res.frontier.includes(key);
  if (!known(dragKey)) return { ok: false, reason: `«${dragKey}» не лежит на столе` };
  if (!known(targetKey)) return { ok: false, reason: `«${targetKey}» не лежит на столе` };

  // Цель — живой узел: предлагается ПОГЛОЩЕНИЕ, и узел сохраняет свою идентичность. Именно цели,
  // а не тащимой ноды: «дособрать GARMENT рукавом» и «собрать новый узел из GARMENT и рукава» —
  // разные намерения, и жест указывает на первое.
  const absorbInto = res.units.has(targetKey) ? targetKey : undefined;
  return absorbInto ? { ok: true, absorbInto } : { ok: true };
}
