import { useState } from 'react';
import type { FileTopic, LibraryFile } from 'api/proto-http/admin';
import { useQueryClient } from '@tanstack/react-query';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { Avatar } from 'ui/components/avatar';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { HATCH } from 'ui/components/skeleton';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import { MAX_UPLOAD_BYTES, uploadLibraryPreview } from '../api/filesService';
import { invalidateFileViews, type PersonRoleFilter } from '../hooks/useFiles';
import { formatBytes } from '../utils/format';
import { rebuildPreview } from '../utils/preview';
import { FailureText } from './failure-text';

/**
 * Пустое и сломанное в галерее.
 *
 * Правило раздела: каждый пустой экран обязан чему-то научить — что тема это ярлык, что
 * ссылка временная, что предел 95 МБ. Библиотека открывается пустой у всех, и первый экран,
 * который человек здесь видит, чаще всего именно такой.
 */

// Штриховка — общая (`ui/components/skeleton`), а не своя копия той же строки: две копии
// расходятся на первой же правке, и скелет галереи стал бы другого серого, чем скелеты
// таблиц.

function StateFrame({
  title,
  children,
  actions,
  note,
}: {
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  note?: React.ReactNode;
}) {
  return (
    <div className='border border-borderColor bg-bgColor p-block'>
      <div className='mx-auto flex max-w-[74ch] flex-col items-center gap-2 text-center'>
        <Text className='uppercase'>{title}</Text>
        {children}
        {actions && (
          <div className='flex flex-wrap items-center justify-center gap-1.5'>{actions}</div>
        )}
        {note && (
          <Text size='micro' variant='label'>
            {note}
          </Text>
        )}
      </div>
    </div>
  );
}

/**
 * Скелет сетки.
 *
 * Плитки того же размера, что настоящие, и ровно столько, сколько влезает в экран: когда
 * придут файлы, ряд не дёрнется. Скелет НЕ считает файлы — он держит место, поэтому число
 * фиксированное и ни на что не претендует.
 */
export function GallerySkeleton({ count = 12 }: { count?: number }) {
  return (
    <Tiles min={190}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} aria-hidden className='flex flex-col border border-borderColor bg-bgColor'>
          <div style={{ background: HATCH }} className='aspect-square w-full' />
          <div className='flex flex-col gap-1 border-t border-hairline px-1.5 py-1'>
            <span
              style={{ background: HATCH, width: `${58 + (i % 4) * 10}%` }}
              className='block h-[11px]'
            />
            <span style={{ background: HATCH }} className='block h-[11px] w-[34%]' />
          </div>
        </div>
      ))}
    </Tiles>
  );
}

/**
 * Раздел закрыт правами — и экран НАЗЫВАЕТ, у кого просить.
 *
 * Ни счётчиков, ни имён файлов: этого экран рассказать не имеет права. Зато имена суперов
 * он рассказать обязан. Разница между «доступа нет» и «доступ выдаёт jekabolt» — это разница
 * между тупиком и решённым за минуту вопросом, а пустой отказ порождает сообщение в телеграм,
 * то есть ровно тот способ работы, от которого раздел и уводит. Панель на шесть человек,
 * которые знают друг друга: раскрытия здесь нет.
 *
 * Список берётся из `ListAdmins` (метод в allowlist — его видит любой аутентифицированный).
 * Не ответил или суперов не назвал — экран деградирует до прежнего текста без имён, а не до
 * пустоты на месте списка.
 */
