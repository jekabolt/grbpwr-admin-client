import { cn } from 'lib/utility';
import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

import { quadPerspectiveParts, type ShapePoint } from './geometry';
import { artworkQuad, boundsOf } from './purpose';

// ВСТАВКИ НАЗНАЧЕНИЯ — ОДИН РЕНДЕР НА ЭКРАН И НА БУМАГУ (волна callout kinds, T07).
//
// Деталь и разрез рисуются одинаково на листе ARTIFACTS (`surface.tsx`) и на печатном листе
// тех-пака (`tech-pack-document.tsx`). Вторая копия разошлась бы с первой первой же правкой —
// поэтому они живут здесь, а печать отличается только тем, что `glass` не передан: тогда вставка
// неинтерактивна, и всё в ней — чернила по белому.
//
// Координаты — ПИКСЕЛИ КАДРА; кадр (`frame`) нужен, чтобы вставка не вышла за картинку.

export type GlassProps = {
  dimmed: boolean;
  selected: boolean;
  interactive: boolean;
  editable: boolean;
  onHover: (on: boolean) => void;
  onPointerDown: (e: ReactPointerEvent) => void;
  onPress: () => void;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Дверь вставки — та же, что у плашки (выбор, Enter, перетаскивание). Без `glass` — ничего. */
function glassDoor(g: GlassProps | undefined, title: string) {
  if (!g) return { title, 'aria-hidden': true as const };
  return {
    role: 'button' as const,
    tabIndex: 0,
    title,
    'data-callout-selected': g.selected ? 'true' : undefined,
    onPointerEnter: () => g.onHover(true),
    onPointerLeave: () => g.onHover(false),
    onPointerDown: g.onPointerDown,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      g.onPress();
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      g.onPress();
    },
  };
}

const glassFrame = (g: GlassProps | undefined) =>
  cn(
    'absolute block border border-textColor bg-bgColor text-left text-textColor',
    g ? 'cursor-pointer' : 'pointer-events-none',
    g?.dimmed && 'invisible',
    g && !g.interactive && 'pointer-events-none',
  );

const NUMBER_TAG = 'bg-textColor px-[3px] text-nano leading-tight text-bgColor tabular-nums';

/**
 * ВСТАВКА ДЕТАЛИ (владелец: «увеличенная выноска отдельного участка … с возможностью показать
 * зазумленный кусок или своё фото из галереи»). Регион — зона на кадре; вставка стоит на месте
 * плашки и показывает тот же снимок, увеличенный ×scale, или своё фото. Лидер от региона к вставке
 * рисует сама зона (`CalloutShape`). Едет с картинкой при зуме: это картинка, а не подпись.
 */
