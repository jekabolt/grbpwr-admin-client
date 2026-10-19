import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from 'lib/utility';
import { Button, Text, Textarea } from 'ui';
import { FormatBar, type FormatMenuItem } from './format-bar';

/**
 * ЛИСТ ПРАВКИ ОДНОГО БЛОКА (телефон, режим «блоки»).
 *
 * ── ЗАНИМАЕТ ВЕСЬ ВИДИМЫЙ ВЬЮПОРТ ────────────────────────────────────────────────────────────
 *
 * Жалоба владельца на старый редактор — ряд форматирования висел посреди экрана над Safari, а
 * полю оставалась щель. Здесь лист стоит `fixed` с `top = visualViewport.offsetTop` и
 * `height = visualViewport.height`: клавиатура и панели Safari сжимают ВИДИМЫЙ вьюпорт, а не
 * вёрсточный, и лист сжимается вместе с ним — шапка сверху, ряд под ней, поле до клавиатуры.
 * Пишется прямо в узел, а не состоянием: `scroll` видимого вьюпорта идёт на каждый кадр.
 *
 * ── ЗАКРЫТЬ = ПРИМЕНИТЬ ──────────────────────────────────────────────────────────────────────
 *
 * Кнопки «cancel» нет (решение владельца): «done» кладёт правку в буфер, откат — общий discard
 * при выходе из правки. Лист, исчезнувший не через свои кнопки (поворот экрана сменил режим,
 * ушли со страницы), отдаёт набранное через `onLost` — набранное молча не теряется.
 */
export function BlockSheet({
  label,
  seed,
  wrapLines,
  menu,
  onDone,
  onLost,
}: {
  /** Что правится: вид блока или «new». */
  label: string;
  /** Текст блока, с которого начинается правка (переводы строк — `\n`). */
  seed: string;
  wrapLines: boolean;
  /** Хвост «•••» ряда: пункты листа (add below, delete block, wrap lines). Получают черновик. */
  menu: (draft: string, close: () => void) => FormatMenuItem[];
  onDone: (draft: string) => void;
  onLost: (draft: string) => void;
}) {
  const [draft, setDraft] = useState(seed);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  /** Лист закрыт своими кнопками — уборка при размонтировании ничего не отдаёт. */
  const closed = useRef(false);
  const latest = useRef({ draft, onLost });
  useLayoutEffect(() => {
    latest.current = { draft, onLost };
  });
  useEffect(
    () => () => {
      if (!closed.current) latest.current.onLost(latest.current.draft);
    },
    [],
  );
  const close = () => {
    closed.current = true;
  };

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const vv = window.visualViewport;
    if (!sheet || !vv) return;
    const place = () => {
      sheet.style.top = `${vv.offsetTop}px`;
      sheet.style.height = `${vv.height}px`;
    };
    place();
    vv.addEventListener('resize', place);
    vv.addEventListener('scroll', place);
    return () => {
      vv.removeEventListener('resize', place);
      vv.removeEventListener('scroll', place);
    };
  }, []);

  // ФОКУС И КАРЕТКА В КОНЕЦ — в том же такте, что и касание по блоку: iOS поднимает клавиатуру
  // только на фокус внутри жеста, а слой-эффект react успевает в него для дискретных событий.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    area.focus({ preventScroll: true });
    const end = area.value.length;
    area.setSelectionRange(end, end);
    area.scrollTop = area.scrollHeight;
  }, []);

  return createPortal(
    <div
      ref={sheetRef}
      role='dialog'
      aria-label={label}
      className='fixed inset-x-0 top-0 z-[var(--z-modal)] flex h-dvh flex-col bg-bgColor text-textColor md:hidden'
    >
      <div className='flex min-h-11 shrink-0 items-center gap-2 border-b border-borderColor pl-3 pr-1.5'>
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {label}
        </Text>
        <Button
          size='sm'
          variant='underline'
          className='ml-auto min-h-11 shrink-0'
          onClick={() => {
            close();
            onDone(areaRef.current?.value ?? draft);
          }}
        >
          done
        </Button>
      </div>
      <FormatBar
        areaRef={areaRef}
        value={draft}
        onChange={setDraft}
        phone={{ lead: [], tail: menu(draft, close), inFlow: true }}
      />
      <Textarea
        ref={areaRef}
        name='noteBlock'
        autoGrow={false}
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
        // 16px — мельче iOS приближает страницу на фокусе; автокоррекция и заглавные молча
        // портят разметку и адреса. `!` — `cn` примитива не знает `text-reading` размером и
        // оставляет рядом базовый `text-textBaseSize`, который иначе побеждает порядком правил.
        spellCheck={false}
        autoCorrect='off'
        autoCapitalize='off'
        wrap={wrapLines ? 'soft' : 'off'}
        className={cn(
          'min-h-0 flex-1 border-0 px-3 py-2.5 !text-reading leading-relaxed focus:border-0',
          !wrapLines && 'overflow-x-auto whitespace-pre',
        )}
      />
    </div>,
    document.body,
  );
}
