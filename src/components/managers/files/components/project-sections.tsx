import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FileTopic, FileTopicStyle, LibraryFile } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { Pill } from 'ui/components/pill';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import { plural } from '../upload/text';
import { FailureText } from './failure-text';
import { ARCHIVED_WORD, projectDates } from './topic-chips';

/**
 * РЕЖИМ ПРОЕКТА — проект целиком, разложенный по ролям.
 *
 * Это НЕ отдельный экран и не отдельный роут: холст остаётся тем же самым, меняется только то,
 * чем он занят место сетки. Плитка, выделение, полоса выделения, приём броска, очередь загрузки
 * и одиннадцать пустых состояний живут в `page.tsx` и сюда приезжают готовыми — плитку рисует
 * переданная функция. Второй копии этой машинерии в разделе нет и быть не должно.
 *
 * ГРАММАТИКА — РУЛЕТКА, А НЕ КАРТОЧКА. Секция это заголовок на 2-пиксельной линии и сетка
 * плиток под ним; коробки вокруг нет. Плитка сама по себе — обведённый белый прямоугольник, и
 * обёртка вокруг сетки дала бы ровно то, что DESIGN.md запрещает прямым текстом: блок внутри
 * блока. Разделяет секции 24-пиксельный зазор земли, как разделены все блоки этого приложения.
 */

/**
 * ШАПКА СТРАНИЦЫ ПРОЕКТА.
 *
 * Адрес не меняется — это по-прежнему `/files?project=N`, режим холста, — но нарисован он
 * теперь как страница: крошка, имя, тип, даты, вещи, правка. Всё, что ниже шапки (описание,
 * строка задач), приезжает `children`: у них своя жизнь и свои запросы, а шапка отвечает
 * только за рамку и порядок.
 *
 * ДАТЫ ПУСТЫЕ — ЭТО ОТВЕТ, А НЕ ПРОБЕЛ. «Бекап CLO» не событие, у него дат не бывает вовсе, и
 * молчащее место читалось бы как незаполненное поле.
 */
export function ProjectHeader({
  project,
  styles,
  stylesFetched,
  onIndex,
  onEdit,
  writable,
  children,
}: {
  project: FileTopic;
  /** Вещи, чьи карточки показывают на этот проект. Тем же одним запросом, что и раньше. */
  styles: FileTopicStyle[];
  /** Ответ приехал: пока нет — ряд вещей не рисуется вовсе, а не рисуется пустым. */
  stylesFetched: boolean;
  onIndex: () => void;
  onEdit: () => void;
  writable: boolean;
  children?: React.ReactNode;
}) {
  const dates = projectDates(project);
  return (
    <div className='flex flex-col gap-2 border border-borderColor bg-bgColor p-block'>
      {/* КРОШКА ВЕДЁТ В ИНДЕКС, А НЕ «НАЗАД». Пришли сюда по ссылке из задачи или с карточки
          вещи — «назад» вернуло бы в задачу; «all projects» отвечает на другой вопрос и всегда
          на один и тот же. */}
      <div className='flex flex-wrap items-center gap-1.5'>
        <Button size='xs' variant='underline' onClick={onIndex}>
          all projects
        </Button>
        <Text size='micro' variant='label' component='span' className='min-w-0 truncate'>
          / {project.name}
        </Text>
      </div>

      <SectionHeader
        title={project.name ?? `#${project.id}`}
        question={
          <span className='flex flex-wrap items-center gap-1.5'>
            {project.archived ? (
              <Pill tone='ink'>{ARCHIVED_WORD}</Pill>
            ) : (
              <Pill tone='mut'>project</Pill>
            )}
            {dates ? (
              <span className='tabular-nums'>{dates}</span>
            ) : (
              <span>no dates — this one is not an event</span>
            )}
          </span>
        }
        action={
          <Button size='xs' variant='secondary' disabled={!writable} onClick={onEdit}>
            edit the project
          </Button>
        }
      />

      {/* ВЕЩИ, ЧЬИ КАРТОЧКИ ПОКАЗЫВАЮТ СЮДА. Один запрос на страницу, а не по одному на строку:
          ровно поэтому этот ряд стоит в шапке ОДНОГО проекта и не строится в индексе. */}
      {stylesFetched && styles.length > 0 && (
        <ChipRow>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            garments
          </Text>
          {/* Ссылка снаружи, чип внутри: `Chip` без `onClick` рисуется `span`, и кнопка внутри
              ссылки была бы невалидной разметкой — тем же классом, которым плитка уже один раз
              разносила сетку. Фокус и клавиатура достаются ссылке, вид — чипу. */}
          {styles.map((s) => (
            <Link
              key={s.techCardId}
              to={`${ROUTES.techCards}/${s.techCardId}`}
              title='open the garment card'
            >
              <Chip>{s.name || s.styleNumber || `#${s.techCardId}`}</Chip>
            </Link>
          ))}
        </ChipRow>
      )}

      {/* АРХИВНЫЙ ПРОЕКТ ИМЕНУЕТСЯ И ПОМЕЧАЕТСЯ, А НЕ ОТКАЗЫВАЕТ. Архив у роли и у проекта
          значит РАЗНОЕ, и это стоит сказать ровно там, где человек открыл архивный проект по
          прямой ссылке: роль — слово, ушедшее из употребления, назначить её нельзя; проект —
          коробка, её закрыли, и положить в закрытую коробку ещё один файл остаётся связным
          действием. */}
      {project.archived && (
        <CalloutBox tone='warning'>
          <Text size='micro' component='span'>
            <b>“{project.name}” is archived.</b> it is not offered in the chips or in the pickers
            any more, but the link works and the project is whole. dropping another file in still
            works — a project is a box and gets closed, while a role is a word and gets retired.
          </Text>
        </CalloutBox>
      )}

      {children}
    </div>
  );
}

