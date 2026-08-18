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
    label: (s.name ?? '').trim() || ((s.id ?? 0) > 0 ? `#${s.id}` : 'no size'),
  }));
  const layOptions = lays.map((l, i) => ({
    key: layKeyOf(l, i),
    label: (l.name ?? '').trim() || `lay ${i + 1}`,
  }));

  return (
    <div className='space-y-stack'>
      <Text size='micro' variant='label' component='p'>
        pick your own — the page address remembers the choice, and such a link can be handed to a
        crew. it hides no data: the server returns the whole run, the filter only guides the eye.
      </Text>

      <Group
        title='colourway'
        options={colorwayOptions}
        selected={subset.colorways}
        onToggle={(key) => onChange({ ...subset, colorways: toggleIn(subset.colorways, key) })}
      />
      <Group
        title='sizes'
        options={sizeOptions}
        selected={subset.sizes}
        onToggle={(key) => onChange({ ...subset, sizes: toggleIn(subset.sizes, key) })}
      />
      <Group
        title='lays'
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
            show the whole run
          </Button>
          <Text size='micro' variant='label' component='p'>
            the lay selection narrows only the lays block — it doesn't cut the cut list down: a lay
            and a piece are linked through a slot, and deriving one from the other here would mean
            guessing on the technologist's behalf.
          </Text>
        </div>
      )}
    </div>
  );
}
