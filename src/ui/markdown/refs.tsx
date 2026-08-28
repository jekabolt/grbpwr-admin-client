import { createContext, useContext, type ReactNode } from 'react';
import { ROUTES } from 'constants/routes';

/**
 * ЧЕМ РАЗМЕТЧИК РИСУЕТ ССЫЛКИ И КАРТИНКИ — И ПОЧЕМУ ЭТО ВНЕСЕНО СНАРУЖИ.
 *
 * Разметчик один на две площадки: экран заметки в админке и ПУБЛИЧНАЯ страница присланной ссылки
 * (`/f/:token`). Текст, заголовки, списки, таблицы и код у них общие — расходятся ровно три вещи,
 * и все три про ДОСТУП:
 *
 *  1. `![…](/files/12)` — картинка файла библиотеки. В админке она резолвится в свежую подпись
 *     запросом `GetLibraryFile`; публично такого запроса нет и быть не может — он ходит под
 *     админским JWT, а страницу открывает подрядчик без аккаунта. Хуже того: открой такую ссылку
 *     СВОЙ человек в живой сессии — запрос ушёл бы с его правами и показал бы файл, которого
 *     ссылка не отдавала.
 *  2. `/files/12` текстом — адрес карточки внутри админки. Публично это ссылка в никуда: маршрут
 *     защищённый, и клик увёл бы читателя на форму входа.
 *  3. Ряд снимков с увеличением — это `MediaViewer` админки со своими жестами; публичной странице
 *     он не нужен и тянуть его туда незачем.
 *
 * Поэтому здесь описан УЗКИЙ интерфейс этих трёх мест, а не «настройки разметчика»: реализация по
 * умолчанию (`PLAIN_REFS`) ничего не запрашивает и ни на что не ссылается, а админская живёт в
 * `managers/files/note/markdown-view.tsx` вместе с провайдерами, которые её кормят. Публичная
 * страница получает безопасное поведение НЕ ПОТОМУ, что не забыли передать проп, а потому что
 * это и есть значение по умолчанию.
 */

/**
 * Адрес карточки файла. Собирается ИЗ `ROUTES.file`, а не из второй такой же строки — по той же
 * причине, по которой `notePath` живёт в `constants/routes`.
 *
 * Оговорка, которой у `notePath` нет: этот адрес ещё и ЗАПИСЫВАЕТСЯ В ТЕКСТ заметки. Значит
 * шаблон `/files/:id` — часть формата хранения, и менять его придётся вместе с уже написанными
 * заметками, а не одной правкой маршрута.
 */
export function fileCardPath(id: number): string {
  return ROUTES.file.replace(':id', String(id));
}

const REF_PREFIX = ROUTES.file.replace(':id', '');
const REF_RE = new RegExp(`^${REF_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d{1,9})$`);

/**
 * Номер файла из адреса — или `null`, если это не ссылка на файл.
 *
 * СТРОГО: только цифры и ничего после них. Ни `?`, ни `#`, ни хвоста — а значит `/files/1?x=…`
 * и `/files/1/note` сюда не попадают и остаются обычной внутренней ссылкой. Это не педантизм:
 * распознанный адрес получает право стать `<img src>` со СВЕЖЕЙ ПОДПИСЬЮ, и калитка, в которую
 * пролезает произвольный хвост, — это калитка в тот самый `src`. Ограничение длины (девять
 * цифр) закрывает `/files/999…9`, где `Number` теряет точность и запрос уходит не за тем файлом.
 *
 * ПРОБЕЛЫ НЕ СНИМАЮТСЯ намеренно: адрес приезжает из середины токена разметки, и « /files/1» —
 * это не тот же адрес, а строка, в которой автор промахнулся. Прощать промах здесь значит
 * расширять калитку.
 */
