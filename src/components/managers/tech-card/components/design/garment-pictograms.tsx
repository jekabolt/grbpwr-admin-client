import type { common_Category } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, type CSSProperties } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { TechCardFormData } from '../schema';
import { categoryChain } from './fit-vocabulary';

/**
 * ═══ ПИКТОГРАММЫ ИЗДЕЛИЯ ПОД ПОЛОСАМИ ПУСТОГО СЛОТА (T25, D-22) ═══════════════════════════════
 *
 * Владелец, дословно: «в FLAT SLOTS в зависимости от категории одежды на бекграунде еле видно там
 * где у нас полосы еще показывать пиктограмку к примеру штанов фронт штанов бэк и тд во всю высоту
 * этого блока просто для интуитивности».
 *
 * ЧТО ЭТО И ЧЕГО ЭТО НЕ ДЕЛАЕТ. Линейный силуэт в кадре 64×96 — подсказка «какую сторону ЧЕГО сюда
 * класть», а не чертёж: ни пропорций модели, ни конструктивных линий кроме тех, что отличают перед
 * от спинки (горловина, планка, карманы, капюшон). Спинка — ТОТ ЖЕ контур с простой горловиной и
 * без передней планки/карманов; боковые стороны берут контур переда (боковых силуэтов у восьми
 * семейств нет, а неверный профиль хуже знакомого фаса). Деталям пиктограмма не рисуется: «карман»
 * или «манжета» — не сторона изделия.
 *
 * ЧЕРТА — `currentColor`, заливки нет, `vector-effect: non-scaling-stroke`: кадр ячейки 136px, а
 * рисунок масштабируется в полтора раза, и толщина обязана остаться волосной, какой её видит глаз
 * на соседних рамках. Бледность (0.12) задаёт обёртка `PictogramBackdrop`, а не цвет черты: сам
 * рисунок остаётся годным и на полную яркость (стенд, будущая легенда).
 *
 * СЕМЕЙСТВО ЧИТАЕТСЯ ИЗ КАТЕГОРИИ ПО ИМЕНАМ СЛОВАРЯ, не по id: id различаются между бетой и продом,
 * имена (`outerwear`, `hoodies_sweatshirts`, …) — ключи переводов сторфронта и одни везде. Нет
 * категории, аксессуар, обувь, сумка, предмет — пиктограммы нет: неверная подсказка хуже никакой.
 */
export type GarmentFamily =
  | 'jacket'
  | 'hoodie'
  | 'tee'
  | 'trousers'
  | 'shorts'
  | 'skirt'
  | 'dress'
  | 'briefs';

/** Имена уровней категории, как их называет словарь (`common_Category.name`). */
export type FamilyInput = { top?: string | null; sub?: string | null };

/**
 * Категория → семейство силуэта (D-22). Порядок проверок — от частного к общему: подкатегория,
 * у которой свой силуэт (худи, шорты, юбки, трусы), выигрывает у своей верхней категории.
 */
export function familyFor(c: FamilyInput): GarmentFamily | null {
  const top = (c.top ?? '').trim().toLowerCase();
  const sub = (c.sub ?? '').trim().toLowerCase();
  switch (top) {
    case 'outerwear':
      return 'jacket';
    case 'tops':
      return sub === 'hoodies_sweatshirts' ? 'hoodie' : 'tee';
    case 'bottoms':
      if (sub === 'shorts') return 'shorts';
      if (sub === 'skirts') return 'skirt';
      return 'trousers';
    case 'dresses':
      return 'dress';
    case 'loungewear_sleepwear':
      return sub === 'boxers' || sub === 'briefs' ? 'briefs' : 'tee';
    default:
      // accessories · shoes · bags · objects · нет категории · категория нового сервера
      return null;
  }
}

/**
 * Лист категории → имена её уровней. Уровни сопоставляются ЯВНО по `level`, не по глубине:
 * у `dresses` типы висят прямо на верхней категории, без подкатегории (тот же довод, что у
 * `CategoryBrowser` в `header-meta-fields.tsx`). Прогулка по `parentId` — ОДНА на админку,
 * `categoryChain` словаря посадок (её же читают CARD DETAILS и факты карточки); здесь только
 * раскладка имён по уровням.
 */
