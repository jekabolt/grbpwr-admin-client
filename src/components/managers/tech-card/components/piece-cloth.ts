// ТКАНЬ ДЕТАЛИ КРОЯ — один словарь на всех, кто рисует, группирует и печатает «из чего кроится».
//
// Отвечает ровно на один вопрос: из какой ткани кроится каждая деталь ОДНОГО колорвея. Ответ
// собирается НЕ из TechCardPiece.materials (таблица tech_card_piece_material — девять строк на всю
// базу, редактора в админке нет: поле мёртвое), а из рецепта колорвея, где эта связь и живёт:
//
//   TechCardPiece.lineKey   ←  usage.pieceLineKey                    какая ДЕТАЛЬ
//                              usage.bomLineKey → bomItems[].lineKey СЛОТ (purpose × section)
//                              usage.materialId                      ПИН колорвея, бьёт дефолт слота
//
// Слот — это РОЛЬ («основная ткань»), пин — АРТИКУЛ («вельвет из каталога»). Заливка кодирует роль,
// артикул уходит в группировку полки и в подписи: слот и назначение живут на уровне карточки,
// артикул — на уровне колорвея, и смешивать эти два уровня в одном признаке значит красить одну
// деталь по-разному в двух колорвеях без единого повода.
//
// Модуль ЧИСТЫЙ: ни React, ни DOM, ни формы — только данные. Он и есть место, где четыре читателя
// (плитка сборки, штриховка силуэта, полка фулскрина, печатный комплект) договариваются об одном
// ответе. Вторая копия любого из этих правил разъедется молча: дублированная лицевая полочка
// получит крест клеевой вместо штриха основной ткани, и увидят это только на фабрике.

import { derivePieceLayerRole } from './piece-layer-role';
import { wireInt } from './schema';

/** Роль слоя, как её видит рисующий: восемь назначений роллгудс-строки. */
export type PieceClothRole =
  | 'main'
  | 'contrast'
  | 'lining'
  | 'pocketing'
  | 'mesh'
  | 'interfacing'
  | 'insulation'
  | 'other';

/**
 * Состояние детали. Три не-роли — три РАЗНЫХ утверждения, и сливать их нельзя:
 *   `unbound`  — рецепт вообще не говорит, из чего эта деталь кроится (нет ни одной строки);
 *   `unsorted` — строка есть, секция рулонная, но назначение никто не ставил (0265 не бэкфилился:
 *                под section=fabric прячутся карманка, контраст и сетка — гадать значит уверенно
 *                врать на большинстве живых карточек);
 *   `other`    — строка есть, но секция НЕ рулонная (шнур, фурнитура): роли слоя у неё не бывает.
 * Слить `unsorted` с `other` — значит заставить аудит полки врать в обе стороны сразу.
 */
export type PieceClothState = 'unbound' | 'unsorted' | PieceClothRole;

/** Артикул каталога как его показывают: id для сравнения, code/name — для глаз. */
export type PieceClothArticle = { id: number; code: string; name: string };

export type PieceCloth = { state: PieceClothState; article?: PieceClothArticle };

/** Строка BOM как её видит этот модуль — проекция bomItems ФОРМЫ (ещё не сохранённой). */
export type ClothSlot = {
  lineKey: string;
  purpose?: string;
  section?: string;
  materialId?: number;
};

/** Строка рецепта колорвея как она приезжает с READ. */
export type ClothUsage = {
  pieceLineKey?: string;
  bomLineKey?: string;
  // int64 с провода: grpc-gateway сериализует его СТРОКОЙ, а сгенерированный тип обещает number —
  // компилятор проверить это не может. Отсюда и wireInt на каждом лукапе ниже.
  bomItemId?: number;
  materialId?: number;
};

/**
 * ПОРЯДОК РАМПЫ — единственный источник. Его читают `clothRollup`, группы полки и инлайновый ключ
 * легенды: трём потребителям нужен ОДИН порядок, и держать его тремя литералами значит
 * гарантировать, что они разойдутся. `readonly` намеренно: константа-порядок, которую можно
 * отсортировать на месте, перестаёт быть источником правды с первого же `.sort()` у читателя.
 */
export const CLOTH_RAMP: readonly PieceClothState[] = [
  'main',
  'contrast',
  'lining',
  'pocketing',
  'mesh',
  'interfacing',
  'insulation',
  'other',
  'unsorted',
  'unbound',
];

/**
 * Геометрия штриховки. Толщина штриха ВСЕГДА 1×u, где u — user units на CSS-пиксель; масштаб
 * считает вызывающий, здесь числа @1×. Осевых (0°/90°) штриховок нет ни одной: на прямоугольной
 * детали они сливаются с её же краями.
 *
 * `dash` обязан делить `tile` нацело — дэшаррей, не попавший в шаг, рисует молча СПЛОШНУЮ линию, и
 * mesh становится неотличим от lining. Проверяется пробой, а не глазами: на картинке разница в
 * полпикселя.
 */
