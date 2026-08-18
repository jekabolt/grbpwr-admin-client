import { useQueryClient } from '@tanstack/react-query';
import type { LibraryFile } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FileTile } from 'components/managers/files/components/file-tile';
import { ROUTES, SECTION } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useRef } from 'react';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import type { TaskMedia, TaskMediaAnnotations } from '../api/types';
import { annotationsOf, NotesMark } from '../components/task-media-viewer';
import { tasksKeys } from '../hooks/useTasks';

/**
 * Вложения задачи ПЛИТКАМИ (`task.v2`).
 *
 * Строками это было списком документов: имя целиком, размер, кнопка — примерно 30px на файл,
 * и на пяти вложениях карточка задачи вырастала на экран. А вложение к задаче почти всегда
 * макет, и макет узнают ГЛАЗАМИ: имя можно обрезать, кадр — нет.
 *
 * Плитка файла берётся из раздела «файлы» (`FileTile`) целиком, а не переписывается здесь:
 * это один и тот же объект в двух местах, и вторая грамматика плитки означала бы, что
 * пришедший из библиотеки человек заново учится читать ту же карточку. Отсюда же и
 * `LibraryFile` в модели задачи (`api/types.ts`): урезанный вид пришлось бы разворачивать
 * обратно фальшивым `LibraryFile` на этом вызове.
 *
 * Медиа рисуется здесь, потому что общего объекта с библиотекой у него нет: у медиа только
 * кадры и id. Плитка сделана ПО ТОЙ ЖЕ разметке (кадр 1:1 → бейдж в углу → подвал за
 * волосяной линией), иначе ряд читался бы как два разных списка.
 *
 * ЯЗЫК ЭКРАНА, А НЕ ЯЗЫК ВОЛНЫ. Раздел «файлы» русский целиком, экран задач — английский
 * целиком, и граница проходит по разделу: русская подпись под английской шапкой это ровно то
 * смешение, от которого правило и защищает. Поэтому интерфейсные строки ЗДЕСЬ английские
 * строчными, как у соседних блоков задачи. Импортированная плитка `FileTile` остаётся русской:
 * она чужая и живёт по правилам своего раздела.
 */
