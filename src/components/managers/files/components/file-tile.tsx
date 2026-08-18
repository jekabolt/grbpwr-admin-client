import type { LibraryFile } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Avatar } from 'ui/components/avatar';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { ACCESS_LEVEL_BADGE, asAccessLevel } from '../api/accessService';
import { extensionOf, formatBytes, kindWord, previewExpected, stemOf } from '../utils/format';
import { isMarkdownNote } from '../utils/reader-find';

/**
 * У ФАЙЛА ЕСТЬ ПУТЬ ПРОСМОТРА ИЛИ ЕГО НЕТ — и решает это одно правило на весь раздел.
 *
 * Заметку показывает свой экран (`text/markdown` сервер сознательно не отдаёт inline, поэтому
 * `url` у неё пуст и без этой ветки заметка выглядела бы файлом без просмотра). Всем остальным
 * просмотр даёт `url`: у svg и html его нет намеренно — браузер выполнил бы их на origin
 * бакета, — и обещать «посмотреть» там нельзя.
 *
 * Экспортируется, потому что то же правило нужно вызывающей стороне: она пишет САМО открытие
 * (новая вкладка или маршрут заметки), а плитка — подпись и мишень. Две копии условия
 * разошлись бы молча: подпись обещала бы «view», а щелчок открывал карточку.
 */
export function hasViewPath(file: LibraryFile): boolean {
  const name = file.fileName ?? '';
  return isMarkdownNote(name, file.contentType ?? undefined) || !!file.url;
}

/**
 * Плитка холста.
 *
 * `div`, а не `Tile`: внутри живут собственные кнопки (выбор, «построить заново»), а кнопка
 * внутри кнопки — невалидная разметка, которую браузер разбирает по-своему и разносит сетку.
 * По той же причине выделение рисуется `outline`, а не вторым пикселем рамки: `border-2`
 * менял бы ширину плитки, а высота кадра считается от неё — ряд дёргался бы на каждом щелчке.
 *
 * ДВЕ ПОЛОВИНЫ, А НЕ ОДНА КНОПКА. Кадр смотрит файл, подвал открывает сведения: до этого
 * плитка умела ровно одно — открыть карточку, — и посмотреть сам файл можно было только через
 * неё. Обе половины — обычные мишени, ничего не спрятано за наведением: на сенсоре наведения
 * нет, а «скрытый путь» здесь означал бы, что просмотра нет вовсе.
 *
 * Подвал становится кнопкой ТОЛЬКО там, где второй путь действительно предложен (`onView`).
 * У вложений карточки задачи его нет — там плитка отдаёт файл ОДНИМ жестом, и вторая кнопка
 * с тем же самым действием удвоила бы число остановок табуляции, не добавив ни одного пути.
 */
