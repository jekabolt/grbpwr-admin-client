import { PantonePicker } from 'components/managers/tech-card/components/pantone-picker';
import { findPantone } from 'components/managers/tech-card/components/pantone-swatches';
import { type JSX } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

import { Swatch } from '../render/field-row';
import { patternColourKey, type PatternColour } from './model';

/**
 * ОДИН ОРГАН О ЦВЕТЕ НА ЭТОМ ШАГЕ, И ЭТО ВХОД ПРОГОНА, А НЕ ЗАПИСЬ О ПРОДУКТЕ.
 *
 * Их было два: COLOUR (свободная ссылка, ни к чему не обязывающая) и WORN BY (связь готовой
 * плитки с колорвеем карточки). Второй снесён владельцем в r3 (п.18) — разбор в конце файла.
 *
 * ⚠ NO COLOURWAY IS PICKED ON CREATION (owner, E-1). At the time of the first generations the
 * card usually has no colourways at all.
 */

/* `usePatternColourways` СНЕСЁН ВМЕСТЕ С ЧИПАМИ (п.18): он был ЕДИНСТВЕННЫМ читателем
   `useTechCard` на этом шаге и держался только ради списка колорвеев под плиткой. */
/** Экранный цвет ссылки: свой hex, а если его нет — приближение из списка пантонов. */
export function colourSwatchHex(colour: PatternColour): string {
  return colour.hex.trim() || findPantone(colour.code)?.hex || '';
}

/**
 * ═══ COLOUR — ОДИН РЯД, ОДНА ДВЕРЬ, И НИКАКИХ ОБЯЗАТЕЛЬСТВ (владелец, r2 §26) ══════════════════
 *
 * Дословно: «выбор цвета, который нас ни к чему не обязывает; история использованных последних
 * цветов при генерации; плейсхолдер для добавления цвета; меню пантоновское, где можно выбрать по
 * пантону».
 *
 * ЧТО СТОЯЛО ЗДЕСЬ ДО ЭТОГО И ПОЧЕМУ СНЕСЕНО. Здесь была сетка ПЛИТОК ПО КОЛОРВЕЯМ КАРТОЧКИ: чтобы
 * покрасить пробную плитку, надо было сначала завести колорвей — то есть выбор цвета обязывал к
 * записи о продукте, а на момент первых генераций колорвеев у карточки обычно нет вовсе, и сетка
 * честно показывала пустоту с дверью на соседний шаг. Это ровно то, что владелец назвал «обязывает».
 * Цвет теперь — ничья пара «код + экранный hex» (`PatternColour`), живущая один прогон.
 *
 * ТРИ ОРГАНА, И НИ ОДНОГО ЛИШНЕГО:
 *   · выбранный цвет — ОДНА плитка со свотчем, кодом и `✕` (владелец: «одна плитка с ✕»);
 *   · нет выбранного — ОДНА дверь `+ colour`, и это ТРИГГЕР САМОГО ПАНТОН-ПИКЕРА ПРОДУКТА
 *     (`pantone-picker.tsx`, поиск «Search Pantone code or colour» + сетка свотчей). Второй пикер
 *     не написан: этот восстановлен ровно тем файлом, каким он был, когда его унесло вместе с
 *     последним вызывающим;
 *   · `recent` — недавние цвета прогонов ЭТОЙ карточки, свотчами. Это не второй способ выбрать
 *     цвет вместо пикера, а ярлык к уже сделанному выбору, и он подписан своим словом.
 *
 * ПОМЕНЯТЬ ЦВЕТ = снять `✕` и выбрать заново. Дверь и плитка меняются местами, а не стоят рядом:
 * два органа на один жест — это ровно то, чего владелец просил не делать.
 */