export function AttachmentTiles({
  taskId,
  media,
  files,
  annotations,
  onOpenMedia,
}: {
  taskId: number;
  media: TaskMedia[];
  files: LibraryFile[];
  /**
   * Указания на снимках. Плитка их только СЧИТАЕТ — рисуют в модалке правки, где есть явная
   * кнопка сохранения.
   */
  annotations: TaskMediaAnnotations[];
  /**
   * Открыть кадр. Просмотрщика у плиток СВОЕГО НЕТ и не должно быть: на этой странице к
   * вложению ведут три двери — плитка, ссылка посреди описания и ссылка из комментария, — и
   * второй просмотрщик означал бы, что выделенное по ссылке указание видно в одном из них, а
   * открытый плиткой кадр про ссылки не знает. Индекс — позиция в `media`, ровно та же, по
   * которой считает `useTaskMediaViewer`.
   */
  onOpenMedia: (index: number) => void;
}) {
  const qc = useQueryClient();
  const { canRead } = usePermissions();
  const mayOpenLibrary = canRead(SECTION.files);
  const { showMessage } = useSnackBarStore();

  // ПРОТУХШАЯ ПОДПИСЬ — НЕ ПОЛОМКА. Превью файла библиотеки приезжает подписанной ссылкой на
  // 6–12 часов, а вкладку с задачей держат открытой дольше. Первый же сорвавшийся `<img>`
  // перезапрашивает ТОТ ЖЕ ответ, который её выдал (GetTask), и плитка перерисовывается на
  // месте. Задвижка по адресу, а не по времени: у по-настоящему битого объекта `onError`
  // возвращается и после перевыдачи, и без неё это вечный цикл запросов.
  const relinked = useRef<Set<string>>(new Set());
  const onPreviewError = useCallback(
    (url: string) => {
      if (!url || relinked.current.has(url)) return;
      relinked.current.add(url);
      qc.invalidateQueries({ queryKey: tasksKeys.detail(taskId) });
    },
    [qc, taskId],
  );

  const openFile = (f: LibraryFile) => {
    // Открытие файла ведёт В РАЗДЕЛ ФАЙЛОВ, к его карточке: там живут темы, ответственные,
    // обсуждение и читалка, и держать их вторую копию в задаче незачем.
    //
    // СОСЕДНЯЯ ВКЛАДКА, а не переход на месте — тот же довод, что у ссылок на задачи из
    // карточки файла. Уход по маршруту размонтирует страницу задачи вместе с её локальным
    // состоянием, а там живёт набранная, но не отправленная реплика (`task-comments.tsx`
    // держит черновик в `useState`): она исчезла бы молча, без единого вопроса. Плюс на
    // вложение смотрят В ХОДЕ работы над задачей — уводить с неё незачем.
    if (mayOpenLibrary) {
      window.open(`${ROUTES.files}/${f.id}`, '_blank', 'noopener,noreferrer');
      return;
    }
    // Без `files:read` карточка ответила бы «нет прав» — тупик на ровном месте. Вложение при
    // этом видеть МОЖНО (сервер выдал его на tasks:read вместе с задачей), поэтому плитка
    // отдаёт сам файл по подписанной ссылке из этого же ответа.
    //
    // `url` пустой у svg и html: браузер выполнил бы их на origin бакета, и сервер сознательно
    // не даёт им ссылки для просмотра. Клиент это уважает и берёт `downloadUrl` — то есть
    // скачивание, а не показ. Аллоулист живёт на сервере; угадывать его здесь нельзя.
    const url = f.url || f.downloadUrl;
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    // Ни адреса просмотра, ни адреса скачивания — сервер не выдал ни одного. Молчащий щелчок
    // человек читает как «сломалась мышь» и жмёт ещё десять раз. Сказать «попробуйте в разделе
    // файлов» нельзя: сюда попадают ровно те, у кого этого раздела нет.
    showMessage('this file came without a link — nothing to open', 'error');
  };

  return (
    <div className='flex flex-col gap-2'>
      {/* 130, а не 190 как на холсте раздела: колонка задачи вдвое уже страницы файлов, и на
          190 в ряд встают три плитки вместо четырёх. Четыре — это обещание самой раскладки:
          вложения к задаче смотрят «сколько их и что это», а не читают по одному. */}
      <Tiles min={130}>
        {media.map((m, i) => {
          const thumb = m.thumbnail || m.fullSize || '';
          // Кадр без единого адреса открыть нечем: просмотрщик показал бы пустоту. Плитка
          // остаётся видимой (вложение существует, и молчаливо исчезнуть оно не должно), но
          // выключена — ровно как было до объединения с указаниями.
          const openable = !!(m.fullSize || m.thumbnail);
          const notes = annotationsOf(annotations, m.id ?? 0).length;
          return (
            // КЛЮЧ С ПОЗИЦИЕЙ, как в форме правки (`media-attachments.tsx`): один и тот же
            // media_id может прийти с провода дважды, и одинаковые ключи React'а перепутали бы
            // плитки местами — а позиция здесь ещё и адрес кадра в просмотрщике.
            <div
              key={`m-${i}-${m.id}`}
              className='flex h-full min-w-0 flex-col border border-borderColor bg-bgColor'
            >
              <button
                type='button'
                disabled={!openable}
                title='site media · public'
                aria-label={
                  notes
                    ? `media ${i + 1} of ${media.length} · public · ${notes} notes`
                    : `media ${i + 1} of ${media.length} · public`
                }
                onClick={() => openable && onOpenMedia(i)}
                className='relative block w-full cursor-zoom-in bg-bgSecondary focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor disabled:cursor-default'
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt=''
                    loading='lazy'
                    className='aspect-square w-full object-contain'
                  />
                ) : (
                  <span className='flex aspect-square w-full items-center justify-center'>
                    <Text size='micro' variant='label' component='span' className='uppercase'>
                      no image
                    </Text>
                  </span>
                )}
                {/* Отметка указаний — В ЛЕВОМ углу, потому что правый занят ответом на вопрос
                    «что это за штука», и он один на оба ряда. Ставится ТОЛЬКО когда есть что
                    отмечать: пустая отметка на каждой плитке перестаёт что-либо значить.

                    ПОДЛОЖКА ОБЯЗАТЕЛЬНА. Отметка чернильная и лежит ПОВЕРХ снимка, а GRBPWR
                    снимает много чёрного: без заливки «notes 3» пропадает на кадре целиком.
                    В галерее, откуда отметку сюда перенесли, она стояла на белой полосе у
                    нижней кромки плитки — и полоса была не украшением, а этим самым фоном.
                    Белая плашка, а не чёрная как у бейджа: два одинаково чёрных
                    прямоугольника в одной полосе читались бы как один разорванный. */}
                {notes > 0 && (
                  <span className='absolute bottom-1 left-1 bg-bgColor px-1'>
                    <NotesMark count={notes} />
                  </span>
                )}
                {/* Бейдж в том же углу, что расширение у файла: угол отвечает на один вопрос —
                    «что это за штука», — и ответ должен стоять на одном месте в обоих рядах. */}
                <Text
                  size='nano'
                  component='span'
                  className='absolute bottom-1 right-1 bg-textColor px-1 uppercase text-bgColor'
                >
                  media
                </Text>
              </button>
              <div className='flex min-w-0 flex-col gap-0.5 border-t border-hairline px-1.5 py-1'>
                {/* «Публичное» — не украшение, а разница «увидит покупатель» / «не увидит»:
                    медиа уезжает на CDN сайта, файл библиотеки лежит в приватном бакете.
                    Пилюля чёрная, а не цветная: это факт, а не состояние. */}
                <Pill tone='ink' className='self-start'>
                  public
                </Pill>
              </div>
            </div>
          );
        })}

        {files.map((f) => (
          // ОДИН ПУТЬ, А НЕ ДВА. На холсте библиотеки плитка разделена надвое — кадр смотрит
          // файл, подвал открывает карточку, — и вторую половину включает проп `onView`.
          // Здесь его нет намеренно: у вложения задачи оба жеста ведут в одно и то же место
          // (`openFile` сам решает, карточка это или сам файл — по праву на раздел), и вторая
          // кнопка с тем же действием просто удвоила бы число остановок табуляции на карточке
          // задачи, где вложений бывает десяток.
          <FileTile
            key={`f-${f.id}`}
            file={f}
            onDetails={() => openFile(f)}
            onPreviewError={onPreviewError}
          />
        ))}
      </Tiles>

      {media.length > 0 && (
        <Text size='micro' variant='label'>
          media is badged in the corner: it goes out to the site, library files stay private.
        </Text>
      )}
      {files.length > 0 && !mayOpenLibrary && (
        <Text size='micro' variant='label'>
          the files section is closed to you: a file tile hands you the file itself, its card
          won’t open.
        </Text>
      )}
    </div>
  );
}