export type ClothGeom =
  /** Нечего рисовать: сегодняшняя плоская заливка классом, паттерн не подставляется вовсе. */
  | { kind: 'flat' }
  /** Точка радиуса `r` в центре ячейки `tile`×`tile`. */
  | { kind: 'dot'; tile: number; r: number }
  /** Одно семейство линий с шагом `tile` под углом `rot`; `dash` — рваная линия. */
  | { kind: 'line'; tile: number; rot: number; dash?: readonly [number, number] }
  /** Два семейства линий, `+rot` и `−rot`: клетка. */
  | { kind: 'cross'; tile: number; rot: number };

export const CLOTH_GEOMETRY: Record<PieceClothState, ClothGeom> = {
  unbound: { kind: 'flat' },
  unsorted: { kind: 'dot', tile: 4, r: 0.62 },
  mesh: { kind: 'line', tile: 5, rot: -45, dash: [3, 2] },
  other: { kind: 'line', tile: 5, rot: 45, dash: [3, 2] },
  main: { kind: 'line', tile: 6, rot: 45 },
  lining: { kind: 'line', tile: 4, rot: -45 },
  // Контраст держит УГОЛ основной ткани и отличается только частотой: это тоже лицевая ткань, и
  // читаться она должна как её родственник, а не как встречное семейство.
  contrast: { kind: 'line', tile: 3.5, rot: 45 },
  pocketing: { kind: 'line', tile: 3, rot: -45 },
  interfacing: { kind: 'cross', tile: 5, rot: 45 },
  insulation: { kind: 'cross', tile: 3.5, rot: 45 },
};

// Клеевая и утеплитель НЕ участвуют в общем приоритете: деталь показывает ткань, из которой её
// КРОЯТ, а дублируют её поверх (правило печати — «клеевая едет на слое ОСНОВНОЙ ткани»). Свой знак
// они получают только тогда, когда других слоёв у детали нет вовсе.
const DEFERRED_LAYERS: readonly PieceClothState[] = ['interfacing', 'insulation'];

// main > contrast > lining > pocketing > mesh > other > unsorted — выведено из рампы, а не написано
// вторым литералом: иначе два порядка разойдутся первой же правкой одного из них.
const LAYER_PRIORITY: readonly PieceClothState[] = CLOTH_RAMP.filter(
  (s) => s !== 'unbound' && !DEFERRED_LAYERS.includes(s),
);

// Назначение (значение энума) → состояние. Ключи — ровно то, что возвращает derivePieceLayerRole:
// либо purpose из PURPOSE_LABEL, либо фолбэк секции (LINING / INTERFACING / INSULATION).
const STATE_BY_PURPOSE: Record<string, PieceClothRole> = {
  TECH_CARD_BOM_PURPOSE_MAIN: 'main',
  TECH_CARD_BOM_PURPOSE_LINING: 'lining',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'pocketing',
  TECH_CARD_BOM_PURPOSE_INTERFACING: 'interfacing',
  TECH_CARD_BOM_PURPOSE_INSULATION: 'insulation',
  TECH_CARD_BOM_PURPOSE_CONTRAST: 'contrast',
  TECH_CARD_BOM_PURPOSE_MESH: 'mesh',
  TECH_CARD_BOM_PURPOSE_OTHER: 'other',
};

/**
 * Приоритет слоя на плитке: деталь показывает ОСНОВНУЮ ткань кроя. Экспортируется отдельно —
 * печатный комплект зовёт его же, чтобы лист и экран не расходились в том, что за деталь.
 * Пустой набор слоёв — это `unbound`, а не «основная»: отсутствие ответа тоже ответ.
 */
export function pickPrimaryLayer(states: PieceClothState[]): PieceClothState {
  const present = new Set(states);
  for (const s of LAYER_PRIORITY) if (present.has(s)) return s;
  // Остались только отложенные слои (клеевая / утеплитель) — значит, это и есть единственный слой
  // детали, и он получает свой знак. Порядок берётся из рампы, второго литерала здесь нет.
  for (const s of CLOTH_RAMP) if (present.has(s)) return s;
  return 'unbound';
}

// Зеркало entity.EffectiveMaterialId — то же правило, что effectiveArticleId в operations-field.tsx
// и effectiveMaterialId в colorway-recipe.tsx: пин колорвея бьёт дефолт слота, 0 = артикула нет
// нигде. Продублировано локально сознательно, как и там: тащить сюда типы редактора рецепта ради
// трёхстрочной формулы значит связать чистый модуль с моделью черновика.
function effectiveArticleId(pin: number, slotDefault: number): number {
  return pin > 0 ? pin : slotDefault > 0 ? slotDefault : 0;
}

