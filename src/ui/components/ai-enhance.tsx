import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { adminService } from 'api/api';
import type { EnhanceTextField, EnhanceTextMode } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import GenericPopover from 'ui/components/popover';

/**
 * ═══ AI ENHANCE — ОДНА ТИХАЯ КНОПКА В УГЛУ СВОБОДНОГО ТЕКСТА ═══════════════════════════════════
 *
 * Волна 2026-09-25 (tmp/plans/techcard-ux-0925/04-DEEP-03-ai-enhance.md). Владелец: «на всех
 * таких полях типа note или DESCRIPTION в мудборде добавить снизу справа кнопку ai enhance… поправить
 * ошибки, написать более детально или наоборот короче».
 *
 * ФОРМА: ровно одна кнопка `ai ✦` в правом нижнем углу обёртки поля; клик открывает поповер с
 * четырьмя строками (improve · expand · shorten · as a prompt — переписать как промпт для генерации;
 * 26.09, O-50). Ответ ЗАМЕНЯЕТ текст поля через `onApply`, и на
 * десять секунд рядом появляется `undo ↶` — вернуть, что было. Никаких второй кнопки, переключателей
 * режимов и превью: поле само и есть превью, а откат — одна дверь.
 *
 * СЕТЬ: `enhanceText` — единственный адрес RPC `EnhanceText` (POST /api/admin/ai/enhance-text),
 * подключён в волне 25.09 (зона CL-E). Компонент о проводе не знает и меняться не должен.
 *
 * ОБЁРТКА ПОЛЯ: родитель делает `relative` и даёт textarea `pb-7`, чтобы последняя строка текста
 * не уезжала под кнопку. `maxRunes` — лимит поля назначения (2000 у DESCRIPTION/WORDS/NOTE): сервер
 * клампит ответ по границе предложения, а не режет посреди слова.
 *
 * `disabled` — ПОЛНЫЙ ЗАМОК (ревью CL-D): ни запуска, ни `undo ↶`, и ответ, пришедший в запертое
 * поле или в поле, текст которого уже не тот, что ушёл на сервер, НЕ ПРИМЕНЯЕТСЯ — иначе FLAT
 * GENERATE, сохраняющий слова, показал бы после себя слова, которых его прогон не получал.
 *
 * ВИДИМОСТЬ (26.09, O-30; владелец: «кнопка ai должна появляться только если мы в активном поле
 * текстбокса, а не всегда, и для пустых текстбоксов вообще не должна показываться»). `ai ✦` стоит в
 * углу, только пока фокус У СВОИХ (сам текст поля, кнопка, чип отката или открытое меню) И в поле
 * есть текст. Летящий запрос кнопку НЕ держит (ревью O-30, MAJOR 1): уйди фокус из поля, пока ответ
 * в пути, — кнопки нет, ответ всё равно ложится, и `undo ↶` встаёт один. Пустое или запертое поле не
 * показывает кнопки вовсе — прежнего выключенного «write something first» нет. `undo ↶` живёт свои
 * десять секунд независимо от фокуса: после замены в оставленном поле он — единственное, что видно.
 *
 * ЧТО «СВОЁ» — текстовый контрол поля, сам ряд (кнопка и чип) и портированное меню; НЕ вся обёртка
 * (ревью O-30, MAJOR 2): в DESCRIPTION и GENERAL INFORMATION рядом стоит пилюля «принять черновик»,
 * и Tab с текста на неё — уход из поля, кнопка гаснет. Поле ищется как ближайший предок с текстовым
 * контролом (`fieldOf`), а не голый `parentElement`: у WORDS кнопка стоит на уровень глубже, в угловой
 * строке рядом со счётчиком. Фокус слушается на `document` (focusin/focusout), а не на обёртке: меню
 * портируется в body, и уход фокуса ИЗ него обёртка не увидела бы. Нажатие на кнопку не уводит
 * каретку из текста (`onMouseDown` → preventDefault); после выбора режима фокус идёт обратно в текст
 * (`pickedMode`) — Escape и повторное нажатие возвращают его на кнопку, как у любой кнопки с меню.
 *
 * ⚠ УХОД ФОКУСА СО СНЯТОГО УЗЛА — НЕ УХОД ИЗ ПОЛЯ. Chromium шлёт focusout (relatedTarget = null) по
 * элементу, который УБРАЛИ из DOM с фокусом: строка меню при закрытии, чип `undo ↶` при нажатии,
 * сама кнопка, когда родитель опустошил или запер поле. Радикс возвращает фокус лишь задачей позже
 * (setTimeout в FocusScope), и, прими мы этот blur за чистую монету, кнопка размонтировалась бы под
 * ним и возвращать фокус было бы некуда. Поэтому blur судится микрозадачей позже: снятая строка меню
 * — дело Радикса (закрытие меню возвращает фокус на кнопку или в текст и перечитывает
 * `activeElement`); снятый СВОЙ узел — кнопка или чип с фокусом на нём (`ownFocus`) — отдаёт фокус
 * тексту поля сам (`handOff`; ревью O-30, MAJOR 5): без этого фокус падал бы в body, `focused`
 * оставался бы ложно истинным, и после разблокировки кнопка вставала бы в поле, где никого нет.
 * Чип отката фокуса по нажатию не берёт (тоже `onMouseDown` → preventDefault): фокус, пришедший на
 * чип, привёл бы рядом `ai ✦`, ряд прижат вправо — чип уехал бы из-под указателя, и клик пропал бы
 * (замерено стендом). Таймер отката (десять секунд) фокуса не трогает: он лишь снимает чип, а фокус
 * с него, если он там был, отдаёт тот же `handOff`; ручная правка снимает и чип, и таймер (MAJOR 4).
 *
 * ОТВЕТ НЕ ЛОЖИТСЯ В ПОЛЕ, КОТОРОЕ ПОД НИМ ШЕВЕЛИЛОСЬ (ревью O-30, MAJOR 3). Замок или правка,
 * случившиеся ПОКА ответ летел, защёлкиваются на запросе при первом же рендере (`flight.invalid`) и
 * не снимаются: правка A → B → A и замок, снятый до прихода медленного ответа, — всё равно «not
 * applied». Конечный снимок (`latest`) сверяется тоже, на случай ответа в том же тике.
 *
 * РАСШИРИТЕЛЬ ПОЛЯ НЕ НАКРЫВАЕТСЯ (26.09, O-42; владелец: «если у нас есть расширитель блока текста,
 * кнопка ai не должна наезжать на него»). У textarea без автовысоты (`resize-y`: GENERAL INFORMATION,
 * WORDS) браузер рисует ручку в правом нижнем углу, 16px. Компонент сам читает `resize` у textarea
 * поля и у такого поля отступает вправо на ширину ручки (`right: 22px` вместо 6), на той же высоте:
 * ряд привязан к низу поля, а не к строке текста, и при любой высоте — минимальной или растянутой
 * рукой — остаётся слева от ручки, в полосе `pb-7`, которую поле держит под ним. Появление и уход
 * кнопки ряд не двигают: место ряда задано отступами, а не содержимым.
 */