export function resolveCategory(
  categories: readonly common_Category[] | undefined,
  leafId: number | null | undefined,
): { top: string; sub: string; type: string; names: string[] } {
  const out = { top: '', sub: '', type: '', names: [] as string[] };
  for (const c of categoryChain(categories, leafId)) {
    const name = (c.name ?? '').trim();
    if (c.level === 'top_category') out.top = name;
    else if (c.level === 'sub_category') out.sub = name;
    else out.type = name;
    if (name) out.names.push(name);
  }
  return out;
}

/** Семейство карточки из формы (`categoryId`) и словаря. Вызывать под `FormProvider`. */
export function useCardGarmentFamily(): GarmentFamily | null {
  const { control } = useFormContext<TechCardFormData>();
  const categoryId = (useWatch({ control, name: 'categoryId' }) as number | undefined) ?? 0;
  const { dictionary } = useDictionary();
  const categories = dictionary?.categories;
  return useMemo(
    () => familyFor(resolveCategory(categories, categoryId)),
    [categories, categoryId],
  );
}

/**
 * Контуры в кадре 64×96. `body` — общий для переда и спинки; `front` / `back` — то, чем они
 * различаются (горловина, планка, карманы, капюшон). Координаты — рука, а не данные: восемь
 * силуэтов проверены глазами на листе-контактке при 136px и при 0.12 поверх полос.
 */
export const GARMENT_SHAPES: Record<
  GarmentFamily,
  { body: string; front: string[]; back: string[] }
> = {
  tee: {
    body: 'M26 14 L15 18 L5 33 L13 38 L18 32 L18 86 L46 86 L46 32 L51 38 L59 33 L49 18 L38 14',
    front: ['M26 14 Q32 23 38 14', 'M28 14 Q32 20.5 36 14'],
    back: ['M26 14 Q32 17 38 14'],
  },
  hoodie: {
    body: 'M25 20 L15 23 L5 76 L12 78 L18 40 L18 86 L46 86 L46 40 L52 78 L59 76 L49 23 L39 20',
    front: [
      'M24 22 Q23 6 32 5 Q41 6 40 22',
      'M27 21 Q27 11 32 11 Q37 11 37 21',
      'M29.5 22 L29 31',
      'M34.5 22 L35 31',
      'M22 60 L42 60 L45 75 L19 75 Z',
      'M18 81 L46 81',
      'M6.5 71 L12.5 73',
      'M57.5 71 L51.5 73',
    ],
    back: [
      'M24 22 Q23 6 32 5 Q41 6 40 22',
      'M32 5.5 L32 20',
      'M18 81 L46 81',
      'M6.5 71 L12.5 73',
      'M57.5 71 L51.5 73',
    ],
  },
  jacket: {
    body: 'M26 13 L14 17 L5 76 L12 78 L18 36 L18 86 L46 86 L46 36 L52 78 L59 76 L50 17 L38 13',
    front: [
      'M26 13 L32 30 L38 13',
      'M26 13 L22 19 L27 26',
      'M38 13 L42 19 L37 26',
      'M32 30 L32 86',
      'M21 62 L28 62 L28 65 L21 65 Z',
      'M36 62 L43 62 L43 65 L36 65 Z',
      'M6.5 71 L12.5 73',
      'M57.5 71 L51.5 73',
    ],
    back: [
      'M26 13 Q32 16 38 13',
      'M24 13.5 Q32 19 40 13.5',
      'M6.5 71 L12.5 73',
      'M57.5 71 L51.5 73',
    ],
  },
  trousers: {
    body: 'M18 8 L46 8 L46 14 L52 90 L35.5 90 L32 38 L28.5 90 L12 90 L18 14 Z',
    front: [
      'M18 14 L46 14',
      'M32 14 L32 30',
      'M32 30 Q35.5 30 35.5 24',
      'M19 14 Q21 21 25 22',
      'M45 14 Q43 21 39 22',
    ],
    back: ['M18 14 L46 14', 'M32 14 L32 38'],
  },
  shorts: {
    body: 'M16 24 L48 24 L48 30 L54 66 L35.5 68 L32 48 L28.5 68 L10 66 L16 30 Z',
    front: [
      'M16 30 L48 30',
      'M32 30 L32 42',
      'M32 42 Q35.5 42 35.5 36.5',
      'M17 30 Q19 37 23 38',
      'M47 30 Q45 37 41 38',
    ],
    back: ['M16 30 L48 30', 'M32 30 L32 48'],
  },
  skirt: {
    body: 'M21 16 L43 16 L43 22 L55 82 L9 82 L21 22 Z',
    front: ['M21 22 L43 22', 'M28 22 L24 82', 'M36 22 L40 82'],
    back: ['M21 22 L43 22', 'M32 22 L32 38'],
  },
  dress: {
    body: 'M25 8 L20 10 Q23 22 19 29 L21 42 L8 90 L56 90 L43 42 L45 29 Q41 22 44 10 L39 8',
    front: ['M25 8 Q32 22 39 8', 'M21 42 L43 42'],
    back: ['M25 8 Q32 13 39 8', 'M21 42 L43 42', 'M32 12 L32 34'],
  },
  briefs: {
    body: 'M11 32 L53 32 L53 38 Q49 55 37 64 L27 64 Q15 55 11 38 Z',
    front: ['M11 38 L53 38', 'M32 38 L32 64'],
    back: ['M11 38 L53 38'],
  },
};

