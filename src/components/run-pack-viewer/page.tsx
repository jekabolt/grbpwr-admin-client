// ПУБЛИЧНЫЙ ВЬЮЕР НАРЯДА НА ПАРТИЮ — страница, которую открывает QR с печатного наряда (/r/:token).
//
// Читатель — раскройщик или швея на фабрике, с телефона, БЕЗ логина. Отсюда все три конструктивных
// запрета (те же, что у вьюера выкроек): вне ProtectedRoute (никакого JWT), вне Layout (никакого
// админского хрома), вне DictionaryProvider (словарь — авторизованный fetch; имена размеров,
// колорвеев и материалов приезжают в самом манифесте). Данные — ручной fetch в components/manifest.ts.
//
// ЗАЧЕМ ЖИВОЙ ВЬЮЕР, ЕСЛИ ЕСТЬ БУМАГА. Наряд живой: количества берутся из прогона, а прогон правят
// после печати. QR несёт версию прогона НА МОМЕНТ ПЕЧАТИ в ?v=, страница сверяет её с
// run_lock_version манифеста — и это единственное место во всей системе, где лист в руках может
// сказать о себе, что он устарел. Без ?v= страница молчит: тревога, выдуманная из отсутствия
// параметра, обесценила бы настоящую.
//
// Мобильный вид первичен: одна колонка, тач-мишени ≥44px, таблицы скроллятся внутри себя.
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import { CutBlockers, CutList } from './components/cut-list';
import { Lays, MaterialBlockers } from './components/lays';
import { LinesMatrix } from './components/lines-matrix';
import { fetchRunPack, type RunPackState } from './components/manifest';
import { RunHeader } from './components/run-header';
import { SubsetFilter } from './components/subset-filter';
import { applySubset, readSubset, subsetActive, writeSubset } from './components/subset';