export function NoAccessState() {
  const { data, isLoading } = useAdmins();
  const supers = (data?.admins ?? []).filter((a) => a.isSuper && a.username);

  return (
    <StateFrame
      title='no access to files'
      note='while there is no right, there is nothing to show: no file names, no counters'
    >
      <Text size='micro' variant='label'>
        the “files” item is visible in the menu to everyone, that is how you got here. the library
        opens with the <b>files:read</b> right, uploading — with <b>files:write</b>.
      </Text>
      {supers.length ? (
        <>
          <Text size='micro' variant='label'>
            access is handed out by one of these people
          </Text>
          <div className='flex flex-wrap items-center justify-center gap-2'>
            {supers.map((a) => (
              <span key={a.id ?? a.username} className='flex items-center gap-1'>
                <Avatar name={a.username} size={20} />
                <Text size='micro' component='span' className='uppercase'>
                  {a.username}
                </Text>
              </span>
            ))}
          </div>
        </>
      ) : (
        // Пока список в пути — молчим: иначе экран сначала говорит «попросите у того, кто
        // ведёт аккаунты», а через мгновение подменяет это именами, и человек читает первое.
        !isLoading && (
          <Text size='micro' variant='label'>
            ask for them from whoever runs the accounts.
          </Text>
        )
      )}
    </StateFrame>
  );
}

export function EmptyLibraryState({
  writable,
  onUpload,
}: {
  writable: boolean;
  onUpload: () => void;
}) {
  return (
    <StateFrame
      title='there is nothing here yet'
      actions={
        writable ? (
          <Button size='sm' variant='main' onClick={onUpload}>
            upload the first files
          </Button>
        ) : undefined
      }
      // Предел печатает `formatBytes`, а не своё деление на 1024²: у оверлея броска и у строки
      // очереди он уже печатается ею, и третий счёт того же числа однажды разойдётся с ними.
      note={`up to ${formatBytes(MAX_UPLOAD_BYTES)} per file · pictures and pdf show the first page right in the grid · download links live 6–12 hours, so the files do not leak outside`}
    >
      <Text size='micro' variant='label'>
        the library is shared: what you upload will be seen by the whole team.{' '}
        <b>a topic is a label, not a folder</b>: one file can carry both “brand” and “packaging” at
        once, or carry none at all — then it lands in “unsorted”.
      </Text>
    </StateFrame>
  );
}

export function EmptyTopicState({
  topics,
  writable,
  onShowAll,
  onUpload,
}: {
  /** Выбранные темы — их и называем: пересечение может быть пустым при непустых темах. */
  topics: FileTopic[];
  writable: boolean;
  onShowAll: () => void;
  onUpload: () => void;
}) {
  const names = topics.map((t) => t.name).join(' + ');
  const single = topics.length === 1 ? topics[0] : undefined;
  return (
    <StateFrame
      title={single ? `the topic “${single.name}” is empty` : 'this intersection is empty'}
      actions={
        <>
          <Button size='sm' variant='secondary' onClick={onShowAll}>
            show all files
          </Button>
          {writable && (
            <Button size='sm' variant='secondary' onClick={onUpload}>
              upload here
            </Button>
          )}
        </>
      }
      note={
        single
          ? 'a file does not “move” into a topic — the label is hung on it in the card, and one file can carry as many topics as it needs'
          : `there is no file that would carry all the selected topics at once (${names}). drop one chip — it gets wider`
      }
    >
      {single?.description ? (
        <Text size='micro' variant='label'>
          {single.description}
        </Text>
      ) : (
        <Text size='micro' variant='label'>
          {single
            ? 'nobody has put this label on yet.'
            : 'several topics at once give an intersection, not a sum.'}
        </Text>
      )}
    </StateFrame>
  );
}

export function EmptyUntopicedState({ onShowAll }: { onShowAll: () => void }) {
  return (
    <StateFrame
      title='everything is sorted'
      actions={
        <Button size='sm' variant='secondary' onClick={onShowAll}>
          show all files
        </Button>
      }
    >
      <Text size='micro' variant='label'>
        files that were given no topic at all fall in here. empty means every one of them carries at
        least one label and will be found by topic, not from memory. new uploads without topics show
        up right here.
      </Text>
    </StateFrame>
  );
}

/**
 * Поиск не нашёл ничего.
 *
 * Когда искали ВНУТРИ выбранных тем, единственный полезный ответ — сколько нашлось бы без
 * них: иначе человек делает вывод, что поиск сломан, хотя сломан был фильтр. Число берётся
 * вторым запросом и только в этот момент — на каждое нажатие клавиши его спрашивать незачем.
 *
 * Фильтр по человеку сужает так же, и молчать о нём здесь нельзя: «ничего не нашлось» рядом с
 * непрочитанным пикером человека — это ровно тот случай, когда виноват фильтр, а винят поиск.
 * Своей кнопки со счётом у него нет намеренно: снять человека — не «поискать шире тем же
 * запросом», а другой вопрос, и число к нему приписывать не за что.
 */
