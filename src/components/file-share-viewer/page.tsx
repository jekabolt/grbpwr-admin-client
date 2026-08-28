// ПУБЛИЧНАЯ СТРАНИЦА ФАЙЛА — то, что открывает человек, которому прислали ссылку (/f/:token).
//
// Читатель — подрядчик, типография, фотограф: БЕЗ аккаунта в админке и без намерения его заводить.
// Отсюда все три конструктивных запрета, ровно те же, что у вьюера выкроек (/p/:token) и наряда на
// партию (/r/:token), и по тем же причинам: вне ProtectedRoute (никакого JWT), вне Layout
// (никакой навигации панели) и вне DictionaryProvider (словарь — авторизованный fetch; страница,
// которой он нужен, публичной не бывает). Данные — ручной fetch в components/meta.ts.
//
// ЧЕГО ЗДЕСЬ НЕТ. Ни одного вызова adminService, ни одного чтения localStorage.authToken, ни
// одного импорта из components/managers/**, кроме ЧИСТЫХ форматтеров (utils/format.ts не
// импортирует ничего вовсе).
//
// РАЗМЕТЧИК ЗАМЕТКИ ЗДЕСЬ ТОТ ЖЕ, ЧТО В АДМИНКЕ, и это не нарушение запрета выше, а причина, по
// которой он переехал: `ui/markdown/**` не импортирует ни `api/api.ts`, ни один хук данных —
// только react и чистые функции. Три места, где разметке нужен доступ к библиотеке (картинка
// файла, внутренняя ссылка, ряд снимков), вынесены в контекст, и ЗНАЧЕНИЕ ПО УМОЛЧАНИЮ у него —
// `PLAIN_REFS`: ничего не запрашивает, на админские маршруты не ссылается. Публичная страница
// получает безопасное поведение не потому, что здесь не забыли передать проп, а потому что
// передавать нечего.
//
// ДИСЦИПЛИНА ПРО ПРОВОД, А НЕ ПРО ЧАНК. Здесь стояло обоснование «иначе api/api.ts втянется в
// чанк публичной страницы», и оно ЛОЖНО: index.html грузит общий чанк на любом маршруте, и в
// собранном виде в нём уже лежат и строка `Grpc-Metadata-Authorization`, и `authToken`. Код
// админки снаружи скачивается в любом случае, и запрет, обоснованный этим, однажды опровергнут
// вместе с самой дисциплиной — а дисциплина верная.
//
// Верна она по другой причине: страница не ОТПРАВЛЯЕТ ничего личного. Токен лежит в
// localStorage той же вкладки — свой человек открывает присланную подрядчику ссылку в живой
// сессии, — и от запроса, ходящего под админскими правами, эту страницу отделяет ровно одно:
// ни одна строка её кода токен не читает и не прикладывает. Единственный её fetch идёт с
// `credentials: 'omit'` и без заголовков (components/meta.ts). Импорт из managers/** тянет за
// собой api/api.ts, а тот прикладывает заголовок сам, ничего не спрашивая, — вот чего нельзя.
//
// ОТКАЗ КОРОТКИЙ И БЕЗ ПОДРОБНОСТЕЙ. Бэк отвечает одинаковым голым 404 на битый токен, отзыв,
// смену уровня, срок и лимит — специально, чтобы перебором нельзя было узнать, что файл
// существует. Страница обязана быть такой же немногословной: «ссылка не работает», без даты, без
// имени файла и без «её отозвали».
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
// ЧИСТЫЕ функции: `utils/format.ts` не импортирует ни одного модуля, поэтому вместе с ними сюда
// не приезжает ничего, что умеет ходить в сеть. Если однажды туда попадёт импорт adminService —
// этот импорт нужно будет разорвать копией, а не оставлять.
import { formatBytes, kindWord } from 'components/managers/files/utils/format';
import { MarkdownDoc, parse as parseMarkdown } from 'ui/markdown/doc';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import {
  downloadEndpoint,
  fetchShareMeta,
  fileEndpoint,
  isSafeObjectUrl,
  type ShareState,
} from './components/meta';

