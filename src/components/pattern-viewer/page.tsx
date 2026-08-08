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
function Shell({ children }: { children: React.ReactNode }) {
  return <div className='mx-auto w-full max-w-3xl px-2.5 py-4 lg:px-4 lg:py-6'>{children}</div>;
}