export function PatternColourRow({
  colour,
  recent,
  onPick,
  disabled,
}: {
  /** Выбранный цвет или `null` — цвет необязателен, и `null` это нормальное состояние. */
  colour: PatternColour | null;
  recent: readonly PatternColour[];
  onPick: (next: PatternColour | null) => void;
  disabled?: boolean;
}): JSX.Element {
  const pickedKey = colour ? patternColourKey(colour) : '';
  return (
    <div data-pattern-colour-row='' className='flex flex-col gap-3'>
      {colour ? (
        <div className='flex flex-col gap-1'>
          <div
            data-colour-picked-tile={colour.code || colour.hex}
            className='flex w-fit items-center gap-2 border border-borderColor bg-bgColor px-[7px] py-[3px]'
          >
            <Swatch hex={colourSwatchHex(colour)} size={16} title={colour.code || colour.hex} />
            <Text component='span' size='micro' className='uppercase'>
              {colour.code || colour.hex}
            </Text>
            {!disabled && (
              <Button
                variant='secondary'
                size='xs'
                data-colour-clear=''
                title='take the colour off — a tile is generated without one just as well'
                onClick={() => onPick(null)}
              >
                ✕
              </Button>
            )}
          </div>
          {/**
           * ═══ СВОТЧ — НАШ, А НЕ МОДЕЛИ, И ЭТО НАДО СКАЗАТЬ ЗДЕСЬ ══════════════════════════════
           *
           * Ряд подписан пилюлей «goes to the model» и показывает КВАДРАТИК ЦВЕТА — и вместе они
           * читаются как обещание «модель получит вот этот цвет». На проводе же уезжает
           * `params.colour = {code, hex}`, а `hex` у выбранного пантона ПУСТ (довод —
           * `patternColourRecipe`), и сервер печатает в промпт ровно `colourway 18-1248 TCX`
           * (`designgen/renderprompt.go`, `colourPhrase`: пара печатается как «colourway CODE —
           * the exact value is #hex», а один код — как есть). Словаря пантонов у сервера нет ни
           * одного; для image-модели TCX-код — это ТЕКСТ, а не цвет, и плитка возвращается какой
           * угодно. Экран при этом показывал приближение из локального списка, и человек узнавал
           * о расхождении только по счёту за прогон.
           *
           * ⚠ ПОЧЕМУ НЕ ПОСЛАТЬ ЭКРАННЫЙ HEX ВМЕСТО ЭТОЙ СТРОКИ. Две причины, и обе с чужой
           * стороны провода:
           *   · `pantone-swatches.ts` о своём `hex` говорит дословно «APPROXIMATE screen
           *     rendering … never a colour standard», и пикер повторяет это человеку («swatches
           *     are approximate on screen»). Сервер же напечатал бы «the EXACT value is #…» —
           *     то есть наше приближение уехало бы в платный промпт как точное значение;
           *   · и хуже: у сервера `hex` НЕ равнозначен коду, а СТАРШЕ его — «a person may then
           *     type a different hex, and that typed value IS a deliberate deviation from the
           *     code» (там же). Заполнив его из таблицы, клиент подделал бы решение человека,
           *     которого никто не принимал, и модель красила бы по подделке.
           * Поэтому едет один код, а строка ниже говорит это прямо — там, где стоит свотч.
           */}
          {/* Оба условия несущие: без кода печатать «told “”» было бы хуже молчания, а с
              настоящим hex (он приезжает из `params.colour` прошлых прогонов) цвет уезжает
              значением, и признаваться не в чем. */}
          {!colour.hex.trim() && !!colour.code.trim() && (
            <Text
              size='nano'
              variant='label'
              component='span'
              data-colour-code-only=''
              className='normal-case'
            >
              code only — the model is told “{colour.code}”, not this swatch
            </Text>
          )}
        </div>
      ) : (
        <div className='w-fit' data-colour-door=''>
          <PantonePicker
            name='pattern-colour'
            label='+ colour'
            disabled={disabled}
            /* Пантон — это КОД. Экранный свотчик списка приблизителен и в платный промпт не едет
               (полный довод — у строки «code only» выше и у `patternColourRecipe`), поэтому hex
               здесь пустой намеренно, а не по забывчивости. */
            onPick={(code) => onPick(code.trim() ? { code: code.trim(), hex: '' } : null)}
          />
        </div>
      )}

      {recent.length > 0 && (
        <div className='flex flex-wrap items-center gap-x-3 gap-y-2' data-colour-recent=''>
          <Text size='nano' variant='label' component='span' className='uppercase'>
            recent
          </Text>
          {recent.map((r) => {
            const key = patternColourKey(r);
            const on = key === pickedKey;
            const label = r.code || r.hex;
            return (
              <button
                key={key}
                type='button'
                data-colour-recent-item={label}
                data-colour-on={on || undefined}
                disabled={disabled}
                title={on ? `${label} · already picked` : `paint in ${label}`}
                onClick={() => onPick(r)}
                className='flex items-center gap-1.5 border border-transparent px-1 py-0.5 hover:border-borderColor focus-visible:border-borderColor disabled:opacity-40'
              >
                <Swatch hex={colourSwatchHex(r)} size={16} />
                <Text size='nano' variant='label' component='span' className='uppercase'>
                  {label}
                </Text>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══ `WornByChips` СНЕСЁН ЦЕЛИКОМ ВМЕСТЕ СО СВОИМ ВЫЗОВОМ (владелец, r3 п.18) ═══════════════════
   Дословно: «TILES ON THIS CARD: никакой связи с колорвеями — снять селектор WORN BY и пилюлю NOT
   BOUND; SetDesignAssetColorway из этого экрана не звать».

   ЧТО ИМЕННО УШЛО, ЧТОБЫ ЭТО НЕ ПРОЧЛИ ПОТОМ КАК СЛУЧАЙНУЮ ПОТЕРЮ: ряд чипов колорвеев под каждой
   плиткой полки, пилюля `not bound`, свотч надетого колорвея, чип `#N (deleted)` для строки,
   указывающей на удалённый колорвей, и пустое состояние «no colourways yet · this tile can be
   bound later» с дверью на FABRIC RENDER. Вместе с ними ушёл ЕДИНСТВЕННЫЙ на этом шаге вызов
   `SetDesignAssetColorway` и запрос `GetTechCard` (`usePatternColourways`), который стоял только
   ради этих чипов.

   ⚠ СВЯЗЬ НЕ УДАЛЕНА, УДАЛЁН ЕЁ ОРГАН ЗДЕСЬ. Колонка `design_asset.colorway_id` жива, сервер
   по-прежнему держит инвариант «колорвей носит одну ткань», и палитра FABRIC RENDER читает эту
   связь (`fabric of`). Владелец сказал, что решается она на оси колорвеев, а не на экране, где
   плитку ДЕЛАЮТ: на момент первых генераций колорвеев у карточки обычно нет вовсе, и селектор
   стоял пустым под каждой плиткой. Возвращать его сюда — только с ответом на п.29/п.41. */