export function RunPackViewerPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [search, setSearch] = useSearchParams();
  const [state, setState] = useState<RunPackState>({ phase: 'loading' });
  // Бамп перезапускает fetch после «нет сети» — единственный отказ, где повтор имеет смысл.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dead = false;
    setState({ phase: 'loading' });
    if (!token) {
      setState({ phase: 'invalid' });
      return;
    }
    fetchRunPack(token).then((next) => {
      if (!dead) setState(next);
    });
    return () => {
      dead = true;
    };
  }, [token, attempt]);

  const manifest = state.phase === 'ready' ? state.manifest : null;

  useEffect(() => {
    const runId = manifest?.run_id ?? 0;
    document.title = runId ? `PR-${runId} — run pack` : 'run pack';
  }, [manifest]);

  const subset = useMemo(() => readSubset(search), [search]);
  const view = useMemo(() => applySubset(manifest, subset), [manifest, subset]);

  // ВЕРСИЯ, ЗАШИТАЯ В БУМАГУ. `?v=` пишет печать (run-pack-document.tsx), и другого источника у неё
  // нет. Непарсящийся параметр приравнивается к отсутствующему: испорченная при пересылке ссылка —
  // не повод кричать «план изменился», а повод молчать ровно так же, как без параметра.
  const printedVersion = useMemo(() => {
    const raw = search.get('v');
    if (raw === null) return null;
    const n = Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }, [search]);
  const currentVersion = manifest?.run_lock_version ?? 0;
  const drifted = printedVersion !== null && printedVersion !== currentVersion;

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
    // Единый 404 бэка неразличим ПО ПОСТРОЕНИЮ (битый токен / отзыв / протухание / лимит) —
    // страница обязана быть такой же немногословной и не гадать о причине.
    return (
      <Shell>
        <Section>
          <CalloutBox tone='error'>
            <Text component='p'>
              <b>the link is invalid</b>
            </Text>
            <Text size='micro' variant='label' component='p'>
              take a fresh printout of the run pack and scan the QR again
            </Text>
          </CalloutBox>
        </Section>
      </Shell>
    );
  }

  if (state.phase === 'broken') {
    // НЕ «недействительна»: сервер ответил, но не манифестом — почти всегда это ошибка конфигурации
    // (незаданный VITE_SERVER_URL уводит запрос на свой origin, где SPA-rewrite отдаёт index.html с
    // кодом 200). Перепечатка тут не поможет, и говорить о ней вредно.
    return (
      <Shell>
        <Section>
          <CalloutBox tone='error'>
            <Text component='p'>
              <b>the viewer is misconfigured</b>
            </Text>
            <Text size='micro' variant='label' component='p'>
              the server answered with the wrong thing — show this screen to a developer, there is no
              need to reprint the paper
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
            <Text component='p'>couldn't load — looks like there's no connection</Text>
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

  const m = state.manifest;
  const caveats = m.cut_caveats ?? [];
  const filtered = subsetActive(subset);

  return (
    <Shell>
      <SectionStack>
        {/* ПЛАН ИЗМЕНИЛСЯ ПОСЛЕ ПЕЧАТИ — первым, до всего остального: это единственная новость,
            которая отменяет достоверность бумаги в руках. Тон синий, потому что в этой системе
            синий означает «изменилось после утверждения, нужен человек», а не «сломано». */}
        {drifted && (
          <CalloutBox tone='warning' className='space-y-1'>
            <Text size='large' component='p' className='uppercase'>
              <b>the plan changed after printing</b>
            </Text>
            <Text component='p'>
              the paper in your hands was printed for version {printedVersion}, and the run is now at
              version {currentVersion}. the numbers on the sheet are out of date — cut from THIS
              screen and reprint the run pack.
            </Text>
          </CalloutBox>
        )}

        <Section>
          <RunHeader m={m} garments={view.garments} garmentsRecomputed={view.recomputed} />
        </Section>

        <Section title='your cut list' question='— show only what you cut'>
          <SubsetFilter
            lines={m.lines ?? []}
            sizes={m.sizes ?? []}
            lays={m.lays ?? []}
            subset={subset}
            onChange={(next) =>
              // replace: true — переключение фильтра не должно набивать историю: «назад» на телефоне
              // обязано возвращать туда, откуда пришли по QR, а не отматывать двадцать нажатий.
              setSearch(writeSubset(search, next), { replace: true })
            }
          />
        </Section>

        <Section title='run lines' question='— how many we sew'>
          <LinesMatrix
            lines={view.lines ?? []}
            axis={view.axis}
            total={view.garments}
            lineTotal={view.lineTotal}
          />
        </Section>

        <Section title='run cut list' question='— what to cut and what from'>
          <div className='space-y-block'>
            {/* БЛОКЕРЫ ПЕРЕД ТАБЛИЦЕЙ. Это единственное место наряда, где цех обязан остановиться и
                спросить, а строка с прочерком в общей таблице теряется среди сорока таких же. */}
            <CutBlockers blockers={view.cutBlockers ?? []} />
            <CutList
              rows={view.cutRows}
              columns={view.cutColumns}
              rowTotal={view.cutRowTotal}
              total={view.piecesToCut}
              caveats={caveats}
              empty={
                filtered
                  ? 'not a single cut list row fell into the selected subset — clear the filter to see the rest.'
                  : (view.cutBlockers ?? []).length > 0
                    ? 'not a single piece linked to an article — everything that was found is in the block above.'
                    : (m.lines ?? []).length === 0
                      ? 'there is no cut list because there are no run lines: nothing to count “how much to cut” from.'
                      : 'the tech card has no cut pieces at all — there is nothing to cut from this run pack.'
              }
            />
          </div>
        </Section>

        <Section title='lays' question='— what lies on the table'>
          <Lays
            lays={view.lays}
            applicable={m.lays_applicable}
            notApplicableReason={m.lays_not_applicable_reason}
            filtered={filtered && (m.lays ?? []).length > 0}
          />
        </Section>

        <Section title='materials' question='— what is missing to cut'>
          <MaterialBlockers blockers={view.materialBlockers ?? []} />
        </Section>

        <Section>
          <Text size='micro' variant='label' component='p'>
            the run pack is live: quantities are taken from the run right now. run version{' '}
            {currentVersion}
            {m.generated_at
              ? ` · snapshot ${m.generated_at.slice(0, 16).replace('T', ' ')} UTC`
              : ''}
            . there is no money in the run pack — costing does not come here at all.
          </Text>
        </Section>
      </SectionStack>
    </Shell>
  );
}

// Одна колонка на всю ширину телефона; на десктопе — столбец по центру серого ground.
//
// 16PX, А НЕ 12PX АДМИНА, И ЭТО РЕШЕНИЕ, А НЕ НЕДОСМОТР. Двенадцать пикселей — размер плотного
// экспертного инструмента, который читают с полуметра сидя. Эту страницу читают с вытянутой руки,
// с телефона, в цеху, у настила — и увеличить её пальцами НЕЛЬЗЯ: index.html просит
// `maximum-scale=1, user-scalable=no`, чтобы iOS не зумил на фокусе поля. То есть здесь размер
// шрифта — единственная доступная цеху регулировка, и мы её не отбираем. Ячейки таблиц просят
// размер отдельно: `DataTable` называет свой (12px) сам, и наследование до них не доходит.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className='mx-auto w-full max-w-5xl px-2.5 py-4 text-base lg:px-4 lg:py-6'>{children}</div>
  );
}
