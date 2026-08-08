// «СВОЙ КАТ-ЛИСТ» — выбор подмножества партии.
//
// Мишени крупные (Button size='lg' + min-h-11), как у селектора групп во вьюере выкроек: это
// телефон в цеху, палец в перчатке, и промах здесь стоит не раздражения, а перелистывания наряда
// в неподходящий момент. Выбранное = залитая чернилами кнопка, остальные — контурные; состояние
// продублировано aria-pressed, потому что заливка одна на всё и монохромна.
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { lineKeyOf, lineLabelOf } from './labels';
import { RpLay, RpLine, RpSize } from './manifest';
import { emptySubset, layKeyOf, Subset, subsetActive, toggleIn } from './subset';

function Group<T extends string | number>({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<{ key: T; label: string }>;
  selected: Set<T>;
  onToggle: (key: T) => void;
}) {
  if (options.length < 2) return null;
  return (
    <div className='space-y-1'>
      <Text size='nano' variant='label' component='p' tracking='label' className='uppercase'>
        {title}
      </Text>
      <div className='flex flex-wrap gap-1.5'>
        {options.map((o) => {
          const on = selected.has(o.key);
          return (
            <Button
              key={String(o.key)}
              type='button'
              variant={on ? 'main' : 'secondary'}
              size='lg'
              className='min-h-11'
              aria-pressed={on}
              onClick={() => onToggle(o.key)}
            >
              {o.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

export function SubsetFilter({
  lines,
  sizes,
  lays,
  subset,
  onChange,
}: {
  lines: RpLine[];
  sizes: RpSize[];
  lays: RpLay[];
  subset: Subset;
  onChange: (next: Subset) => void;
}) {
  const active = subsetActive(subset);

  // Варианты строятся из ПОЛНОГО манифеста, а не из уже отфильтрованного вида: иначе выбор одного
  // колорвея убрал бы кнопки всех остальных, и вернуться было бы нечем, кроме правки URL.
  const colorwayOptions = lines.map((l) => ({ key: lineKeyOf(l), label: lineLabelOf(l) }));
  const sizeOptions = sizes.map((s) => ({
    key: s.id ?? 0,
    label: (s.name ?? '').trim() || ((s.id ?? 0) > 0 ? `#${s.id}` : 'б/р'),
  }));
  const layOptions = lays.map((l, i) => ({
    key: layKeyOf(l, i),
    label: (l.name ?? '').trim() || `настил ${i + 1}`,
  }));

  return (
    <div className='space-y-stack'>
      <Text size='micro' variant='label' component='p'>
        выберите своё — адрес страницы запомнит выбор, и такую ссылку можно отдать бригаде. Данных
        она не прячет: сервер отдаёт партию целиком, фильтр только наводит взгляд.
      </Text>

      <Group
        title='колор-модель'
        options={colorwayOptions}
        selected={subset.colorways}
        onToggle={(key) => onChange({ ...subset, colorways: toggleIn(subset.colorways, key) })}
      />
      <Group
        title='размеры'
        options={sizeOptions}
        selected={subset.sizes}
        onToggle={(key) => onChange({ ...subset, sizes: toggleIn(subset.sizes, key) })}
      />
      <Group
        title='настилы'
        options={layOptions}
        selected={subset.lays}
        onToggle={(key) => onChange({ ...subset, lays: toggleIn(subset.lays, key) })}
      />

      {active && (
        <div className='space-y-1'>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='min-h-11'
            onClick={() => onChange(emptySubset())}
          >
            показать всю партию
          </Button>
          <Text size='micro' variant='label' component='p'>
            выбор настилов сужает только блок настилов — кат-лист он не режет: настил и деталь
            связаны через слот, и вывести одно из другого здесь значило бы догадаться за технолога.
          </Text>
        </div>
      )}
    </div>
  );
}
