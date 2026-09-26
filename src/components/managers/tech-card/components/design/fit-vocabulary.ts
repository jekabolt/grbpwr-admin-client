import type { common_Category } from 'api/proto-http/admin';

/**
 * ═══ FIT — ОДИН СЛОВАРЬ НА АДМИНКУ, КЛЮЧИ СТОРФРОНТА ═════════════════════════════════════════
 *
 * Волна 2026-09-25 (T02, D-03, `04-DEEP-01`). На проводе fit — свободная строка
 * (`tech_card.fit VARCHAR(50)`, серверной проверки нет и не будет: на проде лежат легаси-значения),
 * а сторфронт переводит его ПО КЛЮЧУ из закрытого списка (`messages/*.json → fit`, `FIT_OPTIONS`
 * в grbpwr.com). Отсюда правило этого файла: админка ПРЕДЛАГАЕТ только эти ключи и ровно в этом
 * написании (`wide_leg`, `a_line`) — ключ вне списка сторфронт напечатал бы как «fit.<key>».
 *
 * Список один. До волны он жил дважды — приватной константой в `style-facts-field.tsx` и
 * экспортом «под протест» в `render/model.ts`; теперь `render/model.ts` реэкспортирует этот, а
 * приватной копии нет.
 *
 * Порядок ключей — порядок сторфронта (7 старых, потом 12 новых), чтобы сверка двух списков была
 * построчной.
 */
export const FIT_KEYS = [
  'regular',
  'slim',
  'loose',
  'relaxed',
  'skinny',
  'cropped',
  'tailored',
  'fitted',
  'oversized',
  'boxy',
  'longline',
  'straight',
  'tapered',
  'wide_leg',
  'bootcut',
  'flared',
  'baggy',
  'a_line',
  'bodycon',
] as const;

export type FitKey = (typeof FIT_KEYS)[number];

/**
 * Подпись ключа — так, как её печатает английский сторфронт: подчёркивание → пробел
 * (`wide_leg` → «wide leg»), и одно исключение `a_line` → «a-line». Значение вне словаря
 * (легаси, набранное руками) печатается как есть.
 */
export function fitLabel(key: string | null | undefined): string {
  const k = (key ?? '').trim();
  if (k === 'a_line') return 'a-line';
  return k.replace(/_/g, ' ');
}

/** Семейства одежды по ВЕРХНЕЙ категории карточки (имена верхних категорий из словаря). */
export type FitFamily = 'tops' | 'outerwear' | 'bottoms' | 'dresses' | 'loungewear_sleepwear';

/**
 * Какие посадки осмысленны у семейства (D-03). Порядок внутри семейства — шкала «от облегающего
 * к свободному, потом форма», в нём список и показывается.
 */
export const FIT_FAMILIES: Readonly<Record<FitFamily, readonly FitKey[]>> = {
  tops: [
    'regular',
    'slim',
    'fitted',
    'relaxed',
    'loose',
    'oversized',
    'boxy',
    'cropped',
    'longline',
  ],
  outerwear: [
    'regular',
    'slim',
    'fitted',
    'relaxed',
    'oversized',
    'boxy',
    'cropped',
    'longline',
    'tailored',
  ],
  bottoms: [
    'regular',
    'slim',
    'skinny',
    'straight',
    'tapered',
    'relaxed',
    'loose',
    'wide_leg',
    'bootcut',
    'flared',
    'baggy',
    'cropped',
    'tailored',
  ],
  dresses: [
    'regular',
    'slim',
    'fitted',
    'relaxed',
    'loose',
    'oversized',
    'a_line',
    'bodycon',
    'tailored',
  ],
  loungewear_sleepwear: ['regular', 'slim', 'relaxed', 'loose', 'oversized'],
};

const FAMILY_ORDER: readonly FitFamily[] = [
  'tops',
  'outerwear',
  'bottoms',
  'dresses',
  'loungewear_sleepwear',
];

/**
 * Верхние категории, у которых посадки как факта нет: поле FIT не показывается вовсе, а
 * хранимое значение не трогается (ни очистки, ни записи).
 */
export const FIT_NOT_APPLICABLE: readonly string[] = ['accessories', 'shoes', 'bags', 'objects'];

/** Пункт списка: ключ и (только в полном списке) заголовок группы. */
export type FitChoice = { key: FitKey; group?: string };

/** Заголовок группы посадок, общих для двух и более семейств. */
export const FIT_COMMON_GROUP = 'common';