export function FileShareViewerPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<ShareState>({ phase: 'loading' });
  // Бамп перезапускает fetch после «нет связи» — единственный отказ, где повтор имеет смысл.
  const [attempt, setAttempt] = useState(0);
  // Показ стоит НАД именем и кнопками: человек, открывший ссылку, должен увидеть документ, а не
  // его имя файлом. Не нарисовалось (подпись протухла, пока страница висела открытой; формат,
  // который движок не тянет) — блок просто исчезает, и это состояние, а не правка DOM руками:
  // удалённый в обход React узел вернётся на первом же ре-рендере.
  const [previewFailed, setPreviewFailed] = useState(false);

  useEffect(() => {
    let dead = false;
    setState({ phase: 'loading' });
    setPreviewFailed(false);
    if (!token) {
      setState({ phase: 'invalid' });
      return;
    }
    fetchShareMeta(token).then((next) => {
      if (!dead) setState(next);
    });
    return () => {
      dead = true;
    };
  }, [token, attempt]);

  const name = state.phase === 'ready' ? state.meta.file_name ?? '' : '';

  useEffect(() => {
    // Имя файла в заголовке вкладки — только когда ссылка ЖИВА. На отказе вкладка называется
    // нейтрально: заголовок читается в истории браузера и в списке вкладок, и подставлять туда
    // имя закрытого файла значило бы отдавать наружу ровно то, что скрывает 404.
    document.title = name || 'file';
  }, [name]);

  // ДВЕНАДЦАТЬ ПИКСЕЛЕЙ НА ЧУЖОМ ТЕЛЕФОНЕ — ТОЛЬКО ВМЕСТЕ С ПРАВОМ УВЕЛИЧИТЬ.
  //
  // `index.html` просит `user-scalable=no` ради ОДНОГО: iOS Safari сам наезжает на поле ввода
  // мельче 16px, а админка — плотный 12px инструмент. Полей ввода на этой странице нет ни
  // одного, значит и запрет здесь ничего не защищает — он только отнимает щипок у человека,
  // который читает присланную ссылку с телефона. Снимаем на время жизни страницы и возвращаем
  // как было: тег один на всё приложение, и уйти отсюда можно только в саму админку.
  useEffect(() => {
    const tag = document.querySelector('meta[name="viewport"]');
    if (!tag) return;
    const before = tag.getAttribute('content') ?? '';
    tag.setAttribute('content', 'width=device-width, initial-scale=1');
    return () => {
      tag.setAttribute('content', before);
    };
  }, []);

  if (state.phase === 'loading') {
    return (
      <Shell>
        <Section>
          <Text size='micro' variant='label' component='p'>
            loading…
          </Text>
        </Section>
      </Shell>
    );
  }

  if (state.phase === 'invalid') {
    return (
      <Shell>
        {/* Каллаут БЕЗ обёртки в Section: у него своя рамка, и рамка в рамке — тот самый
            box-in-box, который DESIGN.md запрещает. На сером ground он и есть блок. */}
        <CalloutBox tone='error'>
          <Text component='p'>
            <b>the link doesn't work</b>
          </Text>
          {/* Ни причины, ни даты, ни имени файла. Причина есть — но она на сервере, и там она
              и остаётся: «отозвана», «истекла» и «такого файла нет» снаружи обязаны выглядеть
              одинаково. Единственный полезный совет — спросить того, кто прислал. */}
          <Text size='micro' variant='label' component='p'>
            ask for a new one from whoever sent it
          </Text>
        </CalloutBox>
      </Shell>
    );
  }

  if (state.phase === 'broken') {
    // НЕ «не работает»: сервер ответил, но не метаданными — почти всегда это ошибка настройки
    // (незаданный VITE_SERVER_URL уводит запрос на свой origin, где SPA-rewrite отдаёт index.html
    // с кодом 200). Новая ссылка тут не поможет, и просить её вредно.
    return (
      <Shell>
        <CalloutBox tone='error'>
          <Text component='p'>
            <b>the page is configured wrong</b>
          </Text>
          <Text size='micro' variant='label' component='p'>
            the server answered with the wrong thing — show this screen to the sender, a new link is
            not needed
          </Text>
        </CalloutBox>
      </Shell>
    );
  }

  if (state.phase === 'offline') {
    return (
      <Shell>
        <Section>
          <div className='space-y-2.5'>
            <Text component='p'>couldn't load — looks like there is no connection</Text>
            <Button
              type='button'
              variant='main'
              size='lg'
              className='min-h-11'
              onClick={() => setAttempt((n) => n + 1)}
            >
              retry
            </Button>
          </div>
        </Section>
      </Shell>
    );
  }

  const meta = state.meta;
  const size = Number(meta.size_bytes ?? 0);
  // `download` от сервера — единственный источник правды о том, открывается ли тип в браузере.
  // Свой список тут был бы вторым набором правил, расходящимся с dto.IsInlineSafeContentType.
  const inline = meta.download === false;
  const kind = (meta.content_type ?? '').toLowerCase();
  const isImage = inline && kind.startsWith('image/');
  const isVideo = inline && kind.startsWith('video/');
  const isPdf = inline && kind.startsWith('application/pdf');
  /**
   * ЧТО ИМЕННО ПОКАЗЫВАТЬ — И ПОЧЕМУ ДОКУМЕНТ ЦЕЛИКОМ, А НЕ ЕГО ПЕРВУЮ СТРАНИЦУ.
   *
   * Претензия владельца дословно: «должна быть ссылка, где сразу можно посмотреть весь документ,
   * а не только скачать, т.е. вью-мод дока — так же для всех файлов, где есть предпросмотр».
   *
   * Порядок разбора — от «показать значит прочитать» к «показать значит открыть»:
   *
   *  1. ТЕКСТ (.md, .txt) приезжает полем `text` и рисуется тем же разметчиком, что в админке.
   *     Подписанным адресом его не показать: тип не inline-безопасный, и подпись у него всегда
   *     вложение.
   *  2. КАРТИНКА показывает саму себя по подписанному адресу — в полном качестве и без второго
   *     похода.
   *  3. PDF и ВИДЕО — сам файл, а не миниатюра: у первого встроенный просмотрщик браузера со
   *     всеми страницами, у второго — плеер. До этой правки договор из десяти страниц выглядел
   *     как одна картинка первой страницы, и «посмотреть весь документ» означало «скачать».
   *  4. МИНИАТЮРА остаётся для всего прочего, у чего она есть (чертёж, эскиз, файл, который
   *     браузер не открывает): лучше одна страница лицом, чем одно имя файла.
   */
  const text = typeof meta.text === 'string' ? meta.text : '';
  const inlineSrc = isSafeObjectUrl(meta.url) ? meta.url : '';
  const embedSrc = (isPdf || isVideo) && !previewFailed ? inlineSrc : '';
  const previewSrc = isImage ? meta.url : embedSrc ? '' : meta.preview_url;
  const showPreview = isSafeObjectUrl(previewSrc) && !previewFailed;

  return (
    <Shell>
      <SectionStack>
        {text ? (
          <Section>
            {/* ДОКУМЕНТ, А НЕ ЕГО ОПИСАНИЕ. Разметчик тот же, что на экране заметки, — иначе один
                и тот же текст читался бы по-разному по обе стороны ссылки. Картинки библиотеки
                внутри такого текста показываются ПЛАШКОЙ: они не входят в эту ссылку, и
                подставлять их сюда значило бы отдать наружу файлы, которых никто не открывал. */}
            <MarkdownDoc blocks={parseMarkdown(text)} />
          </Section>
        ) : null}
        {embedSrc && (
          <Section>
            <div className='space-y-1.5'>
              {isVideo ? (
                <video
                  src={embedSrc}
                  controls
                  playsInline
                  className='mx-auto max-h-[70vh] w-full'
                  onError={() => setPreviewFailed(true)}
                />
              ) : (
                // PDF — ВСТРОЕННЫМ ПРОСМОТРЩИКОМ БРАУЗЕРА, а не картинкой первой страницы.
                // Высота фиксированная: документ прокручивается ВНУТРИ рамки, и страница вокруг
                // него не превращается в один бесконечный кадр.
                <iframe
                  src={embedSrc}
                  title={name || 'document'}
                  className='h-[75vh] w-full border-0'
                />
              )}
              {/* Честная оговорка про телефон: iOS показывает в рамке ТОЛЬКО ПЕРВУЮ страницу
                  pdf — это её давнее свойство, и спорить с ним нечем. Кнопка «open» ниже
                  открывает файл целиком отдельной вкладкой, и там ограничения нет. */}
              {isPdf && (
                <Text size='micro' variant='label' component='p'>
                  the whole document — on a phone it may show the first page only, then use “open”
                  below
                </Text>
              )}
            </div>
          </Section>
        )}
        {showPreview && (
          <Section>
            {/* Картинка — по подписанному адресу из ответа, а не по токену: подпись здесь уже
                готова, а лишний поход по токену стоил бы второй подписи. Живёт она минуты, и это
                ровно тот случай, где это неважно: страницу смотрят сейчас. Не загрузилась — блок
                исчезает, а обе кнопки остаются рабочими, потому что ведут на токен. */}
            <div className='space-y-1.5'>
              <img
                src={previewSrc}
                alt={name}
                className='mx-auto max-h-[70vh] w-auto max-w-full'
                onError={() => setPreviewFailed(true)}
              />
              {!isImage && (
                // МИНИАТЮРА — НЕ ФАЙЛ. У pdf это первая страница, и человек, увидевший одну
                // страницу договора, иначе решит, что документ он уже посмотрел целиком.
                <Text size='micro' variant='label' component='p'>
                  a preview of the first page — the whole file is under “download” below
                </Text>
              )}
            </div>
          </Section>
        )}
        <Section>
          <div className='space-y-2.5'>
            <div className='space-y-1'>
              {/* `break-all`, потому что имена здесь машинные и без пробелов
                  («birka_sostav_RU_v2_final.pdf») — на телефоне такое имя иначе уезжает за край
                  экрана вместе с обеими кнопками. */}
              <Text component='h1' className='break-all font-bold'>
                {name || 'file'}
              </Text>
              <Text variant='label' component='p'>
                {kindWord(meta.content_type, name)}
                {size > 0 ? ` · ${formatBytes(size)}` : ''}
              </Text>
            </div>

            <div className='flex flex-wrap gap-2.5'>
              {/* Обычные ссылки, а не fetch: маршрут отвечает 302 на подписанный адрес, и
                  кросс-доменный редирект в fetch обнуляет origin и упирается в CORS бакета.
                  Навигация же переживает редирект без единой настройки. */}
              <Button asChild variant='main' size='lg' className='min-h-11'>
                <a href={downloadEndpoint(token)} rel='noopener'>
                  download
                </a>
              </Button>
              {inline && (
                <Button asChild variant='secondary' size='lg' className='min-h-11'>
                  <a href={fileEndpoint(token)} target='_blank' rel='noopener noreferrer'>
                    open
                  </a>
                </Button>
              )}
            </div>

            {!inline &&
              (text ? (
                // У текстового документа «открыть» тоже нет — и по той же причине, — но говорить
                // «его нельзя посмотреть в браузере» здесь было бы прямой неправдой: он показан
                // выше целиком. Строка объясняет, что даёт скачивание, а не чего не даёт ссылка.
                <Text size='micro' variant='label' component='p'>
                  the document is shown above in full — “download” gives you the source file
                </Text>
              ) : (
                // Почему нет «открыть». Без этой строки кнопка выглядела бы забытой, а причина у
                // неё честная: подписанный адрес смотрит в origin бакета, и svg или html,
                // отрисованные на месте, исполнили бы скрипты в его контексте.
                <Text size='micro' variant='label' component='p'>
                  a file like this is served by download only — it can't be opened right in the
                  browser
                </Text>
              ))}
          </div>
        </Section>

        <Section>
          <Text size='micro' variant='label' component='p'>
            a file from the grbpwr library, opened by link. the link can be closed or rotated at any
            moment — then this page stops opening.
          </Text>
        </Section>
      </SectionStack>
    </Shell>
  );
}

