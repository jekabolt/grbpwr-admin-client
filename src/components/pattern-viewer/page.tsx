// ПУБЛИЧНЫЙ вьюер выкроек — страница, которую открывает QR из печатного тех-пака (/p/:token).
//
// Читатель — швея на фабрике, с телефона, БЕЗ логина. Отсюда все три конструктивных запрета:
// вне ProtectedRoute (никакого JWT), вне Layout (никакого админского хрома), вне
// DictionaryProvider (словарь — авторизованный fetch; токены размеров строятся из манифеста).
// Данные — ручной fetch в components/manifest.ts, не adminService.
//
// Мобильный вид первичен: одна колонка, тач-мишени ≥44px, ничего от hover не зависит.
// Серый ground уже на body (global.css), блоки — Section/SectionStack по DESIGN.md.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { CalloutBox } from 'ui/components/callout-box';
import { Button } from 'ui/components/button';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import { sizeTokensOf } from 'components/managers/tech-card/components/nesting/block-code';
import { GroupSelect, groupLabel } from './components/group-select';
import { SheetList } from './components/sheet-list';
import { fetchManifest, type ManifestState, type PvGroup } from './components/manifest';

export function PatternViewerPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [search] = useSearchParams();
  const [state, setState] = useState<ManifestState>({ phase: 'loading' });
  // Бамп перезапускает fetch после «нет сети» — единственный отказ, где повтор имеет смысл.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dead = false;
    setState({ phase: 'loading' });
    if (!token) {
      setState({ phase: 'invalid' });
      return;
    }
    fetchManifest(token).then((next) => {
      if (!dead) setState(next);
    });
    return () => {
      dead = true;
    };
  }, [token, attempt]);

  const manifest = state.phase === 'ready' ? state.manifest : null;

  useEffect(() => {
    const styleNumber = (manifest?.style_number ?? '').trim();
    document.title = styleNumber ? `${styleNumber} — выкройки` : 'выкройки';
  }, [manifest]);

  // Токены размеров для разбора имён блоков DXF — из размерного ряда КАРТЫ, присланного
  // манифестом. Ровно то, что модалке отдаёт словарь, только без авторизации.
  const dictTokens = useMemo(
    () => new Set((manifest?.sizes ?? []).flatMap((s) => sizeTokensOf(s.name))),
    [manifest],
  );

  const groups: PvGroup[] = useMemo(() => manifest?.groups ?? [], [manifest]);

  // Преселект группы из ?g (печать пишет серверный ключ скоупа). Незнакомый или пустой ?g
  // обязан деградировать в «показать первую группу», а не в ошибку: рассинхрон написаний
  // ключа — штатный режим переходного периода, и вся карточка должна остаться доступной.
  const [picked, setPicked] = useState<string | null>(null);
  const wanted = picked ?? (search.get('g') ?? '');
  const activeGroup = groups.find((g) => (g.key ?? '') === wanted) ?? groups[0];
  const activeKey = activeGroup?.key ?? '';

  // ВЕРСИЯ, ЗАШИТАЯ В БУМАГУ — тот же приём, что у наряда на партию (run-pack-viewer/page.tsx):
  // печать пишет в ?v= и ?n= штамп состава группы (сумму версий листов и их число — версии
  // нумеруются per-size, поэтому одной цифры мало: max не заметил бы замену не-максимального
  // размера, а удаление листа не меняет ни одной версии), страница сверяет его с живым
  // манифестом. Это единственное место, где старая бумага может узнать, что выкройки за её QR
  // уже другие. Непарсящийся или отсутствующий параметр = молчание, как и там: тревога,
  // выдуманная из отсутствия параметра, обесценила бы настоящую. Требуются ОБА параметра —
  // бумага, печатанная до этой пары, несла в ?v= версию карты, и сверять её не с чем.
  const stamp = useMemo(() => {
    const parse = (name: string): number | null => {
      const raw = search.get(name);
      if (raw === null) return null;
      const n = Number.parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : null;
    };
    const v = parse('v');
    const n = parse('n');
    return v !== null && n !== null ? { v, n } : null;
  }, [search]);
  // Сверяется группа, НА КОТОРУЮ УКАЗЫВАЕТ БУМАГА (?g), а не активная: оператор волен листать
  // группы на экране, и это не делает бумагу в его руках ни свежее, ни старее.
  const paperKey = search.get('g') ?? '';
  const paperGroup = paperKey ? groups.find((g) => (g.key ?? '') === paperKey) : undefined;
  const currentV = (paperGroup?.sheets ?? []).reduce((s, p) => s + (p.version ?? 0), 0);
  const currentN = (paperGroup?.sheets ?? []).length;
  // Группы с ключом бумаги больше нет — это тоже дрейф, а не повод молча открыть первую:
  // перегруппировка выкроек меняет именно то, что QR обещал показать.
  const drifted =
    stamp !== null && !!paperKey && (!paperGroup || stamp.v !== currentV || stamp.n !== currentN);

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
    // Единый 404 бэка неразличим по построению (битый токен / отзыв / протухание / лимит) —
    // страница обязана быть такой же немногословной и не гадать о причине.
    return (
      <Shell>
        <Section>
          <CalloutBox tone='error'>
            <Text component='p'>
              <b>ссылка недействительна</b>
            </Text>
            <Text size='micro' variant='label' component='p'>
              попросите свежую распечатку тех-пака и отсканируйте QR ещё раз
            </Text>
          </CalloutBox>
        </Section>
      </Shell>
    );
  }

  if (state.phase === 'broken') {
    // НЕ «недействительна»: сервер ответил, но не манифестом — почти всегда это ошибка
    // конфигурации (незаданный VITE_SERVER_URL уводит запрос на свой origin, где SPA-rewrite
    // отдаёт index.html с кодом 200). Перепечатка тут не поможет, и говорить о ней вредно.
    return (
      <Shell>
        <Section>
          <CalloutBox tone='error'>
            <Text component='p'>
              <b>вьюер настроен неправильно</b>
            </Text>
            <Text size='micro' variant='label' component='p'>
              сервер ответил не тем — покажите этот экран разработчику, бумагу перепечатывать не
              нужно
            </Text>
          </CalloutBox>
        </Section>
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

  const styleNumber = (manifest?.style_number ?? '').trim();
  const styleName = (manifest?.style_name ?? '').trim();

  return (
    <Shell>
      <SectionStack>
        {/* ВЫКРОЙКИ ИЗМЕНИЛИСЬ ПОСЛЕ ПЕЧАТИ — первым, до всего остального: это единственная
            новость, которая отменяет достоверность бумаги в руках (то же правило и почти те же
            слова, что у наряда на партию). Контент ниже НЕ прячется: экран и есть свежая правда,
            по которой надо работать вместо устаревшего листа. */}
        {drifted && (
          <CalloutBox tone='warning' className='space-y-1'>
            <Text size='large' component='p' className='uppercase'>
              <b>выкройки изменились после печати</b>
            </Text>
            <Text component='p'>
              {paperGroup
                ? `бумага в руках напечатана для листов версии ${stamp?.v} (${stamp?.n} шт.), а сейчас они версии ${currentV} (${currentN} шт.). Контуры на бумаге устарели — кроите по листам с ЭТОГО экрана и перепечатайте тех-пак.`
                : 'бумага в руках указывает на группу листов, которой на карточке больше нет — выкройки перегруппированы после печати. Кроите по листам с ЭТОГО экрана и перепечатайте тех-пак.'}
            </Text>
          </CalloutBox>
        )}
        <Section>
          <div className='space-y-2.5'>
            <div>
              <Text size='large' component='h1' className='uppercase'>
                {styleNumber || 'тех-карта'}
              </Text>
              {styleName && (
                <Text variant='label' component='p'>
                  {styleName}
                </Text>
              )}
            </div>
            <GroupSelect groups={groups} activeKey={activeKey} onSelect={setPicked} />
          </div>
        </Section>

        {activeGroup ? (
          <Section
            title='листы'
            question={
              groups.length > 1 ? `— ${groupLabel(activeGroup)}` : '— просмотр и скачивание'
            }
          >
            <SheetList sheets={activeGroup.sheets ?? []} dictTokens={dictTokens} />
          </Section>
        ) : (
          <Section title='листы'>
            <Text size='micro' variant='label' component='p'>
              на карточке нет файлов выкроек
            </Text>
          </Section>
        )}
      </SectionStack>
    </Shell>
  );
}

// Одна колонка на всю ширину телефона; на десктопе — узкий столбец по центру серого ground.
//
// 16PX, А НЕ 12PX АДМИНА — по той же причине, что и во вьюере наряда: страницу читают с телефона
// в цеху, а пальцами её не увеличить (`user-scalable=no` в index.html стоит ради iOS, чтобы тот не
// зумил на фокусе поля). Почти весь текст здесь и так называет размер сам, через `Text`; наследуют
// немногие — например строка отказа парсера DXF, и именно её в цеху и надо прочитать.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className='mx-auto w-full max-w-3xl px-2.5 py-4 text-base lg:px-4 lg:py-6'>{children}</div>
  );
}
