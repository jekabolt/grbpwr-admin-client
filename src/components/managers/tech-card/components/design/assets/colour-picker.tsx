import { cn } from 'lib/utility';
import { useCallback, useEffect, useRef, useState, type JSX, type PointerEvent } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import GenericPopover from 'ui/components/popover';
import Text from 'ui/components/text';

import { hexIsPaintable, normaliseHex } from './model';

/**
 * НОРМАЛЬНЫЙ КОЛОР-ПИКЕР (V-5). Владелец: «сделать нормальный колор пикер в GENERATION — FABRIC
 * RENDER а то сейчас он не очень».
 *
 * ЧТО ТАМ БЫЛО И ПОЧЕМУ ЭТОГО МАЛО. Стоял нативный `<input type='color'>` под нашим квадратом.
 * Он открывает пикер ОПЕРАЦИОННОЙ СИСТЕМЫ — то есть отдельное окно поверх приложения, у которого
 * своя раскладка на каждой ОС, ни одного нашего пикселя внутри и, главное, ни одной вещи, которую
 * этот экран про цвет уже знает: ни словаря колорвеев, ни цветов, которыми ЭТА карточка уже
 * печаталась. Человек выбирал цвет в чужом окне и возвращался сверять его глазами.
 *
 * ЧТО СТОИТ ТЕПЕРЬ — ОДИН ПОПОВЕР, В КОТОРОМ ЛЕЖИТ ВЕСЬ ОТВЕТ:
 *   • КВАДРАТ насыщенности и яркости плюс полоса тона — то, чем цвет ВЫБИРАЮТ, когда точного
 *     значения в голове нет;
 *   • ПОЛЕ HEX — то, чем цвет ЗАДАЮТ, когда значение известно; частичный ввод здесь законен и
 *     квадрат его просто не показывает, пока он не стал цветом;
 *   • ПИПЕТКА — там, где браузер её даёт (`window.EyeDropper`, Chromium). Кнопка РИСУЕТСЯ ТОЛЬКО
 *     при живом API: кнопка, которая на половине машин молча ничего не делает, хуже отсутствующей;
 *   • РЕЦЕПТЫ ЭТОЙ КАРТОЧКИ — цвета, которыми она уже рендерилась. Это и есть «совместимость с
 *     сохранёнными рецептами»: рецепт возвращается ОДНИМ кликом, а не пересобирается по памяти.
 *
 * КООРДИНАТЫ ЖИВУТ В HSV, А ХРАНИТСЯ HEX. Квадрат и полоса — это HSV по построению, но наружу
 * уходит ровно то, что уходит в промпт и в базу. Держать HSV в состоянии карточки значило бы
 * завести второй источник одной величины, который расходится с первым при вводе руками.
 *
 * ⚠ ТОН НЕ ВЫВОДИТСЯ ИЗ ЧЁРНОГО И БЕЛОГО. У `#000` и `#fff` тона нет вовсе, и пересчёт hex→HSV на
 * каждый рендер сбрасывал бы ползунок тона в ноль, стоило довести яркость до края, — то есть цвет
 * «уезжал» бы в красный сам по себе. Поэтому тон — СОБСТВЕННОЕ состояние поповера, а из hex он
 * читается только тогда, когда hex действительно несёт тон.
 */

type HSV = { h: number; s: number; v: number };

