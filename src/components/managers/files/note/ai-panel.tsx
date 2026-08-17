import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import {
  formatNoteMarkdown,
  NoteFormatError,
  NOTE_FORMAT_MAX_RUNES,
  runeLength,
} from '../api/notesService';
import { plural } from '../upload/text';
import { MarkdownView } from './markdown-view';

/**
 * Помощник разметки: приводит набранный текст к аккуратному markdown.
 *
 * ТРИ ПРАВИЛА, КОТОРЫЕ ВАЖНЕЕ САМОЙ РАЗМЕТКИ.
 *
 * 1. РЕЗУЛЬТАТ — ПРЕДЛОЖЕНИЕ, А НЕ ЗАМЕНА. Молча переписанный чужой текст здесь худшее из
 *    возможного: автор не заметит, что потерял формулировку, а сравнить будет уже не с чем.
 *    Поэтому показываются обе стороны, и ни один исход не пишет в файл — принятое предложение
 *    меняет ТОЛЬКО буфер, а запись остаётся обычным сохранением со сравнением отпечатков.
 * 2. ВИДНО, ЧТО ИМЕННО УХОДИТ. Состояние ожидания называет объём и границу: содержимое целиком
 *    или выделенный фрагмент, столько-то знаков.
 * 3. КЛЮЧА МОЖЕТ НЕ БЫТЬ — И ЭКРАН ОБЯЗАН ОСТАТЬСЯ ЦЕЛЫМ. На бете ключ не задан штатно, то есть
 *    отказ `FailedPrecondition` — это НОРМАЛЬНЫЙ ответ, а не поломка. Он гасит блок в состояние
 *    «не подключён» и не трогает ни заметку, ни правку, ни сохранение.
 */

export type AiScope = 'all' | 'selection';

export interface AiSuggestion {
  /** Текст, который уходил в модель, — левая колонка «как сейчас». */
  before: string;
  /** Ответ модели — правая колонка «станет». */
  after: string;
  scope: AiScope;
  /** Куда возвращать ответ: границы выделения или null для всего буфера. */
  range: { start: number; end: number } | null;
}

export interface AiRequest {
  text: string;
  range: { start: number; end: number } | null;
}

export type AiState =
  | { kind: 'idle' }
  | { kind: 'working'; scope: AiScope; runes: number }
  | { kind: 'ready'; suggestion: AiSuggestion }
  | { kind: 'off' }
  | { kind: 'toolong'; runes: number; scope: AiScope }
  | { kind: 'failed'; message: string; request: AiRequest };

function scopeOf(req: AiRequest): AiScope {
  return req.range ? 'selection' : 'all';
}

/**
 * Состояние помощника. Живёт рядом с редактором, а не в общем сторе: помощник ничего не
 * персистит и не переживает уход с экрана — предложение, оставшееся от прошлой заметки, было бы
 * готовым способом подставить один текст вместо другого.
 */
export function useNoteAssistant() {
  const [state, setState] = useState<AiState>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);
  /** Номер обращения: ответ прошлого запроса не имеет права заменить состояние нового. */
  const runIdRef = useRef(0);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runIdRef.current += 1;
  }, []);

  // Уход с экрана прекращает обращение. Без этого ответ возвращался бы в размонтированный
  // компонент, а сервер продолжал бы ждать модель ради никому не нужного текста.
  useEffect(() => stop, [stop]);

  const run = useCallback(
    async (req: AiRequest) => {
      const scope = scopeOf(req);
      const runes = runeLength(req.text);
      // Потолок проверяется ЗДЕСЬ, а не по отказу сервера: на стенде без ключа сервер до
      // проверки длины вообще не доходит (пре-чек «помощник не подключён» стоит первым), и
      // состояние `toolong` иначе было бы недостижимо ровно там, где его показывают.
      if (runes > NOTE_FORMAT_MAX_RUNES) {
        stop();
        setState({ kind: 'toolong', runes, scope });
        return;
      }

      stop();
      const id = runIdRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ kind: 'working', scope, runes });

      try {
        const after = await formatNoteMarkdown(req.text, controller.signal);
        if (runIdRef.current !== id) return;
        setState({
          kind: 'ready',
          suggestion: { before: req.text, after, scope, range: req.range },
        });
      } catch (e) {
        if (runIdRef.current !== id) return;
        if (e instanceof NoteFormatError) {
          if (e.kind === 'aborted') return;
          if (e.kind === 'off') return setState({ kind: 'off' });
          if (e.kind === 'toolong') return setState({ kind: 'toolong', runes, scope });
          return setState({ kind: 'failed', message: e.message, request: req });
        }
        setState({ kind: 'failed', message: 'помощник не ответил', request: req });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [stop],
  );

  /** «Отменить» — настоящая отмена: соединение рвётся, буфер не тронут ничем. */
  const cancel = useCallback(() => {
    stop();
    setState({ kind: 'idle' });
  }, [stop]);

  return { state, run, cancel, dismiss: cancel };
}