export type EnhanceMode =
  | 'improve'
  | 'expand'
  | 'shorten'
  | 'prompt'
  // The PLAYGROUND prompt field's Improve (20-PROMPTS §3.8): one field of an image tool rewritten for
  // that field. Not in `ENHANCE_MODES` — never a choice of this menu.
  | 'steer';

/** Что за поле — закрытый список (сервер держит такой же enum; свободный текст в промпт не идёт). */
export type EnhanceField = 'description' | 'note' | 'words' | 'silhouette' | 'fabric' | 'other';

export const ENHANCE_MODES: ReadonlyArray<{ mode: EnhanceMode; label: string; hint: string }> = [
  { mode: 'improve', label: 'improve', hint: 'fix errors, make it clearer' },
  { mode: 'expand', label: 'expand', hint: 'more detail' },
  { mode: 'shorten', label: 'shorten', hint: 'to the point' },
  { mode: 'prompt', label: 'as a prompt', hint: 'rewrite as a generation prompt' },
];

export type EnhanceRequest = {
  text: string;
  mode: EnhanceMode;
  field: EnhanceField;
  /** Факты карточки (`cardFactsContext`), без картинок. */
  context?: string;
  /** Лимит поля назначения; сервер не вернёт длиннее. */
  maxRunes?: number;
  /**
   * STEER only: the PLAYGROUND workflow key and the field key of its prompt. The server names the
   * tool and the field from its own table by this pair and refuses STEER without a known one
   * (InvalidArgument on `workflow` / `field_key`); every other mode ignores both.
   */
  workflow?: string;
  fieldKey?: string;
};

