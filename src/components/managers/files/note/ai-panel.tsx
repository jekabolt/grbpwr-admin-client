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
 * 3. ПОМОЩНИКА МОЖЕТ НЕ БЫТЬ — И ЭКРАН ОБЯЗАН ОСТАТЬСЯ ЦЕЛЫМ. На бете помощник штатно не
 *    подключён, то есть отказ `FailedPrecondition` — это НОРМАЛЬНЫЙ ответ, а не поломка. Он
 *    гасит блок в состояние «not connected» и не трогает ни заметку, ни правку, ни сохранение.
 *    Именно «помощника», а не «ключа»: в это состояние ведут разные причины, и панель не имеет
 *    права называть ни одну из них — см. `off` ниже.
 */

export type AiScope = 'all' | 'selection';

export interface AiSuggestion {
  /** Текст, который уходил в модель, — левая колонка «how it is now». */
  before: string;
  /** Ответ модели — правая колонка «how it will be». */
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
  /**
   * Предложение принято — и панель НЕ закрывается.
   *
   * Закрытая панель делала «принять» необратимым: колонка «как сейчас» была единственной копией
   * прежнего текста, ⌘Z сюда не достаёт (буфер меняет react, а не поле), а черновик браузера
   * через полсекунды перезаписывался принятым. Подпись под колонками при этом обещала, что
   * последнее слово за человеком. Теперь обещание выполняется кнопкой: обе версии остаются на
   * экране, пока их не закрыли руками.
   */
  | { kind: 'applied'; previous: string; next: string; scope: AiScope }
  | { kind: 'off' }
  /**
   * НАСТРОЙКА СЛОМАНА — и это отдельное состояние ровно потому, что выглядеть оно обязано иначе.
   *
   * `off` спокоен намеренно: на бете помощника нет, это норма развёртывания. Но на проде ключ
   * ЕСТЬ, и снятый с обслуживания слуг приезжал тем же самым `FailedPrecondition` — то есть
   * поломка на проде выглядела нормой и никого не побуждала разбираться. Сервер теперь называет
   * причину машинночитаемо (`ErrorInfo.reason`), и громкая причина получает громкий вид.
   */
  | { kind: 'misconfigured' }
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
      // проверки длины вообще не доходит (пре-чек «the assistant is not connected» стоит первым), и
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
          if (e.kind === 'misconfigured') return setState({ kind: 'misconfigured' });
          if (e.kind === 'toolong') return setState({ kind: 'toolong', runes, scope });
          return setState({ kind: 'failed', message: e.message, request: req });
        }
        setState({ kind: 'failed', message: "the assistant didn't answer", request: req });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [stop],
  );

  /** «cancel» — настоящая отмена: соединение рвётся, буфер не тронут ничем. */
  const cancel = useCallback(() => {
    stop();
    setState({ kind: 'idle' });
  }, [stop]);

  /** Предложение ушло в буфер. Обе версии остаются на экране — см. `applied` в `AiState`. */
  const applied = useCallback((previous: string, next: string, scope: AiScope) => {
    setState({ kind: 'applied', previous, next, scope });
  }, []);

  return { state, run, cancel, applied, dismiss: cancel };
}