export function EmptySearchState({
  search,
  narrowed,
  personLabel,
  roleLabel,
  everywhereTotal,
  anyRoleTotal,
  onSearchEverywhere,
  onAnyRole,
  onClearPerson,
  onClearSearch,
}: {
  search: string;
  /** Поиск шёл в сузившем фильтре (выбраны темы или «unsorted»). */
  narrowed: boolean;
  /** Имя выбранного человека (или `#id`, если такого аккаунта уже нет). */
  personLabel?: string;
  /**
   * Роль файла, если выбрана: «исходники» либо «без роли».
   *
   * РОЛЬ СУЖАЕТ И БЕЗ ПРОЕКТА, и молчать о ней здесь нельзя по той же причине, по которой
   * нельзя молчать о человеке: «ничего не нашлось» рядом с непрочитанным рядом ролей — это
   * случай, когда виноват фильтр, а винят поиск.
   */
  roleLabel?: string;
  everywhereTotal?: number;
  /** Сколько нашлось бы БЕЗ роли. `undefined` — не спрашивали. */
  anyRoleTotal?: number;
  onSearchEverywhere: () => void;
  onAnyRole: () => void;
  onClearPerson: () => void;
  onClearSearch: () => void;
}) {
  // Все сужения называются ОДНОЙ фразой: фильтры, перечисленные порознь, читаются как несколько
  // разных причин одной пустоты.
  const where = [
    narrowed ? 'in the chosen topics' : '',
    roleLabel ? `among “${roleLabel}”` : '',
    personLabel ? `for ${personLabel}` : '',
  ]
    .filter(Boolean)
    .join(' and ');
  return (
    <StateFrame
      title='nothing was found'
      actions={
        <>
          {narrowed && everywhereTotal !== undefined && everywhereTotal > 0 && (
            <Button size='sm' variant='main' onClick={onSearchEverywhere}>
              search in all topics ({everywhereTotal})
            </Button>
          )}
          {/* Кнопка НЕСЁТ ЧИСЛО — то же правило, что у соседних: без него она обещает
              результат, которого может не быть. Нет числа или оно ноль — кнопки нет. */}
          {roleLabel && !!anyRoleTotal && (
            <Button size='sm' variant='secondary' onClick={onAnyRole}>
              in any role ({anyRoleTotal})
            </Button>
          )}
          {personLabel && (
            <Button size='sm' variant='secondary' onClick={onClearPerson}>
              search across all people
            </Button>
          )}
          <Button size='sm' variant='secondary' onClick={onClearSearch}>
            clear the search
          </Button>
        </>
      }
      note='the search goes by pieces of the name: “box” will find packaging_box_dieline.pdf. it does not look inside a pdf'
    >
      <Text size='micro' variant='label'>
        “{search}” did not turn up in a file name, in a topic name, or in the name of whoever
        uploaded it{where ? ` — ${where}` : ''}.
        {narrowed && everywhereTotal === 0 ? ' there is no such file in all topics either.' : ''}
      </Text>
    </StateFrame>
  );
}

/**
 * У ВЫБРАННОГО ЧЕЛОВЕКА ЗДЕСЬ НИЧЕГО НЕТ — и это законный ответ, а не поломка.
 *
 * Отдельное состояние нужно ровно потому, что предыдущие одиннадцать про человека не знают:
 * «здесь пока ничего нет» на полной библиотеке прочли бы как сломавшийся раздел, а «в теме
 * пусто» — как пустую тему. Пустота тут значит одно: с этим человеком в этой роли ни один
 * файл не связан.
 *
 * ЭКРАН НЕ КЛЯНЁТСЯ, ЧТО У ЧЕЛОВЕКА ФАЙЛОВ НЕТ. Выдача считается предикатом видимости
 * смотрящего: закрытый файл не попадает ни в список, ни в счёт. «Ничего нет» здесь всегда
 * значит «ничего, что видно ВАМ», и сказать это надо вслух — иначе экран выдаёт ограничение
 * доступа за факт о человеке.
 */
