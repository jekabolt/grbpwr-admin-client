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
// импортирует ничего вовсе). Это не стилистика: любой такой импорт втянул бы api/api.ts в чанк
// публичной страницы, и человек снаружи получил бы код админки вместе с картинкой.
//
// ОТКАЗ КОРОТКИЙ И БЕЗ ПОДРОБНОСТЕЙ. Бэк отвечает одинаковым голым 404 на битый токен, отзыв,
// смену уровня, срок и лимит — специально, чтобы перебором нельзя было узнать, что файл
// существует. Страница обязана быть такой же немногословной: «ссылка не работает», без даты, без
// имени файла и без «её отозвали».
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
// ЧИСТЫЕ функции: `utils/format.ts` не импортирует ни одного модуля, поэтому в публичный чанк
// вместе с ними ничего не приезжает. Если однажды туда попадёт импорт adminService — этот импорт
// нужно будет разорвать копией, а не оставлять.
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

  const name = state.phase === 'ready' ? (state.meta.file_name ?? '') : '';

  useEffect(() => {
    // Имя файла в заголовке вкладки — только когда ссылка ЖИВА. На отказе вкладка называется
    // нейтрально: заголовок читается в истории браузера и в списке вкладок, и подставлять туда
    // имя закрытого файла значило бы отдавать наружу ровно то, что скрывает 404.
    document.title = name || 'файл';
  }, [name]);

  if (state.phase === 'loading') {
    return (
      <Shell>
        <Section>
          <Text size='micro' variant='label' component='p'>
            загрузка…
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
            <b>ссылка не работает</b>
          </Text>
          {/* Ни причины, ни даты, ни имени файла. Причина есть — но она на сервере, и там она
              и остаётся: «отозвана», «истекла» и «такого файла нет» снаружи обязаны выглядеть
              одинаково. Единственный полезный совет — спросить того, кто прислал. */}
          <Text size='micro' variant='label' component='p'>
            попросите новую у того, кто её прислал
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
            <b>страница настроена неправильно</b>
          </Text>
          <Text size='micro' variant='label' component='p'>
            сервер ответил не тем — покажите этот экран отправителю, новая ссылка не нужна
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
            <Text component='p'>не удалось загрузить — похоже, нет связи</Text>
            <Button
              type='button'
              variant='main'
              size='lg'
              className='min-h-11'
              onClick={() => setAttempt((n) => n + 1)}
            >
              повторить
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
                {name || 'файл'}
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
                  скачать
                </a>
              </Button>
              {inline && (
                <Button asChild variant='secondary' size='lg' className='min-h-11'>
                  <a href={fileEndpoint(token)} target='_blank' rel='noopener noreferrer'>
                    открыть
                  </a>
                </Button>
              )}
            </div>

            {!inline && (
              // Почему нет «открыть». Без этой строки кнопка выглядела бы забытой, а причина у
              // неё честная: подписанный адрес смотрит в origin бакета, и svg или html,
              // отрисованные на месте, исполнили бы скрипты в его контексте.
              <Text size='micro' variant='label' component='p'>
                такой файл отдаётся только скачиванием — открыть его прямо в браузере нельзя
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
            файл из библиотеки grbpwr, открытый по ссылке. ссылку могут закрыть или пересоздать в
            любой момент — тогда эта страница перестанет открываться.
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
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className='mx-auto w-full max-w-3xl px-2.5 py-4 text-base lg:px-4 lg:py-6'>{children}</div>
  );
}
