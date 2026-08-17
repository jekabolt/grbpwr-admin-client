import { useState } from 'react';
import type { FileTopic, LibraryFile } from 'api/proto-http/admin';
import { useQueryClient } from '@tanstack/react-query';
import { useAdmins } from 'components/managers/tech-card/components/useRoles';
import { Avatar } from 'ui/components/avatar';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import { MAX_UPLOAD_BYTES, uploadLibraryPreview } from '../api/filesService';
import { filesKeys } from '../hooks/useFiles';
import { rebuildPreview } from '../utils/preview';

/**
 * Пустое и сломанное в галерее.
 *
 * Правило раздела: каждый пустой экран обязан чему-то научить — что тема это ярлык, что
 * ссылка временная, что предел 95 МБ. Библиотека открывается пустой у всех, и первый экран,
 * который человек здесь видит, чаще всего именно такой.
 */

const HATCH = 'repeating-linear-gradient(45deg,#f4f4f4,#f4f4f4 6px,#ececec 6px,#ececec 12px)';

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
  const { data } = useAdmins();
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
        <Text size='micro' variant='label'>
          попросите их у того, кто ведёт аккаунты.
        </Text>
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
      note={`до ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} мб на файл · картинки и pdf показывают первую страницу прямо в сетке · ссылки на скачивание живут 6–12 часов, поэтому файлы не утекают наружу`}
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
 */
export function EmptySearchState({
  search,
  narrowed,
  everywhereTotal,
  onSearchEverywhere,
  onClearSearch,
}: {
  search: string;
  /** Поиск шёл в сузившем фильтре (выбраны темы или «разобрать»). */
  narrowed: boolean;
  everywhereTotal?: number;
  onSearchEverywhere: () => void;
  onClearSearch: () => void;
}) {
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
          <Button size='sm' variant='secondary' onClick={onClearSearch}>
            очистить поиск
          </Button>
        </>
      }
      note='поиск идёт по кускам имени: «box» найдёт packaging_box_dieline.pdf. внутрь pdf он не заглядывает'
    >
      <Text size='micro' variant='label'>
        «{search}» не встретилось ни в имени файла, ни в названии темы, ни в имени того, кто
        загрузил{narrowed ? ' — в выбранном фильтре' : ''}.
        {narrowed && everywhereTotal === 0
          ? ' во всех темах такого файла тоже нет.'
          : ''}
      </Text>
    </StateFrame>
  );
}

/** Первая страница не пришла вовсе — показывать пока нечего, но и делать вид, что библиотека
 * пуста, нельзя: это два разных ответа. */
export function ListFailedState({
  error,
  onRetry,
}: {
  /** Слова сервера. Отказ бывает содержательным («не больше 20 тем в одном фильтре»), и
   * подменять его на «сервер не ответил» значит увести человека чинить связь вместо фильтра. */
  error?: string;
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
        {error || 'сервер не ответил.'}
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
        <Text size='micro' component='span'>
          следующая страница не догрузилась — связь оборвалась. загруженные {loaded}
          {total ? ` из ${total}` : ''} остались на месте.
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
export function RebuildPreview({ file }: { file: LibraryFile }) {
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
      qc.invalidateQueries({ queryKey: filesKeys.all });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'не вышло');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='flex flex-col gap-0.5'>
      <Button size='xs' variant='secondary' disabled={busy} onClick={run}>
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
