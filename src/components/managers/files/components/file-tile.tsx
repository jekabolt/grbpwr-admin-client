import type { LibraryFile } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Avatar } from 'ui/components/avatar';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { asAccessLevel } from '../api/accessService';
import { extensionOf, formatBytes, kindWord, previewExpected, stemOf } from '../utils/format';

/**
 * Плитка холста.
 *
 * `div`, а не `Tile`: внутри живут собственные кнопки (выбор, «построить заново»), а кнопка
 * внутри кнопки — невалидная разметка, которую браузер разбирает по-своему и разносит сетку.
 * По той же причине выделение рисуется `outline`, а не вторым пикселем рамки: `border-2`
 * менял бы ширину плитки, а высота кадра считается от неё — ряд дёргался бы на каждом щелчке.
 */
export function FileTile({
  file,
  selected,
  selectable,
  onToggleSelect,
  onOpen,
  onPreviewError,
  children,
}: {
  file: LibraryFile;
  selected?: boolean;
  /** Выбор доступен вообще (сам режим), независимо от того, выбран ли этот файл. */
  selectable?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  /**
   * Превью не открылось. Почти всегда это протухшая presigned-ссылка, а не порча файла.
   * Отдаётся именно адрес: перепрашивать выдачу можно один раз на адрес, иначе по-настоящему
   * битый объект гоняет её по кругу.
   */
  onPreviewError?: (url: string) => void;
  /** Досыл в подвал плитки — кнопка «построить заново» у состояния «превью не вышло». */
  children?: React.ReactNode;
}) {
  const name = file.fileName ?? '';
  const ext = extensionOf(name);
  // Строка-имя, а не id: она переживает аккаунт, и «чьи это файлы» на глаз отвечается и для
  // ушедшего из команды человека.
  const uploader = file.uploadedBy ?? '';
  const noTopics = !(file.topics ?? []).length;
  // «Не вышло» против «не бывает». У картинки и pdf превью строит браузер, значит пустое
  // превью у такого типа — сбой отрисовки; у .zip первой страницы не существует, и подпись
  // «не вышло» на нём была бы обещанием, которое никто не сможет выполнить.
  const failed = !file.previewUrl && previewExpected(file.contentType ?? undefined, name);
  /**
   * Уровень доступа и число реплик — то, ради чего иначе пришлось бы открыть карточку.
   *
   * Уровень не секрет от того, кто файл ВИДИТ: ограниченный файл до чужой сетки просто не
   * доезжает, поэтому бейдж здесь ничего не выдаёт — он объясняет, почему файла не видит сосед.
   * `team` не помечается: обычное состояние не бейджат, иначе бейдж перестаёт что-либо значить.
   */
  const level = asAccessLevel(file.accessLevel ?? undefined);
  const comments = Number(file.commentsCount ?? 0);

  return (
    <div
      className={cn(
        'group relative flex h-full min-w-0 flex-col border border-borderColor bg-bgColor',
        selected && 'outline outline-2 -outline-offset-2 outline-textColor',
      )}
    >
      {/* ИНИЦИАЛЫ ЗАГРУЗИВШЕГО ДЕЛЯТ УГОЛ С ЧЕКБОКСОМ, и в споре чекбокс выигрывает: отметка
          выбора — действие, инициалы — справка, а два глифа в одной точке читаются как один
          сломанный. Поэтому инициалы гаснут ровно тогда, когда чекбокс проявляется: на
          наведении, на фокусе внутри плитки и на выбранной плитке. Решается здесь, в
          примитиве плитки, а не на холсте — иначе каждый следующий экран решал бы заново. */}
      {uploader && (
        <span
          // `aria-hidden`, потому что это ГЛИФ, а не текст: без него скринридер читает
          // болтающиеся посреди плитки две буквы «АЛ». Имя загрузившего целиком уезжает в
          // `aria-label` кнопки ниже — там оно стоит рядом с именем файла, к которому
          // относится.
          aria-hidden
          className={cn(
            'pointer-events-none absolute left-1 top-1 z-10 transition-opacity',
            selectable && 'group-hover:opacity-0 group-focus-within:opacity-0',
            selected && 'opacity-0',
          )}
        >
          <Avatar name={uploader} size={16} />
        </span>
      )}

      {selectable && (
        <button
          type='button'
          aria-pressed={!!selected}
          aria-label={selected ? `убрать из выбора ${name}` : `выбрать ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
          className={cn(
            // z-20 — локальный стек ПЛИТКИ, а не слой страницы: поднимает отметку над кадром
            // внутри одной карточки.
            'absolute left-1 top-1 z-20 flex size-3.5 items-center justify-center border transition-opacity',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            selected
              ? 'border-textColor bg-textColor text-bgColor opacity-100'
              : 'border-borderColor bg-bgColor opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
        >
          {selected && <span className='text-nano leading-none'>✓</span>}
        </button>
      )}

      <button
        type='button'
        onClick={onOpen}
        // Имя загрузившего дописано к подсказке и к имени самой плитки, а не повешено на
        // инициалы: у инициалов `pointer-events-none` (иначе прозрачный кружок съедал бы клик
        // по углу превью), своей подсказки у них быть не может — а «кто такой AL» спрашивают
        // ровно на наведении.
        title={uploader ? `${name}\nзагрузил ${uploader}` : name}
        aria-label={uploader ? `${name} · загрузил ${uploader}` : name}
        className='relative block w-full cursor-pointer bg-bgSecondary focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
      >
        {file.previewUrl ? (
          <img
            src={file.previewUrl}
            alt=''
            loading='lazy'
            onError={() => onPreviewError?.(file.previewUrl ?? '')}
            className='aspect-square w-full object-contain'
          />
        ) : (
          // ЗАКОНЧЕННОЕ СОСТОЯНИЕ, А НЕ ЗАГРУЗКА. У .zip и .step первой страницы не
          // существует — спиннера здесь не будет никогда, иначе плитка вечно выглядит
          // недогруженной.
          <span className='flex aspect-square w-full flex-col items-center justify-center gap-0.5'>
            {/* 12px жирным, а не `size='stat'`: stat — кегль стат-ячейки (16px), и вне её он
                пробивает 12px-потолок DESIGN.md. Это было единственное такое место раздела. */}
            <Text component='span' className='font-bold uppercase'>
              {ext}
            </Text>
            <Text size='micro' variant='label' component='span' className='uppercase'>
              {failed ? 'превью не вышло' : kindWord(file.contentType ?? undefined, name)}
            </Text>
          </span>
        )}
        {/* ОДНА ПОЛОСА НА ДВЕ ПЛАШКИ, а не две абсолютные метки в противоположных углах: на
            узкой плитке (сетка вложений задачи начинается со 130px) «обсуждение · 128» и
            шестибуквенное расширение наезжали бы друг на друга двумя чёрными прямоугольниками.
            Расширение неприкосновенно и стоит справа, счётчик слева жмётся и обрезается.

            Счётчик — НАД КАДРОМ, а не в подвале плитки: подвал у плитки в одну строку, и
            четвёртый элемент в нём переносил бы её ровно у тех файлов, которые обсуждают, то
            есть у самых нужных. Ноль не печатается: «0 реплик» это не факт, а шум.
            «обсуждение · N», а не «N реплик»: склонение при числе живёт в модуле очереди
            загрузки, и тащить её машину в плитку ради одного слова — плохой обмен. */}
        <span className='pointer-events-none absolute inset-x-1 bottom-1 flex items-end justify-between gap-1'>
          {comments > 0 ? (
            <Text
              size='nano'
              component='span'
              title={`реплик в обсуждении: ${comments}`}
              className='min-w-0 truncate bg-textColor px-1 uppercase text-bgColor tabular-nums'
            >
              обсуждение · {comments}
            </Text>
          ) : (
            <span />
          )}
          {/* Бейдж расширения поверх кадра: у картинки и pdf превью показывает содержимое, а
              чем файл открывать — нет. На плашке он избыточен, но снимать его там значило бы
              держать две разные плитки. */}
          <Text
            size='nano'
            component='span'
            className='flex-none bg-textColor px-1 uppercase text-bgColor'
          >
            {ext}
          </Text>
        </span>
      </button>

      <div className='flex min-w-0 flex-col gap-0.5 border-t border-hairline px-1.5 py-1'>
        {/* Имя БЕЗ расширения: оно уже стоит бейджем, а «.pdf» в конце каждого второго имени
            съедает ровно те символы, которыми одна раскладка отличается от другой. */}
        <Text size='micro' component='span' className='truncate font-bold uppercase'>
          {stemOf(name)}
        </Text>
        <span className='flex min-w-0 flex-wrap items-center gap-1.5'>
          <Text size='micro' variant='label' component='span' className='flex-none tabular-nums'>
            {formatBytes(Number(file.sizeBytes ?? 0))}
          </Text>
          {noTopics && (
            <Pill tone='warn' className='flex-none'>
              без темы
            </Pill>
          )}
          {level === 'link' && (
            <Pill tone='attention' className='flex-none' title='файл открыт по публичной ссылке'>
              по ссылке
            </Pill>
          )}
          {level === 'people' && (
            <Pill tone='ink' className='flex-none' title='файл виден только перечисленным людям'>
              ограничен
            </Pill>
          )}
        </span>
        {children}
      </div>
    </div>
  );
}
