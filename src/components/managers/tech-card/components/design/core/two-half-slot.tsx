import type { common_MediaFull } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { cn } from 'lib/utility';
import type { JSX } from 'react';
import { PLACEHOLDER_SURFACE } from 'ui/components/placeholder';

/**
 * ═══ ПЛИТКА НА ДВЕ ПОЛОВИНЫ — ОДИН ОРГАН НА ВСЕ ЛЕНТЫ ПОЛОСЫ ══════════════════════════════════
 *
 * Владелец, дословно (r2 п.16): «плейсхолдер как был — из двух частей: половина „из медиатеки“,
 * половина „draw“; разделён горизонтальной линией пополам, с пиктограммами». Тот же плейсхолдер
 * он потребовал во ФЛЭТ-СТОРОНАХ рендера (r2 п.28: «в каждый пустой плейсхолдер флэт-стороны —
 * выбрать картинку из медиа-селектора ИЛИ нарисовать»).
 *
 * ⚠ ПОЧЕМУ ЭТОТ ФАЙЛ ВООБЩЕ ЗАВЁЛСЯ. Волну r2 писали семь агентов параллельно, и два из них
 * (зона D — `references-section.tsx` / `bench-slot.tsx`, зона G — `render/strip-cell.tsx`)
 * начертили ОДИН И ТОТ ЖЕ орган по отдельности, каждый в своём файле: два `PenGlyph` с теми же
 * путями и две разные половины «draw». Кожа уже разъехалась — у зоны D одна пунктирная коробка с
 * линией посередине, у зоны G ДВЕ пунктирные коробки внахлёст на пиксель, — и это ровно то
 * расхождение, которое сам файл зоны G назвал запрещённым и просил свести после волны. Сведено
 * сюда, в `core`: одна коробка, одна линия, одно перо. Форма выбрана зоны D — она и есть та, что
 * владелец описал словами («разделён горизонтальной линией пополам»).
 *
 * ДВЕ ДВЕРИ В ОДНУ КОМНАТУ, А НЕ ПЛИТКА С КНОПКАМИ. Верх — `MediaSlot` как он есть: клик в
 * библиотеку, ⌘V, бросок файла и фотоглиф живут ВНУТРИ примитива, и второго их написания здесь не
 * заводится. Низ — перо и глагол на той же полосатой поверхности. Обе половины заводят ОДИН
 * предмет — картинку в этот слот, — поэтому рамку несёт коробка, а не половины по отдельности.
 */

/**
 * Перо нижней половины — тем же штрихом и в той же коробке 24×24, что фотоглиф верхней у
 * `MediaSlot`: две половины одной плитки обязаны читаться одной парой «знак + глагол».
 */
export function PenGlyph({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      aria-hidden
      width={20}
      height={20}
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='1.25'
      className={cn('shrink-0', className)}
    >
      <path d='M4.5 19.5 6 14.5 16.5 4l3.5 3.5L9.5 18z' />
      <path d='M14.5 6l3.5 3.5' />
      <path d='M6 14.5l3.5 3.5' />
    </svg>
  );
}

/** Лицо половины — общее для верхней и нижней, чтобы «знак + глагол» стояли на одной высоте. */
export const HALF_FACE =
  'flex h-full w-full min-w-0 cursor-pointer flex-col items-center justify-center gap-1 px-2 ' +
  'text-center text-micro uppercase tracking-label text-labelColor hover:text-textColor ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor';

/**
 * Деление коробки НАДВОЕ — ГЕОМЕТРИЕЙ, А НЕ ВЕРОЙ. `<button>` меряется по содержимому, а у
 * элемента грида `min-height: auto`: без нулевого минимума собственные пропорции кнопки слота
 * (4/5) распирают строку, и «половина» перестаёт быть половиной (замерено: 366 против 162 у
 * заполненной ячейки). Поэтому размер живёт на КОРОБКЕ, а строки просто делят её пополам.
 */
export const SLOT_HALVES: React.CSSProperties = { display: 'grid', gridTemplateRows: '1fr 1fr' };

