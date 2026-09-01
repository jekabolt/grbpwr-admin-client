import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useMemo, type JSX } from 'react';
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { ColourPicker } from '../assets/colour-picker';
import type { ColourDraft } from './drafts';
import { FieldRow, Hint, Swatch } from './field-row';
import { fabricStatement, hexIsPaintable } from './model';

/**
 * ═══ ВЫБОР ЦВЕТА — ОДИН ОРГАН НА ВСЮ ПОЛОСУ DESIGN ════════════════════════════════════════════
 *
 * Цвет в фабрик-рендере и целевой цвет в ON MODEL — ОДИН И ТОТ ЖЕ ПРЕДМЕТ: код словаря, hex, или
 * оба. Разница между экранами не в том, ЧЕМ его выбирают, а в том, что с ним потом делают —
 * рендер им КРАСИТ чертёж, рекол ПЕРЕКРАШИВАЕТ фотографию. Поэтому орган здесь один, а различие
 * живёт ровно в одной строке подсказки (`hint`).
 *
 * ⚠ БЛИЗНЕЦ В `palette.tsx` СНЕСЁН, И ЭТО ЧАСТЬ ЭТОЙ ЖЕ ПРАВКИ. Файл родился выделением из
 * палитры, где сетка словаря стояла приватной функцией и была недоступна второму экрану. Пока
 * копий было две, они уже РАЗОШЛИСЬ — у одной появился `data-colour-code`, у другой осталась своя
 * фраза про пустой словарь, — за неполные сутки и без единого предупреждения. Ровно тот дефект,
 * ради которого в этой полосе заведён `views.ts`. Теперь орган один, а различие экранов живёт в
 * двух пропах: `hint` (что с цветом сделают) и `emptyNote` (есть ли третий путь назвать цвет).
 *
 * НИЧЕГО ЗДЕСЬ НЕ ЯВЛЯЕТСЯ ДАННЫМИ КАРТОЧКИ. Колорвей подписывает лаб-дип; выбранный здесь цвет —
 * подача, он уезжает один раз внутри `StartDesignRun.params.colour` и живёт дальше только как
 * замороженная история прогона. Отсюда и предупреждение у набранного руками hex.
 */

/**
 * Словарь колорвеев как сетка плашек. Обёрнут так, чтобы переноситься на узком экране.
 *
 * ПУСТОЙ СЛОВАРЬ — ЭТО ОТВЕТ, А НЕ ПУСТОЕ МЕСТО. На бете он бывает пуст целиком; ряд, молча
 * исчезнувший, читается как поломка экрана, а не как состояние сервера.
 */