export function DetailInset({
  at,
  region,
  frame,
  src,
  own,
  scale,
  number,
  text,
  glass,
}: {
  at: ShapePoint;
  region: { x: number; y: number; w: number; h: number } | null;
  frame: { w: number; h: number };
  src: string;
  own: boolean;
  scale: number;
  number?: number;
  text: string;
  glass?: GlassProps;
}) {
  const rw = Math.max(region?.w ?? 0, 4);
  const rh = Math.max(region?.h ?? 0, 4);
  // Потолок — чтобы вставка не закрыла собой плиту: длинная сторона не больше 60 % высоты кадра.
  const cap = Math.max(72, Math.min(220, frame.h * 0.6));
  const k = Math.min(1, cap / Math.max(rw * scale, rh * scale));
  const eff = scale * k;
  const w = Math.max(32, rw * eff);
  const h = Math.max(32, rh * eff);
  // ВСТАВКА НЕ ВЫХОДИТ ЗА КАДР: на краю плиты она легла бы на соседнюю или за край листа.
  const cx = clamp(at.x, w / 2, Math.max(w / 2, frame.w - w / 2));
  const cy = clamp(at.y, h / 2, Math.max(h / 2, frame.h - h / 2));
  return (
    <span
      {...glassDoor(glass, [`detail ×${scale}`, text].filter(Boolean).join(' · '))}
      data-callout-detail=''
      className={cn(glassFrame(glass), 'overflow-visible')}
      style={{
        touchAction: glass?.editable ? 'none' : undefined,
        left: `${cx}px`,
        top: `${cy}px`,
        width: w,
        height: h,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <span className='absolute inset-0 block overflow-hidden'>
        {src &&
          (own ? (
            <img src={src} alt='' draggable={false} className='h-full w-full object-cover' />
          ) : (
            <img
              src={src}
              alt=''
              draggable={false}
              className='absolute max-w-none object-cover'
              style={{
                width: frame.w * eff,
                height: frame.h * eff,
                left: -(region?.x ?? 0) * eff,
                top: -(region?.y ?? 0) * eff,
              }}
            />
          ))}
      </span>
      {number != null && <span className={cn('absolute left-0 top-0', NUMBER_TAG)}>{number}</span>}
      <span className='absolute bottom-0 right-0 bg-bgColor px-[3px] text-nano leading-tight'>
        ×{scale}
      </span>
      {text && (
        <span className='absolute left-0 top-full mt-0.5 block w-full whitespace-pre-wrap break-words bg-bgColor px-[3px] text-nano leading-tight'>
          {text}
        </span>
      )}
    </span>
  );
}

/**
 * ВСТАВКА РАЗРЕЗА (владелец: «когда важно, как уложены слои: прокладка, подкладка, бейка, шов,
 * отстрочка»). Слои — полосами сверху вниз, имя на каждой; шапка — буквы разреза. Подпись, а не
 * картинка: держит экранный размер при зуме (`inv`), как плашка. Ширина известна только после
 * раскладки, поэтому сдвиг внутрь кадра меряется, а не считается.
 */
export function SectionInset({
  at,
  inv = 1,
  frame,
  letter,
  number,
  layers,
  text,
  glass,
}: {
  at: ShapePoint;
  inv?: number;
  frame: { w: number; h: number };
  letter: string;
  number?: number;
  layers: string[];
  text: string;
  glass?: GlassProps;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth * inv;
    const h = el.offsetHeight * inv;
    if (w !== box.w || h !== box.h) setBox({ w, h });
  });
  const cx = box.w ? clamp(at.x, box.w / 2, Math.max(box.w / 2, frame.w - box.w / 2)) : at.x;
  const cy = box.h ? clamp(at.y, box.h / 2, Math.max(box.h / 2, frame.h - box.h / 2)) : at.y;
  return (
    <span
      ref={ref}
      {...glassDoor(
        glass,
        [`${letter}–${letter}`, layers.join(' / '), text].filter(Boolean).join(' · '),
      )}
      data-callout-section=''
      className={cn(glassFrame(glass), 'w-max min-w-20 max-w-[45%] text-nano leading-tight')}
      style={{
        touchAction: glass?.editable ? 'none' : undefined,
        left: `${cx}px`,
        top: `${cy}px`,
        transform: `translate(-50%, -50%) scale(${inv})`,
      }}
    >
      <span className='flex items-center gap-1 px-1 py-px'>
        {number != null && <span className={NUMBER_TAG}>{number}</span>}
        <span className='font-bold'>
          {letter}–{letter}
        </span>
        {text && <span className='truncate text-labelColor'>{text}</span>}
      </span>
      {layers.map((name, i) => (
        <span
          key={i}
          className={cn(
            'block truncate border-t border-textColor px-1 py-[2px]',
            i % 2 === 1 && 'bg-bgSecondary',
          )}
        >
          {name}
        </span>
      ))}
    </span>
  );
}

/** Буквы разреза у обоих концов линии, на продолжении линии наружу. */
export function SectionLetters({
  a,
  z,
  letter,
  inv = 1,
}: {
  a: ShapePoint;
  z: ShapePoint;
  letter: string;
  inv?: number;
}) {
  return (
    <>
      {[
        [a, z],
        [z, a],
      ].map(([end, other], i) => {
        const dx = end.x - other.x;
        const dy = end.y - other.y;
        const len = Math.hypot(dx, dy) || 1;
        const off = 11 * inv;
        return (
          <span
            key={i}
            aria-hidden
            data-section-letter={letter}
            className='pointer-events-none absolute text-micro font-bold leading-none text-textColor [text-shadow:0_0_2px_var(--color-bgColor),0_0_2px_var(--color-bgColor)]'
            style={{
              left: end.x + (dx / len) * off,
              top: end.y + (dy / len) * off,
              transform: `translate(-50%, -50%) scale(${inv})`,
            }}
          >
            {letter}
          </span>
        );
      })}
    </>
  );
}

/**
 * КАРТИНКА АРТВОРКА (владелец: «добавить картинку с поддержкой пнг картинок с прозрачностью и что
 * бы мы могли этот артворк туда поместить»). Рисуется ВНУТРИ зоны размещения, БЕЗ подложки и без
 * белого паспарту: прозрачный PNG показывает флэт сквозь себя. Это картинка, а не подпись: едет с
 * кадром при зуме. Неинтерактивна — выбор и ручки остаются у зоны. Слой стоит ПОД слоем геометрии,
 * чтобы пунктир зоны не закрывался непрозрачным краем.
 *
 * ВАРП НА ЧЕТЫРЕ РУЧКИ (R20, владелец: «она должна помещатся внутрь подвижных штук и варпаться
 * вместе с ними»): углы картинки = точки зоны в их порядке (TL, TR, BR, BL), середина — по проекции.
 * Проекция — ОДНА <img> с CSS `matrix3d` (`quadMatrix3d`, T27/R35): прежняя сетка из 200 треугольников
 * с клипами перерисовывалась на каждое движение ручки и тормозила жест. Зона не из четырёх точек
 * или вывернутая (старая запись) — картинка натягивается на её габарит (`artworkQuad`), без лучей.
 *
 * Слой — в пикселях замера кадра (`box`), в той же системе, что слой геометрии: картинка едет с
 * кадром при зуме, потому что лежит внутри его трансформа. А при ПЕЧАТИ кадр меняет ширину после
 * замера (ResizeObserver молчит) — поэтому все длины здесь в единицах контейнера (cqw/cqh): слой —
 * контейнер размера кадра, и картинка растёт с ним, как пунктир с viewBox (`quadPerspectiveParts`).
 */
export function ArtworkImage({
  quad,
  box,
  src,
}: {
  /** Точки зоны в пикселях кадра. */
  quad: ShapePoint[];
  box: { w: number; h: number };
  src: string;
}) {
  if (!src || quad.length < 2 || box.w < 1 || box.h < 1) return null;
  const corners = artworkQuad(quad);
  const b = boundsOf(corners);
  if (!b || b.w < 1 || b.h < 1) return null;
  const cw = (px: number) => `${(px / box.w) * 100}cqw`;
  const ch = (px: number) => `${(px / box.h) * 100}cqh`;
  // Своя коробка картинки — габарит зоны: масштаб матрицы около единицы, растр не мылится.
  const t = quadPerspectiveParts(corners, b.w, b.h);
  return (
    <div
      aria-hidden
      data-callout-artwork=''
      className='pointer-events-none absolute inset-0 block overflow-visible'
      style={{ containerType: 'size' }}
    >
      <img
        src={src}
        alt=''
        draggable={false}
        className='absolute left-0 top-0 block max-w-none'
        style={
          t
            ? {
                width: cw(b.w),
                height: ch(b.h),
                transformOrigin: '0 0',
                transform: `translate(${cw(t.tx)}, ${ch(t.ty)}) perspective(${cw(t.d)}) matrix3d(${t.m.join(',')})`,
              }
            : // Вырожденный габарит (три точки на прямой) — вписать, как до варпа.
              { left: cw(b.x), top: ch(b.y), width: cw(b.w), height: ch(b.h), objectFit: 'contain' }
        }
      />
    </div>
  );
}