// Одна колонка на всю ширину телефона; на десктопе — узкий столбец по центру серого ground.
//
// КЕГЛЬ ТУТ ТАКОЙ ЖЕ, КАК ВЕЗДЕ В АДМИНКЕ (12px), ПО РЕШЕНИЮ ВЛАДЕЛЬЦА. Страница объявляла себя
// исключением из «Twelve-Pixel Ceiling» (DESIGN.md) и переопределяла токены `--text-*` на 16px;
// обоснованием было, что читатель смотрит с телефона и УВЕЛИЧИТЬ НЕ МОЖЕТ — `index.html` просит
// `user-scalable=no`. Из этой пары снята вторая половина, а не первая: щипок странице возвращён
// эффектом выше, и крупный кегль перестал быть единственным способом её прочесть.
//
// ЕСЛИ ПОНАДОБИТСЯ ВЕРНУТЬ КРУПНЫЙ КЕГЛЬ — ВОЗВРАЩАЙ ТОКЕНАМИ, А НЕ `text-base` НА ОБЁРТКЕ.
// `ui/components/text.tsx` вешает СВОЙ класс кегля на каждый элемент, а собственный кегль всегда
// сильнее унаследованного: стоявший здесь `text-base` не менял ни одной строки и был чистым
// украшением. Работали только переопределения `--text-*` — они действуют на всё поддерево разом,
// включая Section, CalloutBox и Button.
//
// /r/:token и /p/:token остаются 16-пиксельными исключениями, названными в DESIGN.md: про них
// не просили, и в этой правке их нет.
function Shell({ children }: { children: React.ReactNode }) {
  return <div className='mx-auto w-full max-w-3xl px-2.5 py-4 lg:px-4 lg:py-6'>{children}</div>;
}
