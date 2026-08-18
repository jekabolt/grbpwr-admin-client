import type { FileRole, FileTopic } from 'api/proto-http/admin';
import { Chip, ChipRow } from 'ui/components/chip';
import Text from 'ui/components/text';
import type { FileRoleFilter } from '../hooks/useFiles';

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
  return [projectDates(t), t.archived ? 'в архиве' : ''].filter(Boolean).join(' · ');
}

/**
 * ВИДИМАЯ метка архива внутри чипа проекта — подсказки на наведении здесь мало.
 *
 * Архивный проект попадает к писателю ровно одним путём: человек пришёл по прямой ссылке и
 * стоит внутри него. Значит проект уже преселектен, и решение «класть сюда» принимается, не
 * наводя мышь ни на что. Метка стоит в самом чипе тем же словом, что и на экране словаря.
 */
export function ProjectArchiveMark({ project }: { project: FileTopic }) {
  if (!project.archived) return null;
  return <span className='opacity-70'>в архиве</span>;
}

/** Даты проекта в подпись чипа: «12.09 — 14.09». Пустые не печатаются вовсе. */
export function projectDates(t: FileTopic): string {
  const from = (t.startsAt ?? '').trim();
  const to = (t.endsAt ?? '').trim();
  const short = (d: string) => d.split('-').reverse().slice(0, 2).join('.');
  if (from && to) return `${short(from)} — ${short(to)}`;
  if (from) return `с ${short(from)}`;
  if (to) return `до ${short(to)}`;
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
      // «Разобрать» и темы взаимоисключающи: сервер ставит untopiced выше topic_ids, так что
      // выбранный чип поверх «разобрать» рисовал бы фильтр, которого в выдаче нет.
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
  // поставить рядом чип «packaging 40» и подпись «packaging — 3 шт.» — два разных ответа про
  // одно и то же в двух сантиметрах друг от друга.
  const count = matched === undefined ? '' : ` — ${matched} шт.${searching ? ' по запросу' : ''}`;

  const caption = () => {
    if (untopiced) {
      return 'файлы, на которых нет ни одной темы. разобрать — значит проставить ярлыки, а не разложить по папкам';
    }
    if (orphans.length) {
      return `${orphans.map((id) => `#${id}`).join(', ')} — этих тем нет в списке: они в архиве, стали проектами либо ссылка старая. фильтр по ним всё равно работает${count}`;
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
        <RowLabel>темы</RowLabel>
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
        {orphans.map((id) => (
          <Chip
            key={`orphan-${id}`}
            selected
            pressed
            title='темы нет в списке: она в архиве, стала проектом или ссылка старая — фильтр всё равно применён'
            onClick={() => toggle(id)}
          >
            #{id}
          </Chip>
        ))}
        {!topics.length && !orphans.length && (
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
  const count = matched === undefined ? '' : ` — ${matched} шт.`;
  const dates = picked ? projectDates(picked) : '';

  const caption = () => {
    if (orphan) {
      return `проект #${selected} не в списке: он в архиве либо ссылка старая. фильтр при этом работает — он спрашивает по номеру, а не по имени`;
    }
    if (!projects.length) {
      return 'проектов пока нет. проект — это обычная тема, которой в словаре тем поставили тип: у неё появляются даты, архив и роли у файлов внутри';
    }
    if (picked) {
      return `проект «${picked.name}»${dates ? ` · ${dates}` : ''}${count}. ряд роли ниже спрашивает уже про связь файла С ЭТИМ проектом`;
    }
    return 'проект выбирается один: два проекта через «и» — это файлы, лежащие сразу в обеих съёмках, а таких почти не бывает';
  };

  return (
    <div className='flex flex-col gap-1'>
      <ChipRow>
        <RowLabel>проекты</RowLabel>
        <Chip selected={!selected} pressed={!selected} onClick={() => onChange(0)}>
          вне проекта
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
              title={d ? `${p.name} · ${d}` : undefined}
              // Повторное нажатие СНИМАЕТ выбор. Ряд одиночного выбора без этого превращается
              // в ловушку: поставить проект можно, а вернуться ко всей библиотеке — только
              // через соседний чип, о котором ещё надо догадаться.
              onClick={() => onChange(on ? 0 : id)}
            >
              {p.name}
              <span className='tabular-nums opacity-70'>{Number(p.filesCount ?? 0)}</span>
            </Chip>
          );
        })}
        {orphan && (
          <Chip
            selected
            pressed
            title='проект в архиве или ссылка старая — фильтр всё равно применён'
            onClick={() => onChange(0)}
          >
            #{selected}
          </Chip>
        )}
      </ChipRow>
      <Text size='micro' variant='label'>
        {caption()}
      </Text>
    </div>
  );
}