/**
 * ЗАГОЛОВОК СУЖЕННОЙ СЕКЦИИ — «проект / роль · N» и выход обратно.
 *
 * Он же МИШЕНЬ ФОКУСА после нажатия «show all» в секции: нажатая кнопка исчезает вместе с
 * секциями, и без явной мишени фокус падает на `body` — клавиатурный человек начинает
 * следующий шаг с начала документа. Раньше мишенью был чип этой же роли; ряда чипов больше
 * нет, и состояние, поставленное нажатием, держит теперь этот заголовок.
 */
export const NARROWED_HEAD_ID = 'project-narrowed-head';

export function NarrowedSectionHeader({
  projectName,
  roleName,
  total,
  archivedRole,
  onBack,
}: {
  projectName: string;
  roleName: string;
  /** `undefined` — ответ ещё не приехал; число не выдумывается. */
  total?: number;
  archivedRole?: boolean;
  onBack: () => void;
}) {
  return (
    <div id={NARROWED_HEAD_ID} tabIndex={-1} className='focus:outline-none'>
      <SectionHeader
        title={`${projectName} / ${roleName}`}
        question={total === undefined ? undefined : `· ${total} ${plural(total, 'file')}`}
        action={
          <>
            {archivedRole && (
              <Pill
                tone='mut'
                title='the role is archived: it can be taken off files, but not put on again'
              >
                {ARCHIVED_WORD}
              </Pill>
            )}
            <Button size='xs' variant='secondary' onClick={onBack}>
              back to the project
            </Button>
          </>
        }
      />
    </div>
  );
}

export type ProjectSectionView = {
  key: string;
  title: string;
  /** Роль в архиве: назначить её нельзя, а снять — можно, поэтому файлы под ней видны. */
  archived?: boolean;
  /** Грей-клауза заголовка: чем эта секция является. */
  question?: React.ReactNode;
  /** Плитки и `total` — ИЗ ОДНОГО ответа. Врозь они разойдутся, и число соврёт. */
  files: LibraryFile[];
  total: number;
  error?: unknown;
  onRetry: () => void;
  /** Ставит `frole=` и уводит в плоскую сетку — там листают и там работают. */
  onShowAll: () => void;
};