function hexToHsv(hex: string): HSV | null {
  const v = normaliseHex(hex);
  if (!v) return null;
  const r = parseInt(v.slice(1, 3), 16) / 255;
  const g = parseInt(v.slice(3, 5), 16) / 255;
  const b = parseInt(v.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToHex({ h, s, v }: HSV): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const seg = Math.floor(h / 60) % 6;
  const [r, g, b] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg < 0 ? 0 : seg];
  const byte = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

/** Живо ли API пипетки в этом браузере. Считается один раз: оно не появляется по ходу сеанса. */
const eyeDropperLives = (): boolean =>
  typeof window !== 'undefined' && typeof (window as any).EyeDropper === 'function';

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * КВАДРАТ НАСЫЩЕННОСТИ И ЯРКОСТИ. Слева направо — насыщенность, сверху вниз — падение яркости,
 * то есть та же раскладка, что во всех графических редакторах: изобретать здесь свою значило бы
 * заставлять человека учиться заново ради ничего.
 *
 * КЛАВИАТУРА РАБОТАЕТ, И ЭТО НЕ ЛЮБЕЗНОСТЬ. Квадрат — единственный орган выбора цвета в поповере,
 * а орган только для мыши это орган не для всех (PRODUCT.md, WCAG AA). Стрелки двигают на 1%,
 * с Shift — на 10%.
 */
function SaturationSquare({
  hsv,
  onChange,
  disabled,
}: {
  hsv: HSV;
  onChange: (next: HSV) => void;
  disabled?: boolean;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);

  const pick = useCallback(
    (clientX: number, clientY: number) => {
      const box = ref.current?.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0) return;
      onChange({
        h: hsv.h,
        s: clamp01((clientX - box.left) / box.width),
        v: 1 - clamp01((clientY - box.top) / box.height),
      });
    },
    [hsv.h, onChange],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pick(e.clientX, e.clientY);
  };

  return (
    <div
      ref={ref}
      role='application'
      aria-label='saturation and brightness'
      tabIndex={disabled ? -1 : 0}
      data-colour-square
      className={cn(
        'relative h-[120px] w-full cursor-crosshair border border-textColor',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
        disabled && 'pointer-events-none opacity-50',
      )}
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hsvToHex(
          { h: hsv.h, s: 1, v: 1 },
        )})`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => {
        if (e.buttons === 1) pick(e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.01;
        const move: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, step],
          ArrowDown: [0, -step],
        };
        const d = move[e.key];
        if (!d) return;
        e.preventDefault();
        onChange({ h: hsv.h, s: clamp01(hsv.s + d[0]), v: clamp01(hsv.v + d[1]) });
      }}
    >
      {/* МАРКЕР ДВУХСЛОЕН ПО ТОЙ ЖЕ ПРИЧИНЕ, ПО КОТОРОЙ БЕЛАЯ ЛИНИЯ УКАЗАНИЯ ДВУХСЛОЙНА: он ездит
          по полю, где есть и чёрный угол, и белый, и одноцветное кольцо в одном из них исчезает. */}
      <span
        aria-hidden='true'
        className='pointer-events-none absolute block size-[10px] border-2 border-bgColor outline outline-1 outline-textColor'
        style={{
          left: `calc(${hsv.s * 100}% - 5px)`,
          top: `calc(${(1 - hsv.v) * 100}% - 5px)`,
        }}
      />
    </div>
  );
}

export type ColourPickerProps = {
  hex: string;
  onPick: (hex: string) => void;
  disabled?: boolean;
  /**
   * Цвета, которыми ЭТА карточка уже рендерилась (`band.colour_recipes`). Совместимость с
   * сохранёнными рецептами — это возможность вернуть один КЛИКОМ, а не переписать по памяти.
   */
  recent?: { hex: string; code?: string }[];
  /** Словарь колорвеев: он остаётся у вызывающего, поповер только даёт ему место. */
  children?: React.ReactNode;
  /** Подпись кнопки-квадрата для скринридера — на экране рядом с ней стоит поле HEX. */
  label?: string;
};

/**
 * КВАДРАТ-КНОПКА, ЗА КОТОРЫМ ЖИВЁТ ПИКЕР. Сам квадрат — это ЗНАЧЕНИЕ (что выбрано), поповер — это
 * ВЫБОР. Незакрашиваемое значение полосатое, никогда не белое и не чёрное: квадрат, закрашенный
 * белым при пустом поле, утверждал бы, что белый выбран.
 */
export function ColourPicker({
  hex,
  onPick,
  disabled,
  recent = [],
  children,
  label = 'pick a colour',
}: ColourPickerProps): JSX.Element {
  const paintable = hexIsPaintable(hex);
  const [open, setOpen] = useState(false);

  /** Тон — состояние поповера; см. шапку файла о том, почему его нельзя выводить каждый раз. */
  const [hue, setHue] = useState(() => hexToHsv(hex)?.h ?? 0);
  const [seenHex, setSeenHex] = useState(hex);
  if (seenHex !== hex) {
    setSeenHex(hex);
    // Тон подхватывается ТОЛЬКО у цвета, который его несёт: у серого, чёрного и белого он равен
    // нулю по математике, а не по выбору человека, и подхватить его значило бы увести ползунок.
    const parsed = hexToHsv(hex);
    if (parsed && parsed.s > 0.02 && parsed.v > 0.02) setHue(parsed.h);
  }

  const hsv: HSV = (() => {
    const parsed = hexToHsv(hex);
    if (!parsed) return { h: hue, s: 1, v: 1 };
    return { h: parsed.s > 0.02 && parsed.v > 0.02 ? parsed.h : hue, s: parsed.s, v: parsed.v };
  })();

  const [dropperLives, setDropperLives] = useState(false);
  useEffect(() => setDropperLives(eyeDropperLives()), []);

  const dropper = async () => {
    try {
      const picked = await new (window as any).EyeDropper().open();
      if (picked?.sRGBHex) onPick(String(picked.sRGBHex).toLowerCase());
    } catch {
      // Отмена пипетки — это отказ человека, а не ошибка: Esc отклоняет промис. Молчим.
    }
  };

  const swatches = recent.filter((r) => hexIsPaintable(r.hex));

  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      noTail
      className='w-[240px]'
      triggerProps={{ disabled, 'aria-label': label, title: label }}
      openElement={
        <span
          data-colour-swatch
          className={cn(
            'block size-[22px] shrink-0 border border-textColor',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            disabled && 'opacity-50',
          )}
          style={
            paintable
              ? { background: normaliseHex(hex) }
              : {
                  backgroundImage:
                    'repeating-linear-gradient(45deg, #ccc 0 3px, #fff 3px 6px)',
                }
          }
        />
      }
    >
      <div className='space-y-2'>
        <SaturationSquare
          hsv={hsv}
          disabled={disabled}
          onChange={(next) => {
            setHue(next.h);
            onPick(hsvToHex(next));
          }}
        />

        {/* ПОЛОСА ТОНА. Нативный `range` — потому что это ровно он и есть: одна величина на одной
            оси, с клавиатурой, шагом и повтором, которые уже написаны в браузере. Своя полоса
            была бы переизобретением стандартного органа, что этот продукт запрещает прямо. */}
        <label className='block'>
          <span className='sr-only'>hue</span>
          <input
            type='range'
            min={0}
            max={359}
            value={Math.round(hsv.h)}
            disabled={disabled}
            data-colour-hue
            className='h-[14px] w-full cursor-pointer appearance-none border border-textColor'
            style={{
              background:
                'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
            }}
            onChange={(e) => {
              const h = Number(e.target.value);
              setHue(h);
              onPick(hsvToHex({ h, s: hsv.s || 1, v: hsv.v || 1 }));
            }}
          />
        </label>

        <div className='flex items-center gap-1.5'>
          <div className='w-[92px]'>
            <Input
              name='colour-hex'
              value={hex ?? ''}
              disabled={disabled}
              placeholder='#4a5a3c'
              data-colour-hex
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => onPick(e.target.value)}
            />
          </div>
          {/* ПИПЕТКА РИСУЕТСЯ ТОЛЬКО ТАМ, ГДЕ ОНА РАБОТАЕТ. `EyeDropper` есть в Chromium и нет в
              Safari и Firefox; нарисованная всюду кнопка на двух браузерах из трёх нажималась бы
              и молчала, а молчащая кнопка читается как сломанная. */}
          {dropperLives && (
            <Button
              variant='secondary'
              size='xs'
              disabled={disabled}
              data-colour-dropper
              title='pick a colour from anywhere on the screen'
              onClick={dropper}
            >
              eyedropper
            </Button>
          )}
        </div>

        {swatches.length > 0 && (
          <div className='space-y-1 border-t border-hairline pt-1.5'>
            <Text size='nano' variant='label' component='p' className='uppercase'>
              already used on this card
            </Text>
            <div className='flex flex-wrap gap-1'>
              {swatches.map((r, i) => (
                <button
                  key={`${r.hex}-${i}`}
                  type='button'
                  disabled={disabled}
                  data-colour-recent={r.hex}
                  title={r.code ? `${r.code} · ${r.hex}` : r.hex}
                  aria-label={`reuse ${r.code ? `${r.code} ` : ''}${r.hex}`}
                  onClick={() => onPick(normaliseHex(r.hex))}
                  className='size-[18px] border border-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                  style={{ background: normaliseHex(r.hex) }}
                />
              ))}
            </div>
          </div>
        )}

        {children && <div className='border-t border-hairline pt-1.5'>{children}</div>}
      </div>
    </GenericPopover>
  );
}