export function AiPanel({
  state,
  stale,
  onCancel,
  onDismiss,
  onAccept,
  onRevert,
  onRetry,
}: {
  state: AiState;
  /** Буфер изменился, пока помощник работал: предложение построено по прошлой версии. */
  stale?: boolean;
  onCancel: () => void;
  onDismiss: () => void;
  /** `edit` — «edit the suggestion»: тот же буфер, но сразу в режиме правки. */
  onAccept: (suggestion: AiSuggestion, edit: boolean) => void;
  /** Вернуть буфер к тому, что было до «accept». `next` — чтобы возврат отказался работать,
   * если после принятия текст успели поправить руками. */
  onRevert: (previous: string, next: string) => void;
  onRetry: (request: AiRequest) => void;
}) {
  if (state.kind === 'idle') return null;

  if (state.kind === 'off') {
    return (
      // Заливка добавлена намеренно: `note` и `error` у примитива без фона, а этот блок стоит
      // прямо на сером холсте страницы, а не внутри белой секции. Без заливки холст просвечивал
      // бы сквозь текст, и сообщение читалось бы как дыра в странице, а не как её материал.
      <CalloutBox tone='note' className='bg-bgColor'>
        <div data-ai-state='off' className='flex flex-wrap items-baseline gap-2'>
          {/* ПРИЧИНА НЕ НАЗЫВАЕТСЯ — и это не скромность, а единственное верное, что тут можно
              сказать. В это состояние ведут ТРИ разных пути (`notesService`): ключа модели нет;
              ключ есть, а слуг модели у провайдера мёртв; помощника на этом контуре не выкатывали
              вовсе. Прежняя фраза «the model key is not set on this deployment» была верна ровно
              для первого и уверенно врала в двух остальных — человек шёл искать ключ, который на
              месте. Провести причину сюда нечем: первые два отказа приезжают ОДНИМ кодом
              (`FailedPrecondition`) и неотличимы, а слова сервера в панель не едут намеренно —
              см. `formatNoteMarkdown`. Осталось состояние и его последствие: они верны для всех
              трёх причин, а «почему» ищут на стенде, а не в заметке. */}
          <Text size='micro' component='span'>
            <b>the assistant is not connected.</b> that doesn't limit the note in any way — the
            text, the edit and the save work as usual, and the button simply won't do anything.
          </Text>
          {/* «close», а не «got it»: соседние два состояния этой же панели закрываются
              кнопкой с таким именем, и кнопка называет действие, а не согласие. */}
          <Button size='xs' variant='secondary' className='ml-auto' onClick={onDismiss}>
            close
          </Button>
        </div>
      </CalloutBox>
    );
  }

  if (state.kind === 'misconfigured') {
    return (
      // tone='error', а не 'note': это единственное, чем поломка отличается от нормы ДО того, как
      // текст прочитан. Сосед `off` намеренно тихий, и если оба выглядят одинаково, то различать
      // их на проводе было незачем.
      <CalloutBox tone='error' className='bg-bgColor'>
        <div data-ai-state='misconfigured' className='flex flex-wrap items-baseline gap-2'>
          <Text size='micro' component='span'>
            <b>the assistant is misconfigured.</b> the model this deployment asks for is not served
            any more — that is a setting on the server, not a hiccup, so pressing again won't help.
            tell whoever keeps the deployment. the note itself is untouched: the text, the edit and
            the save work as usual.
          </Text>
          {/* «retry» здесь НЕТ, и это не забывчивость: повтор обречён ровно так же, как был обречён
              до того, как отказ научился называть причину. Кнопка, предлагающая бессмысленное
              действие, — это то же самое обещание «попробуйте через минуту», только кнопкой. */}
          <Button size='xs' variant='secondary' className='ml-auto' onClick={onDismiss}>
            close
          </Button>
        </div>
      </CalloutBox>
    );
  }

  if (state.kind === 'toolong') {
    return (
      <CalloutBox tone='warning'>
        <div data-ai-state='toolong' className='flex flex-wrap items-baseline gap-2'>
          <Text size='micro' component='span'>
            <b>the text is longer than the assistant takes at once</b> —{' '}
            {state.runes.toLocaleString('ru-RU')} {plural(state.runes, 'character')} against a limit
            of {NOTE_FORMAT_MAX_RUNES.toLocaleString('ru-RU')}. select a piece of the text and press
            again: only the selected part goes, and only it gets replaced.
          </Text>
          <Button size='xs' variant='secondary' className='ml-auto' onClick={onDismiss}>
            close
          </Button>
        </div>
      </CalloutBox>
    );
  }

  if (state.kind === 'working') {
    return (
      <CalloutBox tone='warning'>
        <div data-ai-state='working' className='flex flex-wrap items-baseline gap-2'>
          <Text size='micro' component='span'>
            <b>the assistant is reading the text…</b> what goes is{' '}
            {state.scope === 'selection' ? 'the selected fragment' : 'the note contents in full'},{' '}
            {state.runes.toLocaleString('ru-RU')} {plural(state.runes, 'character')}. the file name,
            the topics and the discussion do not go.
          </Text>
          <Button size='xs' variant='secondary' className='ml-auto' onClick={onCancel}>
            cancel
          </Button>
        </div>
      </CalloutBox>
    );
  }

  if (state.kind === 'failed') {
    return (
      <CalloutBox tone='error' className='bg-bgColor'>
        <div data-ai-state='failed' className='flex flex-wrap items-baseline gap-2'>
          <Text size='micro' component='span'>
            <b>the assistant didn't answer.</b> {state.message}. the note text is untouched.
          </Text>
          <div className='ml-auto flex gap-1.5'>
            <Button size='xs' variant='secondary' onClick={() => onRetry(state.request)}>
              retry
            </Button>
            <Button size='xs' variant='secondary' onClick={onDismiss}>
              close
            </Button>
          </div>
        </div>
      </CalloutBox>
    );
  }

  if (state.kind === 'applied') {
    return (
      <Section
        title='suggestion accepted'
        question='— the text in the field is replaced, and the note is NOT saved'
        action={
          <>
            <Button
              size='sm'
              variant='secondary'
              onClick={() => onRevert(state.previous, state.next)}
            >
              put it back as it was
            </Button>
            <Button size='sm' variant='main' onClick={onDismiss}>
              close
            </Button>
          </>
        }
      >
        {/* Колонки те же и в том же порядке, что до принятия: слева прежний текст, справа
            нынешний. Меняются только подписи — «how it is now» после принятия означало бы уже не
            то, что означало минуту назад. */}
        <div className='grid gap-2.5 lg:grid-cols-2'>
          <SuggestionColumn title='how it was' source={state.previous} />
          <SuggestionColumn title='how it is now' source={state.next} />
        </div>

        <Text size='micro' variant='label'>
          the revert puts exactly the pre-accept text into the field. if you have already edited the
          text by hand after accepting, the revert will refuse — it won't erase what you typed.
        </Text>
      </Section>
    );
  }

  const { suggestion } = state;
  return (
    <Section
      title="the assistant's suggestion"
      question={`— the markup is placed, the wording is not rewritten${
        suggestion.scope === 'selection' ? '; only the selected part will be replaced' : ''
      }`}
      action={
        <>
          <Button size='sm' variant='secondary' onClick={onDismiss}>
            reject
          </Button>
          <Button size='sm' variant='secondary' onClick={() => onAccept(suggestion, true)}>
            edit the suggestion
          </Button>
          <Button size='sm' variant='main' onClick={() => onAccept(suggestion, false)}>
            accept
          </Button>
        </>
      }
    >
      {stale && (
        <Text size='micro' component='span' className='text-warning'>
          the text changed while the assistant was working: on the left is the version it read, and
          the suggestion can't be accepted on top of what you added. ask again.
        </Text>
      )}

      <div className='grid gap-2.5 lg:grid-cols-2'>
        <SuggestionColumn title='how it is now' source={suggestion.before} />
        <SuggestionColumn title='how it will be' source={suggestion.after} />
      </div>

      <Text size='micro' variant='label'>
        accept — will replace the note text and leave it unsaved: the last word is yours anyway. the
        panel won't close after that, and what was accepted can be put back right away.
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