/** «12 files» — склонение берётся из модуля очереди, второй машины в разделе нет. */
function filesWord(n: number): string {
  return `${n} ${plural(n, 'file')}`;
}

function ProjectSection({
  section,
  renderTile,
}: {
  section: ProjectSectionView;
  renderTile: (f: LibraryFile) => React.ReactNode;
}) {
  const shown = section.files.length;
  const truncated = section.total > shown;

  return (
    <>
      <SectionHeader
        title={section.title}
        question={
          <>
            {/* ЧИСЛО НАЗЫВАЕТ СЕБЯ ЧЕСТНО. Секция показывает начало, а не всё: «первые 12 из
                412» сказано словами ровно там, где иначе стояло бы «412» над двенадцатью
                плитками — а это и есть та ложь, ради которой счётчик и берётся из ответа
                самой секции. */}
            {truncated ? `first ${shown} of ${section.total}` : filesWord(section.total)}
            {section.question ? ` · ${section.question}` : ''}
          </>
        }
        action={
          <>
            {section.archived && (
              <Pill
                tone='mut'
                title='the role is archived: it can be taken off files, but not put on again'
              >
                {ARCHIVED_WORD}
              </Pill>
            )}
            {/* КНОПКА ЕСТЬ ВСЕГДА, А НЕ ТОЛЬКО ПРИ ОБРЕЗАННОЙ СЕКЦИИ, и это перемена.
                Довод «показано всё — сужать нечем» держался на ряде чипов ролей: он стоял
                рядом и давал тот же переход. Ряда больше нет (роль принадлежит проекту), и без
                этой кнопки в раздел из трёх файлов нельзя войти ВООБЩЕ — а вход туда нужен не
                ради «показать больше»: там своя ссылка `?project=N&frole=M`, которую кидают в
                чат, там листают и там работают выделением.

                «OPEN ALL (N)», А НЕ «SHOW ALL»: на необрезанной секции «показать все» над теми
                же тремя плитками обещало бы новое и не давало бы ничего. «Открыть» честно
                называет то, что происходит, — смену вида, а не догрузку. */}
            <Button size='xs' variant='secondary' onClick={section.onShowAll}>
              open all ({section.total})
            </Button>
          </>
        }
      />
      <Tiles min={190}>{section.files.map(renderTile)}</Tiles>
    </>
  );
}

function FailedSection({ section, onRetry }: { section: ProjectSectionView; onRetry: () => void }) {
  return (
    <>
      <SectionHeader title={section.title} question='this section did not load' />
      <CalloutBox tone='error'>
        <div className='flex flex-wrap items-center gap-2.5'>
          <Text size='micro' component='span'>
            <FailureText e={section.error} fallback="the server didn't answer." />
          </Text>
          <Button size='sm' variant='secondary' className='ml-auto' onClick={onRetry}>
            try again
          </Button>
        </div>
      </CalloutBox>
    </>
  );
}

/**
 * ОБОЛОЧКА СЕКЦИИ — ОДНА НА ОБА СОСТОЯНИЯ, и она же мишень фокуса.
 *
 * Кнопка «try again» исчезает ровно тогда, когда повтор УДАЛСЯ, — и фокус вместе с ней падает
 * на `body`. Мишенью взята сама секция, а не первая плитка: человек нажимал «повторить» ради
 * РАЗДЕЛА, и вернуть его надо к разделу, а не к случайному файлу внутри. `tabIndex={-1}` даёт
 * секции принимать фокус программно, не влезая в порядок обхода табом.
 */