export class EnhanceRefusal extends Error {
  constructor(
    public readonly reason: 'AI_NOT_CONFIGURED' | 'AI_MODEL_UNAVAILABLE' | 'OTHER',
    message: string,
  ) {
    super(message);
  }
}

const MODE_WIRE: Record<EnhanceMode, EnhanceTextMode> = {
  improve: 'ENHANCE_TEXT_MODE_IMPROVE',
  expand: 'ENHANCE_TEXT_MODE_EXPAND',
  shorten: 'ENHANCE_TEXT_MODE_SHORTEN',
  prompt: 'ENHANCE_TEXT_MODE_PROMPT',
  steer: 'ENHANCE_TEXT_MODE_STEER',
};

const FIELD_WIRE: Record<EnhanceField, EnhanceTextField> = {
  description: 'ENHANCE_TEXT_FIELD_DESCRIPTION',
  note: 'ENHANCE_TEXT_FIELD_NOTE',
  words: 'ENHANCE_TEXT_FIELD_WORDS',
  silhouette: 'ENHANCE_TEXT_FIELD_SILHOUETTE',
  fabric: 'ENHANCE_TEXT_FIELD_FABRIC',
  other: 'ENHANCE_TEXT_FIELD_OTHER',
};

/**
 * `ErrorInfo.reason` из деталей google.rpc.Status (их хранит `api/api.ts` в `error.details`).
 * Сверка по суффиксу `@type`, как в `utils/field-errors.ts`; голый объект с `reason` тоже годится.
 */
function errorInfoReason(error: unknown): string | undefined {
  const details = (error as { details?: unknown } | null)?.details;
  if (!Array.isArray(details)) return undefined;
  for (const d of details) {
    if (!d || typeof d !== 'object') continue;
    const type = (d as { '@type'?: unknown })['@type'];
    if (typeof type === 'string' && !type.endsWith('ErrorInfo')) continue;
    const reason = (d as { reason?: unknown }).reason;
    if (typeof reason === 'string' && reason) return reason;
  }
  return undefined;
}

/**
 * Единственная дверь к серверу: `adminService.EnhanceText`. Режим и поле уходят закрытыми enum'ами
 * (сервер сам превращает их в свою фразу промпта), `maxRunes` — лимит поля назначения (0 = 4000 на
 * сервере). Отказ с `ErrorInfo` становится `EnhanceRefusal` с той же причиной (`AI_NOT_CONFIGURED`,
 * `AI_MODEL_UNAVAILABLE`; незнакомая — `OTHER`), остальные ошибки (занят, лимит в час, сеть) идут
 * как есть — компонент показывает их текст.
 *
 * `signal` не доходит до сети: сгенерированный клиент не принимает AbortSignal. Поздний ответ
 * отбрасывает сам компонент (он сверяет свой контроллер после `await`).
 */
export async function enhanceText(req: EnhanceRequest, _signal?: AbortSignal): Promise<string> {
  try {
    const res = await adminService.EnhanceText({
      text: req.text,
      mode: MODE_WIRE[req.mode],
      field: FIELD_WIRE[req.field],
      context: req.context ?? '',
      maxRunes: req.maxRunes ?? 0,
      workflow: req.workflow ?? '',
      fieldKey: req.fieldKey ?? '',
    });
    return res.text ?? '';
  } catch (e) {
    const reason = errorInfoReason(e);
    if (!reason) throw e;
    const known = reason === 'AI_NOT_CONFIGURED' || reason === 'AI_MODEL_UNAVAILABLE';
    throw new EnhanceRefusal(known ? reason : 'OTHER', e instanceof Error ? e.message : reason);
  }
}

const UNDO_WINDOW_MS = 10_000;

const TEXT_CONTROL = 'textarea, input, [contenteditable]';
const TRIGGER = 'button[aria-label="ai enhance"]';

/**
 * The field this control belongs to: the nearest ancestor that holds a text control. Every call
 * site renders `AiEnhance` inside the field's `relative` wrapper; WORDS keeps it one level deeper,
 * in the corner row beside the counter, so the parent alone is not the field. Stops short of
 * `body` — a control with no text control above it owns only its parent.
 */