export function EmptyPersonState({
  personLabel,
  known,
  role,
  narrowed,
  anyRoleTotal,
  onAnyRole,
  onShowAll,
}: {
  /** Имя из списка людей или `#id`, если аккаунта в нём нет. */
  personLabel: string;
  /** Такой аккаунт есть в `ListAdmins`. Нет — он отключён либо ссылка старая. */
  known: boolean;
  role: PersonRoleFilter;
  /** Кроме человека фильтр сужен ещё темами или «разобрать». */
  narrowed: boolean;
  /** Сколько нашлось бы у него В ЛЮБОЙ РОЛИ. `undefined` — не спрашивали. */
  anyRoleTotal?: number;
  onAnyRole: () => void;
  onShowAll: () => void;
}) {
  const title =
    role === 'uploaded'
      ? `${personLabel} has uploaded nothing here`
      : role === 'owner'
        ? `${personLabel} owns no file at all`
        : `${personLabel} has nothing here`;

  return (
    <StateFrame
      title={title}
      actions={
        <>
          {/* Кнопка ослабления НЕСЁТ ЧИСЛО — тот же довод, что у «искать во всех темах (N)»:
              без него она обещает результат, которого может не быть, и второе пустое место
              подряд человек прочтёт уже как поломку. Нет числа или оно ноль — кнопки нет. */}
          {role !== 'any' && !!anyRoleTotal && (
            <Button size='sm' variant='main' onClick={onAnyRole}>
              in any role ({anyRoleTotal})
            </Button>
          )}
          <Button size='sm' variant='secondary' onClick={onShowAll}>
            show all files
          </Button>
        </>
      }
      note='files closed to you do not enter this answer — the person may well hold more of them than shows up here'
    >
      <Text size='micro' variant='label'>
        a file has two different ties to a person: <b>uploaded</b> — who brought it into the
        library, and that never comes off the file again; <b>owns</b> — who answers for it now, and
        who is gone to when the file is out of date. usually it is one person, but not always: the
        one who uploaded it may have left while the file stayed.
      </Text>
      {narrowed && (
        <Text size='micro' variant='label'>
          the person is not the only narrowing: topics (or “unsorted”) are chosen above as well.
          what is empty may be the intersection rather than the person — “show all files” drops the
          lot at once.
        </Text>
      )}
      {!known && (
        // Фильтр при этом РАБОТАЕТ: сервер ищет по id, и «нет в списке» — не «не найден».
        // Молчать об отсутствующем имени нельзя, иначе `#41` в пикере читается как сбой.
        <Text size='micro' variant='label'>
          this account has no name here: it is disabled, or the link was sent long ago. the filter
          still answers correctly — it asks by account number rather than by name, and so never
          confuses two people who share one.
        </Text>
      )}
    </StateFrame>
  );
}

/**
 * ПУСТО В ПРОЕКТЕ ИЛИ В РОЛИ — и это тоже законный ответ, а не поломка.
 *
 * Двенадцать предыдущих состояний про группировку не знают: «в теме пусто» на выбранном
 * проекте прочлось бы как пустая тема, а «здесь пока ничего нет» на полной библиотеке — как
 * сломавшийся раздел. Пустота тут значит ровно одно: такой пары «проект × роль» ни у одного
 * видимого файла нет.
 *
 * ЭКРАН УЧИТ МОДЕЛИ, потому что именно здесь она чаще всего и не сходится в голове: человек
 * ждёт, что «исходники» — ярлык на файле, и не понимает, почему файл, который он точно
 * помечал, сюда не попал. Ответ — роль стоит на СВЯЗИ с проектом, и в другом проекте у того
 * же файла другая роль.
 */