function SectionShell({
  section,
  renderTile,
}: {
  section: ProjectSectionView;
  renderTile: (f: LibraryFile) => React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [retried, setRetried] = useState(false);
  const failed = !!section.error;

  useEffect(() => {
    if (retried && !failed) {
      setRetried(false);
      ref.current?.focus();
    }
  }, [retried, failed]);

  return (
    <section ref={ref} tabIndex={-1} className='flex flex-col focus:outline-none'>
      {failed ? (
        <FailedSection
          section={section}
          onRetry={() => {
            setRetried(true);
            section.onRetry();
          }}
        />
      ) : (
        <ProjectSection section={section} renderTile={renderTile} />
      )}
    </section>
  );
}

export function ProjectSections({
  sections,
  emptyRoles,
  pileEmpty,
  projectName,
  roleNames,
  writable,
  onAddRole,
  renderTile,
}: {
  /** Только непустые (и сломавшиеся): пустая секция — это строка внизу, а не блок. */
  sections: ProjectSectionView[];
  /** Имя проекта — в строке про то, чьи это слова. */
  projectName: string;
  /** Весь живой словарь ЭТОГО проекта, по порядку: строка называет его целиком. */
  roleNames: string[];
  writable: boolean;
  /** Открывает словарь ролей этого проекта — единственное место, где роли правят. */
  onAddRole: () => void;
  /**
   * Живые роли словаря, которых в этом проекте нет ни у одного файла.
   *
   * ПУСТАЯ СЕКЦИЯ НЕ РИСУЕТСЯ, А НАЗЫВАЕТСЯ. Четыре заголовка с нулём под каждым — это четыре
   * экрана прокрутки ни о чём, и на проекте, где заполнена одна роль, они заслоняют
   * единственное, что там есть. Но и молчать нельзя: словарь ролей закрытый, человек его не
   * придумывает, и не увидев слова «планирование» он не догадается, что оно бывает. Поэтому
   * пустые роли остаются строкой — весь словарь виден, места занимает одну строку.
   *
   * Архивные роли сюда НЕ попадают: назначить их нельзя, и предлагать «сюда можно класть»
   * значило бы предлагать жест, который отвечает отказом.
   */
  emptyRoles: string[];
  /** Приёмной кучи нет — в проекте всё разобрано. Это хорошая новость, и её стоит сказать. */
  pileEmpty: boolean;
  renderTile: (f: LibraryFile) => React.ReactNode;
}) {
  return (
    <>
      {sections.map((s) => (
        <SectionShell key={s.key} section={s} renderTile={renderTile} />
      ))}
      {(emptyRoles.length > 0 || pileEmpty) && (
        <div className='flex flex-col gap-1'>
          {emptyRoles.length > 0 && (
            <Text size='micro' variant='label'>
              not in this project yet: {emptyRoles.join(' · ')}. a role goes on files, from the
              selection bar — not on the section.
            </Text>
          )}
          {pileEmpty && (
            <Text size='micro' variant='label'>
              nothing to sort out: no file in this project is without a role. whatever gets
              dropped here next shows up as a separate “without a role” section — uploading sets
              no role.
            </Text>
          )}
        </div>
      )}
      {/* НОВЫЙ РАЗДЕЛ — ЭТО НОВОЕ СЛОВО, И СЛОВО ПРИНАДЛЕЖИТ ЭТОМУ ПРОЕКТУ. Ряд стоит внизу
          страницы, а не в шапке: сначала смотрят, что уже есть, и только потом заводят ещё
          одно. Он же единственный вход в правку словаря — переименование, порядок, архив и
          слияние живут за той же кнопкой. */}
      <div className='flex flex-wrap items-center gap-2 border-t border-hairline pt-2'>
        <Button size='xs' variant='secondary' disabled={!writable} onClick={onAddRole}>
          + role
        </Button>
        <Text size='micro' variant='label' component='span' className='min-w-0'>
          {roleNames.length
            ? `a new section is a new word, and the word belongs to “${projectName}” alone: ${roleNames.join(' · ')}. the shoot next door keeps its own set, and neither list is offered to the other.`
            : `“${projectName}” has no words of its own yet — files sit in it unsorted, which is a lawful state. a role names a sub-group of THIS project and is not shared with the library.`}
        </Text>
      </div>
    </>
  );
}
