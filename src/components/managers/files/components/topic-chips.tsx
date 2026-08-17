import type { FileTopic } from 'api/proto-http/admin';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

export type TopicSelection = { topicIds: number[]; untopiced: boolean };

/**
 * Столько тем сервер соглашается пересечь за раз (`entity.MaxLibraryTopicFilters`): каждая —
 * отдельный EXISTS-подзапрос. Двадцать первый чип отвечал бы отказом вместо выдачи, поэтому
 * граница видна здесь глушением, а не там ошибкой.
 */
export const MAX_TOPIC_FILTERS = 20;

/**
 * Темы холста: строка чипов вместо рейла.
 *
 * Мультивыбор — ПЕРЕСЕЧЕНИЕ, а не сумма. Второй чип в этом разделе нажимают, чтобы сузить
 * сетку из сотен файлов до десятка («бирка из packaging, которая ещё и atelier»); объединение
 * росло бы от каждого нажатия и делало бы фильтр бесполезным ровно там, где он нужен.
 *
 * Счётчик на чипе — число файлов ВО ВСЕЙ теме, а не в текущем пересечении: он приходит одним
 * ответом на весь словарь и пересчитывать его под каждый набор было бы N запросов на строку
 * чипов. Поэтому строка под чипами называет число найденного отдельно.
 */
export function TopicChips({
  topics,
  selected,
  untopiced,
  totalFiles,
  untopicedCount,
  matched,
  searching,
  onChange,
}: {
  topics: FileTopic[];
  selected: number[];
  untopiced: boolean;
  totalFiles: number;
  untopicedCount: number;
  /** Сколько файлов отвечает текущему фильтру. `undefined` — ответ ещё не приехал. */
  matched?: number;
  /** В строке поиска что-то есть, то есть `matched` — это НЕ размер пересечения тем. */
  searching?: boolean;
  onChange: (next: TopicSelection) => void;
}) {
  const names = selected
    .map((id) => topics.find((t) => Number(t.id) === id)?.name)
    .filter(Boolean) as string[];

  const toggle = (id: number) =>
    onChange({
      // «unsorted» и темы взаимоисключающи: сервер ставит untopiced выше topic_ids, так что
      // выбранный чип поверх «unsorted» рисовал бы фильтр, которого в выдаче нет.
      untopiced: false,
      topicIds: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    });

  const atLimit = selected.length >= MAX_TOPIC_FILTERS;

  // `matched` — размер ВСЕЙ текущей выдачи, а сервер применяет поиск в том же предикате, что
  // и темы. Приписать это число одному пересечению тем при непустом поиске значило бы
  // поставить рядом чип «packaging 40» и подпись «packaging — 3 pcs» — два разных ответа про
  // одно и то же в двух сантиметрах друг от друга.
  const count =
    matched === undefined ? '' : ` — ${matched} pcs${searching ? ' for the query' : ''}`;

  const caption = () => {
    if (untopiced) {
      return 'files that have not a single topic on them. sorting them means putting labels on, not laying them out into folders';
    }
    if (atLimit) {
      return `${MAX_TOPIC_FILTERS} topics — the limit of one intersection${count}. drop a chip to pick another`;
    }
    if (selected.length > 1) {
      return `intersection: files that have all the selected topics (${names.join(' + ')})${count}`;
    }
    if (selected.length === 1) {
      return `topic “${names[0] ?? ''}”${count}. press a second topic to narrow it down to an intersection`;
    }
    return 'several topics at once give an intersection, not a sum: this is how you look for “a hangtag from packaging that is also atelier”';
  };

  return (
    <div className='flex flex-col gap-1'>
      <ChipRow>
        <Chip
          selected={!selected.length && !untopiced}
          pressed={!selected.length && !untopiced}
          onClick={() => onChange({ topicIds: [], untopiced: false })}
        >
          all
          <span className='tabular-nums opacity-70'>{totalFiles}</span>
        </Chip>
        <Chip
          selected={untopiced}
          pressed={untopiced}
          onClick={() => onChange({ topicIds: [], untopiced: !untopiced })}
        >
          unsorted
          <span className='tabular-nums opacity-70'>{untopicedCount}</span>
        </Chip>
        {topics.map((t) => {
          const id = Number(t.id);
          const on = selected.includes(id);
          return (
            <Chip
              key={id}
              selected={on}
              pressed={on}
              disabled={atLimit && !on}
              title={
                atLimit && !on
                  ? `no more than ${MAX_TOPIC_FILTERS} topics in one intersection`
                  : undefined
              }
              onClick={() => toggle(id)}
            >
              {t.name}
              <span className='tabular-nums opacity-70'>{Number(t.filesCount ?? 0)}</span>
            </Chip>
          );
        })}
        {!topics.length && (
          <Text size='micro' variant='label' component='span'>
            no topics yet — they are started right as a file is uploaded
          </Text>
        )}
      </ChipRow>
      <Text size='micro' variant='label'>
        {caption()}
      </Text>
    </div>
  );
}
