import type { common_Category } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, type CSSProperties } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { TechCardFormData } from '../schema';
import { categoryChain } from './fit-vocabulary';
import { isActiveView, normaliseViewKey, type ActiveView } from './views';

/**
 * ═══ ПИКТОГРАММЫ ИЗДЕЛИЯ ПОД ПОЛОСАМИ ПУСТОГО СЛОТА (T25, D-22; стороны — T38, D-36) ═══════════
 *
 * Владелец, дословно: «в FLAT SLOTS в зависимости от категории одежды на бекграунде еле видно там
 * где у нас полосы еще показывать пиктограмку к примеру штанов фронт штанов бэк и тд во всю высоту
 * этого блока просто для интуитивности». И потом (26.09): «в FLAT SLOTS у нас на все слоты одна и
 * та же иконка пиктограмка в плейсхолдере а должны быть реально FRONT BACK SIDE LEFT SIDE RIGHT».
 *
 * ЧТО ЭТО И ЧЕГО ЭТО НЕ ДЕЛАЕТ. Линейный силуэт в кадре 64×96 — подсказка «какую сторону ЧЕГО сюда
 * класть», а не чертёж: ни пропорций модели, ни конструктивных линий кроме тех, что отличают одну
 * сторону от другой. Деталям пиктограмма не рисуется: «карман» или «манжета» — не сторона изделия.
 *
 * ЧЕТЫРЕ СТОРОНЫ — ЧЕТЫРЕ РИСУНКА (D-36):
 *   · перед — контур `body` и передние детали (горловина, планка, карманы, капюшон);
 *   · спинка — ТОТ ЖЕ контур без передних деталей, с линией центра спины и тем, что у спинки
 *     своё: кокетка и задние карманы у брюк и шорт, вытачки у юбки, шов капюшона у худи;
 *   · бок — ПРОФИЛЬ: узкий контур изделия, рукав или штанина ПЕРЕД туловищем. Изделие смотрит
 *     ВЛЕВО: «side left» — это левый бок изделия, обращённый к зрителю, и перед у такой фигуры
 *     слева, как на боковом виде модной иллюстрации;
 *   · правый бок — тот же профиль зеркалом (`matrix(-1 0 0 1 64 0)`), второго набора путей нет.
 * Все четыре стоят в одном кадре 64×96 и на одной высоте (верх и низ рисунка совпадают у переда,
 * спинки и бока в пределах пары единиц), поэтому лента из четырёх ячеек стоит вровень.
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
 * различаются (горловина, планка, карманы, капюшон — и линия центра спины, кокетка, задние
 * карманы, вытачки); `side` — ПОЛНЫЙ рисунок левого профиля, со своим контуром: у профиля нет
 * общего с фасом контура, рукав или штанина стоят перед туловищем. Координаты — рука, а не данные:
 * тридцать два рисунка проверены глазами на листе-контактке при 136px и при 0.12 поверх полос.
 */
export const GARMENT_SHAPES: Record<
  GarmentFamily,
  { body: string; front: string[]; back: string[]; side: string[] }