function fieldOf(root: HTMLElement): HTMLElement {
  for (let el = root.parentElement; el && el !== document.body; el = el.parentElement) {
    if (el.querySelector(TEXT_CONTROL)) return el;
  }
  return root.parentElement ?? root;
}

/** The field's text control — what «the caret is in the field» means. */
function textControlOf(root: HTMLElement | null): HTMLElement | null {
  return root ? fieldOf(root).querySelector<HTMLElement>(TEXT_CONTROL) : null;
}

/**
 * Whether `node` is this control's own: the field's text control or the row itself (trigger, undo
 * chip). A sibling control in the same wrapper — the «accept drafted value» pill — is not: focus on
 * it is focus out of the text.
 */
function isOwn(root: HTMLElement, node: Node): boolean {
  return !!textControlOf(root)?.contains(node) || root.contains(node);
}

/** …or in the open menu (portalled to body by Radix). */
function inHome(root: HTMLElement | null, menu: HTMLElement | null, node: EventTarget | null) {
  if (!root || !(node instanceof Node)) return false;
  if (isOwn(root, node)) return true;
  const panel = menu?.closest('[data-radix-popper-content-wrapper]') ?? menu;
  return !!panel && panel.contains(node);
}

export function AiEnhance({
  value,
  onApply,
  field,
  context,
  maxRunes,
  disabled,
  className,
}: {
  value: string | null | undefined;
  /** Получает новый текст; родитель пишет его в поле (setValue с shouldDirty). */
  onApply: (text: string) => void;
  field: EnhanceField;
  context?: string;
  maxRunes?: number;
  disabled?: boolean;
  className?: string;
}) {
  const { showMessage } = useSnackBarStore();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Focus is on our own (the text, the trigger, the undo chip) or in the open menu — `inHome`. */
  const [focused, setFocused] = useState(false);
  /** Что стояло в поле до замены — пока жив, рисуется `undo ↶`. */
  const [prev, setPrev] = useState<{ before: string; after: string } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const undoTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** The open menu was dismissed from outside the field (a click elsewhere, Tab away). */
  const leftOutside = useRef(false);
  /** The menu closed because a mode was chosen — focus goes back to the text, not the button. */
  const pickedMode = useRef(false);
  /** The row's own node that holds the focus (trigger or chip) — see `handOff`. */
  const ownFocus = useRef<Node | null>(null);
  /**
   * The request in flight: the text it was sent for, and whether the field moved under it since —
   * latched on the first lock or edit and never cleared for that request (MAJOR 3).
   */
  const flight = useRef<{ before: string; invalid: 'locked' | 'changed' | null } | null>(null);
  /** The field's textarea keeps its resize grip in the corner — the row stands left of it (O-42). */
  const [resizable, setResizable] = useState(false);
  // What the field holds and whether the control is open as of the LAST render — the answer lands
  // renders after the click, and is checked against these, not against the click's own closure.
  // The same pass latches a lock or an edit onto the request in flight: a value that came and went
  // (A → B → A) or a lock lifted before the answer still leaves its mark.
  const latest = useRef({ value: value ?? '', disabled: !!disabled });
  useLayoutEffect(() => {
    latest.current = { value: value ?? '', disabled: !!disabled };
    const f = flight.current;
    if (f && !f.invalid) {
      if (disabled) f.invalid = 'locked';
      else if ((value ?? '') !== f.before) f.invalid = 'changed';
    }
  });

  const empty = !(value ?? '').trim();
  // THE VISIBILITY RULE (O-30): in a focused, non-empty, open field. A request in flight does not
  // hold the button: blurred, the field shows nothing until the answer's `undo ↶`.
  const shown = !disabled && !empty && (focused || open);

  // A menu left open when the parent locks the control, or when the text is emptied under it,
  // closes with it — a menu with no button to hang from would float.
  useEffect(() => {
    if (disabled || empty) setOpen(false);
  }, [disabled, empty]);

  // THE RESIZE GRIP IS NOT COVERED (O-42, owner: «кнопка ai не должна наезжать на расширитель»).
  // A textarea that keeps its grip (`resize-y`: GENERAL INFORMATION, WORDS; `resize-none` on the
  // auto-growing ones) draws it in the bottom-right 16px; the row then stands 16px further left,
  // at the same height, at every height the operator drags the field to — it is anchored to the
  // field's bottom, not to a line of text. Read when the row is about to be seen: the class is the
  // caller's and does not change afterwards.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const ta = root && fieldOf(root).querySelector('textarea');
    setResizable(!!ta && getComputedStyle(ta).resize !== 'none');
  }, [shown]);

  // Focus is read at the document: the menu lives outside the wrapper, and a field that is
  // already focused when this mounts (a card switch re-keys the control) sends no event.
  useEffect(() => {
    const here = (n: EventTarget | null) => inHome(rootRef.current, menuRef.current, n);
    // A node of the row that held the focus is gone (the trigger, when the parent emptied or
    // locked the field under it; the chip, when its window closed or it was pressed by keyboard):
    // the text takes the focus. A text control that cannot take it (disabled) leaves focus on
    // body, and `focused` is re-read either way — never left true over a field nobody is in.
    const handOff = () => {
      ownFocus.current = null;
      textControlOf(rootRef.current)?.focus();
      setFocused(here(document.activeElement));
    };
    const onIn = (e: FocusEvent) => {
      const t = e.target;
      ownFocus.current = t instanceof Node && rootRef.current?.contains(t) ? t : null;
      setFocused(here(t));
    };
    // A focused element that LEAVES THE DOM (a menu row when the menu closes, the undo chip when
    // pressed, the trigger when the field is emptied or locked) fires a focusout with no
    // relatedTarget in Chromium. That is not the operator leaving the field, and Radix hands focus
    // back a task later — dropping `focused` here would unmount the trigger under it. The blur is
    // judged a microtask later, when a removed node has no document any more: a menu row is
    // Radix's to hand back (`onCloseAutoFocus` re-reads); a node of our own hands off to the text.
    const onOut = (e: FocusEvent) => {
      const { target, relatedTarget } = e;
      queueMicrotask(() => {
        if (target instanceof Node && !target.isConnected) {
          if (target === ownFocus.current) handOff();
          return;
        }
        setFocused(here(relatedTarget));
      });
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    setFocused(here(document.activeElement));
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  /** The menu closed: put focus where the operator expects it, then re-read where it really is. */
  const onCloseAutoFocus = (e: Event) => {
    const outside = leftOutside.current;
    const chosen = pickedMode.current;
    leftOutside.current = false;
    pickedMode.current = false;
    if (chosen || !outside) {
      // Radix would hand focus back to the trigger. A mode chosen means the operator is done with
      // the button: the text takes the focus (the trigger is busy anyway, and focus would fall to
      // body). Escape and a second press keep the button convention — back on the trigger. A
      // locked field is left alone.
      e.preventDefault();
      const root = rootRef.current;
      const trigger = chosen ? null : root?.querySelector<HTMLButtonElement>(TRIGGER);
      const next =
        trigger && !trigger.disabled
          ? trigger
          : latest.current.disabled
            ? null
            : textControlOf(root);
      next?.focus();
    }
    // The focused menu row left the DOM and its blur was set aside — re-read where focus really is.
    queueMicrotask(() => setFocused(inHome(rootRef.current, null, document.activeElement)));
  };

  const clearUndoTimer = () => {
    if (undoTimer.current) window.clearTimeout(undoTimer.current);
    undoTimer.current = null;
  };

  // Ручная правка после замены снимает откат — и его таймер: возвращать «что было» поверх чужой
  // правки нельзя, а таймеру после этого нечего снимать.
  useEffect(() => {
    if (prev && (value ?? '') !== prev.after) {
      setPrev(null);
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
  }, [value, prev]);

  useEffect(
    () => () => {
      abort.current?.abort();
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
    },
    [],
  );

  const run = async (mode: EnhanceMode) => {
    pickedMode.current = true;
    setOpen(false);
    const before = value ?? '';
    if (!before.trim() || busy || disabled) return;
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    const f: NonNullable<typeof flight.current> = { before, invalid: null };
    flight.current = f;
    setBusy(true);
    try {
      const after = await enhanceText(
        { text: before, mode, field, context, maxRunes },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) return;
      if (flight.current === f) flight.current = null;
      // THE ANSWER IS FOR THE TEXT THAT WAS SENT, INTO A FIELD THAT STAYED OPEN THE WHOLE WAY. A field
      // locked meanwhile (the card saving what it holds) or edited meanwhile gets nothing — even if
      // the words are back to what was sent, even if the lock is off again: applying would put words
      // on the screen that the save never got, or write over the operator's typing. `f.invalid` is
      // the latch; the final snapshot is read too, for an edit in the answer's own tick.
      const now = latest.current;
      const lateWhy = now.disabled ? 'locked' : now.value !== before ? 'changed' : null;
      const why = f.invalid ?? lateWhy;
      if (why) {
        showMessage(
          why === 'locked' ? 'not applied: field locked' : 'not applied: field changed',
          'success',
        );
        return;
      }
      const next = after.trim();
      if (!next) {
        showMessage('the model returned nothing — the text is unchanged', 'error');
        return;
      }
      onApply(next);
      setPrev({ before, after: next });
      clearUndoTimer();
      // The window closing takes the chip and nothing else: focus, if it was on the chip, goes to
      // the text through `handOff`; on the trigger or anywhere else it is not touched.
      undoTimer.current = window.setTimeout(() => setPrev(null), UNDO_WINDOW_MS);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      const r = e instanceof EnhanceRefusal ? e.reason : 'OTHER';
      showMessage(
        r === 'AI_NOT_CONFIGURED'
          ? 'AI is off on this server'
          : r === 'AI_MODEL_UNAVAILABLE'
            ? 'the AI model is unavailable right now'
            : `could not enhance: ${e instanceof Error ? e.message : String(e)}`,
        'error',
      );
    } finally {
      if (!ctrl.signal.aborted) {
        setBusy(false);
        if (flight.current === f) flight.current = null;
      }
    }
  };

  const undo = () => {
    if (!prev || disabled) return;
    onApply(prev.before);
    setPrev(null);
    clearUndoTimer();
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        'absolute bottom-1.5 right-1.5 flex items-center gap-1.5',
        resizable && 'right-[22px]',
        className,
      )}
      data-ai-enhance
      data-ai-enhance-clear={resizable ? 'resizer' : undefined}
    >
      {prev && (
        <Chip
          onClick={undo}
          disabled={disabled}
          title='put the previous text back'
          data-ai-enhance-undo=''
          // Takes no focus on a press: focus arriving here would bring `ai ✦` in beside it and
          // slide the chip out from under the pointer before the click lands.
          onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
        >
          undo ↶
        </Chip>
      )}
      {shown && (
        <GenericPopover
          open={open}
          onOpenChange={setOpen}
          noTail
          contentProps={{
            align: 'end',
            side: 'top',
            onInteractOutside: (e) => {
              leftOutside.current = !inHome(rootRef.current, menuRef.current, e.target);
            },
            onCloseAutoFocus,
          }}
          triggerProps={{
            'aria-label': 'ai enhance',
            // Never rendered locked or empty; only a request in flight holds it.
            disabled: busy,
            // A press must not take the caret out of the text: the button is a detour, not a place.
            onMouseDown: (e) => e.preventDefault(),
          }}
          openElement={
            <Button
              asChild
              variant='secondary'
              size='xs'
              disabled={busy}
              title={
                busy ? 'working…' : 'ai enhance: improve, expand, shorten or rewrite as a prompt'
              }
              // Appears with a short fade (the button is absolute: nothing moves); leaves at once.
              className='bg-bgColor transition-opacity duration-100 starting:opacity-0 motion-reduce:transition-none'
            >
              <span>{busy ? 'ai …' : 'ai ✦'}</span>
            </Button>
          }
        >
          {/* Plain buttons in the labelled popover — Tab walks them, Enter chooses, Escape closes
              (Radix). No `role=menu`: that promises arrow-key roving this small list does not
              implement, and would be the one more moving part the owner asked not to have. */}
          <div
            ref={menuRef}
            role='group'
            aria-label='ai enhance'
            data-ai-enhance-menu=''
            className='flex flex-col'
          >
            {ENHANCE_MODES.map((m) => (
              <button
                key={m.mode}
                type='button'
                onClick={() => run(m.mode)}
                className='flex w-full items-baseline gap-2 px-2 py-1.5 text-left hover:bg-bgSecondary'
              >
                <span className='text-micro uppercase tracking-label text-textColor'>
                  {m.label}
                </span>
                <span className='text-micro text-labelColor'>· {m.hint}</span>
              </button>
            ))}
          </div>
        </GenericPopover>
      )}
    </div>
  );
}