export function FileTile({
  file,
  selected,
  selectable,
  onToggleSelect,
  onDetails,
  onView,
  onPreviewError,
  children,
}: {
  file: LibraryFile;
  selected?: boolean;
  /** Выбор доступен вообще (сам режим), независимо от того, выбран ли этот файл. */
  selectable?: boolean;
  onToggleSelect?: () => void;
  /** Открыть карточку файла. Единственное действие плитки там, где `onView` не передан. */
  onDetails: () => void;
  /**
   * Показать САМ файл. Не передаётся — плитка остаётся односоставной (вложения задачи).
   * Зовётся только когда путь просмотра есть (`hasViewPath`): у .zip без ссылки кадр честно
   * открывает карточку и подписан «details», потому что показывать там нечего.
   */
  onView?: () => void;
  /**
   * Превью не открылось. Почти всегда это протухшая presigned-ссылка, а не порча файла.
   * Отдаётся именно адрес: перепрашивать выдачу можно один раз на адрес, иначе по-настоящему
   * битый объект гоняет её по кругу.
   */
  onPreviewError?: (url: string) => void;
  /** Досыл под подвал плитки — кнопка «построить заново» у состояния «превью не вышло». */
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
  const badge = level ? ACCESS_LEVEL_BADGE[level] : undefined;
  const comments = Number(file.commentsCount ?? 0);
  /**
   * Выдержка заметки вместо кадра. Пустая у `.md`, залитого ФАЙЛОМ, а не набранного в
   * редакторе: сервер не читает содержимое на пути загрузки, и колонка дозаполнится первым
   * сохранением через экран заметки. Пустая строка здесь и означает «показывай расширение»,
   * поэтому проверка на `trim`, а не на наличие поля.
   */
  const excerpt = isMarkdownNote(name, file.contentType ?? undefined)
    ? (file.contentExcerpt ?? '').trim()
    : '';

  // Разделена ли плитка надвое. Не «есть ли у файла превью» и не «можно ли его посмотреть»:
  // это вопрос к ЭКРАНУ — предлагает ли он второй путь вообще.
  const split = !!onView;
  const viewable = split && hasViewPath(file);
  // ПОДПИСЬ НЕ ОБЕЩАЕТ БОЛЬШЕ, ЧЕМ СДЕЛАЕТ ЩЕЛЧОК. У файла без пути просмотра кадр открывает
  // карточку — и говорит «details», а не «view».
  const frameWord = viewable ? 'view' : 'details';
  // «details OF имя», а не «details имя»: обе половины называются одинаково ровно тогда, когда
  // делают одно и то же, и разночтение в предлоге читалось бы как разные действия.
  const frameLabel = split
    ? `${viewable ? `view ${name}` : `details of ${name}`}${
        uploader ? ` · uploaded by ${uploader}` : ''
      }`
    : uploader
      ? `${name} · uploaded by ${uploader}`
      : name;

  // Тело подвала одно на обе раскладки: кнопкой он становится или остаётся `div`, но читается
  // одинаково. Две копии этой разметки разошлись бы на первой же правке.
  const foot = (
    <>
      {/* Имя БЕЗ расширения: оно уже стоит бейджем, а «.pdf» в конце каждого второго имени
          съедает ровно те символы, которыми одна раскладка отличается от другой. */}
      <Text
        size='micro'
        component='span'
        className={cn('truncate font-bold uppercase', split && 'group-hover/foot:text-bgColor')}
      >
        {stemOf(name)}
      </Text>
      <span className='flex min-w-0 flex-wrap items-center gap-1.5'>
        <Text
          size='micro'
          variant='label'
          component='span'
          className={cn('flex-none tabular-nums', split && 'group-hover/foot:text-bgColor')}
        >
          {formatBytes(Number(file.sizeBytes ?? 0))}
        </Text>
        {noTopics && (
          <Pill tone='warn' className='flex-none'>
            no topic
          </Pill>
        )}
        {/* Слово, цвет и подсказка — из ACCESS_LEVEL_BADGE: тот же бейдж стоит на витрине
            открытого и в шапке блока доступа, и три вписанных строками копии расходились бы
            молча. */}
        {!!badge && (
          <Pill tone={badge.tone} className='flex-none' title={badge.title}>
            {badge.label}
          </Pill>
        )}
      </span>
    </>
  );

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
          aria-label={selected ? `remove ${name} from the selection` : `select ${name}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
          className={cn(
            // z-20 — локальный стек ПЛИТКИ, а не слой страницы: поднимает отметку над кадром
            // внутри одной карточки.
            'absolute left-1 top-1 z-20 flex size-3.5 min-w-0 max-w-full items-center justify-center border transition-opacity',
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
        onClick={viewable ? onView : onDetails}
        // Имя загрузившего дописано к подсказке и к имени самой плитки, а не повешено на
        // инициалы: у инициалов `pointer-events-none` (иначе прозрачный кружок съедал бы клик
        // по углу превью), своей подсказки у них быть не может — а «кто такой AL» спрашивают
        // ровно на наведении.
        title={uploader ? `${name}\nuploaded by ${uploader}` : name}
        aria-label={frameLabel}
        // `min-w-0 max-w-full` — ЛОВУШКА ПРИМИТИВА, а не украшение: `button` меряется по
        // содержимому, вылезает за колонку грида и ложится поверх соседней плитки, а `truncate`
        // внутри неё при этом молчит — обрезать нечего, разъехалась сама коробка.
        className='group/frame relative block w-full min-w-0 max-w-full cursor-pointer overflow-hidden bg-bgSecondary focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
      >
        {file.previewUrl ? (
          <img
            src={file.previewUrl}
            alt=''
            loading='lazy'
            onError={() => onPreviewError?.(file.previewUrl ?? '')}
            className='aspect-square w-full object-contain'
          />
        ) : excerpt ? (
          // ИСКЛЮЧЕНИЕ ИЗ «У КОГО НЕТ КАДРА — ТОТ ПОКАЗЫВАЕТ РАСШИРЕНИЕ»: у заметки картинки
          // нет и не будет, но есть текст, и первые строки отвечают на вопрос «что это»
          // лучше, чем глиф «MD» на всех заметках сразу. Выравнивание по левому краю, а не по
          // центру, — это текст, а не метка.
          //
          // Обрезка строками, а не символами: `line-clamp` считает по отрисованным строкам,
          // поэтому одинаково выглядит и на узкой плитке вложений задачи (от 130px), и на
          // широкой холста. Сервер и так режет выдержку по 500 символов.
          <span className='flex aspect-square w-full flex-col justify-start overflow-hidden p-2'>
            <Text
              size='micro'
              variant='label'
              component='span'
              className='line-clamp-[9] whitespace-pre-wrap break-words text-left'
            >
              {excerpt}
            </Text>
          </span>
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
              {failed ? 'preview failed' : kindWord(file.contentType ?? undefined, name)}
            </Text>
          </span>
        )}
        {/* ПОДПИСЬ, НАЗЫВАЮЩАЯ КУДА УЙДЁТ ЩЕЛЧОК. По центру кадра, а не полосой у нижней
            кромки, как в прототипе: там оба нижних угла свободны, а здесь в них уже стоят
            счётчик обсуждения и бейдж расширения — полоса легла бы поверх них.

            `aria-hidden` и `pointer-events-none`: доступное имя кнопки уже сказано `aria-label`,
            второй раз читать его незачем, а перехватывать собственный клик подпись не должна. */}
        {split && (
          <span
            aria-hidden
            className='pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-textColor bg-bgColor px-1.5 py-0.5 text-nano uppercase tracking-pill opacity-0 transition-opacity group-hover/frame:opacity-100 group-focus-visible/frame:opacity-100 motion-reduce:transition-none'
          >
            {frameWord}
          </span>
        )}
        {/* ОДНА ПОЛОСА НА ДВЕ ПЛАШКИ, а не две абсолютные метки в противоположных углах: на
            узкой плитке (сетка вложений задачи начинается со 130px) «обсуждение · 128» и
            шестибуквенное расширение наезжали бы друг на друга двумя чёрными прямоугольниками.
            Расширение неприкосновенно и стоит справа, счётчик слева жмётся и обрезается.

            Счётчик — НАД КАДРОМ, а не в подвале плитки: подвал у плитки в одну строку, и
            четвёртый элемент в нём переносил бы её ровно у тех файлов, которые обсуждают, то
            есть у самых нужных. Ноль не печатается: «0 replies» это не факт, а шум.
            «discussion · N», а не «N replies»: склонение при числе живёт в модуле очереди
            загрузки, и тащить её машину в плитку ради одного слова — плохой обмен. */}
        <span className='pointer-events-none absolute inset-x-1 bottom-1 flex items-end justify-between gap-1'>
          {comments > 0 ? (
            <Text
              size='nano'
              component='span'
              title={`replies in the discussion: ${comments}`}
              className='min-w-0 truncate bg-textColor px-1 uppercase text-bgColor tabular-nums'
            >
              discussion · {comments}
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

      {split ? (
        <button
          type='button'
          onClick={onDetails}
          aria-label={`details of ${name}`}
          // Мишень под палец: 34px — не украшение, а нижняя граница, на которой большой палец
          // попадает в подвал, а не в кадр над ним.
          //
          // Инверсия на наведении — единственное, чем разделённая плитка объясняет себя на
          // глаз: без неё подвал выглядит подписью, а не второй половиной.
          className='group/foot flex min-h-[34px] w-full min-w-0 max-w-full flex-col gap-0.5 overflow-hidden border-t border-hairline px-1.5 py-1 text-left hover:bg-textColor focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor'
        >
          {foot}
        </button>
      ) : (
        <div className='flex min-w-0 flex-col gap-0.5 border-t border-hairline px-1.5 py-1'>
          {foot}
        </div>
      )}

      {/* ДОСЫЛ — СОСЕД ПОДВАЛА, А НЕ ЕГО СОДЕРЖИМОЕ. Внутри едет «построить заново», то есть
          кнопка, а кнопка внутри кнопки — невалидная разметка: React её отрисует, а щелчок по
          ней уйдёт и в неё, и в подвал, открыв карточку поверх начатой перестройки. */}
      {!!children && <div className='flex min-w-0 flex-col px-1.5 pb-1'>{children}</div>}
    </div>
  );
}
