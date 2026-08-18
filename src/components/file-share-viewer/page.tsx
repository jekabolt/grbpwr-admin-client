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
  // Превью — украшение поверх кнопок. Не нарисовалось (подпись протухла, пока страница висела
  // открытой; формат, который движок не тянет) — блок просто исчезает, и это состояние, а не
  // правка DOM руками: удалённый в обход React узел вернётся на первом же ре-рендере.
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
  const isImage = inline && (meta.content_type ?? '').toLowerCase().startsWith('image/');
  const showPreview = isImage && isSafeObjectUrl(meta.url) && !previewFailed;

  return (
    <Shell>
      <SectionStack>
        <Section>
          <div className='space-y-2.5'>
            <div className='space-y-1'>
              {/* `break-all`, потому что имена здесь машинные и без пробелов
                  («birka_sostav_RU_v2_final.pdf») — на телефоне такое имя иначе уезжает за край
                  экрана вместе с обеими кнопками. */}
              <Text size='large' component='h1' className='break-all'>
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

            {!inline && (
              // Почему нет «открыть». Без этой строки кнопка выглядела бы забытой, а причина у
              // неё честная: подписанный адрес смотрит в origin бакета, и svg или html,
              // отрисованные на месте, исполнили бы скрипты в его контексте.
              <Text size='micro' variant='label' component='p'>
                a file like this is served by download only — it can't be opened right in the
                browser
              </Text>
            )}
          </div>
        </Section>

        {showPreview && (
          <Section>
            {/* Картинка — по подписанному адресу из ответа, а не по токену: подпись здесь уже
                готова, а лишний поход по токену стоил бы второй подписи. Живёт она минуты, и это
                ровно тот случай, где это неважно: страницу смотрят сейчас. Не загрузилась — блок
                исчезает, а обе кнопки остаются рабочими, потому что ведут на токен. */}
            <img
              src={meta.url}
              alt={name}
              className='mx-auto max-h-[70vh] w-auto max-w-full'
              onError={() => setPreviewFailed(true)}
            />
          </Section>
        )}

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
// 16PX, А НЕ 12PX АДМИНА — по той же причине, что у двух публичных вьюеров QR (см. DESIGN.md,
// «The Twelve-Pixel Ceiling Rule»): страницу читают с телефона, а увеличить её пальцами нельзя —
// `user-scalable=no` в index.html стоит ради iOS. Двенадцать пикселей — размер плотного
// инструмента для того, кто сидит за столом; здесь читатель не наш и не за столом.
//
// И ЭТО СДЕЛАНО ТОКЕНАМИ, А НЕ `text-base` НА ОБЁРТКЕ. Один `text-base` тут был чистым
// украшением и не менял ни одной строки: `ui/components/text.tsx` вешает СВОЙ класс кегля на
// каждый элемент (`text-textBaseSize`, `text-micro`, `text-nano`), а собственный кегль всегда
// сильнее унаследованного. Измеренная страница выходила админской: h1 18px, «картинка · 200 кб»
// 12px, подписи 10px — то есть ровно тот плотный инструмент, исключением из которого она себя
// объявляла. Переопределение переменных `--text-*` на обёртке действует НА ВСЁ поддерево разом,
// включая Section, CalloutBox и Button, и не требует трогать ни примитив, ни каждый элемент.
//
// Мелкого кегля здесь нет вовсе: рунги ниже тела подняты ДО тела. Мелкий кегль — способ
// уместить плотность на экране того, кто сидит за столом; на телефоне подрядчика вся эта
// страница — три фразы и две кнопки, и уплотнять тут нечего. Разницу несут цвет и вес.
//
// ТО ЖЕ САМОЕ ВЕРНО ДЛЯ /r/:token И /p/:token — двух исключений, НАЗВАННЫХ в DESIGN.md: их
// `text-base` так же инертен, и их бумага так же выходит двенадцатипиксельной. Здесь это не
// чинится: те экраны выкачены, живут в другом разделе и в диффе этой волны их нет.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className='mx-auto w-full max-w-3xl px-2.5 py-4 text-base [--text-control:16px] [--text-lg:22px] [--text-micro:16px] [--text-nano:14px] [--text-small:16px] [--text-textBaseSize:16px] lg:px-4 lg:py-6'>
      {children}
    </div>
  );
}
