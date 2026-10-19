import { useState } from 'react';
import type { FileTopic } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Chip } from 'ui';

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
 * ОДИН ЖЕСТ ВЫБОРА ТЕМЫ на оба места, где её выбирают: ряд чипов телефона и рейл десктопа.
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

/** Чип ряда на телефоне: 34px под палец, строчная подпись телом, а не микро-капсом. */
export const TAP_CHIP = 'h-8.5 shrink-0 gap-1.5 px-3 text-textBaseSize normal-case tracking-normal';
/** Залитый чип с «×»: крестик у примитива чернильный, на чёрной заливке его не видно. */
export const TAP_CHIP_ON = `${TAP_CHIP} *:text-bgColor`;

/** Счётчик внутри чипа — на ступень мельче имени. */
function Count({ n }: { n: number }) {
  return <span className='text-control tabular-nums opacity-70'>{n}</span>;
}

/**
 * Темы холста на телефоне — ОДИН прокручиваемый ряд.
 *
 * ПОРЯДОК И ЕСТЬ ОБЪЯСНЕНИЕ. Выбранные темы впереди и залиты (с ×); дальше темы, в которых есть
 * файлы, со счётчиком; пустые свёрнуты в «+ N empty»; «unsorted» стоит за чертой красным — это
 * другое состояние, а не ещё одна тема. Чипа «all» нет: ничего не выбрано — значит все.
 *
 * Счётчик на чипе — число файлов ВО ВСЕЙ теме, а не в текущем пересечении: он приходит одним
 * ответом на весь словарь. Число найденного называет строка статуса.
 *
 * ВЫБРАННОЕ, НО НЕ НАЙДЕННОЕ В СЛОВАРЕ (тема в архиве, ссылка из чата, испорченный адрес)
 * горит как «#id»: сетка отфильтрована, и экран не имеет права спорить сам с собой.
 */
export function TopicChips({
  topics,
  selected,
  untopiced,
  untopicedCount,
  onChange,
  lead,
  tail,
  className,
}: {
  topics: FileTopic[];
  selected: number[];
  untopiced: boolean;
  untopicedCount: number;
  onChange: (next: TopicSelection) => void;
  /** Другие действующие фильтры (человек) — залитым чипом сразу за выбранными темами. */
  lead?: React.ReactNode;
  /** Переполнение ряда (пикер человека) — перед чертой. */
  tail?: React.ReactNode;
  className?: string;
}) {
  const [showEmpty, setShowEmpty] = useState(false);
  const atLimit = selected.length >= MAX_TOPIC_FILTERS;
  const toggle = (id: number) => onChange(toggleTopic(selected, id));
  const rest = topics.filter((t) => !selected.includes(Number(t.id)));
  const full = rest.filter((t) => Number(t.filesCount ?? 0) > 0);
  const empty = rest.filter((t) => Number(t.filesCount ?? 0) === 0);

  const offChip = (t: FileTopic) => {
    const id = Number(t.id);
    return (
      <Chip
        key={id}
        className={TAP_CHIP}
        pressed={false}
        disabled={atLimit}
        title={atLimit ? `max ${MAX_TOPIC_FILTERS} topics` : t.name ?? undefined}
        onClick={() => toggle(id)}
      >
        <ChipName>{t.name}</ChipName>
        <Count n={Number(t.filesCount ?? 0)} />
      </Chip>
    );
  };

  return (
    <div
      role='group'
      aria-label='topics'
      className={cn('flex items-stretch gap-1.5 overflow-x-auto', className)}
    >
      {selected.map((id) => {
        const name = topics.find((t) => Number(t.id) === id)?.name ?? `#${id}`;
        return (
          <Chip
            key={id}
            selected
            pressed
            className={TAP_CHIP_ON}
            title={name}
            onClick={() => toggle(id)}
            onRemove={() => toggle(id)}
          >
            <ChipName>{name}</ChipName>
          </Chip>
        );
      })}
      {lead}
      {full.map(offChip)}
      {empty.length > 0 &&
        (showEmpty ? (
          empty.map(offChip)
        ) : (
          <Chip className={TAP_CHIP} onClick={() => setShowEmpty(true)}>
            + {empty.length} empty
          </Chip>
        ))}
      {tail}
      <span aria-hidden className='my-1 shrink-0 border-l border-borderColor' />
      <Chip
        className={TAP_CHIP}
        tone='error'
        selected={untopiced}
        pressed={untopiced}
        onClick={() => onChange({ topicIds: [], untopiced: !untopiced })}
      >
        unsorted
        <Count n={untopicedCount} />
      </Chip>
    </div>
  );
}
