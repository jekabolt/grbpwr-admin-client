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
      title='доступа к файлам нет'
      note='пока права нет, показывать нечего: ни имён файлов, ни счётчиков'
    >
      <Text size='micro' variant='label'>
        пункт «файлы» видно в меню у всех, поэтому вы сюда и попали. открыть библиотеку можно с
        правом <b>files:read</b>, загружать — с <b>files:write</b>.
      </Text>
      {supers.length ? (
        <>
          <Text size='micro' variant='label'>
            доступ выдаёт кто-то из этих людей
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
            попросите их у того, кто ведёт аккаунты.
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
      title='здесь пока ничего нет'
      actions={
        writable ? (
          <Button size='sm' variant='main' onClick={onUpload}>
            загрузить первые файлы
          </Button>
        ) : undefined
      }
      // Предел печатает `formatBytes`, а не своё деление на 1024²: у оверлея броска и у строки
      // очереди он уже печатается ею, и третий счёт того же числа однажды разойдётся с ними.
      note={`до ${formatBytes(MAX_UPLOAD_BYTES)} на файл · картинки и pdf показывают первую страницу прямо в сетке · ссылки на скачивание живут 6–12 часов, поэтому файлы не утекают наружу`}
    >
      <Text size='micro' variant='label'>
        библиотека общая: то, что вы загрузите, увидит вся команда. <b>тема — ярлык, а не папка</b>
        : один файл может нести и «brand», и «packaging» сразу, а может не нести ни одной — тогда
        он попадёт в «разобрать».
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
      title={single ? `в теме «${single.name}» пусто` : 'в этом пересечении пусто'}
      actions={
        <>
          <Button size='sm' variant='secondary' onClick={onShowAll}>
            показать все файлы
          </Button>
          {writable && (
            <Button size='sm' variant='secondary' onClick={onUpload}>
              загрузить сюда
            </Button>
          )}
        </>
      }
      note={
        single
          ? 'файл не «переезжает» в тему — ярлык вешается на него в карточке, и тем у одного файла может быть сколько нужно'
          : `файла, который нёс бы сразу все выбранные темы (${names}), нет. снимите один чип — станет шире`
      }
    >
      {single?.description ? (
        <Text size='micro' variant='label'>
          {single.description}
        </Text>
      ) : (
        <Text size='micro' variant='label'>
          {single
            ? 'никто ещё не поставил этот ярлык.'
            : 'несколько тем сразу дают пересечение, а не сумму.'}
        </Text>
      )}
    </StateFrame>
  );
}

