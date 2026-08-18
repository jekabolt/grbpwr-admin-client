import { Link } from 'react-router-dom';
import type { FileTopic } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';

export type TopicSelection = { topicIds: number[]; untopiced: boolean };

/**
 * Подпись ряда чипов.
 *
 * Рядов стало три, и без имени они читаются как один длинный ряд с непонятной сменой смысла
 * посередине: «packaging», «осень 2026» и «исходники» выглядят одинаково, а значат разное —
 * ярлык, контейнер и связь. Подпись здесь дешевле любого объяснения.
 */
function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      size='micro'
      variant='label'
      tracking='group'
      component='span'
      className='w-[62px] shrink-0 font-bold uppercase'
    >
      {children}
    </Text>
  );
}

/**
 * Подпись чипа проекта у ПИСАТЕЛЕЙ: даты и, если проект в архиве, слово об этом.
 *
 * Архив у писателя не запрет, а предупреждение: положить файл в закрытую коробку — связное
 * действие, и сервер его принимает (в отличие от архивной РОЛИ, которую он ставить не даёт:
 * роль — слово словаря, от которого команда отказалась). Обязанность интерфейса здесь одна —
 * не молчать. Слово взято ровно то же, что печатает экран словаря, чтобы человек читал одно
 * и то же в двух местах.
 */
export function projectHint(t: FileTopic): string {
  return [projectDates(t), t.archived ? ARCHIVED_WORD : ''].filter(Boolean).join(' · ');
}

/**
 * ИМЯ ИЗ СЛОВАРЯ ВНУТРИ ЧИПА — С ПОТОЛКОМ ШИРИНЫ.
 *
 * У чипа `white-space: nowrap` (и это правильно: подпись органа не переносят посреди слова), а
 * имена тем, проектов и ролей пишет человек, и сервер пускает до 255 знаков. Одно длинное имя
 * без пробелов растягивало чип шире холста и тянуло за собой ГОРИЗОНТАЛЬНЫЙ СКРОЛЛ ВСЕЙ
 * СТРАНИЦЫ — замерено: 1654px при окне 700.
 *
 * Здесь обрезка, а не перенос, и это не то же решение, что в заголовке секции. Заголовок —
 * единственное место, где имя названо целиком, и прятать его там нечем оправдать; чип же орган
 * выбора, его читают боковым зрением, и двадцати знаков хватает, чтобы отличить один от
 * другого. Целое имя остаётся в подсказке.
 */
function ChipName({ children }: { children: React.ReactNode }) {
  return <span className='max-w-[24ch] truncate'>{children}</span>;
}

/**
 * СЛОВО АРХИВА — ОДНО НА ВЕСЬ РАЗДЕЛ.
 *
 * Им помечены и чипы проектов у писателей, и секции ролей в режиме проекта, и строка на экране
 * словаря. Три места, где человек читает про одно и то же состояние, обязаны читаться одинаково:
 * `archived`, `retired` и `hidden` — это три разных факта на слух и один в базе.
 */
export const ARCHIVED_WORD = 'archived';

/**
 * ВИДИМАЯ метка архива внутри чипа проекта — подсказки на наведении здесь мало.
 *
 * Архивный проект попадает к писателю ровно одним путём: человек пришёл по прямой ссылке и
 * стоит внутри него. Значит проект уже преселектен, и решение «класть сюда» принимается, не
 * наводя мышь ни на что. Метка стоит в самом чипе тем же словом, что и на экране словаря.
 */
export function ProjectArchiveMark({ project }: { project: FileTopic }) {
  if (!project.archived) return null;
  return <span className='opacity-70'>{ARCHIVED_WORD}</span>;
}

/** Даты проекта в подпись чипа: «12.09 — 14.09». Пустые не печатаются вовсе. */
export function projectDates(t: FileTopic): string {
  const from = (t.startsAt ?? '').trim();
  const to = (t.endsAt ?? '').trim();
  const short = (d: string) => d.split('-').reverse().slice(0, 2).join('.');
  if (from && to) return `${short(from)} — ${short(to)}`;
  if (from) return `from ${short(from)}`;
  if (to) return `until ${short(to)}`;
  return '';
}

/**
 * Столько тем сервер соглашается пересечь за раз (`entity.MaxLibraryTopicFilters`): каждая —
 * отдельный EXISTS-подзапрос. Двадцать первый чип отвечал бы отказом вместо выдачи, поэтому
 * граница видна здесь глушением, а не там ошибкой.
 */
export const MAX_TOPIC_FILTERS = 20;

