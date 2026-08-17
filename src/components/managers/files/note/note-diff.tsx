import { useMemo } from 'react';
import Text from 'ui/components/text';
import { plural } from '../upload/text';

/**
 * «Показать различия» — что именно разошлось между чужой сохранённой версией и вашим буфером.
 *
 * Экран конфликта существует ради одного решения: записывать поверх или нет. Принять его по двум
 * простыням текста нельзя — глазами их никто не сверит, и человек нажмёт «поверх» просто потому,
 * что это единственная кнопка, которая куда-то ведёт. Поэтому различия показываются построчно.
 *
 * ЦВЕТ ЗДЕСЬ НЕ УКРАШЕНИЕ. Красным — строки ЧУЖОЙ версии, которых в вашем тексте нет: это ровно
 * то, что «записать поверх» уничтожит, а красный в этой системе и означает «сейчас будет
 * уничтожено». Ваши строки — чернилами: они никуда не денутся ни при каком исходе. Зелёного тут
 * нет: «принято/готово» — не про эти строки. Каждая строка помечена ещё и знаком (− / +), чтобы
 * различия читались и без цвета.
 */

type Op = 'same' | 'theirs' | 'mine';

interface Row {
  op: Op;
  text: string;
}

/**
 * Потолок сравнения. Наибольшая общая подпоследовательность — это таблица N×M: на двух
 * тысячах строк с каждой стороны это четыре миллиона ячеек и заметное подвисание вкладки ровно
 * в тот момент, когда человек торопится спасти текст. За потолком честно показываем обе версии
 * целиком, вместо того чтобы делать вид, что считаем.
 */
const MAX_LINES = 1200;

/** Совпадающие начало и конец срезаются до таблицы: в реальном конфликте расходится середина. */
export function diffLines(theirs: string, mine: string): { rows: Row[]; tooBig: boolean } {
  const a = theirs.split('\n');
  const b = mine.split('\n');

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;

  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  if (midA.length > MAX_LINES || midB.length > MAX_LINES) {
    return { rows: [], tooBig: true };
  }

  // Таблица длин НОП. Uint32Array, а не массив массивов: на тысяче строк разница между ними —
  // это разница между мгновенным ответом и заметной паузой.
  const w = midB.length + 1;
  const lcs = new Uint32Array((midA.length + 1) * w);
  for (let i = midA.length - 1; i >= 0; i -= 1) {
    for (let j = midB.length - 1; j >= 0; j -= 1) {
      lcs[i * w + j] =
        midA[i] === midB[j]
          ? lcs[(i + 1) * w + j + 1] + 1
          : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
    }
  }

  const rows: Row[] = [];
  for (let k = 0; k < head; k += 1) rows.push({ op: 'same', text: a[k] });

  let i = 0;
  let j = 0;
  while (i < midA.length && j < midB.length) {
    if (midA[i] === midB[j]) {
      rows.push({ op: 'same', text: midA[i] });
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
      rows.push({ op: 'theirs', text: midA[i] });
      i += 1;
    } else {
      rows.push({ op: 'mine', text: midB[j] });
      j += 1;
    }
  }
  while (i < midA.length) {
    rows.push({ op: 'theirs', text: midA[i] });
    i += 1;
  }
  while (j < midB.length) {
    rows.push({ op: 'mine', text: midB[j] });
    j += 1;
  }

  for (let k = b.length - tail; k < b.length; k += 1) rows.push({ op: 'same', text: b[k] });

  return { rows, tooBig: false };
}

export function NoteDiff({
  theirs,
  mine,
  theirsBy,
}: {
  theirs: string;
  mine: string;
  theirsBy: string;
}) {
  const { rows, tooBig } = useMemo(() => diffLines(theirs, mine), [theirs, mine]);
  const lost = rows.filter((r) => r.op === 'theirs').length;
  const added = rows.filter((r) => r.op === 'mine').length;

  if (tooBig) {
    return (
      <div className='space-y-stack'>
        <Text size='micro' variant='label'>
          версии слишком велики, чтобы сверить их построчно, — вот обе целиком
        </Text>
        <div className='grid gap-2.5 lg:grid-cols-2'>
          <VersionColumn title={`версия ${theirsBy || 'коллеги'}`} text={theirs} />
          <VersionColumn title='ваш текст' text={mine} />
        </div>
      </div>
    );
  }

  return (
    <div className='space-y-stack'>
      <div className='flex flex-wrap items-baseline gap-3'>
        <Text size='micro' variant='label' component='span'>
          <span className='text-error'>
            − {lost} {plural(lost, 'строка', 'строки', 'строк')}
          </span>{' '}
          есть только у {theirsBy || 'коллеги'} — запись поверх сотрёт именно их
        </Text>
        <Text size='micro' variant='label' component='span'>
          + {added} {plural(added, 'строка', 'строки', 'строк')} есть только у вас
        </Text>
      </div>
      <div className='max-h-[50vh] overflow-auto border border-hairline'>
        {rows.map((r, i) => (
          <div
            key={i}
            className={
              r.op === 'same'
                ? 'flex gap-2 px-2 text-labelColor'
                : r.op === 'theirs'
                  ? 'flex gap-2 bg-bgZebra px-2 text-error'
                  : 'flex gap-2 bg-bgZebra px-2 text-textColor'
            }
          >
            <span aria-hidden className='w-3 shrink-0 select-none text-center'>
              {r.op === 'same' ? '' : r.op === 'theirs' ? '−' : '+'}
            </span>
            <span className='whitespace-pre-wrap break-words'>{r.text || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VersionColumn({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <Text size='micro' variant='label' component='span' className='uppercase'>
        {title}
      </Text>
      <div className='mt-1 max-h-[40vh] overflow-auto border border-hairline px-2 py-1 whitespace-pre-wrap break-words'>
        {text}
      </div>
    </div>
  );
}
