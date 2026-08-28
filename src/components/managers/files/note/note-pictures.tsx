import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MediaViewer,
  ViewerAction,
  useMediaViewer,
  type MediaViewerItem,
} from 'ui/components/media-viewer';
import type { MarkdownPicture } from 'ui/markdown/doc';
import {
  fileCardPath,
  fileRefImageSrc,
  NOTE_PICTURE_FRAME,
  NOTE_PICTURE_IMAGE,
  useFileRefs,
} from './file-refs';

/**
 * КАРТИНКИ ЗАМЕТКИ КАК ОДИН РЯД, А НЕ КАК РОССЫПЬ ОДИНОЧЕК.
 *
 * Нажатие на снимок открывает увеличенный вид — тот же `MediaViewer`, что и в медиатеке, со
 * своими жестами масштаба, лентой и стрелками. Ряд собран по ВСЕМУ документу в порядке чтения,
 * поэтому из открытого снимка листается к следующему снимку заметки, а не только к самому себе:
 * заметка со списком тканей — это по сути галерея, и разглядывать её по одной картинке, каждый
 * раз возвращаясь в текст, было бы работой вместо просмотра.
 *
 * ОДИН РЯД НА ДОКУМЕНТ, А НЕ ХУК НА КАЖДУЮ КАРТИНКУ — по той же причине, по какой в одном месте
 * собран резолв файлов (`file-refs.tsx`): иначе у каждого снимка была бы своя копия состояния
 * просмотрщика, и «следующий» не значил бы ничего.
 *
 * КЛЮЧ, А НЕ ПОРЯДКОВЫЙ НОМЕР, — адрес места в ряду. Номер пришлось бы протаскивать через
 * разметчик счётчиком, живущим между вызовами `inline()`, а он вызывается построчно и в порядке,
 * который разметчик менять вправе. Ключ («f:12» для файла библиотеки, «u:<адрес>» для внешнего)
 * вычисляется из самого токена, поэтому одна и та же картинка, встреченная дважды, ведёт в одно
 * место ряда — что и значит «это тот же снимок».
 */
/** Место снимка в документе. Тип НЕ свой: его строит разбор разметки, и второе описание той же
 * записи разошлось бы с ним молча. Имя оставлено прежним — им пользуется весь экран заметки. */
export type NotePicture = MarkdownPicture;

type Ctx = {
  openAt: (key: string) => void;
  has: (key: string) => boolean;
  /** Снимок не открылся — вон из ряда. */
  reportBroken: (key: string) => void;
};

const NotePicturesContext = createContext<Ctx>({
  openAt: () => {},
  has: () => false,
  reportBroken: () => {},
});

/** Открыть увеличенный вид на своём снимке. Вне провайдера — пустая операция, не падение. */
export function useNotePictures(): Ctx {
  return useContext(NotePicturesContext);
}