export function EmptyGroupingState({
  projectId,
  projectName,
  roleName,
  roleId,
  withoutRole,
  narrowedByTopics,
  wholeProjectTotal,
  onWholeProject,
  onShowAll,
}: {
  projectId: number;
  /** Имя проекта из словаря холста; пусто — он в архиве либо ссылка старая. */
  projectName?: string;
  roleName?: string;
  roleId: number;
  withoutRole: boolean;
  /** Кроме проекта и роли фильтр сужен ещё темами или «разобрать». */
  narrowedByTopics: boolean;
  /** Сколько нашлось бы в проекте ЦЕЛИКОМ, без роли. `undefined` — не спрашивали. */
  wholeProjectTotal?: number;
  onWholeProject: () => void;
  onShowAll: () => void;
}) {
  const project = projectName ?? (projectId > 0 ? `#${projectId}` : '');
  const role = roleName ?? (roleId > 0 ? `#${roleId}` : '');

  const title = (() => {
    if (projectId > 0 && withoutRole) return `everything in “${project}” already has a role`;
    if (projectId > 0 && role) return `nothing in “${project}” carries the role “${role}”`;
    if (projectId > 0) return `the project “${project}” is empty`;
    // СТРАХОВКА, А НЕ ЖИВАЯ ВЕТКА, и это надо сказать вслух, чтобы через полгода её не сочли
    // сломанной. «Без роли» без проекта до сюда не доходит: его гасит `fileRoleFromUrl` при
    // разборе адреса и второй раз `normalizeGrouping` при сборке запроса. Но компонент —
    // обычная функция, и её пропы не защищены ни одним из этих двух гейтов: следующий вызывающий
    // может собрать такую пару руками. Строка стоит здесь ровно на этот случай, потому что
    // альтернатива — «ни в одном проекте нет роли «»» с пустыми кавычками.
    if (withoutRole) return 'pick a project — “without a role” is asked inside one';
    return `no project holds anything in the role “${role}”`;
  })();

  return (
    <StateFrame
      title={title}
      actions={
        <>
          {/* Число обязательно — тот же довод, что у «искать во всех темах (N)»: без него
              кнопка обещает результат, которого может не быть, и второе пустое место подряд
              человек читает уже как поломку. */}
          {projectId > 0 && (roleId > 0 || withoutRole) && !!wholeProjectTotal && (
            <Button size='sm' variant='main' onClick={onWholeProject}>
              the whole project ({wholeProjectTotal})
            </Button>
          )}
          <Button size='sm' variant='secondary' onClick={onShowAll}>
            show all files
          </Button>
        </>
      }
      note='files closed to you do not enter this answer — the project may well hold more of them than shows up here'
    >
      <Text size='micro' variant='label'>
        a role sits <b>on the link between the file and the project</b>, not as a label on the file
        itself. one and the same shot is “raw” in a shoot and “idea” in a lookbook — and “shoot ×
        idea” will not find it, because it was not an idea in the shoot. this is not strictness for
        its own sake: flat labels would find it silently and wrongly.
      </Text>
      {projectId > 0 && withoutRole && (
        <Text size='micro' variant='label'>
          “without a role” is the project's intake pile: everything dropped into it and not sorted
          out yet lands here. empty means every file of the project already has its role.
        </Text>
      )}
      {projectId > 0 && !projectName && (
        // Фильтр РАБОТАЕТ: сервер ищет по номеру. Молчать об отсутствующем имени нельзя —
        // «#17» в ряду чипов иначе читается как сбой.
        <Text size='micro' variant='label'>
          this project has no name in the chip row: it is archived, or the link was sent long ago.
          in the archive the project stays whole and shows up on the topics screen — the archive
          hides it from the chips, it does not delete it.
        </Text>
      )}
      {projectId === 0 && !withoutRole && (
        <Text size='micro' variant='label'>
          a role without a project is the question “all the raws across all the shoots” at once.
          empty here means nobody has been given this role yet: that is done in the selection bar,
          with the “set a role” button.
        </Text>
      )}
      {narrowedByTopics && (
        <Text size='micro' variant='label'>
          the project is not the only narrowing: topics (or “unsorted”) are chosen above as well.
          what is empty may be the intersection rather than the pair — “show all files” drops the
          lot at once.
        </Text>
      )}
    </StateFrame>
  );
}