/** Какой вид рисовать для стороны: спинка — своя, всё остальное (перед, бока) — перед. */
export function pictogramViewFor(view: string): 'front' | 'back' {
  return view === 'back' ? 'back' : 'front';
}

export function GarmentPictogram({
  family,
  view,
  className,
  style,
}: {
  family: GarmentFamily;
  view: 'front' | 'back';
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  const shape = GARMENT_SHAPES[family];
  return (
    <svg
      aria-hidden
      viewBox='0 0 64 96'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.25}
      strokeLinejoin='round'
      strokeLinecap='round'
      className={className}
      style={style}
    >
      {[shape.body, ...(view === 'back' ? shape.back : shape.front)].map((d) => (
        <path key={d} d={d} vectorEffect='non-scaling-stroke' />
      ))}
    </svg>
  );
}

/**
 * ФОН ПУСТОЙ ЯЧЕЙКИ: пиктограмма во всю высоту кадра, по центру, 0.12 и мимо указателя.
 *
 * ⚠ ЛЕЖИТ ПОВЕРХ ПОЛОС, А НЕ ПОД НИМИ, И ЭТО НЕ ВЫБОР, А ГЕОМЕТРИЯ. Полосы — непрозрачный фон
 * дважды: у кадра и у самой кнопки слота медиа (`MediaSlot` красит `PLACEHOLDER_SURFACE` на себе).
 * Рисунок «под полосами» не был бы виден вовсе, а под одной верхней половиной — виден наполовину.
 * Поэтому он лежит слоем над кадром, но с прозрачностью 0.12 и `pointer-events: none`: глазом —
 * часть фактуры полос, рукой — его нет, клик и бросок файла уходят в двери под ним.
 *
 * Геометрия — ИНЛАЙНОМ (как у кадра в `core/two-half-slot.tsx`): стенд читает собранный CSS, и
 * произвольного класса там может не оказаться.
 */
export function PictogramBackdrop({
  family,
  view,
}: {
  family: GarmentFamily;
  view: string;
}): JSX.Element {
  const face = pictogramViewFor(view);
  return (
    <span
      aria-hidden
      data-garment-pictogram={`${family}:${face}`}
      className='text-textColor'
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 0',
        opacity: 0.12,
        pointerEvents: 'none',
      }}
    >
      <GarmentPictogram
        family={family}
        view={face}
        style={{ height: '100%', aspectRatio: '64 / 96' }}
      />
    </span>
  );
}