export function fileRefId(href: string): number | null {
  const m = REF_RE.exec(href);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * КАДР СНИМКА В ТЕКСТЕ — ОДНОЙ ВЫСОТЫ, А НЕ ОДНОЙ ШИРИНЫ.
 *
 * Высота фиксирована, картинка вписывается в неё целиком (`max-h-full` + `object-contain`):
 * крупная уменьшается, мелкая остаётся собой. Ширина коробки идёт по картинке (`w-fit`), чтобы
 * нажатие попадало в снимок, а не в пустое поле рядом с ним.
 *
 * КАДР СТРОЧНЫЙ (`inline-flex`), А НЕ БЛОЧНЫЙ. Блочный занимал всю ширину заметки, и два снимка
 * рядом в тексте всё равно вставали друг под другом — столбцом. Строчный кадр стоит там, где его
 * поставили, а абзац из одних снимков разметчик кладёт рядом с переносом (`galleryLines`).
 */
export const NOTE_PICTURE_FRAME =
  'my-1 inline-flex h-[240px] w-fit max-w-full items-center align-top';
export const NOTE_PICTURE_IMAGE = 'max-h-full max-w-full object-contain';

/** Плашка на месте картинки. `span`, а не `div`: она стоит внутри абзаца. */
export function InlinePlate({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: 'default' | 'error';
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-px text-micro uppercase tracking-label ${
        tone === 'error' ? 'border-error text-error' : 'border-borderColor text-labelColor'
      }`}
    >
      {children}
    </span>
  );
}

/** Три места, где разметчику нужен доступ к чему-то за пределами текста. */
export interface MarkdownRefs {
  /**
   * Ссылка ВНУТРЬ приложения (`/что-то`). `inPlate` — она стоит внутри плашки, где текст
   * набран капителью: ссылке там нужен обычный регистр.
   */
  internalLink(href: string, label: string, opts?: { inPlate?: boolean }): ReactNode;
  /** Картинка файла библиотеки `![подпись](/files/{id})`. */
  fileImage(id: number, label: string, pictureKey: string): ReactNode;
  /** Картинка по внешнему адресу. `fallback` — что показать вместо неё, если не открылась. */
  externalImage(p: {
    src: string;
    label: string;
    pictureKey: string;
    fallback: ReactNode;
  }): ReactNode;
}

/**
 * ЧТО УМЕЕТ РАЗМЕТЧИК БЕЗ ДОСТУПА К БИБЛИОТЕКЕ — то есть на публичной странице.
 *
 * Файл библиотеки показывается ПЛАШКОЙ С ПОДПИСЬЮ, а не пустотой и не битым значком: читатель
 * должен видеть, что в этом месте документа стоит снимок, которого ссылка ему не отдаёт. Врать
 * про это нельзя ни в одну сторону — ни «тут ничего нет», ни `<img src="/files/12">`.
 */
export const PLAIN_REFS: MarkdownRefs = {
  internalLink: (href, label, opts) => (
    <span className={opts?.inPlate ? 'normal-case' : undefined}>{label || href}</span>
  ),
  fileImage: (_id, label) => (
    <InlinePlate>
      picture
      {label ? <span className='normal-case tracking-normal'>{label}</span> : null}
    </InlinePlate>
  ),
  externalImage: ({ src, label }) => (
    <span className={NOTE_PICTURE_FRAME}>
      <img src={src} alt={label} className={NOTE_PICTURE_IMAGE} />
    </span>
  ),
};

const MarkdownRefsContext = createContext<MarkdownRefs>(PLAIN_REFS);

/** Админская реализация вешается ОДИН РАЗ вокруг документа — см. `markdown-view.tsx`. */
export function MarkdownRefsProvider({
  value,
  children,
}: {
  value: MarkdownRefs;
  children: ReactNode;
}) {
  return <MarkdownRefsContext.Provider value={value}>{children}</MarkdownRefsContext.Provider>;
}

export function useMarkdownRefs(): MarkdownRefs {
  return useContext(MarkdownRefsContext);
}