/**
 * НИЖНЯЯ ПОЛОВИНА ПЛЕЙСХОЛДЕРА — «нарисовать». Отдельный экспорт потому, что ВЕРХНЮЮ половину на
 * разных лентах держат разные коробки (квадрат референса, кадр верстака, плита стороны), а нижняя
 * везде одна и та же: второе её начертание разъехалось бы с первым в первый же день.
 */
export function DrawHalf({
  label,
  title,
  onClick,
  anchor,
  ariaLabel,
  className,
  ...rest
}: {
  label: string;
  title?: string;
  onClick: () => void;
  /** Якорь пробы: чем эта половина является на своём экране. */
  anchor?: string;
  /** Шесть половин с надписью «draw» в одной ленте неразличимы на слух — здесь их различают. */
  ariaLabel?: string;
  className?: string;
  [k: `data-${string}`]: unknown;
}): JSX.Element {
  return (
    <button
      type='button'
      data-draw-half={anchor ?? ''}
      {...rest}
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      style={{ minHeight: 0 }}
      className={cn(HALF_FACE, 'border-t border-dashed border-borderColor', className)}
    >
      <PenGlyph />
      <span className='leading-tight'>{label}</span>
    </button>
  );
}

/**
 * ЦЕЛАЯ ПУСТАЯ ПЛИТКА НА ДВЕ ПОЛОВИНЫ, КОГДА У НЕЁ ЗАДАН РОСТ В ПИКСЕЛЯХ — флэт-стороны рендера
 * (r2 п.28). Коробка обязана совпадать с занятой плитой соседней ячейки той же строки, поэтому
 * рост приходит числом, а не пропорцией: у ленты сторон плита меряется рядом, не собой.
 *
 * Ленты, где коробка задана ПРОПОРЦИЕЙ (референсы, верстак флэтов), собирают те же две половины
 * у себя вокруг своей коробки — `MediaSlot` сверху и `DrawHalf` снизу; общий здесь орган, а не
 * общая коробка.
 */
export function PlaceOrDrawCell({
  /** Имя слота — едет в подпись пикера и в `aria-label` обеих половин. */
  label,
  /** Рост коробки в пикселях: она обязана совпадать с занятой плитой соседней ячейки. */
  heightPx,
  purpose,
  onSelect,
  onDraw,
  drawLabel = 'draw',
  drawTitle,
  className,
  ...rest
}: {
  label: string;
  heightPx: number;
  purpose: string;
  onSelect: (media: common_MediaFull) => void;
  onDraw: () => void;
  drawLabel?: string;
  drawTitle?: string;
  className?: string;
  [k: `data-${string}`]: unknown;
}): JSX.Element {
  return (
    <div
      {...rest}
      data-place-or-draw=''
      /* Рост и деление — ИНЛАЙНОМ: стенд читает CSS готовой сборки, где произвольного класса,
         которого не было в дереве на момент сборки, нет вовсе (замерено на `h-[calc(50%+1px)]`). */
      style={{ ...PLACEHOLDER_SURFACE, ...SLOT_HALVES, height: heightPx }}
      className={cn(
        'w-full min-w-0 overflow-hidden border border-dashed border-borderColor',
        className,
      )}
    >
      {/* ⚠ ОБЁРТКА С НУЛЕВЫМ МИНИМУМОМ НЕСУЩАЯ, А НЕ УБОРКА — см. разбор у `SLOT_HALVES`. */}
      <div style={{ minHeight: 0, overflow: 'hidden' }} className='min-w-0'>
        <MediaSlot
          aspectRatio={['Custom']}
          label={label}
          hint={null}
          purpose={purpose}
          showVideos={false}
          editMode
          onSelect={(media) => {
            const first = media[0];
            if (first?.id) onSelect(first);
          }}
          sizeClassName='h-full w-full'
          className='border-0'
        />
      </div>
      <DrawHalf
        data-place-or-draw-pen=''
        anchor={label}
        label={drawLabel}
        ariaLabel={`${drawLabel} — ${label}`}
        title={
          drawTitle ??
          'opens the picture editor on a blank plate; what you draw goes into this slot'
        }
        onClick={onDraw}
      />
    </div>
  );
}