> = {
  tee: {
    body: 'M26 14 L15 18 L5 33 L13 38 L18 32 L18 86 L46 86 L46 32 L51 38 L59 33 L49 18 L38 14',
    front: ['M26 14 Q32 23 38 14', 'M28 14 Q32 20.5 36 14'],
    back: ['M26 14 Q32 17 38 14', 'M32 15.5 L32 86'],
    side: [
      // короткий рукав — широкий блок на плече, из-под него узкое туловище до низа;
      // горловина спереди ниже, чем сзади, плечо — дуга между ними
      'M25 18 Q33 12.5 41 15 L45 19 L45 38 L43 38 L43 86 L21 86 L21 38 L19 38 L19 20 Z',
      'M19 38 L45 38',
    ],
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
      'M32 5.5 L32 19',
      'M32 23 L32 81',
      'M18 81 L46 81',
      'M6.5 71 L12.5 73',
      'M57.5 71 L51.5 73',
    ],
    side: [
      // туловище без верхней кромки — сверху лежит капюшон
      'M25 22 L21 34 L21 86 L43 86 L43 34 L45 23',
      // капюшон, лежащий на спине: от горловины спереди вверх и назад, вниз по спине
      'M25 22 Q25 7 35 6 Q46.5 6.5 45 23',
      // длинный рукав перед туловищем и его манжета
      'M26.5 22.5 L27 78 L37 78 L38 22',
      'M27 75 L37 75',
      // резинка низа
      'M21 81 L43 81',
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
      'M32 16.5 L32 86',
      'M6.5 71 L12.5 73',
      'M57.5 71 L51.5 73',
    ],
    side: [
      // туловище с плечевой кромкой — это нижний край воротника
      'M25 17 L21 30 L21 86 L43 86 L43 30 L41 14',
      'M25 17 Q33 12 41 14',
      // воротник: стойка выше сзади, к лацкану спереди сходит на нет
      'M25 16 Q34 9.5 42.5 11 L41 14',
      // длинный рукав перед туловищем и его манжета
      'M26.5 17.5 L27 78 L37 78 L37.5 15.5',
      'M27 75 L37 75',
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
    back: [
      'M18 14 L46 14',
      'M32 14 L32 38',
      'M18 16 L32 22 L46 16',
      'M20 25 L27 25 L26 34 L22 34 Z',
      'M44 25 L37 25 L38 34 L42 34 Z',
    ],
    side: [
      // пояс — узкий, в глубину бедра
      'M22 8 L42 8 L42 14 L22 14 Z',
      // ближняя штанина, сужается к низу
      'M22 14 L21 30 L25 90 L39 90 L44 30 L42 14',
      // боковой шов и косой вход в карман от пояса к нему
      'M32 14 L32 90',
      'M26 15 L31 25',
    ],
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
    back: [
      'M16 30 L48 30',
      'M32 30 L32 48',
      'M16 32 L32 37.5 L48 32',
      'M19 40 L26 40 L25 48 L21 48 Z',
      'M45 40 L38 40 L39 48 L43 48 Z',
    ],
    side: [
      'M22 24 L42 24 L42 30 L22 30 Z',
      'M22 30 L21 42 L24 66 L40 66 L44 42 L42 30',
      'M32 30 L32 66',
      'M26 31 L31 41',
    ],
  },
  skirt: {
    body: 'M21 16 L43 16 L43 22 L55 82 L9 82 L21 22 Z',
    front: ['M21 22 L43 22', 'M28 22 L24 82', 'M36 22 L40 82'],
    back: ['M21 22 L43 22', 'M32 22 L32 40', 'M27 22 L28 31', 'M37 22 L36 31'],
    side: [
      'M24 16 L40 16 L40 22 L24 22 Z',
      // профиль уже фаса: расклешение только вперёд и назад
      'M24 22 L18 82 L46 82 L40 22',
      'M32 22 L32 82',
    ],
  },
  dress: {
    body: 'M25 8 L20 10 Q23 22 19 29 L21 42 L8 90 L56 90 L43 42 L45 29 Q41 22 44 10 L39 8',
    front: ['M25 8 Q32 22 39 8', 'M21 42 L43 42'],
    back: ['M25 8 Q32 13 39 8', 'M21 42 L43 42', 'M32 10.5 L32 42'],
    side: [
      // бретель через плечо и корпус: лиф до талии, расклешённая юбка до низа
      'M26 9 Q33 6.5 40 9',
      'M26 9 L22 26 L23 42 L14 90 L50 90 L41 42 L42 26 L40 9',
      // пройма — раскрытая петля под бретелью, от неё вниз боковой шов
      'M28 10 C28 30 38 30 38 10',
      'M32 25 L32 90',
      'M23 42 L41 42',
    ],
  },
  briefs: {
    body: 'M11 32 L53 32 L53 38 Q49 55 37 64 L27 64 Q15 55 11 38 Z',
    front: ['M11 38 L53 38', 'M32 38 L32 64'],
    back: ['M11 38 L53 38', 'M32 38 L32 54', 'M25 58 Q32 52 39 58'],
    side: [
      'M22 32 L42 32 L42 38 L22 38 Z',
      // спереди ниже, край выреза ноги поднимается назад
      'M22 38 L23 50 Q24 60 28 61 Q40 56 42 46 L42 38',
    ],
  },
};

/** Сторона рисунка: одна из четырёх активных сторон ленты (`views.ts`). */
export type PictogramView = ActiveView;

/** Зеркало левого профиля в кадре шириной 64: x' = 64 − x. */
const MIRROR_TRANSFORM = 'matrix(-1 0 0 1 64 0)';

/**
 * Какой вид рисовать для стороны слота. Четыре активные стороны — каждая своя; всё прочее
 * (неизвестный ключ нового сервера, пустая строка) — перед: знакомый фас лучше отсутствия.
 * Обе записи боков (`side_l` провода и `sideL` прототипа) сводятся `normaliseViewKey`.
 */
export function pictogramViewFor(view: string): PictogramView {
  return isActiveView(view) ? (normaliseViewKey(view) as PictogramView) : 'front';
}

/** Пути одной стороны: перед и спинка — общий контур плюс свои детали; оба бока — профиль. */
export function pictogramPaths(family: GarmentFamily, view: PictogramView): string[] {
  const shape = GARMENT_SHAPES[family];
  if (view === 'front') return [shape.body, ...shape.front];
  if (view === 'back') return [shape.body, ...shape.back];
  return shape.side;
}

export function GarmentPictogram({
  family,
  view,
  className,
  style,
}: {
  family: GarmentFamily;
  view: PictogramView;
  className?: string;
  style?: CSSProperties;
}): JSX.Element {
  const paths = pictogramPaths(family, view);
  return (
    <svg
      aria-hidden
      data-pictogram={view}
      viewBox='0 0 64 96'
      fill='none'
      stroke='currentColor'
      strokeWidth={1.25}
      strokeLinejoin='round'
      strokeLinecap='round'
      className={className}
      style={style}
    >
      <g transform={view === 'side_r' ? MIRROR_TRANSFORM : undefined}>
        {paths.map((d) => (
          <path key={d} d={d} vectorEffect='non-scaling-stroke' />
        ))}
      </g>
    </svg>
  );
}

/**
 * ФОН ПУСТОЙ ЯЧЕЙКИ: пиктограмма ЭТОЙ стороны во всю высоту кадра, по центру, 0.12 и мимо
 * указателя.
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