function isFamily(name: string): name is FitFamily {
  return Object.prototype.hasOwnProperty.call(FIT_FAMILIES, name);
}

/**
 * ВЕСЬ СЛОВАРЬ ПО ГРУППАМ — для карточки без категории (или с незнакомой верхней категорией).
 *
 * ⚠ КАЖДЫЙ КЛЮЧ СТОИТ РОВНО ОДИН РАЗ, И ЭТО НЕ ВКУС, А ПРЕДЕЛ ПРИМИТИВА. Radix Select держит
 * пункты по значению: `regular`, повторённый под пятью семействами, дал бы пять пунктов с одним
 * значением (двоящаяся подсветка выбранного, коллизии ключей React). Поэтому группы — «common»
 * (посадки двух и более семейств) и дальше семейства со СВОИМИ посадками (`bottoms`:
 * skinny · straight · tapered · wide leg · bootcut · flared · baggy; `dresses`: a-line · bodycon).
 * Выводится из `FIT_FAMILIES`, а не пишется вторым списком: поправка семейства сама переедет сюда.
 * Ключ, не попавший ни в одно семейство (сегодня таких нет), не теряется — он идёт группой
 * «other», иначе его нельзя было бы выбрать ниоткуда.
 */
const ALL_GROUPED: readonly FitChoice[] = (() => {
  const families = new Map<FitKey, number>();
  for (const f of FAMILY_ORDER) {
    for (const k of FIT_FAMILIES[f]) families.set(k, (families.get(k) ?? 0) + 1);
  }
  const seen = new Set<FitKey>();
  const common: FitChoice[] = [];
  const own: FitChoice[] = [];
  for (const f of FAMILY_ORDER) {
    for (const k of FIT_FAMILIES[f]) {
      if (seen.has(k)) continue;
      seen.add(k);
      if ((families.get(k) ?? 0) > 1) common.push({ key: k, group: FIT_COMMON_GROUP });
      else own.push({ key: k, group: f.replace(/_/g, ' ') });
    }
  }
  for (const k of FIT_KEYS) if (!seen.has(k)) own.push({ key: k, group: 'other' });
  return [...common, ...own];
})();

/**
 * Посадки для карточки по имени её ВЕРХНЕЙ категории:
 *   · известное семейство → его список, без групп;
 *   · accessories / shoes / bags / objects → `null`: поля нет;
 *   · категория не выбрана или незнакома → весь словарь по группам (см. `ALL_GROUPED`).
 */
export function fitsForTopCategory(topName: string | null | undefined): FitChoice[] | null {
  const top = (topName ?? '').trim().toLowerCase();
  if (FIT_NOT_APPLICABLE.includes(top)) return null;
  if (isFamily(top)) return FIT_FAMILIES[top].map((key) => ({ key }));
  return ALL_GROUPED.map((c) => ({ ...c }));
}

/**
 * Цепочка категорий от верхней до листа — по словарю (`parentId`), без запроса. Пустая, если
 * лист не задан или словарь его не знает (ещё не загружен, категория удалена).
 */
export function categoryChain(
  categories: readonly common_Category[] | undefined,
  leafId: number | null | undefined,
): common_Category[] {
  if (!categories?.length || !leafId) return [];
  const byId = new Map<number, common_Category>();
  for (const c of categories) if (c.id != null) byId.set(c.id, c);
  const chain: common_Category[] = [];
  let cur = byId.get(leafId);
  let guard = 0;
  while (cur && guard++ < 8) {
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

/** Имя верхней категории листа (`undefined`, если цепочки нет). */
export function topCategoryName(
  categories: readonly common_Category[] | undefined,
  leafId: number | null | undefined,
): string | undefined {
  const chain = categoryChain(categories, leafId);
  const top = chain.find((c) => c.level === 'top_category') ?? chain[0];
  return top?.name || undefined;
}

/**
 * Посадки ЭТОЙ карточки, или `null` — поля FIT у неё нет: auxiliary-карта (она делает упаковку) и
 * семейства без посадки. Один ответ на два вопроса — что рисует CARD DETAILS и что имеет право
 * уехать в маску UpdateStyle (`StyleFactsField`): поле, которого не видно, не пишется.
 */
export function fitChoicesFor(
  categories: readonly common_Category[] | undefined,
  categoryId: number | null | undefined,
  isAux: boolean,
): FitChoice[] | null {
  return isAux ? null : fitsForTopCategory(topCategoryName(categories, categoryId));
}
