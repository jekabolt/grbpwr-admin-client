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
      // «Разобрать» и темы взаимоисключающи: сервер ставит untopiced выше topic_ids, так что
      // выбранный чип поверх «разобрать» рисовал бы фильтр, которого в выдаче нет.
      untopiced: false,
      topicIds: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    });

  const atLimit = selected.length >= MAX_TOPIC_FILTERS;

  // `matched` — размер ВСЕЙ текущей выдачи, а сервер применяет поиск в том же предикате, что
  // и темы. Приписать это число одному пересечению тем при непустом поиске значило бы
  // поставить рядом чип «packaging 40» и подпись «packaging — 3 шт.» — два разных ответа про
  // одно и то же в двух сантиметрах друг от друга.
  const count = matched === undefined ? '' : ` — ${matched} шт.${searching ? ' по запросу' : ''}`;

  const caption = () => {
    if (untopiced) {
      return 'файлы, на которых нет ни одной темы. разобрать — значит проставить ярлыки, а не разложить по папкам';
    }
    if (atLimit) {
      return `${MAX_TOPIC_FILTERS} тем — предел одного пересечения${count}. снимите чип, чтобы выбрать другой`;
    }
    if (selected.length > 1) {
      return `пересечение: файлы, у которых есть все выбранные темы (${names.join(' + ')})${count}`;
    }
    if (selected.length === 1) {
      return `тема «${names[0] ?? ''}»${count}. нажмите вторую тему, чтобы сузить до пересечения`;
    }
    return 'несколько тем сразу дают пересечение, а не сумму: так ищут «бирку из packaging, которая ещё и atelier»';
  };

  return (
    <div className='flex flex-col gap-1'>
      <ChipRow>
        <Chip
          selected={!selected.length && !untopiced}
          pressed={!selected.length && !untopiced}
          onClick={() => onChange({ topicIds: [], untopiced: false })}
        >
          все
          <span className='tabular-nums opacity-70'>{totalFiles}</span>
        </Chip>
        <Chip
          selected={untopiced}
          pressed={untopiced}
          onClick={() => onChange({ topicIds: [], untopiced: !untopiced })}
        >
          разобрать
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
              title={atLimit && !on ? `в одном пересечении не больше ${MAX_TOPIC_FILTERS} тем` : undefined}
              onClick={() => toggle(id)}
            >
              {t.name}
              <span className='tabular-nums opacity-70'>{Number(t.filesCount ?? 0)}</span>
            </Chip>
          );
        })}
        {!topics.length && (
          <Text size='micro' variant='label' component='span'>
            тем пока нет — они заводятся прямо при загрузке файла
          </Text>
        )}
      </ChipRow>
      <Text size='micro' variant='label'>
        {caption()}
      </Text>
    </div>
  );
}