export function AiPanel({
  state,
  stale,
  onCancel,
  onDismiss,
  onAccept,
  onRetry,
}: {
  state: AiState;
  /** Буфер изменился, пока помощник работал: предложение построено по прошлой версии. */
  stale?: boolean;
  onCancel: () => void;
  onDismiss: () => void;
  /** `edit` — «править предложение»: тот же буфер, но сразу в режиме правки. */
  onAccept: (suggestion: AiSuggestion, edit: boolean) => void;
  onRetry: (request: AiRequest) => void;
}) {
  if (state.kind === 'idle') return null;

  if (state.kind === 'off') {
    return (
      // Заливка добавлена намеренно: `note` и `error` у примитива без фона, а этот блок стоит
      // прямо на сером холсте страницы, а не внутри белой секции. Без заливки холст просвечивал
      // бы сквозь текст, и сообщение читалось бы как дыра в странице, а не как её материал.
      <CalloutBox tone='note' className='bg-bgColor'>
        <div className='flex flex-wrap items-baseline gap-2'>
          <Text size='micro' component='span'>
            <b>помощник не подключён.</b> ключ модели на этом стенде не задан — заметку это никак
            не ограничивает, просто кнопка ничего не сделает.
          </Text>
          {/* «Закрыть», а не «понятно»: соседние два состояния этой же панели закрываются
              кнопкой с таким именем, и кнопка называет действие, а не согласие. */}
          <Button size='xs' variant='secondary' className='ml-auto' onClick={onDismiss}>
            закрыть
          </Button>
        </div>
      </CalloutBox>
    );
  }

  if (state.kind === 'toolong') {
    return (
      <CalloutBox tone='warning'>
        <div className='flex flex-wrap items-baseline gap-2'>
          <Text size='micro' component='span'>
            <b>текст длиннее, чем помощник берёт за раз</b> — {state.runes.toLocaleString('ru-RU')}{' '}
            {plural(state.runes, 'знак', 'знака', 'знаков')} при пределе{' '}
            {NOTE_FORMAT_MAX_RUNES.toLocaleString('ru-RU')}. выделите кусок в тексте и нажмите ещё
            раз: уйдёт только выделенное, и заменится тоже только оно.
          </Text>
          <Button size='xs' variant='secondary' className='ml-auto' onClick={onDismiss}>
            закрыть
          </Button>
        </div>
      </CalloutBox>
    );
  }

  if (state.kind === 'working') {
    return (
      <CalloutBox tone='warning'>
        <div className='flex flex-wrap items-baseline gap-2'>
          <Text size='micro' component='span'>
            <b>помощник читает текст…</b> уходит{' '}
            {state.scope === 'selection' ? 'выделенный фрагмент' : 'содержимое заметки целиком'},{' '}
            {state.runes.toLocaleString('ru-RU')} {plural(state.runes, 'знак', 'знака', 'знаков')}.
            имя файла, темы и обсуждение не уходят.
          </Text>
          <Button size='xs' variant='secondary' className='ml-auto' onClick={onCancel}>
            отменить
          </Button>
        </div>
      </CalloutBox>
    );
  }

  if (state.kind === 'failed') {
    return (
      <CalloutBox tone='error' className='bg-bgColor'>
        <div className='flex flex-wrap items-baseline gap-2'>
          <Text size='micro' component='span'>
            <b>помощник не ответил.</b> {state.message}. текст заметки не тронут.
          </Text>
          <div className='ml-auto flex gap-1.5'>
            <Button size='xs' variant='secondary' onClick={() => onRetry(state.request)}>
              повторить
            </Button>
            <Button size='xs' variant='secondary' onClick={onDismiss}>
              закрыть
            </Button>
          </div>
        </div>
      </CalloutBox>
    );
  }

  const { suggestion } = state;
  return (
    <Section
      title='предложение помощника'
      question={`— разметка расставлена, формулировки не переписаны${
        suggestion.scope === 'selection' ? '; заменится только выделенное' : ''
      }`}
      action={
        <>
          <Button size='sm' variant='secondary' onClick={onDismiss}>
            отклонить
          </Button>
          <Button size='sm' variant='secondary' onClick={() => onAccept(suggestion, true)}>
            править предложение
          </Button>
          <Button size='sm' variant='main' onClick={() => onAccept(suggestion, false)}>
            принять
          </Button>
        </>
      }
    >
      {stale && (
        <Text size='micro' component='span' className='text-warning'>
          текст изменился, пока помощник работал: слева — та версия, которую он читал, и принять
          предложение поверх дописанного нельзя. попросите ещё раз.
        </Text>
      )}

      <div className='grid gap-2.5 lg:grid-cols-2'>
        <SuggestionColumn title='как сейчас' source={suggestion.before} />
        <SuggestionColumn title='станет' source={suggestion.after} />
      </div>

      <Text size='micro' variant='label'>
        принять — заменит текст заметки и оставит его несохранённым: последнее слово всё равно за
        вами
      </Text>
    </Section>
  );
}

function SuggestionColumn({ title, source }: { title: string; source: string }) {
  return (
    <div>
      <GroupLabel flush>{title}</GroupLabel>
      {/* Прокручиваемая полоса, а не вторая коробка: у области ограничена высота, и её границу
          рисуют ЛИНЕЙКИ сверху и снизу внутренним весом. Рамка по всем четырём сторонам была бы
          блоком внутри блока — ровно то, что система запрещает. */}
      <div className='max-h-[45vh] overflow-auto border-y border-hairline py-2'>
        <MarkdownView source={source} />
      </div>
    </div>
  );
}
