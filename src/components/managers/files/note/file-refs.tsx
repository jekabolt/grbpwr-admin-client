import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import type { LibraryFile } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { filesService } from '../api/filesService';
import { errorStatus } from '../api/rpc-error';
import { filesKeys } from '../hooks/useFiles';

/**
 * ССЫЛКИ НА ФАЙЛ БИБЛИОТЕКИ ВНУТРИ ТЕКСТА ЗАМЕТКИ.
 *
 * ── ПОЧЕМУ В ТЕКСТЕ ЛЕЖИТ АДРЕС КАРТОЧКИ, А НЕ ПОДПИСАННАЯ ССЫЛКА ───────────────────────────
 *
 * `url` и `preview_url` у файла — presigned, они живут часы. Заметка живёт годами, и её текст
 * ПЕРЕЖИВАЕТ любую подпись: вставить сюда `https://bucket…?X-Amz-Expires=21600` значило бы
 * записать в документ ссылку, которая протухнет к вечеру, а на следующий день будет выглядеть
 * как «файл пропал». Поэтому в тексте стоит `/files/{id}` — адрес КАРТОЧКИ, то есть имя, а не
 * ключ доступа. Свежая подпись добывается при каждом открытии заметки и нигде не сохраняется.
 *
 * Побочное следствие того же решения: текст заметки, утёкший наружу (скопирован в чат,
 * выгружен `.md`), не несёт в себе доступа к самим файлам — только номера.
 *
 * ── ОДНО МЕСТО РЕЗОЛВА ──────────────────────────────────────────────────────────────────────
 *
 * Хук на каждый `<img>` в глубине разметки означал бы N независимых запросов, каждый со своим
 * жизненным циклом, — и заметку с десятком снимков было бы видно по сетевой панели. Здесь адреса
 * собираются ОДИН РАЗ по разобранному документу, спрашиваются одним `useQueries` (параллельно, а
 * не водопадом) и раздаются через контекст. Повторная ссылка на тот же файл запроса не добавляет:
 * список номеров уникален по построению.
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
 */