export function DictionaryGrid({
  code,
  disabled,
  onPick,
  emptyNote,
}: {
  code: string;
  disabled?: boolean;
  onPick: (code: string, hex: string) => void;
  /**
   * Что сказать, когда словарь пуст. ЭТО НЕ ОФОРМЛЕНИЕ, А РАЗНАЯ ПРАВДА: на фабрик-рендере цвет
   * можно вовсе не называть — его назовёт фотография ткани, — и там об этом надо сказать; в
   * перекрасе третьего пути нет, и та же фраза была бы советом, которому нельзя последовать.
   * Умолчание — общая половина, верная на обоих экранах.
   */
  emptyNote?: React.ReactNode;
}): JSX.Element {
  const { dictionary, loading } = useDictionary();
  const colors = (dictionary?.colors ?? []).filter((c) => !c.archived && (c.code ?? '').trim());

  if (loading && !colors.length) {
    return (
      <Text size='micro' variant='inactive' component='span'>
        loading the colour dictionary…
      </Text>
    );
  }
  if (!colors.length) {
    return (
      <Text size='micro' variant='inactive' component='span' className='normal-case'>
        {emptyNote ?? 'The colour dictionary is empty on this server. Type a hex beside it instead.'}
      </Text>
    );
  }

  const current = (code ?? '').trim().toUpperCase();
  return (
    <div className='flex flex-wrap gap-1.5'>
      {colors.map((colour) => {
        const value = (colour.code ?? '').trim().toUpperCase();
        const hex = (colour.hex ?? '').trim();
        const selected = value === current;
        return (
          <button
            key={value}
            type='button'
            disabled={disabled}
            aria-pressed={selected}
            data-colour-code={value}
            title={`${value}${colour.name ? ` · ${colour.name}` : ''}${hex ? ` · ${hex}` : ''}`}
            onClick={() => onPick(value, hex)}
            className={cn(
              'flex w-[34px] shrink-0 flex-col items-center gap-0.5 p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
              selected ? 'bg-textColor' : 'hover:bg-bgZebra',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <Swatch hex={hex} size={22} />
            <Text
              size='nano'
              variant='uppercase'
              component='span'
              className={selected ? '!text-bgColor' : 'text-labelColor'}
            >
              {value}
            </Text>
          </button>
        );
      })}
    </div>
  );
}

/**
 * ОДИН РУЛЁНЫЙ РЯД «COLOUR»: пикер, поле hex, снятие, и словарь под ними.
 *
 * КОД И HEX — ОДНО ЗАЯВЛЕНИЕ, ПОЭТОМУ ОДИН РЯД. Выбор плашки словаря заполняет ОБЕ половины (имя,
 * которое читает промпт, и значение, которым красится экран); набранный поверх hex — осознанное
 * отклонение от кода, и подпись над палитрой называет его отклонением, а не подменяет им код.
 *
 * ОТСТУП ПЕРЕНОСА ИЗМЕРЕН, А НЕ УГАДАН: колонка подписи `FieldRow` — 92px плюс 8px зазора. Без
 * него сетка словаря начиналась бы у левого края блока, под словом COLOUR, и читалась бы как
 * отдельная секция, потерявшая заголовок.
 */
export function ColourStatementRow({
  band,
  draft,
  disabled,
  /** Чем этот цвет распорядится ЭТОТ экран. Главное, чем два вызова отличаются. */
  hint,
  label = 'colour',
  emptyNote,
}: {
  band: GetDesignBandResponse;
  draft: ColourDraft;
  disabled?: boolean;
  hint: React.ReactNode;
  label?: string;
  emptyNote?: React.ReactNode;
}): JSX.Element {
  const recipe = draft.recipe;
  const stated = fabricStatement(recipe);

  /**
   * ЦВЕТА, КОТОРЫМИ ЭТА КАРТОЧКА УЖЕ ПОЛЬЗОВАЛАСЬ. Рецепт возвращается одним кликом внутри
   * пикера, а не пересобирается по памяти; полоса привозит их дедуплицированными, свежие первыми.
   */
  const recent = useMemo(
    () =>
      (band.colourRecipes ?? [])
        .map((r) => ({ hex: (r.hex ?? '').trim(), code: (r.code ?? '').trim() }))
        .filter((r) => hexIsPaintable(r.hex)),
    [band.colourRecipes],
  );

  return (
    <FieldRow label={label}>
      <ColourPicker
        hex={recipe.hex ?? ''}
        disabled={disabled}
        recent={recent}
        onPick={(hex) => draft.patch({ hex })}
      />
      <div className='w-[100px]'>
        <Input
          name='design-colour-hex'
          value={recipe.hex ?? ''}
          disabled={disabled}
          placeholder='#4a5a3c'
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => draft.patch({ hex: e.target.value })}
        />
      </div>
      {!disabled && stated.colour && (
        <Button variant='secondary' size='xs' onClick={() => draft.clear('colour')}>
          clear
        </Button>
      )}
      {hexIsPaintable(recipe.hex) && !(recipe.code ?? '').trim() && (
        <Pill tone='attention'>visualisation override — cannot become canonical</Pill>
      )}
      <div className='w-full space-y-1 pl-[100px]'>
        <DictionaryGrid
          code={recipe.code ?? ''}
          disabled={disabled}
          emptyNote={emptyNote}
          // Плашка словаря заявляет ОБЕ половины: код, который называет промпт, и hex, которым
          // красится экран. Остальные поля рецепта она не трогает.
          onPick={(code, hex) => draft.patch({ code, hex })}
        />
        <Hint>{hint}</Hint>
      </div>
    </FieldRow>
  );
}
