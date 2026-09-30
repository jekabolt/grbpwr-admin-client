// ЗНАЧЕНИЕ СТРОКИ «MADE IN» (R-03). Страна есть — это факт колорвея, строка его показывает и
// «↺ derived» не несёт (это не переопределение). Страны нет — клетка значения САМА есть выбор
// страны из словаря; выбранное ставится в одно сохранение карточки (made-in.ts) и до него видно как
// «saves with the card». Одна галочка — «also the other N without a country», второй кнопки нет.
import { useMemo, useState } from 'react';
import CheckboxCommon from 'ui/components/checkbox';
import { Combobox, type ComboboxGroup } from 'ui/components/combobox';
import Text from 'ui/components/text';

export type Country = { code: string; name: string };

export function MadeInValue({
  countryName,
  pickedCode,
  unavailable,
  countries,
  othersWithout,
  disabled,
  onPick,
}: {
  /** Страна колорвея (уже записанная). */
  countryName: string;
  /** Выбрана здесь и ждёт сохранения карточки. */
  pickedCode?: string;
  /** Ответ колорвея не пришёл — страна неизвестна (не «пусто»). */
  unavailable: boolean;
  countries: readonly Country[];
  /** Сколько ДРУГИХ колорвеев стиля без страны (и без выбора). */
  othersWithout: number;
  disabled?: boolean;
  onPick: (code: string, alsoOthers: boolean) => void;
}) {
  const [alsoOthers, setAlsoOthers] = useState(false);
  const filter = useMemo(
    () =>
      (q: string): ComboboxGroup[] => {
        const s = q.trim().toLowerCase();
        const options = countries
          .filter((c) => !s || c.name.toLowerCase().includes(s) || c.code.toLowerCase() === s)
          .map((c) => ({ value: c.code, label: c.name }));
        return options.length ? [{ key: 'countries', label: 'countries', options }] : [];
      },
    [countries],
  );

  if (countryName && !pickedCode)
    return (
      <Text className='uppercase' data-made-in={countryName}>
        {countryName}
      </Text>
    );
  if (unavailable)
    return (
      <Text size='micro' variant='label'>
        loading the colourway…
      </Text>
    );

  const picked = pickedCode ? countries.find((c) => c.code === pickedCode) : undefined;
  return (
    <div className='flex flex-col gap-3'>
      <div className='max-w-[280px]'>
        <Combobox
          name='made-in-country'
          placeholder='set country of origin'
          searchPlaceholder='country'
          valueLabel={picked?.name ?? pickedCode ?? ''}
          readOnly={disabled}
          filter={filter}
          onSelect={(code) => onPick(code, alsoOthers)}
        />
      </div>
      {picked ? (
        <Text size='micro' variant='label' data-made-in-staged={picked.code}>
          saves with the card
        </Text>
      ) : null}
      {othersWithout > 0 && !disabled ? (
        <label className='flex cursor-pointer items-center gap-2'>
          <CheckboxCommon
            name='made-in-others'
            checked={alsoOthers}
            onChange={(on: boolean) => {
              setAlsoOthers(on);
              if (on && pickedCode) onPick(pickedCode, true);
            }}
          />
          <Text size='micro' className='uppercase tracking-label'>
            also the other {othersWithout} without a country
          </Text>
        </label>
      ) : null}
    </div>
  );
}