/**
 * Темы холста: строка чипов вместо рейла.
 *
 * СЮДА ПРИЕЗЖАЮТ ТОЛЬКО ОБЫЧНЫЕ ТЕМЫ. Проекты вынесены в свой ряд ниже, и это не украшение:
 * у них другая семантика выбора (один, а не пересечение) и другое продолжение (роль). Смешай
 * их в одном ряду — и один и тот же жест означал бы в нём две разные вещи.
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

  // ВЫБРАННОЕ, НО НЕ НАЙДЕННОЕ В СЛОВАРЕ. Три источника сразу: тема в архиве (холст архив не
  // просит), ссылка из чата, отправленная до того, как тема стала проектом (в ней проект ещё
  // лежит как `?topic=`), и просто испорченный адрес. Во всех трёх случаях сетка отфильтрована,
  // а горящего чипа нет — экран спорил бы сам с собой ровно так же, как спорил бы с
  // незарисованным проектом.
  const orphans = selected.filter((id) => !topics.some((t) => Number(t.id) === id));

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
    if (orphans.length) {
      return `${orphans.map((id) => `#${id}`).join(', ')} — these topics are not in the list: they are archived, they became projects, or the link is old. the filter by them still works${count}`;
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
        <RowLabel>topics</RowLabel>
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
                  : (t.name ?? undefined)
              }
              onClick={() => toggle(id)}
            >
              <ChipName>{t.name}</ChipName>
              <span className='tabular-nums opacity-70'>{Number(t.filesCount ?? 0)}</span>
            </Chip>
          );
        })}
        {orphans.map((id) => (
          <Chip
            key={`orphan-${id}`}
            selected
            pressed
            title='the topic is not in the list: it is archived, it became a project, or the link is old — the filter is applied all the same'
            onClick={() => toggle(id)}
          >
            #{id}
          </Chip>
        ))}
        {!topics.length && !orphans.length && (
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

/**
 * Проекты холста — ряд ОДИНОЧНОГО выбора.
 *
 * Довод одиночного выбора: одно значение в адресе, одна семантика на весь тулбар и картинка
 * «я работаю в одном проекте». Довод НЕ в том, что двух ролей не бывает по построению, — это
 * неверно, и держать решение на ложном доводе нельзя: через полгода кто-нибудь его проверит,
 * увидит ложность и «починит» ряд на мультивыбор.
 *
 * Заархивированные проекты сюда не приезжают вовсе: холст просит словарь без архива. Проекты
 * копятся и не удаляются (у проекта всегда есть файлы), поэтому без архива ряд рос бы
 * монотонно и со временем делал бы холст хуже, чем он был до проектов.
 */
export function ProjectChips({
  projects,
  selected,
  matched,
  onChange,
}: {
  projects: FileTopic[];
  /** 0 — проект не выбран. */
  selected: number;
  /** Сколько файлов отвечает текущему фильтру целиком. `undefined` — ответ ещё не приехал. */
  matched?: number;
  onChange: (projectId: number) => void;
}) {
  const picked = projects.find((p) => Number(p.id) === selected);
  // ВЫБРАННЫЙ, НО НЕ НАЙДЕННЫЙ В СЛОВАРЕ — это заархивированный проект (холст архив не просит,
  // а прямая ссылка на него живёт) либо id из испорченной ссылки. Молчать нельзя: сетка
  // отфильтрована, а ни один чип не горит — экран спорил бы сам с собой, и пустая выдача
  // читалась бы как поломка. Тот же приём, что у пикера человека с «#id».
  const orphan = selected > 0 && !picked;
  const count = matched === undefined ? '' : ` — ${matched} pcs`;
  const dates = picked ? projectDates(picked) : '';

  const caption = () => {
    if (orphan) {
      return `project #${selected} is not in the list: it is archived, or the link is old. the filter works all the same — it asks by number rather than by name`;
    }
    if (!projects.length) {
      return 'no projects yet. a project is a topic that has dates, an archive and roles on the files inside it — start one with “all projects →”, in one press';
    }
    if (picked) {
      // ПОДПИСЬ ЦИТИРОВАЛА ОРГАН, КОТОРОГО БОЛЬШЕ НЕТ: «the role row below» умер вместе с
      // общим словарём ролей, а сам этот ряд чипов остался в тулбаре — то есть ложь была видна
      // на КАЖДОЙ странице проекта. Теперь подпись называет то, что действительно ниже.
      return `project “${picked.name}”${dates ? ` · ${dates}` : ''}${count}. its page is below: the roles of THIS project are its sections, and its own vocabulary is edited there`;
    }
    return 'one project at a time: two projects joined by “and” would mean files lying in both shoots at once, and there are almost none of those';
  };

  return (
    <div className='flex flex-col gap-1'>
      <ChipRow>
        <RowLabel>projects</RowLabel>
        <Chip selected={!selected} pressed={!selected} onClick={() => onChange(0)}>
          outside a project
        </Chip>
        {projects.map((p) => {
          const id = Number(p.id);
          const on = id === selected;
          const d = projectDates(p);
          return (
            <Chip
              key={id}
              selected={on}
              pressed={on}
              title={d ? `${p.name} · ${d}` : (p.name ?? undefined)}
              // Повторное нажатие СНИМАЕТ выбор. Ряд одиночного выбора без этого превращается
              // в ловушку: поставить проект можно, а вернуться ко всей библиотеке — только
              // через соседний чип, о котором ещё надо догадаться.
              onClick={() => onChange(on ? 0 : id)}
            >
              <ChipName>{p.name}</ChipName>
              <span className='tabular-nums opacity-70'>{Number(p.filesCount ?? 0)}</span>
            </Chip>
          );
        })}
        {orphan && (
          <Chip
            selected
            pressed
            title='the project is archived or the link is old — the filter is applied all the same'
            onClick={() => onChange(0)}
          >
            #{selected}
          </Chip>
        )}
        {/* ХВОСТ РЯДА — ВЫХОД В СПИСОК. Ряд чипов держится до десятка проектов; дальше нужен
            список, который сортируется и ищется, и там же заводят новый. Ссылка стоит В РЯДУ, а
            не отдельной кнопкой сверху: она отвечает на тот же вопрос, что и сам ряд («какой
            проект»), просто на большем числе проектов. */}
        <Button asChild size='xs' variant='underline'>
          <Link to={ROUTES.filesProjects}>all projects →</Link>
        </Button>
      </ChipRow>
      <Text size='micro' variant='label'>
        {caption()}
      </Text>
    </div>
  );
}