export function EmptyUntopicedState({ onShowAll }: { onShowAll: () => void }) {
  return (
    <StateFrame
      title='всё разобрано'
      actions={
        <Button size='sm' variant='secondary' onClick={onShowAll}>
          показать все файлы
        </Button>
      }
    >
      <Text size='micro' variant='label'>
        сюда падают файлы, которым не поставили ни одной темы. пусто — значит у каждого есть хотя
        бы один ярлык и его найдут по теме, а не по памяти. новые загрузки без тем появятся здесь
        же.
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
  everywhereTotal,
  onSearchEverywhere,
  onClearPerson,
  onClearSearch,
}: {
  search: string;
  /** Поиск шёл в сузившем фильтре (выбраны темы или «разобрать»). */
  narrowed: boolean;
  /** Имя выбранного человека (или `#id`, если такого аккаунта уже нет). */
  personLabel?: string;
  everywhereTotal?: number;
  onSearchEverywhere: () => void;
  onClearPerson: () => void;
  onClearSearch: () => void;
}) {
  // Оба сужения называются ОДНОЙ фразой: два фильтра, перечисленные порознь, читаются как две
  // разные причины одной пустоты.
  const where = [narrowed ? 'в выбранных темах' : '', personLabel ? `у ${personLabel}` : '']
    .filter(Boolean)
    .join(' и ');
  return (
    <StateFrame
      title='ничего не нашлось'
      actions={
        <>
          {narrowed && everywhereTotal !== undefined && everywhereTotal > 0 && (
            <Button size='sm' variant='main' onClick={onSearchEverywhere}>
              искать во всех темах ({everywhereTotal})
            </Button>
          )}
          {personLabel && (
            <Button size='sm' variant='secondary' onClick={onClearPerson}>
              искать у всех людей
            </Button>
          )}
          <Button size='sm' variant='secondary' onClick={onClearSearch}>
            очистить поиск
          </Button>
        </>
      }
      note='поиск идёт по кускам имени: «box» найдёт packaging_box_dieline.pdf. внутрь pdf он не заглядывает'
    >
      <Text size='micro' variant='label'>
        «{search}» не встретилось ни в имени файла, ни в названии темы, ни в имени того, кто
        загрузил{where ? ` — ${where}` : ''}.
        {narrowed && everywhereTotal === 0
          ? ' во всех темах такого файла тоже нет.'
          : ''}
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
      ? `${personLabel} сюда ничего не загружал`
      : role === 'owner'
        ? `${personLabel} не ведёт ни одного файла`
        : `у ${personLabel} здесь ничего нет`;

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
              в любой роли ({anyRoleTotal})
            </Button>
          )}
          <Button size='sm' variant='secondary' onClick={onShowAll}>
            показать все файлы
          </Button>
        </>
      }
      note='файлы, закрытые от вас, в этот ответ не попадают — у самого человека их может быть больше, чем видно отсюда'
    >
      <Text size='micro' variant='label'>
        у файла две разные связи с человеком: <b>загрузил</b> — кто принёс его в библиотеку, и
        этого с файла не снять уже никогда; <b>ведёт</b> — кто отвечает за него сейчас, к тому и
        идут, когда файл устарел. чаще это один человек, но не всегда: загрузивший мог уйти, а
        файл остаться.
      </Text>
      {narrowed && (
        <Text size='micro' variant='label'>
          человек — не единственное сужение: сверху выбраны ещё темы (или «разобрать»). пустым
          может быть именно пересечение, а не человек — «показать все файлы» снимет всё разом.
        </Text>
      )}
      {!known && (
        // Фильтр при этом РАБОТАЕТ: сервер ищет по id, и «нет в списке» — не «не найден».
        // Молчать об отсутствующем имени нельзя, иначе `#41` в пикере читается как сбой.
        <Text size='micro' variant='label'>
          имени у этого аккаунта здесь нет: он отключён или ссылку прислали давно. фильтр всё
          равно считает верно — он спрашивает по номеру аккаунта, а не по имени, и потому не
          путает однофамильцев.
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
    if (projectId > 0 && withoutRole) return `в проекте «${project}» всё разобрано по ролям`;
    if (projectId > 0 && role) return `в проекте «${project}» нет ничего в роли «${role}»`;
    if (projectId > 0) return `в проекте «${project}» пусто`;
    if (withoutRole) return 'выберите проект — «без роли» спрашивают внутри него';
    return `ни в одном проекте нет роли «${role}»`;
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
              весь проект ({wholeProjectTotal})
            </Button>
          )}
          <Button size='sm' variant='secondary' onClick={onShowAll}>
            показать все файлы
          </Button>
        </>
      }
      note='файлы, закрытые от вас, в этот ответ не попадают — в проекте их может быть больше, чем видно отсюда'
    >
      <Text size='micro' variant='label'>
        роль стоит <b>на связи файла с проектом</b>, а не ярлыком на самом файле. один и тот же
        снимок бывает «исходники» в съёмке и «идея» в лукбуке — и «съёмка × идея» его не найдёт,
        потому что идеей он был не в съёмке. это не строгость ради строгости: плоские ярлыки
        находили бы его молча и неправильно.
      </Text>
      {projectId > 0 && withoutRole && (
        <Text size='micro' variant='label'>
          «без роли» — приёмная куча проекта: сюда попадает всё, что в него бросили и ещё не
          разобрали. пусто — значит у каждого файла проекта роль уже есть.
        </Text>
      )}
      {projectId > 0 && !projectName && (
        // Фильтр РАБОТАЕТ: сервер ищет по номеру. Молчать об отсутствующем имени нельзя —
        // «#17» в ряду чипов иначе читается как сбой.
        <Text size='micro' variant='label'>
          имени этого проекта в ряду чипов нет: он в архиве или ссылку прислали давно. в архиве
          проект остаётся целым и виден на экране тем — архив прячет его из чипов, а не удаляет.
        </Text>
      )}
      {projectId === 0 && !withoutRole && (
        <Text size='micro' variant='label'>
          роль без проекта — это вопрос «все исходники по всем съёмкам» сразу. пусто здесь
          значит, что роль ещё никому не проставили: делается это в полосе выделения, кнопкой
          «проставить роль».
        </Text>
      )}
      {narrowedByTopics && (
        <Text size='micro' variant='label'>
          сужает не только проект: сверху выбраны ещё темы (или «разобрать»). пустым может быть
          именно пересечение — «показать все файлы» снимет всё разом.
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
   * содержательным («за раз можно пересечь не больше 20 тем»), и подменять его на «сервер не
   * ответил» значит увести человека чинить связь вместо фильтра. */
  error?: unknown;
  onRetry: () => void;
}) {
  return (
    <StateFrame
      title='список не загрузился'
      actions={
        <Button size='sm' variant='secondary' onClick={onRetry}>
          повторить
        </Button>
      }
      note='это не значит, что библиотека пуста — её просто сейчас не спросить'
    >
      <Text size='micro' variant='label'>
        <FailureText e={error} fallback='сервер не ответил.' />
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
          следующая страница не догрузилась. уже показанное осталось на месте: {loaded}
          {total ? ` из ${total}` : ''}.
        </Text>
        <Button
          size='sm'
          variant='secondary'
          className='ml-auto'
          disabled={retrying}
          onClick={onRetry}
        >
          {retrying ? 'пробуем…' : 'повторить'}
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
 * не существует, и кнопка «построить заново» была бы там вечным обещанием.
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
      setError(e instanceof Error ? e.message : 'превью не построилось');
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
        title={writable ? undefined : 'только чтение — превью не перестроить'}
        onClick={run}
      >
        {busy ? 'строим…' : 'построить заново'}
      </Button>
      {error && (
        <Text size='nano' variant='label' component='span' className='block'>
          {error}
        </Text>
      )}
    </div>
  );
}