/** Первая страница не пришла вовсе — показывать пока нечего, но и делать вид, что библиотека
 * пуста, нельзя: это два разных ответа. */
export function ListFailedState({
  error,
  onRetry,
}: {
  /** САМ ОТКАЗ, а не строка: разбор один на раздел и живёт на отрисовке. Отказ бывает
   * содержательным («no more than 20 topics can be crossed at a time»), и подменять его на «the
   * server didn't answer» значит увести человека чинить связь вместо фильтра. */
  error?: unknown;
  onRetry: () => void;
}) {
  return (
    <StateFrame
      title={"the list didn't load"}
      actions={
        <Button size='sm' variant='secondary' onClick={onRetry}>
          retry
        </Button>
      }
      note='this does not mean the library is empty — it just cannot be asked right now'
    >
      <Text size='micro' variant='label'>
        <FailureText e={error} fallback="the server didn't answer." />
      </Text>
    </StateFrame>
  );
}

/**
 * Обрыв при листании.
 *
 * Ошибка живёт ПОЛОСОЙ ПОД СПИСКОМ, а не вместо него: уже показанные страницы никуда не
 * деваются, позиция прокрутки не съезжает, и «повторить» дотягивает ровно недостающее.
 */
export function NextPageFailure({
  loaded,
  total,
  retrying,
  onRetry,
}: {
  loaded: number;
  total?: number;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <CalloutBox tone='error'>
      <div className='flex flex-wrap items-center gap-2.5'>
        {/* Причина НЕ называется: сюда приходит и обрыв связи, и отказ сервера, а полоса кода
            ответа не видит. «Связь оборвалась» здесь было догадкой, и на 403 она отправляла
            чинить не то. Число — без существительного, чтобы обойтись без склонения. */}
        <Text size='micro' component='span'>
          the next page did not load. what is already shown stayed in place: {loaded}
          {total ? ` of ${total}` : ''}.
        </Text>
        <Button
          size='sm'
          variant='secondary'
          className='ml-auto'
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? 'trying…' : 'retry'}
        </Button>
      </div>
    </CalloutBox>
  );
}

/**
 * «Превью не вышло» — и это НЕ «превью не бывает».
 *
 * Различает их одно правило: превью бывает у картинок и pdf (их рисует браузер), значит
 * такой тип с пустым preview — сбой отрисовки, а не свойство формата. У .zip первой страницы
 * не существует, и кнопка «build again» была бы там вечным обещанием.
 *
 * Строит клиент, ровно как при загрузке: качает файл по своей же ссылке, рисует первую
 * страницу в canvas и шлёт webp в эндпоинт замены превью.
 */
export function RebuildPreview({ file, writable }: { file: LibraryFile; writable: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      const blob = await rebuildPreview({
        downloadUrl: file.downloadUrl ?? '',
        fileName: file.fileName ?? 'file',
        contentType: file.contentType ?? undefined,
      });
      await uploadLibraryPreview(Number(file.id), blob);
      // ОБА КОРНЯ: перестроенная миниатюра — это ровно то, что видно на плитке вложения в
      // карточке задачи, а та приезжает из `['tasks','detail',id]`, куда `['files']` не
      // достаёт. С одним корнем человек чинил превью и полчаса видел старое — на том самом
      // экране, ради которого его и чинил (см. `invalidateFileViews`).
      invalidateFileViews(qc);
    } catch (e) {
      // «Не вышло» не называло ничего. Оба пути отказа (скачивание файла и отправка картинки)
      // приезжают сюда со своими словами; запасная фраза нужна только на не-Error.
      setError(e instanceof Error ? e.message : "the preview didn't build");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='flex flex-col gap-0.5'>
      <Button
        size='xs'
        variant='secondary'
        disabled={busy || !writable}
        title={writable ? undefined : "read-only — the preview can't be rebuilt"}
        onClick={run}
      >
        {busy ? 'building…' : 'build again'}
      </Button>
      {error && (
        <Text size='nano' variant='label' component='span' className='block'>
          {error}
        </Text>
      )}
    </div>
  );
}
