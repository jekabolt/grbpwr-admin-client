import { useQueryClient } from '@tanstack/react-query';
import type { LibraryFile } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { FileTile } from 'components/managers/files/components/file-tile';
import { ROUTES, SECTION } from 'constants/routes';
import { useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MediaViewer, useMediaViewer, type MediaViewerItem } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import type { TaskMedia } from '../api/types';
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
 */
export function AttachmentTiles({
  taskId,
  media,
  files,
}: {
  taskId: number;
  media: TaskMedia[];
  files: LibraryFile[];
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { canRead } = usePermissions();
  const mayOpenLibrary = canRead(SECTION.files);
  const viewer = useMediaViewer();

  // Кадры БЕЗ адреса выброшены из ряда просмотрщика — иначе стрелка «дальше» листает в пустоту.
  // Поэтому индекс плитки и индекс в просмотрщике — РАЗНЫЕ числа, и связь между ними держится
  // здесь, одним проходом: считать их порознь значит однажды открыть не тот снимок.
  const { items, viewerIndex } = useMemo(() => {
    const list: MediaViewerItem[] = [];
    const index = new Map<number, number>();
    media.forEach((m, i) => {
      const src = m.fullSize || m.thumbnail || '';
      if (!src) return;
      index.set(i, list.length);
      list.push({ src, thumbnail: m.thumbnail, alt: '', meta: { id: m.id, blurhash: m.blurhash } });
    });
    return { items: list, viewerIndex: index };
  }, [media]);

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
    if (mayOpenLibrary) {
      navigate(`${ROUTES.files}/${f.id}`);
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
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className='flex flex-col gap-2'>
      {/* 130, а не 190 как на холсте раздела: колонка задачи вдвое уже страницы файлов, и на
          190 в ряд встают три плитки вместо четырёх. Четыре — это обещание самой раскладки:
          вложения к задаче смотрят «сколько их и что это», а не читают по одному. */}
      <Tiles min={130}>
        {media.map((m, i) => {
          const thumb = m.thumbnail || m.fullSize || '';
          const at = viewerIndex.get(i);
          return (
            <div
              key={`m-${m.id}`}
              className='flex h-full min-w-0 flex-col border border-borderColor bg-bgColor'
            >
              <button
                type='button'
                disabled={at === undefined}
                title='медиа сайта · публичное'
                aria-label={`медиа ${i + 1} из ${media.length} · публичное`}
                onClick={() => at !== undefined && viewer.openAt(at)}
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
                      нет кадра
                    </Text>
                  </span>
                )}
                {/* Бейдж в том же углу, что расширение у файла: угол отвечает на один вопрос —
                    «что это за штука», — и ответ должен стоять на одном месте в обоих рядах. */}
                <Text
                  size='nano'
                  component='span'
                  className='absolute bottom-1 right-1 bg-textColor px-1 uppercase text-bgColor'
                >
                  медиа
                </Text>
              </button>
              <div className='flex min-w-0 flex-col gap-0.5 border-t border-hairline px-1.5 py-1'>
                {/* «Публичное» — не украшение, а разница «увидит покупатель» / «не увидит»:
                    медиа уезжает на CDN сайта, файл библиотеки лежит в приватном бакете.
                    Пилюля чёрная, а не цветная: это факт, а не состояние. */}
                <Pill tone='ink' className='self-start'>
                  публичное
                </Pill>
              </div>
            </div>
          );
        })}

        {files.map((f) => (
          <FileTile
            key={`f-${f.id}`}
            file={f}
            onOpen={() => openFile(f)}
            onPreviewError={onPreviewError}
          />
        ))}
      </Tiles>

      {media.length > 0 && (
        <Text size='micro' variant='label'>
          медиа помечено в углу: оно публичное и уедет на сайт, файлы библиотеки — приватные.
        </Text>
      )}
      {files.length > 0 && !mayOpenLibrary && (
        <Text size='micro' variant='label'>
          раздел «файлы» вам не открыт: плитка файла отдаёт его на скачивание, карточка не
          откроется.
        </Text>
      )}

      {items.length > 0 && <MediaViewer items={items} {...viewer} />}
    </div>
  );
}
