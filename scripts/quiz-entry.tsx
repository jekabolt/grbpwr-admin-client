// СТЕНД КВИЗА ДОСКИ (ASK ME) — визуальный и поведенческий, не тест. Настоящий `MoodQuiz` в белом
// блоке, как под лентой MOODBOARD. Сеть — прокси в `quiz-shot.mjs`: `GenerateDesignQuiz` отдаёт
// фикстуру из шести вопросов (один с противоречащим вариантом и уточнением, один multi),
// `SaveDesignQuizAnswers` кладёт список в `window.__answers`, `DraftDesignIdea` — прозу.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { createRoot } from 'react-dom/client';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { MoodQuiz } from 'components/managers/tech-card/components/design/mood-quiz';
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
    q('label', 'finish', 'back', 'single', 'Where does the brand label go?', [
      'neck tape inside',
      'woven patch at the back hem',
      'none, printed only',
    ]),
  ],
};
(window as unknown as { __answers: unknown[] }).__answers = [];

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
      <Form>
        <div data-probe='quiz' style={{ padding: 24, maxWidth: 1000 }}>
          <Section id='mb-board' title='moodboard'>
            <div className='space-y-stack'>
              <div
                style={{
                  height: 120,
                  background: 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0/24px 24px',
                }}
                aria-label='board strip stand-in'
              />
              <MoodQuiz techCardId={1} readOnly={false} pictures={3} concept='' conceptMax={2000} />
            </div>
          </Section>
          <Concept />
        </div>
      </Form>
    </DesignCapabilityProvider>
  </QueryClientProvider>,
);