function resolveArticle(
  pin: number,
  slotDefault: number,
  materialNameById: Map<number, { code: string; name: string }>,
): PieceClothArticle | undefined {
  const id = effectiveArticleId(pin, slotDefault);
  if (id <= 0) return undefined;
  // Каталог мог не доехать (запрос ещё летит) или артикул мог быть удалён. Ни то ни другое не
  // отменяет самой связи: id известен, и он печатается как есть — молчаливое падение здесь стёрло
  // бы деталь с полки целиком.
  const known = materialNameById.get(id);
  return { id, code: known?.code?.trim() || String(id), name: known?.name?.trim() || '' };
}

function slotState(slot: ClothSlot): PieceClothState {
  const role = derivePieceLayerRole(slot.section, slot.purpose);
  // ДВА РАЗНЫХ null. Проверить только `role === null`, забыв про rollGoods, — значит записать шнур
  // и фурнитуру в «не разложено» и заставить аудит требовать назначения там, где его не бывает.
  if (!role.rollGoods) return 'other';
  if (role.role === null) return 'unsorted';
  // Незнакомое назначение — «прочее», а не «не разложено»: роль у строки ЕСТЬ, просто она новее
  // этого словаря, и называть её неразобранной было бы неправдой про работу технолога.
  return STATE_BY_PURPOSE[role.role] ?? 'other';
}

/**
 * Карта «lineKey детали → ткань» для ОДНОГО колорвея.
 *
 * `slots` — из ФОРМЫ (bomItems): дефолтный артикул слота правится на вкладке BOM, и только что
 * выбранный, ещё не сохранённый, обязан резолвиться. `usages` — из READ. `lineKeyByBomId` — мост
 * для легаси-строк, которые несут только `bomItemId`.
 *
 * Деталь, у которой не резолвнулась ни одна строка, в карту НЕ пишется: читатель трактует её
 * отсутствие как `unbound`, и «нет ответа» никогда не превращается в «ответ по умолчанию».
 */
export function pieceClothMap(
  slots: ClothSlot[],
  usages: ClothUsage[],
  materialNameById: Map<number, { code: string; name: string }>,
  lineKeyByBomId: Map<number, string>,
): Map<string, PieceCloth> {
  const slotByLineKey = new Map<string, ClothSlot>();
  for (const slot of slots) {
    const key = slot.lineKey?.trim();
    if (key) slotByLineKey.set(key, slot);
  }

  const layersByPiece = new Map<string, PieceCloth[]>();
  for (const usage of usages) {
    const pieceKey = usage.pieceLineKey?.trim();
    // Строка только с позиционным pieceIndex сюда не доезжает — ровно как у обоих прецедентов
    // (tech-pack-document и construction-tab): позиция детали не идентичность, и угадывать по ней
    // значит перекрасить чужую деталь при первой же перестановке.
    if (!pieceKey) continue;
    const bomKey = usage.bomLineKey?.trim() || lineKeyByBomId.get(wireInt(usage.bomItemId)) || '';
    if (!bomKey) continue;
    const slot = slotByLineKey.get(bomKey);
    if (!slot) continue;
    const article = resolveArticle(
      wireInt(usage.materialId),
      wireInt(slot.materialId),
      materialNameById,
    );
    const layer: PieceCloth = article
      ? { state: slotState(slot), article }
      : { state: slotState(slot) };
    const bucket = layersByPiece.get(pieceKey);
    if (bucket) bucket.push(layer);
    else layersByPiece.set(pieceKey, [layer]);
  }

  const out = new Map<string, PieceCloth>();
  for (const [pieceKey, layers] of layersByPiece) {
    const state = pickPrimaryLayer(layers.map((l) => l.state));
    // Артикул берётся от ВЫИГРАВШЕГО слоя: подпись обязана называть ту же ткань, которой деталь
    // залита, иначе плитка утверждает одно, а её title — другое.
    const winner = layers.find((l) => l.state === state) ?? layers[0];
    out.set(pieceKey, winner.article ? { state, article: winner.article } : { state });
  }
  return out;
}

/** Свёртка множества состояний словами: `main ×3 · pocketing ×1`. Пустой вход — пустая строка. */
export function clothRollup(states: PieceClothState[]): string {
  const count = new Map<PieceClothState, number>();
  for (const s of states) count.set(s, (count.get(s) ?? 0) + 1);
  const parts: string[] = [];
  for (const s of CLOTH_RAMP) {
    const n = count.get(s);
    if (!n) continue;
    // `unbound` называется словами, а не термином рампы: это не вид ткани, а её отсутствие, и в
    // одном ряду с ролями оно читалось бы как ещё одна роль.
    parts.push(`${s === 'unbound' ? 'no cloth' : s} ×${n}`);
  }
  return parts.join(' · ');
}

/**
 * Ключ группы полки в режиме cloth: назначение × ЭФФЕКТИВНЫЙ артикул. Артикул сравнивается по id, а
 * не по имени: два артикула каталога законно носят одно имя (та же молния от двух поставщиков), и
 * склейка по имени утверждала бы, что деталь кроят из одной физической ткани, когда это не так.
 */
export function clothGroupKey(c: PieceCloth): string {
  return `${c.state}#${c.article?.id ?? 0}`;
}
