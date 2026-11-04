import type { FileTopic } from 'api/proto-http/admin';

export type TopicSelection = { topicIds: number[]; untopiced: boolean };

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
 * ОДИН ЖЕСТ ВЫБОРА ТЕМЫ в меню и на выбранном чипе.
 *
 * Мультивыбор — ПЕРЕСЕЧЕНИЕ, а не сумма: второй чип нажимают, чтобы сузить сотни файлов до
 * десятка («бирка из packaging, которая ещё и atelier»). Объяснять это фразой больше не нужно —
 * строка статуса называет пересечение словами («design & atelier») и числом.
 */
export function toggleTopic(selected: number[], id: number): TopicSelection {
  return {
    // «unsorted» и темы взаимоисключающи: сервер ставит untopiced выше topic_ids, так что
    // выбранный чип поверх «unsorted» рисовал бы фильтр, которого в выдаче нет.
    untopiced: false,
    topicIds: selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
  };
}
