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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DesignCapabilityProvider } from 'components/managers/tech-card/components/design/capability';
import { wordsBriefSource } from 'components/managers/tech-card/components/design/core/card-facts';
import { useCardFacts } from 'components/managers/tech-card/components/design/head/card-facts-form';
import { MoodQuiz } from 'components/managers/tech-card/components/design/mood-quiz';
import { CornerMenu } from 'components/managers/tech-card/components/design/picture-tile';
import {
  roleMenu,
  usePictureAnchor,
  type QuizPicture,
} from 'components/managers/tech-card/components/design/quiz-anchor';
import {
  applyRows,
  clarifyOf,
  decisionLines,
  insertClarify,
  QUIZ_MAX,
} from 'components/managers/tech-card/components/design/quiz-model';
import { seamOf, swatchOf } from 'components/managers/tech-card/components/design/seam-icons';
import { requestBrief } from 'components/managers/tech-card/components/design/words-brief';
import { DictionaryProvider } from 'lib/providers/dictionary-provider';
import { enhanceText } from 'ui/components/ai-enhance';
import { FocusedAnnotator, type FocusedView } from 'ui/components/focused-annotator';
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

const defaultQuiz = {
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
// 70-SEAMS: `quiz` — свой набор вопросов вместо фикстуры, `seamClass` — класс шва карточки в форме.
// 96-PICTURE-QUESTIONS: `board` — настоящая лента `FocusedAnnotator` с картинками вместо заглушки,
// якорь через тот же `usePictureAnchor`, что у доски.
type BoardPic = { id: number; role: string; shade: string };
type Preset = {
  board?: BoardPic[];
  answers?: unknown[];
  pictures?: number;
  session?: unknown;
  quiz?: unknown;
  seamClass?: string;
};
const w = window as unknown as {
  __answers: unknown[];
  __session: unknown;
  __preset?: Preset;
  __model: unknown;
  __quiz: unknown;
  __form: unknown;
};
w.__quiz = w.__preset?.quiz ?? defaultQuiz;
w.__answers = w.__preset?.answers ?? [];
// E2: открытый прогон на «сервере» — `{ questions, family }` или null.
w.__session = w.__preset?.session ?? null;
w.__model = { applyRows, clarifyOf, decisionLines, insertClarify, QUIZ_MAX, seamOf, swatchOf };

// Картинка-заглушка: серый кадр с крупной цифрой — монохром, как у доски.
const picUrl = (n: number, shade: string, w: number, h: number) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='${shade}'/><text x='50%' y='55%' font-family='monospace' font-size='${h / 3}' text-anchor='middle' fill='#000'>${n}</text></svg>`,
  )}`;

function Board({
  pics: initial,
  quiz,
}: {
  pics: BoardPic[];
  quiz: (p: QuizProps) => React.ReactNode;
}) {
  // 97: роли живут в состоянии ленты — ответ на вопрос роли и угол-меню пишут одно и то же.
  const [pics, setPics] = useState(initial);
  const onSetRole = useCallback(
    (id: number, role: string) =>
      setPics((list) => list.map((p) => (p.id === id ? { ...p, role } : p))),
    [],
  );
  const unmarked = useMemo(() => pics.filter((p) => !p.role).map((p) => p.id), [pics]);
  const scope = useRef<HTMLDivElement>(null);
  const { anchored, onFocusPicture } = usePictureAnchor(scope, true);
  const views: FocusedView[] = pics.map((p, i) => {
    const w = i % 2 ? 300 : 240;
    const url = picUrl(i + 1, p.shade, w, 320);
    const size = { mediaUrl: url, width: w, height: 320 };
    return {
      key: String(p.id),
      mediaId: p.id,
      full: { id: p.id, media: { fullSize: size, thumbnail: size } } as never,
    };
  });
  const pictureOf = useCallback(
    (id: number): QuizPicture | null => {
      const at = pics.findIndex((p) => p.id === id);
      if (at < 0) return null;
      return { n: at + 1, role: pics[at].role, url: picUrl(at + 1, pics[at].shade, 240, 320) };
    },
    [pics],
  );
  return (
    <div ref={scope} className='space-y-stack'>
      <FocusedAnnotator
        layout='grid'
        gridRowHeight={220}
        readOnly
        views={views}
        calloutsFor={() => []}
        onAddCallout={() => undefined}
        onMoveCallout={() => undefined}
        onRemoveCallout={() => undefined}
        onPickMedia={() => []}
        onRemoveMedia={() => undefined}
        addLabel='+ picture'
        purpose='moodboard reference'
        emptyLabel='nothing on the board yet'
        mediaLabel={(v, i) => `moodboard picture ${i + 1}`}
        tileBadge={(v) => pics.find((p) => p.id === v.mediaId)?.role || null}
        tileCorners={(v, i) => ({
          right: (
            <CornerMenu
              menu={roleMenu(v.mediaId, i + 1, pics[i]?.role ?? '', (r) => onSetRole(v.mediaId, r))}
            />
          ),
        })}
        anchoredMediaId={anchored}
      />
      {quiz({ pictureOf, onFocusPicture, unmarked, onSetRole })}
    </div>
  );
}
type QuizProps = {
  pictureOf?: (id: number) => QuizPicture | null;
  onFocusPicture?: (id: number | null) => void;
  unmarked?: number[];
  onSetRole?: (id: number, role: string) => void;
};

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
  const form = useForm({
    defaultValues: {
      concept: '',
      construction: { defaultSeamClass: w.__preset?.seamClass ?? 'TECH_CARD_SEAM_CLASS_UNKNOWN' },
    } as never,
  });
  // подписка прокси formState на dirtyFields — иначе RHF их не ведёт для чтения вне рендера
  void form.formState.dirtyFields;
  w.__form = {
    seamClass: () => form.getValues('construction.defaultSeamClass' as never),
    seamDirty: () =>
      !!(form.formState.dirtyFields as { construction?: { defaultSeamClass?: boolean } })
        .construction?.defaultSeamClass,
  };
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
                      {w.__preset?.board ? (
                        <Board
                          pics={w.__preset.board}
                          quiz={(extra) => (
                            <MoodQuiz
                              techCardId={1}
                              readOnly={false}
                              pictures={w.__preset?.board?.length ?? 0}
                              concept=''
                              conceptMax={2000}
                              {...extra}
                            />
                          )}
                        />
                      ) : (
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
                      )}
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