/**
 * Роли холста — второй ряд одиночного выбора.
 *
 * РОЛЬ ЖИВЁТ НА СВЯЗИ «файл ↔ проект», а не ярлыком на файле, и весь этот ряд существует
 * ради одного следствия: пара «проект × роль» относится к ОДНОЙ строке связи. Снимок,
 * который в съёмке «отобранное», а в лукбуке «референс», при плоских метках нашёлся бы по
 * «съёмка × референс» — молча и неправильно. Здесь не найдётся.
 *
 * «БЕЗ РОЛИ» ПОКАЗЫВАЕТСЯ ТОЛЬКО ПРИ ВЫБРАННОМ ПРОЕКТЕ, и это не прихоть: в одиночку такой
 * фильтр значит «почти вся библиотека», и сервер его ОТКАЗЫВАЕТ, а не игнорирует. Тот же
 * приём, что у переключателя роли человека в полосе: орган появляется вместе с вопросом, на
 * который отвечает, — просить тут не у кого, спрятанного никто не ищет.
 */
export function RoleChips({
  roles,
  value,
  hasProject,
  projectName,
  matched,
  onChange,
}: {
  roles: FileRole[];
  value: FileRoleFilter;
  /**
   * Проект выбран — независимо от того, нашлось ли его имя.
   *
   * Разделено с `projectName` намеренно. Пока «без роли» показывался по имени, архивный проект
   * из прямой ссылки давал ряд, в котором фильтр применён, а нажатым не выглядит ничего: имя —
   * это то, что мы не сумели показать, а не то, чего нет.
   */
  hasProject: boolean;
  /** Имя выбранного проекта; пусто — его нет в словаре холста (архив или старая ссылка). */
  projectName?: string;
  matched?: number;
  onChange: (next: FileRoleFilter) => void;
}) {
  const picked = roles.find((r) => Number(r.id) === value.roleId);
  // То же, что и у проекта: роль в архиве или из старой ссылки фильтрует, но в словаре холста
  // её нет. Чип-сирота показывает, что фильтр стоит.
  const orphan = value.roleId > 0 && !picked;
  const count = matched === undefined ? '' : ` — ${matched} шт.`;
  // Проект называется именем, а когда имени нет — прямо говорится, что его нет. Пустые кавычки
  // «в проекте «»» читаются как поломка и ничего не сообщают.
  const where = projectName ? `«${projectName}»` : 'из ссылки (имени нет: он в архиве)';

  const caption = () => {
    if (orphan) {
      return `роль #${value.roleId} не в списке: она в архиве либо ссылка старая. снять её с файлов можно, назначить заново — нет, пока она в архиве`;
    }
    if (!roles.length) {
      return 'словарь ролей пуст. роли заводят на экране тем: словарь закрытый — «все исходники по всем съёмкам» значит что-нибудь только пока «исходники» везде одно и то же';
    }
    if (value.withoutRole) {
      return `файлы, которые в проекте ${where} уже лежат, а роли им ещё не дали${count}. сюда попадает всё, что в проект бросили`;
    }
    if (picked && hasProject) {
      return `в проекте ${where} — «${picked.name}»${count}. оба условия проверяются на ОДНОЙ строке связи, поэтому файл, который «${picked.name}» в другом проекте, сюда не попадёт`;
    }
    if (picked) {
      return `«${picked.name}» во всех проектах сразу${count}. выберите проект выше, чтобы спросить про один`;
    }
    return hasProject
      ? 'роль отвечает, ЧЕМ файл в этом проекте является. она стоит на связи с проектом, а не ярлыком на файле: тот же файл бывает исходником в съёмке и идеей в лукбуке'
      : 'роль без проекта — это вопрос «все исходники по всем съёмкам». с выбранным проектом она становится разделом его страницы';
  };

  return (
    <div className='flex flex-col gap-1'>
      <ChipRow>
        <RowLabel>роль</RowLabel>
        <Chip
          selected={!value.roleId && !value.withoutRole}
          pressed={!value.roleId && !value.withoutRole}
          onClick={() => onChange({ roleId: 0, withoutRole: false })}
        >
          любая
        </Chip>
        {roles.map((r) => {
          const id = Number(r.id);
          const on = id === value.roleId;
          return (
            <Chip
              key={id}
              selected={on}
              pressed={on}
              onClick={() => onChange({ roleId: on ? 0 : id, withoutRole: false })}
            >
              {r.name}
              <span className='tabular-nums opacity-70'>{Number(r.filesCount ?? 0)}</span>
            </Chip>
          );
        })}
        {orphan && (
          <Chip
            selected
            pressed
            title='роль в архиве или ссылка старая — фильтр всё равно применён'
            onClick={() => onChange({ roleId: 0, withoutRole: false })}
          >
            #{value.roleId}
          </Chip>
        )}
        {hasProject && (
          <Chip
            selected={value.withoutRole}
            pressed={value.withoutRole}
            onClick={() => onChange({ roleId: 0, withoutRole: !value.withoutRole })}
          >
            без роли
          </Chip>
        )}
      </ChipRow>
      <Text size='micro' variant='label'>
        {caption()}
      </Text>
    </div>
  );
}