export function fileRefId(href: string): number | null {
  const m = REF_RE.exec(href);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export type FileRefState =
  | { kind: 'loading' }
  /** 404 — файла больше нет. Не «ошибка сети»: об этом надо сказать словами. */
  | { kind: 'gone' }
  | { kind: 'error' }
  | { kind: 'ok'; file: LibraryFile };

const FileRefsContext = createContext<ReadonlyMap<number, FileRefState>>(new Map());

export function FileRefsProvider({ ids, children }: { ids: number[]; children: ReactNode }) {
  const map = useQueries({
    queries: ids.map((id) => ({
      queryKey: filesKeys.file(id),
      queryFn: () => filesService.getFile(id),
      // НОЛЬ, А НЕ ПОЛЧАСА, КАК У СЕТКИ. Ответ несёт подписанные адреса, и кэш здесь — это не
      // экономия запроса, а обещание показать картинку по вчерашней подписи. Открыли заметку —
      // спросили заново; лежащие в кэше данные при этом показываются сразу, поэтому «заново»
      // человек видит как отсутствие мигания, а не как загрузку.
      staleTime: 0,
      // 404 повторять незачем: удалённый файл не появится со второй попытки, а пара лишних
      // запросов на каждую мёртвую ссылку в старой заметке — это заметная пачка.
      retry: (count: number, e: unknown) => errorStatus(e) !== 404 && count < 1,
    })),
    combine: (results) => {
      const out = new Map<number, FileRefState>();
      results.forEach((r, i) => {
        const id = ids[i];
        if (r.isPending) out.set(id, { kind: 'loading' });
        else if (r.isError)
          out.set(id, errorStatus(r.error) === 404 ? { kind: 'gone' } : { kind: 'error' });
        // Ответ без файла — тот же смысл, что и 404: показывать нечего, и молчать об этом нельзя.
        else out.set(id, r.data?.file ? { kind: 'ok', file: r.data.file } : { kind: 'gone' });
      });
      return out;
    },
  });

  return <FileRefsContext.Provider value={map}>{children}</FileRefsContext.Provider>;
}

/** Разобранные файлы всего документа — тем, кто собирает из них ряд снимков, а не рисует один. */
export function useFileRefs(): ReadonlyMap<number, FileRefState> {
  return useContext(FileRefsContext);
}

/**
 * Чем показать этот файл на СЦЕНЕ просмотрщика: первый кандидат или ничего.
 *
 * Тот же список, что и в тексте, и это не совпадение: снимок, который в тексте не показался,
 * нечем показать и в увеличенном виде — а место в ряду он бы занял.
 */
export function fileRefImageSrc(state: FileRefState | undefined): string {
  return state?.kind === 'ok' ? imageCandidates(state.file)[0] ?? '' : '';
}

function useFileRef(id: number): FileRefState {
  const state = useContext(FileRefsContext).get(id);
  // Номера собраны по тому же документу, который сейчас рисуется, поэтому «нет в карте» бывает
  // ровно в одном случае — разметчик позвали вне провайдера. Тогда честнее ждать, чем врать.
  return state ?? { kind: 'loading' };
}

/** Схема проверяется ВСЕГДА, даже для адреса из ответа своего же бэкенда: `src` и `href` — это
 * место, где `javascript:`/`data:` перестают быть текстом. Проверка стоит копейку, а её
 * отсутствие однажды становится дырой через чужую (или подменённую) выдачу. */
function httpUrl(u: string | undefined): string {
  return u && /^https?:\/\//i.test(u) ? u : '';
}

/**
 * Чем можно показать этот файл прямо в тексте, по порядку попыток.
 *
 * ПУСТОЙ `url` — ЭТО ОТВЕТ СЕРВЕРА, А НЕ ПРОБЕЛ В ДАННЫХ. Сервер сознательно не выдаёт адрес
 * просмотра тому, что исполнилось бы на его origin (svg, html): такой файл ездит только
 * `download_url`. Клиент не заводит своего списка «безопасных типов» — он читает решение
 * сервера. Нет `url` — значит показывать нечего, и на месте картинки встаёт плашка-ссылка.
 *
 * Порядок внутри: сам снимок, потом миниатюра. Миниатюра — 512 px по длинной стороне (её рисует
 * браузер при загрузке), и растянутая на ширину заметки она мыльная; для не-картинки (pdf) она
 * наоборот единственное, что вообще можно показать, — сам файл в `<img>` не декодируется.
 */
function imageCandidates(f: LibraryFile | undefined): string[] {
  const url = httpUrl(f?.url);
  if (!f || !url) return [];
  const out: string[] = [];
  if ((f.contentType ?? '').startsWith('image/')) out.push(url);
  const preview = httpUrl(f.previewUrl);
  if (preview && !out.includes(preview)) out.push(preview);
  return out;
}

/**
 * Есть ли чем показать этот файл ПРЯМО В ТЕКСТЕ. Тот же список кандидатов, что и у самой
 * картинки, — и это не удобство, а условие: пикер, помечающий файл «превью нет», обязан судить
 * ровно тем же правилом, каким потом решает разметчик, иначе метка врёт в одну из сторон.
 */
export function canShowInText(f: LibraryFile | undefined): boolean {
  return imageCandidates(f).length > 0;
}

/**
 * КАДР ПРЕВЬЮ В ТЕКСТЕ — ФИКСИРОВАННОЙ ВЫСОТЫ.
 *
 * Раньше снимок был ограничен только сверху (`max-h-[70vh]`), то есть высоту абзацам задавали
 * сами файлы: вертикальный кадр забирал пол-экрана, следующий за ним горизонтальный — полосу в
 * пять строк, и текст между ними скакал. В заметке снимок — иллюстрация абзаца, а не страница;
 * разглядывают его в увеличенном виде, где ему отдан весь экран. Одна высота у всех превью
 * возвращает документу ровный ход сверху вниз.
 *
 * ВЫСОТА У КОРОБКИ, А НЕ У КАРТИНКИ. `h-…` на самом `<img>` РАСТЯНУЛ БЫ мелкий снимок — значок
 * 40×40 стал бы мыльным на 240 px. Поэтому высоту держит коробка, а картинка в неё вписывается
 * (`max-h-full` + `object-contain`): крупная уменьшается, мелкая остаётся собой. Ширина коробки
 * идёт по картинке (`w-fit`), чтобы нажатие попадало в снимок, а не в пустое поле рядом с ним.
 */
export const NOTE_PICTURE_FRAME = 'my-1 flex h-[240px] w-fit max-w-full items-center';
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

/**
 * Картинка `![подпись](/files/{id})`.
 *
 * Четыре исхода, и ни один из них не «пустое место»: пока читают — «загружается», нет файла —
 * слова про это, показывать нечем — плашка-ссылка, показать можно — сам снимок, кликом ведущий
 * на карточку. Битый значок `<img>` не годится ни в одном: он одинаково выглядит и когда файл
 * удалён, и когда подпись протухла, и когда браузер не умеет этот формат.
 */
export function FileRefImage({
  id,
  label,
  onZoom,
}: {
  id: number;
  label: string;
  /** Открыть увеличенный вид. Нет — снимок по-прежнему ведёт на карточку файла. */
  onZoom?: () => void;
}) {
  const state = useFileRef(id);
  const file = state.kind === 'ok' ? state.file : undefined;
  const name = label || file?.fileName || `file ${id}`;
  const candidates = imageCandidates(file);
  const signature = candidates.join('|');

  // Какую попытку показываем. Сбрасывается на первую, когда приезжают СВЕЖИЕ адреса: иначе
  // заметка, один раз наткнувшаяся на протухшую подпись, так и осталась бы с плашкой до
  // перезагрузки вкладки.
  const [tried, setTried] = useState(0);
  useEffect(() => setTried(0), [signature]);

  if (state.kind === 'loading') return <InlinePlate>picture · reading…</InlinePlate>;

  if (state.kind === 'gone') {
    return (
      <InlinePlate tone='error'>
        the file is gone
        <span className='normal-case tracking-normal'>{name}</span>
      </InlinePlate>
    );
  }

  if (state.kind === 'error') {
    return (
      <InlinePlate>
        the picture didn't read
        <Link to={fileCardPath(id)} className='text-highlightColor underline normal-case'>
          {name}
        </Link>
      </InlinePlate>
    );
  }

  const src = candidates[tried];
  if (!src) {
    return (
      <InlinePlate>
        {/* Причина названа: «не показывается» без причины читается как поломка, а это решение
            сервера — такой файл отдают только скачиванием. */}
        {candidates.length ? "the picture didn't open" : 'this file is not shown inside the text'}
        <Link to={fileCardPath(id)} className='text-highlightColor underline normal-case'>
          {name}
        </Link>
      </InlinePlate>
    );
  }

  const picture = (
    <img
      src={src}
      alt={name}
      loading='lazy'
      // Следующий адрес из списка, а если их больше нет — плашка. Сюда попадают и протухшая
      // подпись, и формат, который браузер не декодирует (tiff, heic): и то и другое иначе
      // осталось бы битым значком.
      onError={() => setTried((t) => t + 1)}
      className={NOTE_PICTURE_IMAGE}
    />
  );

  // НАЖАТИЕ ОТКРЫВАЕТ УВЕЛИЧЕННЫЙ ВИД, а дорога на карточку файла переехала в кнопку внутри
  // него: разглядывать снимок — то, ради чего на него нажимают, а уход со страницы посреди
  // чтения заметки был для этого жеста слишком крупным ответом.
  if (onZoom) {
    return (
      <button
        type='button'
        onClick={onZoom}
        title={`${name} — enlarge`}
        className={`${NOTE_PICTURE_FRAME} cursor-zoom-in`}
      >
        {picture}
      </button>
    );
  }

  return (
    <Link
      to={fileCardPath(id)}
      title={`${name} — open the file card`}
      className={NOTE_PICTURE_FRAME}
    >
      {picture}
    </Link>
  );
}
