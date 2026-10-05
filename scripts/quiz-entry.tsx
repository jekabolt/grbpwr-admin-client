// СТЕНД КВИЗА ДОСКИ (ASK ME) — визуальный и поведенческий, не тест. Настоящий `MoodQuiz` в белом
// блоке, как под лентой MOODBOARD. Сеть — прокси в `quiz-shot.mjs`: `GenerateDesignQuiz` отдаёт
// фикстуру из шести вопросов (один с противоречащим вариантом и уточнением, один multi),
// `SaveDesignQuizAnswers` кладёт список в `window.__answers`, `DraftDesignIdea` — прозу.
//
// W-C2: `BriefProbe` — настоящие `useCardFacts` → `wordsBriefSource` → `requestBrief` с дребезгом,
// как у `useWordsSeeding` (короче: 120 мс), и `EnhanceText` через настоящий `enhanceText`. Счёт
// вызовов `EnhanceText` в `window.__calls` — сколько брифов стоил прогон квиза.
// `window.__preset` (ставит `quiz-shot.mjs` до бандла): сохранённые ответы, открытый прогон
// сервера (`session`, E2), задержка/отказ чтения.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { wordsBriefSource } from 'components/managers/tech-card/components/design/core/card-facts';
import { useCardFacts } from 'components/managers/tech-card/components/design/head/card-facts-form';
import { MoodQuiz } from 'components/managers/tech-card/components/design/mood-quiz';
import {
  clarifyOf,
  decisionLines,
  insertClarify,
} from 'components/managers/tech-card/components/design/quiz-model';
import { requestBrief } from 'components/managers/tech-card/components/design/words-brief';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { enhanceText } from 'ui/components/ai-enhance';
import { Section } from 'ui/components/section';

const q = (
  id: string,
  category: string,
  part: string,
  kind: string,
  question: string,
  options: string[],
  extra: Record<string, unknown> = {},
) => ({
  id,
  category,
  part,
  family: 'jacket',
  view: 'front',
  kind,
  question,
  options,
  contradicts: options.map(() => false),
  visualEvidence: '',
  clarifyQuestion: '',
  clarifyOptions: [],
  decisionKey: `${id}_key`,
  ...extra,
});

(window as unknown as { __quiz: unknown }).__quiz = {
  family: 'jacket',
  model: 'stub',
  questions: [
    q(
      'insulation',
      'materials',
      'lining',
      'single',
      'Is the jacket insulated or a light summer layer?',
      ['unlined, summer weight', 'half lining, cupro', 'wadded, 80 g fill', 'quilted down, 120 g'],
      {
        contradicts: [false, false, false, true],
        visualEvidence: 'pictures show a thin unlined shell',
        clarifyQuestion: 'The pictures read as a thin shell. Which one is right?',
        clarifyOptions: ['thin shell as pictured', 'puffed, as answered'],
      },
    ),
    q('collar', 'details', 'collar', 'single', 'How does the collar stand?', [
      'soft, folds flat',
      'stiff stand, 3 cm',
      'notched lapel',
    ]),
    q('pockets', 'details', 'pocket', 'multi', 'Which pockets does it carry?', [
      'welt chest pocket',
      'two patch hip pockets',
      'inside zip pocket',
      'flap cargo pockets',
    ]),
    q('length', 'design', 'whole', 'single', 'Where does the hem fall?', [
      'cropped, at the waist',
      'hip length',
      'mid thigh',
    ]),
    q('season', 'use', 'whole', 'single', 'Which season is it for?', [
      'spring and autumn',
      'summer',
      'winter',
    ]),
    q('label', 'finish', 'label', 'single', 'Which label does it use?', [
      'woven brand label',
      'care label',
      'size tab',
    ]),
    q('button_count', 'details', 'hw_button', 'single', 'How many buttons does it use?', [
      'four',
      'five',
      'six',
    ]),
    q('closure_type', 'details', 'closure', 'single', 'Which closure does it use?', [
      'buttons',
      'zip',
      'snaps',
    ]),
  ],
};
type Preset = { answers?: unknown[]; pictures?: number; session?: unknown };
const w = window as unknown as {
  __answers: unknown[];
  __session: unknown;
  __preset?: Preset;
  __model: unknown;
};
w.__answers = w.__preset?.answers ?? [];
// E2: открытый прогон на «сервере» — `{ questions, family }` или null.
w.__session = w.__preset?.session ?? null;
w.__model = { clarifyOf, decisionLines, insertClarify };

const always = () => true;
function BriefProbe() {
  const facts = useCardFacts(always);
  const source = useMemo(() => wordsBriefSource(facts), [facts]);
  const key = JSON.stringify([source.text, source.context]);
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    if (settled === key) return;
    const t = setTimeout(() => setSettled(key), 120);
    return () => clearTimeout(t);
  }, [key, settled]);
  useEffect(() => {
    if (settled !== key || !source.text) return;
    requestBrief(source.text, source.context, (r) =>
      enhanceText({ text: r.text, context: r.context, mode: 'prompt', field: 'words' }),
    );
  }, [settled, key, source]);
  return null;
}

function Concept() {
  const v = useWatch({ name: 'concept' }) as string;
  return (
    <p data-probe='concept' style={{ fontFamily: 'monospace', fontSize: 11 }}>
      concept: {v || '—'}
    </p>
  );
}

function Form({ children }: { children: React.ReactNode }) {
  const form = useForm({ defaultValues: { concept: '' } as never });
  return <FormProvider {...form}>{children}</FormProvider>;
}

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={qc}>
    <DesignCapabilityProvider value>
      <DictionaryProvider>
        <MemoryRouter initialEntries={['/tech-cards/1']}>
          <Routes>
            <Route
              path='/tech-cards/:id'
              element={
                <Form>
                  <BriefProbe />
                  <div data-probe='quiz' style={{ padding: 24, maxWidth: 1000 }}>
                    <Section id='mb-board' title='moodboard'>
                      <div className='space-y-stack'>
                        <div
                          style={{
                            height: 120,
                            background:
                              'repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0/24px 24px',
                          }}
                          aria-label='board strip stand-in'
                        />
                        <MoodQuiz
                          techCardId={1}
                          readOnly={false}
                          pictures={w.__preset?.pictures ?? 3}
                          concept=''
                          conceptMax={2000}
                        />
                      </div>
                    </Section>
                    <Concept />
                  </div>
                </Form>
              }
            />
          </Routes>
        </MemoryRouter>
      </DictionaryProvider>
    </DesignCapabilityProvider>
  </QueryClientProvider>,
);