export function NotePicturesProvider({
  pictures,
  children,
}: {
  pictures: NotePicture[];
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const refs = useFileRefs();
  const viewer = useMediaViewer();
  // Адреса, которые не открылись. Про файл библиотеки это известно из резолва ДО показа, а про
  // чужой адрес — только когда браузер попробовал: узнаём от самой картинки.
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const reportBroken = useCallback(
    (key: string) => setBroken((prev) => (prev.has(key) ? prev : new Set(prev).add(key))),
    [],
  );

  // Снимки, у которых показывать нечего, из ряда ВЫПАДАЮТ, а не встают пустым кадром: файл
  // библиотеки может ещё читаться, оказаться удалённым или быть из тех, что сервер сознательно
  // отдаёт только скачиванием. Пустой кадр в ленте — обещание картинки, которой нет.
  const shown = useMemo(
    () =>
      pictures
        .map((p) => ({
          picture: p,
          src: p.href ?? (p.fileId !== undefined ? fileRefImageSrc(refs.get(p.fileId)) : ''),
        }))
        .filter((r) => !!r.src && !broken.has(r.picture.key)),
    [pictures, refs, broken],
  );

  const items = useMemo<MediaViewerItem[]>(
    () => shown.map((r) => ({ src: r.src, alt: r.picture.label, type: 'image' })),
    [shown],
  );

  const openAt = useCallback(
    (key: string) => {
      const at = shown.findIndex((r) => r.picture.key === key);
      if (at >= 0) viewer.openAt(at);
    },
    [shown, viewer],
  );

  const has = useCallback((key: string) => shown.some((r) => r.picture.key === key), [shown]);

  const ctx = useMemo<Ctx>(() => ({ openAt, has, reportBroken }), [openAt, has, reportBroken]);

  return (
    <NotePicturesContext.Provider value={ctx}>
      {children}
      <MediaViewer
        items={items}
        {...viewer}
        // У снимка библиотеки остаётся дорога на его карточку: раньше она была самим нажатием на
        // картинку, и молча забрать её, заменив зумом, значило бы обменять одно на другое.
        actions={(_item, index) => {
          const id = shown[index]?.picture.fileId;
          if (id === undefined) return null;
          return (
            <ViewerAction
              onClick={() => {
                viewer.onOpenChange(false);
                navigate(fileCardPath(id));
              }}
            >
              open the file card
            </ViewerAction>
          );
        }}
      />
    </NotePicturesContext.Provider>
  );
}

/**
 * Внешний снимок внутри заметки.
 *
 * ЕСЛИ НЕ ОТКРЫЛСЯ — ВОЗВРАЩАЕТСЯ ССЫЛКА, А НЕ БИТЫЙ ЗНАЧОК. Это и есть страховка правила
 * «адрес, похожий на картинку, показывается картинкой»: адрес, который на картинку только похож
 * (отдаёт html, требует входа, уже удалён), не теряет ничего — на его месте оказывается ровно та
 * ссылка, которая стояла бы там без этого правила.
 */
export function NoteImage({
  src,
  label,
  pictureKey,
  fallback,
}: {
  src: string;
  label: string;
  pictureKey: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const { openAt, has, reportBroken } = useNotePictures();
  if (failed) return <>{fallback}</>;
  const zoomable = has(pictureKey);
  const picture = (
    <img
      src={src}
      alt={label}
      loading='lazy'
      // Картинка с чужого хоста — это ещё и маячок: без этого в Referer уезжает адрес страницы
      // админки, а в лог чужого сервера — ip каждого, кто открыл заметку.
      referrerPolicy='no-referrer'
      onError={() => {
        setFailed(true);
        // И ИЗ РЯДА ТОЖЕ. Иначе в ленте просмотрщика остаётся пустой кадр — обещание снимка,
        // которого нет, и «следующий» ведёт в никуда.
        reportBroken(pictureKey);
      }}
      className={NOTE_PICTURE_IMAGE}
    />
  );

  // Кадр той же фиксированной высоты, что и у снимка библиотеки (`NOTE_PICTURE_FRAME`): чужой
  // адрес в заметке — такое же превью, и заводить ему вторую меру высоты значило бы, что ровный
  // ход документа зависит от того, откуда картинка приехала.
  //
  // НАЖАТИЕ — У КАДРА, А НЕ У КАРТИНКИ, и кадр — настоящая кнопка. Широкий снимок вписан по
  // ширине, и сверху-снизу от него остаётся поле кадра: на нём курсор обещал бы увеличение,
  // которого нажатие там не давало бы. Кнопка заодно возвращает клавиатуру — до неё увеличить
  // снимок с клавиш было нельзя вовсе.
  if (!zoomable) return <span className={NOTE_PICTURE_FRAME}>{picture}</span>;
  return (
    <button
      type='button'
      onClick={() => openAt(pictureKey)}
      title={label ? `${label} — enlarge` : 'enlarge'}
      className={`${NOTE_PICTURE_FRAME} cursor-zoom-in`}
    >
      {picture}
    </button>
  );
}
