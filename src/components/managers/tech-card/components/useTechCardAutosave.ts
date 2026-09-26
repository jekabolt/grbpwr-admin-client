import type { MutationCache } from '@tanstack/react-query';
import type { common_TechCard, common_TechCardInsert } from 'api/proto-http/admin';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { AutosaveApi, AutosaveStatus, FlushResult } from './design/autosave-contract';
import { mapFormToTechCardInsert, mapTechCardToForm, type TechCardFormData } from './schema';
import { STYLE_FACT_KEYS } from './tech-card-options';

/**
 * ═══ АВТОСЕЙВ КАРТОЧКИ (волна 25.09 · T21 · D-16/D-16' · ревью Codex B-02/B-03/M-02/M-03) ═══════
 *
 * Клиентский автосейв ПОВЕРХ существующего конвейера Save: полная замена UpdateTechCard с
 * `expectedLockVersion`, затем очередь застейдженных панелей. Этот файл не знает, КАК карточка
 * пишется, — он решает только КОГДА писать и что сказать о результате. Сам конвейер живёт в
 * `index.tsx` и приходит сюда функцией `save(mode, reason)`.
 *
 * Правила, ради которых файл написан:
 *   · дебаунс 2 с от ПОСЛЕДНЕЙ правки (формы — `form.watch`; панели — ревизия очереди стейджинга,
 *     B-03: длина очереди не видит правку уже застейдженной панели);
 *   · перед тихой записью — ТИХАЯ проверка (ревью M-02): значения разбираются схемой, полям не
 *     публикуется ни одна ошибка; невалидная форма НЕ пишется — статус `invalid` с числом ошибок.
 *     Красным поля становятся только по явному жесту: ⌘S, щелчок по чипу, раскрытие его поповера;
 *   · один вызов в полёте; правки во время записи — ещё один цикл после неё, без второго параллельного;
 *   · «saved» — только над ТИХОЙ карточкой (ревью B-03): запись легла, а правка, набранная пока она
 *     летела, всё ещё только в браузере, — это ход вперёд (`progress`), а не конец. История и уборка
 *     черновика висят на том проходе, после которого работы не осталось;
 *   · `flush()` — немедленно и с ответом, и отвечает он только над тихой карточкой: проходит цикл за
 *     циклом, пока за проход не пришло ни одной правки и писать больше нечего. Платные двери
 *     стартуют только при `ok`/`nothing` (B-05). Не затихла за все проходы — `busy`, а не `error`:
 *     запись не падала, её просто правили, пока дверь ждала (ревью R-10);
 *   · `restaged` подряд — панель, перестейдживающая САМА себя, и только это упирается в потолок
 *     повторов. Жест оператора (ввод, клавиша, нажатие) счёт обнуляет: человек, который правит, пока
 *     идёт запись, — не петля (R-9). Flush, упёршийся в потолок, тоже слышит `busy` (R-10);
 *   · работа, появившаяся раньше самой машины (эффект ребёнка испачкал форму на первом рендере, до
 *     подписки), видна сразу — статус `dirty` при создании (R-12); дебаунс при этом взводится, только
 *     если за работой стоит человек (жест, явная просьба), — открытие карточки само не пишет (m7);
 *   · правка формы доходит до машины микрозадачей позже события: `reset` RHF 7.62 шлёт значения
 *     РАНЬШЕ, чем пересчитывает isDirty, и решение по событию видело бы прежнюю чистоту (ревью B-1);
 *   · цикл, пришедшийся на паузу (диалог перевода), взводится концом паузы (m9);
 *   · запись, которую ведёт не машина (перевод в auxiliary после диалога), сообщает ей исход
 *     `settleExternal` — статус и уборка тихой карточки кончаются там же, где запись (R-7);
 *   · ошибка → повторы через 5 / 15 / 45 с, потом `not saved · retry`;
 *   · 409 → статус `conflict`, и автосейв стоит ЦЕЛИКОМ, явные записи тоже (ревью M-01: ⌘S под
 *     модалкой отправил бы ту же протухшую версию). Выходов два, и оба в модалке: «reload theirs»
 *     уходит со страницы, «keep mine» читает текущую версию и снимает паузу `resolveConflict()`.
 *     Сам автосейв НИКОГДА не выбирает «keep mine» (B-02).
 *
 * Машина ниже не импортирует React и не трогает window: таймеры, часы и все чтения приходят
 * зависимостями. Это не ради красоты — проба (`scripts/techcard-autosave-probe.mjs`) гоняет её в node
 * с поддельными часами и отложенными записями и доказывает «сработал ровно через 2 с», «не пишет
 * невалидное» и «flush не отвечает, пока карточка не затихла» без браузера.
 */

export const AUTOSAVE_DEBOUNCE_MS = 2000;
export const AUTOSAVE_RETRY_MS: readonly number[] = [5000, 15000, 45000];
/**
 * Сколько циклов подряд может кончиться `restaged`, прежде чем автосейв перестанет повторять сам.
 * Панель, которую оператор правит прямо во время её коммита, даёт один-два таких цикла; панель,
 * которая перестейдживается САМА после каждого коммита, давала бы их бесконечно — и гоняла бы
 * одну и ту же запись на сервер каждые две секунды.
 */
const RESTAGED_CAP = 4;
/**
 * Сколько проходов `flush` делает, прежде чем ответить «не вышло». Обычный flush — один проход и
 * один пустой контрольный; оператор, который печатает не переставая, пока платная дверь ждёт,
 * получает отказ двери, а не бесконечное «saving…».
 */
const FLUSH_MAX_PASSES = 5;

export type SaveMode = 'silent' | 'explicit';

/** Что сделал один проход конвейера сохранения. */
export type SaveOutcome =
  /** Тело (если было грязным) и вся очередь панелей легли; ничего не перестейджилось. */
  | 'complete'
  /** Панель отказала; всё, что не записано, осталось в очереди. */
  | 'partial'
  /** Всё легло, но панель сдвинулась, пока писалась: её новые значения ещё в очереди. */
  | 'restaged'
  /** Отказ валидации (клиентской или серверной поимённой) — повторять бессмысленно. */
  | 'invalid'
  /** 409: сервер ушёл вперёд. */
  | 'conflict'
  /** Сеть/сервер — стоит повторить. */
  | 'error'
  /** Писать было нечего. */
  | 'nothing'
  /** Висит только смена purpose sellable→auxiliary; она ждёт ответа человека (M-03). */
  | 'needs-confirm';

export type SaveResult = {
  outcome: SaveOutcome;
  /** Человекочитаемая причина для `error`/`conflict`/`invalid` — её показывает поповер чипа. */
  message?: string;
  /** `complete`, но смена purpose по-прежнему ждёт подтверждения (остальное записано). */
  pendingConfirm?: boolean;
  /** `invalid`: сколько полей держат запись, когда конвейер сосчитал их сам (тихий разбор). */
  errorsCount?: number;
};

export type MachineState = {
  status: AutosaveStatus;
  lastSavedAt?: number;
  errorsCount?: number;
  message?: string;
  /** При `error`: идут ли ещё автоматические повторы (`false` — исчерпаны, нужен человек). */
  retrying?: boolean;
};

export type MachineDeps = {
  debounceMs: number;
  retryDelaysMs: readonly number[];
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  now: () => number;
  isEnabled: () => boolean;
  /** Модалка владеет решением (диалог перевода в auxiliary) — автосейв ждёт. */
  isPaused: () => boolean;
  /** Грязно ли тело формы или есть ли что-то в очереди панелей — читается «сейчас», не из рендера. */
  hasWork: () => boolean;
  /** ТИХАЯ проверка (M-02): разбирает значения и считает ошибки, полям НЕ публикует ничего. */
  validate: () => Promise<{ ok: boolean; errors: number }>;
  save: (mode: SaveMode, reason: string) => Promise<SaveResult>;
  countErrors: () => number;
  onState: (state: MachineState) => void;
  /** Только на ТИХОМ `complete` (B-03): сюда вешаются запись истории и уборка черновика. */
  onComplete?: (reason: string) => void;
  /**
   * Счётчик жестов оператора на странице (ввод, клавиша, нажатие, вставка). Перестейдж панели без
   * жеста за спиной — эхо её собственного коммита; с жестом — правка человека (R-9).
   */
  operatorGen?: () => number;
  /**
   * Взводить ли дебаунс над работой, которая была раньше самой машины (R-12). Только если за ней стоит
   * человек — жест оператора или явная просьба органа: дочерний эффект, испачкавший форму на
   * монтировании, — не правка, и открытие карточки не пишет её (ревью m7). Без ответа — взводить.
   */
  armAtCreation?: () => boolean;
};

/**
 * Внутренний исход цикла. Наружу, из `flush`, выходят только `FlushResult`: `restaged` (панель
 * сдвинулась на лету) и `progress` (запись легла, но за время полёта набралась новая работа) flush
 * разворачивает сам — ещё одним проходом.
 */
type CycleResult = FlushResult | 'restaged' | 'progress';

export type AutosaveMachine = {
  state: () => MachineState;
  /** Что-то изменилось (правка формы, движение очереди, просьба органа): взвести дебаунс. */
  notifyChange: () => void;
  /** Сохранить сейчас и сказать, вышло ли, — над тихой карточкой. `explicit` — ⌘S / «save now»:
   *  первый проход валидирует сам конвейер (с прыжком к полю), и только там работает диалог перевода
   *  purpose; добирающие проходы тихие. */
  flush: (reason: string, mode?: SaveMode) => Promise<FlushResult>;
  /** «keep mine» модалки конфликта: снять паузу, чтобы следующая явная запись могла пойти. */
  resolveConflict: () => void;
  /**
   * Исход записи, которую вела НЕ машина (перевод в auxiliary: диалог перехватил запись и повторил её
   * сам). Разбирается тем же `settle`, что и свой цикл: тихий `complete` — «saved» и уборка, работа на
   * руках — ход вперёд, отказ — свой статус (R-7).
   */
  settleExternal: (r: SaveResult, reason: string) => void;
  /**
   * Пауза кончилась (диалог перевода закрыт, перевод дописан). Цикл, который пришёлся на паузу, не
   * писал и ничего не взвёл, — он взводится сейчас, иначе статус так и стоит `dirty` без записи
   * (ревью m9). Паузу, на которую не пришёлся ни один цикл, конец паузы не трогает: отменённый диалог
   * не открывается снова сам.
   */
  resume: () => void;
  /** Включение/выключение (режим создания, frozen, права). */
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : 'unknown error';

function sameState(a: MachineState, b: MachineState) {
  return (
    a.status === b.status &&
    a.lastSavedAt === b.lastSavedAt &&
    a.errorsCount === b.errorsCount &&
    a.message === b.message &&
    a.retrying === b.retrying
  );
}

export function createAutosaveMachine(deps: MachineDeps): AutosaveMachine {
  let state: MachineState = { status: deps.isEnabled() ? 'idle' : 'off' };
  let timer: unknown = null;
  let retryIndex = 0;
  let restagedStreak = 0;
  let running: Promise<CycleResult> | null = null;
  let queued: { promise: Promise<CycleResult>; mode: SaveMode; reason: string } | null = null;
  let disposed = false;
  // B-03: every change the machine has heard of, counted. A flush compares it across a pass: a
  // change heard while the pass ran means the pass wrote an older card than the one on screen.
  let changeGen = 0;
  // R-9: the operator's gestures as of the last change heard (see notifyChange).
  let heardOperatorGen = deps.operatorGen?.();
  // m9: a cycle came due while the convert dialog held the page — it wrote nothing and armed nothing.
  let skippedWhilePaused = false;

  const set = (patch: Partial<MachineState>) => {
    const next = { ...state, ...patch };
    if (sameState(next, state)) return;
    state = next;
    // N-01: after dispose (the page unmounted) the last flush may still finish; it gets no render.
    if (!disposed) deps.onState(state);
  };
  const restingStatus = (): AutosaveStatus => (state.lastSavedAt ? 'saved' : 'idle');

  const clearTimer = () => {
    if (timer != null) deps.clearTimer(timer);
    timer = null;
  };
  const arm = (ms: number, reason: string) => {
    clearTimer();
    // N-01: no retry or debounce outlives the page.
    if (disposed) return;
    timer = deps.setTimer(() => {
      timer = null;
      void enqueue('silent', reason);
    }, ms);
  };
  // N-02: nothing left to write — whatever the status said about the work (dirty, invalid, a purpose
  // waiting for its dialog, a failed save with retries pending) is moot now. A conflict stays: it is
  // a fact about the SERVER, and only the modal ends it.
  const restIfNoWork = () => {
    if (state.status === 'conflict') return;
    clearTimer();
    retryIndex = 0;
    restagedStreak = 0;
    set({
      status: restingStatus(),
      errorsCount: undefined,
      message: undefined,
      retrying: undefined,
    });
  };

  async function runCycle(mode: SaveMode, reason: string): Promise<CycleResult> {
    if (disposed && reason !== 'unmount') return 'off';
    if (!deps.isEnabled()) {
      set({ status: 'off' });
      return 'off';
    }
    // Диалог перевода в auxiliary открыт: запись, которую он перехватил, он же и повторит. Цикл,
    // пришедшийся на паузу, запоминается — его взведёт конец паузы (m9).
    if (deps.isPaused()) {
      skippedWhilePaused = true;
      return 'needs-confirm';
    }
    // M-01: 409 держит ВСЕ записи, явные тоже. Выходы — только двери модалки (см. шапку файла).
    if (state.status === 'conflict') return 'conflict';
    if (!deps.hasWork()) {
      restIfNoWork();
      return 'nothing';
    }
    if (mode === 'silent') {
      const v = await deps.validate();
      if (!v.ok) {
        set({ status: 'invalid', errorsCount: v.errors, message: undefined, retrying: undefined });
        return 'invalid';
      }
    }
    set({ status: 'saving', message: undefined, retrying: undefined });
    let r: SaveResult;
    try {
      r = await deps.save(mode, reason);
    } catch (e) {
      r = { outcome: 'error', message: errorText(e) };
    }
    return settle(r, reason);
  }

  /** A pass that moved the card forward but left work behind: say so, and make sure a cycle follows. */
  function progress(at: number | undefined): CycleResult {
    set({
      status: 'dirty',
      ...(at !== undefined ? { lastSavedAt: at } : {}),
      errorsCount: undefined,
      message: undefined,
      retrying: undefined,
    });
    if (timer == null) arm(deps.debounceMs, 'debounce');
    return 'progress';
  }

  function settle(r: SaveResult, reason: string): CycleResult {
    switch (r.outcome) {
      case 'complete': {
        retryIndex = 0;
        restagedStreak = 0;
        const at = deps.now();
        if (r.pendingConfirm) {
          set({
            status: 'needs-confirm',
            lastSavedAt: at,
            errorsCount: undefined,
            message: r.message,
            retrying: undefined,
          });
          return 'needs-confirm';
        }
        // B-03: правка, набранная, пока запись летела, или панель, застейдженная за это время, — ещё
        // только в браузере. «saved» над ней было бы ложью, история записала бы не то, что на
        // сервере, а черновик — единственная копия этой правки — был бы стёрт.
        if (deps.hasWork()) return progress(at);
        // Тихо: всё, что есть на экране, лежит на сервере. Эхо самой записи (её сброс базы будит
        // form.watch) успело взвести дебаунс — он пустой, и его снимаем.
        clearTimer();
        deps.onComplete?.(reason);
        set({
          status: 'saved',
          lastSavedAt: at,
          errorsCount: undefined,
          message: undefined,
          retrying: undefined,
        });
        return 'ok';
      }
      case 'nothing':
        // A pass that wrote nothing can still end over work: the quiet re-read after the auto-stage's
        // 409 keeps what the operator typed during the read (B-07).
        if (deps.hasWork()) return progress(undefined);
        restIfNoWork();
        return 'nothing';
      case 'needs-confirm':
        set({ status: 'needs-confirm', message: r.message, errorsCount: undefined });
        return 'needs-confirm';
      case 'restaged': {
        restagedStreak += 1;
        if (restagedStreak >= RESTAGED_CAP) {
          clearTimer();
          set({
            status: 'error',
            message: r.message ?? 'a panel kept changing while it was being saved',
            retrying: false,
          });
          // No write failed here either: a flush that ends on the cap hears `busy`, and its door says
          // that the card kept changing — not «the last save failed» (R-10).
          return 'busy';
        }
        // Новые значения панели ещё в очереди — следующий цикл их и понесёт.
        set({ status: 'dirty', message: undefined });
        arm(deps.debounceMs, 'restaged');
        return 'restaged';
      }
      case 'invalid':
        restagedStreak = 0;
        set({
          status: 'invalid',
          errorsCount: r.errorsCount || deps.countErrors() || undefined,
          message: r.message,
          retrying: undefined,
        });
        return 'invalid';
      case 'conflict':
        restagedStreak = 0;
        clearTimer();
        set({ status: 'conflict', message: r.message, retrying: undefined });
        return 'conflict';
      case 'partial':
      case 'error':
      default: {
        restagedStreak = 0;
        if (retryIndex < deps.retryDelaysMs.length) {
          arm(deps.retryDelaysMs[retryIndex], 'retry');
          retryIndex += 1;
          set({ status: 'error', message: r.message, retrying: true });
        } else {
          clearTimer();
          set({ status: 'error', message: r.message, retrying: false });
        }
        return 'error';
      }
    }
  }

  /** Один вызов в полёте; всё, что пришло во время него, сливается в ОДИН следующий цикл. */
  function enqueue(mode: SaveMode, reason: string): Promise<CycleResult> {
    if (running) {
      if (queued) {
        if (mode === 'explicit') queued.mode = 'explicit';
        return queued.promise;
      }
      const q = { mode, reason, promise: undefined as unknown as Promise<CycleResult> };
      q.promise = running
        .catch(() => undefined)
        .then(() => {
          if (queued === q) queued = null;
          return start(q.mode, q.reason);
        });
      queued = q;
      return q.promise;
    }
    return start(mode, reason);
  }
  function start(mode: SaveMode, reason: string): Promise<CycleResult> {
    const p: Promise<CycleResult> = runCycle(mode, reason).finally(() => {
      if (running === p) running = null;
    });
    running = p;
    return p;
  }

  // R-12: work that exists before the machine does — a child's effect dirtied the form on the first
  // render, before `form.watch` subscribed — is armed now instead of waiting under «idle» for the next
  // edit.
  // m7: the status says so at once (the chip does not claim «saved» over a form that differs), but the
  // write waits for a person — a gesture or an explicit request — unless the caller does not say.
  if (deps.isEnabled() && deps.hasWork()) {
    state = { ...state, status: 'dirty' };
    if (deps.armAtCreation?.() ?? true) arm(deps.debounceMs, 'debounce');
  }

  return {
    state: () => state,

    notifyChange: () => {
      if (disposed || !deps.isEnabled()) return;
      changeGen += 1;
      // R-9: a change with an operator's gesture behind it ends a run of «restaged» cycles. The streak
      // is there to stop a panel that re-stages ITSELF after every commit; a person editing a panel
      // while its commit runs re-stages it too, and must never be taken for that loop.
      const gestures = deps.operatorGen?.();
      if (gestures !== heardOperatorGen) {
        heardOperatorGen = gestures;
        restagedStreak = 0;
      }
      if (state.status === 'conflict') return;
      if (running) {
        // Решим после цикла: правка во время записи — ещё один цикл, а не второй параллельный.
        arm(deps.debounceMs, 'debounce');
        return;
      }
      if (!deps.hasWork()) {
        // Правку откатили руками — сохранять нечего, и любое «unsaved» над чистой карточкой было бы
        // ложью (N-02: не только `dirty` — `invalid` и `needs-confirm` тоже).
        restIfNoWork();
        return;
      }
      retryIndex = 0;
      if (state.status === 'saved' || state.status === 'idle' || state.status === 'error') {
        set({ status: 'dirty', message: undefined, retrying: undefined });
      }
      arm(deps.debounceMs, 'debounce');
    },

    flush: async (reason, mode = 'silent') => {
      if (disposed && reason !== 'unmount') return 'off';
      let wrote = false;
      let passMode = mode;
      for (let pass = 0; pass < FLUSH_MAX_PASSES; pass++) {
        clearTimer();
        const gen = changeGen;
        const r = await enqueue(passMode, reason);
        if (r === 'ok' || r === 'progress' || r === 'restaged') wrote = true;
        if (r !== 'ok' && r !== 'nothing' && r !== 'progress' && r !== 'restaged') return r;
        // B-03: отвечать можно только над ТИХОЙ карточкой — за проход не пришло ни одной правки, и
        // писать больше нечего. Иначе платная дверь стартует по карточке, которой нет на сервере.
        const quiet = gen === changeGen && !deps.hasWork();
        if (quiet) return wrote ? 'ok' : 'nothing';
        // Добирающие проходы несут то, что набрали, пока шёл предыдущий: тихо, с тихой проверкой.
        passMode = 'silent';
      }
      // Карточка не затихла за FLUSH_MAX_PASSES проходов — оператор печатает, пока дверь ждёт. Запись не
      // падала, и сказать «the last save failed» было бы неправдой (R-10).
      return 'busy';
    },

    settleExternal: (r, reason) => {
      if (disposed || !deps.isEnabled()) return;
      settle(r, reason);
    },

    resume: () => {
      if (disposed || !skippedWhilePaused) return;
      skippedWhilePaused = false;
      if (!deps.isEnabled() || state.status === 'conflict' || running) return;
      if (!deps.hasWork()) {
        restIfNoWork();
        return;
      }
      if (state.status === 'saved' || state.status === 'idle' || state.status === 'error') {
        set({ status: 'dirty', message: undefined, retrying: undefined });
      }
      arm(deps.debounceMs, 'resume');
    },

    resolveConflict: () => {
      if (state.status !== 'conflict') return;
      set({
        status: deps.hasWork() ? 'dirty' : restingStatus(),
        message: undefined,
        retrying: undefined,
      });
    },

    setEnabled: (enabled) => {
      if (!enabled) {
        clearTimer();
        retryIndex = 0;
        restagedStreak = 0;
        set({ status: 'off', errorsCount: undefined, message: undefined, retrying: undefined });
        return;
      }
      if (state.status !== 'off') return;
      set({ status: restingStatus() });
      if (deps.hasWork()) {
        set({ status: 'dirty' });
        arm(deps.debounceMs, 'debounce');
      }
    },

    dispose: () => {
      disposed = true;
      clearTimer();
    },
  };
}

/**
 * Равенство по ЗНАЧЕНИЮ, нечувствительное к порядку ключей объекта.
 *
 * JSON.stringify здесь не годится: объект, собранный спредом (`{ ...s, signedDigest }`), и объект
 * из маппера несут одни и те же ключи в РАЗНОМ порядке, и строки расходятся при равных значениях —
 * а на этом ответе стоят два решения: «правил ли человек поле, пока запись летела» и «грязно ли
 * что-то, кроме purpose».
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  // `undefined` и отсутствующий ключ — одно и то же для формы: RHF не различает их при сравнении.
  if (a == null || b == null) return (a ?? undefined) === (b ?? undefined);
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i])) return false;
    return true;
  }
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) if (!deepEqual(ao[k], bo[k])) return false;
  return true;
}

/**
 * ГРЯЗНА ЛИ ФОРМА — ПРЯМО СЕЙЧАС, а не на момент последнего рендера.
 *
 * `form.formState.isDirty` — это геттер над СНИМКОМ состояния, который `useForm` положил в React при
 * последнем рендере (`getProxyFormState` отдаёт `formState[key]` из замыкания рендера). Внутри
 * `form.watch`, таймера или сразу после `setValue` он отстаёт на рендер: первая же правка чистой
 * карточки читается как «ничего не изменилось», и автосейв её не взводит; `setValue(stage)` + flush
 * в том же тике уходит на сервер БЕЗ тела — ровно дефект G1, который этой волной и чинится.
 * `control._formState` RHF обновляет синхронно, до того как зовёт подписчиков. Поле типизировано в
 * `Control` (react-hook-form 7.62) — это внутренность, но объявленная.
 */
export function liveIsDirty(form: UseFormReturn<TechCardFormData>): boolean {
  return !!form.control._formState.isDirty;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.getPrototypeOf(v) === Object.prototype;

/**
 * Write `next` into the form at `path` through the SMALLEST paths that differ from `cur`. A leaf
 * write never re-keys a field array; only a change of an array's LENGTH is written at that array's
 * root — the rows really changed, and the useFieldArray that owns them has to hear it.
 */
export function writeFormDiff(
  write: (path: string, value: unknown) => void,
  path: string,
  cur: unknown,
  next: unknown,
): void {
  if (deepEqual(cur, next)) return;
  if (Array.isArray(cur) && Array.isArray(next) && cur.length === next.length) {
    next.forEach((n, i) => writeFormDiff(write, `${path}.${i}`, cur[i], n));
    return;
  }
  if (isPlainObject(cur) && isPlainObject(next)) {
    for (const k of new Set([...Object.keys(cur), ...Object.keys(next)])) {
      writeFormDiff(write, `${path}.${k}`, cur[k], next[k]);
    }
    return;
  }
  write(path, next);
}

/**
 * RHF's FULL dirty map → the SPARSE one its per-field updates keep (ревью R-8).
 *
 * `reset(values, { keepDefaultValues })` answers with `getDirtyFields(baseline, values)`: every leaf
 * of the form, `false` included, and every object and array present even when nothing under it moved.
 * The page's readers ask the sparse question — `!!dirtyFields.moodboardMedia`, «is anything under this
 * dirty» — and over the full map `!![]` is always true: the construction draft's «the board has unsaved
 * changes» stood over every card after its first save. Only what is dirty stays; a clean row of an
 * array becomes a hole, exactly like the map `setValue` / `unset` build one field at a time.
 */
export function sparseDirtyFields(node: unknown): unknown {
  if (node === true) return true;
  if (Array.isArray(node)) {
    const out: unknown[] = [];
    let any = false;
    for (let i = 0; i < node.length; i++) {
      const s = sparseDirtyFields(node[i]);
      if (s === undefined) continue;
      out[i] = s;
      any = true;
    }
    return any ? out : undefined;
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    let any = false;
    for (const [k, v] of Object.entries(node)) {
      const s = sparseDirtyFields(v);
      if (s === undefined) continue;
      out[k] = s;
      any = true;
    }
    return any ? out : undefined;
  }
  return undefined;
}

/**
 * «Is anything under this dirty?» — over the sparse map AND over RHF's full one (ревью m4). RHF rebuilds
 * the FULL map on a field-array operation or `setValue(arrayRoot, …, { shouldDirty })`: every leaf
 * present, `false` included, `[]` for an array with nothing dirty in it — and `!![]` is true. A reader
 * asking `!!dirtyFields.moodboardMedia` gets «dirty» over a board nobody touched; this one does not.
 */
export function anyDirty(node: unknown): boolean {
  if (node === true) return true;
  if (Array.isArray(node)) return node.some(anyDirty);
  if (node && typeof node === 'object') return Object.values(node).some(anyDirty);
  return false;
}

// ─── WHOSE 409 (B-06 / R-5 / m2) ────────────────────────────────────────────────────────────────

const httpStatus = (x: unknown) => (x as { status?: number } | null | undefined)?.status;
const causeOf = (e: unknown) => (e as { cause?: unknown } | null | undefined)?.cause;

/** A 409 — on the error itself, or on the one a panel wrapped into its own sentence (`cause`). */
export function isConflictError(e: unknown): boolean {
  return httpStatus(e) === 409 || httpStatus(causeOf(e)) === 409;
}

/** Whether the error still says what the server answered (a panel's rewrap into a sentence drops it). */
export function hasHttpStatus(e: unknown): boolean {
  return typeof httpStatus(e) === 'number' || typeof httpStatus(causeOf(e)) === 'number';
}

/**
 * THE FAILURE A REFUSING PANEL IS RE-THROWING RIGHT NOW (ревью m2).
 *
 * The recipe, lab-dip and sample panels catch their mutation's error and re-throw a sentence of their
 * own, without the HTTP status. TanStack notifies the mutation cache of the failure synchronously, in
 * the same task as the rejection those panels re-throw from (their catch is synchronous) — so the
 * failure this watcher holds is that panel's only while the task lasts: a timer of 0 forgets it. A
 * panel that fails before any mutation (its version read, a check of its own) finds nothing here, and
 * another mutation of the page failing a second earlier is not taken for it — the window the previous
 * rule used («any failure submitted since the commit began») did take it.
 */
export function watchOwnFailure(cache: MutationCache): {
  current: () => { conflict: boolean } | null;
  stop: () => void;
} {
  let last: { conflict: boolean } | null = null;
  const stop = cache.subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'error') return;
    const failure = { conflict: isConflictError(event.action.error) };
    last = failure;
    setTimeout(() => {
      if (last === failure) last = null;
    }, 0);
  });
  return { current: () => last, stop };
}

// ─── DID THE BODY MOVE (M-3) ──────────────────────────────────────────────────────────────────

/**
 * The style facts the card body carries but UpdateTechCard does not write (R4/§14.7 — UpdateStyle owns
 * brand, sku_season, collection and target_gender; techcard.go). A move there is never overwritten by a
 * body write, so it is not a move of the body.
 */
const STYLE_OWNED_INSERT_KEYS = ['brand', 'collection', 'targetGender', 'skuSeason'] as const;

/**
 * Rows whose key a mapper MINTS when it is empty (the read mapper for BOM lines and pieces, the write
 * mapper for equipment profiles) — pinned by position on the stored card, so two readings compare.
 */
function pinRowKeys(card: common_TechCard): common_TechCard {
  const tc = card.techCard;
  if (!tc) return card;
  const pin = <T>(rows: T[] | undefined, key: string, tag: string): T[] | undefined =>
    rows?.map((r, i) =>
      String((r as Record<string, unknown>)?.[key] ?? '').trim()
        ? r
        : ({ ...r, [key]: `${tag}${i}` } as T),
    );
  const eq = tc.construction?.equipmentDefaults;
  return {
    ...card,
    techCard: {
      ...tc,
      bomItems: pin(tc.bomItems, 'lineKey', 'bom#'),
      pieces: pin(tc.pieces, 'lineKey', 'piece#'),
      ...(tc.construction && eq
        ? {
            construction: {
              ...tc.construction,
              equipmentDefaults: {
                ...eq,
                machines: pin(eq.machines, 'profileKey', 'machine#'),
                presses: pin(eq.presses, 'profileKey', 'press#'),
              },
            },
          }
        : {}),
    },
  };
}

/** The body a write built on `card` would put on the wire, `echo` standing in for the stored fields it echoes. */
function bodyOnTheWire(
  card: common_TechCard,
  echo: common_TechCardInsert | undefined,
  canWriteCosting: boolean,
): Record<string, unknown> {
  const wire = {
    ...(mapFormToTechCardInsert(
      mapTechCardToForm(pinRowKeys(card)),
      echo,
      canWriteCosting,
    ) as unknown as Record<string, unknown>),
  };
  for (const k of STYLE_OWNED_INSERT_KEYS) delete wire[k];
  return wire;
}

/**
 * DID THE CARD'S BODY MOVE BETWEEN TWO READINGS — would a body write built on `from` put back something
 * `to` has? (ревью M-3.) Both readings go through the SAME write mapper, with the same echo (`to`'s
 * stored insert), so exactly what the PUT would carry is compared and nothing else: a panel's lock
 * bump, a roll-up, a colourway, a style fact — all move the version, none moves the body.
 */
export function bodyMoved(
  from: common_TechCard,
  to: common_TechCard,
  canWriteCosting: boolean,
): boolean {
  const echo = to.techCard;
  return !deepEqual(
    bodyOnTheWire(from, echo, canWriteCosting),
    bodyOnTheWire(to, echo, canWriteCosting),
  );
}

const STYLE_FACTS: ReadonlySet<string> = new Set(STYLE_FACT_KEYS);

/**
 * THE FORM'S WORK A BODY WRITE CAN CARRY (CL-C re-review M2). Every field but the style facts: the body
 * never writes them — the style panel does, and only while it is staged, when the queue is the work.
 * A fact dirtied by a path that does not stage it (the care mirror, a draft, an account without
 * products:write) keeps its baseline through body saves, and must not be a cycle the autosave runs
 * every two seconds, or a flush that never goes quiet.
 */
export function bodyWorkOf(form: UseFormReturn<TechCardFormData>): boolean {
  if (!liveIsDirty(form)) return false;
  const values = form.getValues() as Record<string, unknown>;
  const baseline = form.control._defaultValues as Record<string, unknown>;
  for (const key of new Set([...Object.keys(values), ...Object.keys(baseline)])) {
    if (STYLE_FACTS.has(key)) continue;
    if (!deepEqual(values[key], baseline[key])) return true;
  }
  return false;
}

type ServerLists = Pick<TechCardFormData, 'signoffs' | 'patterns' | 'bomItems'>;

/**
 * ПОСЛЕ ЗАПИСИ ТЕЛА: ФОРМА БЕРЁТ СЕРВЕР ТАМ, ГДЕ ОПЕРАТОР НЕ ПРАВИЛ, И НОВУЮ БАЗУ «ЧИСТО».
 *
 * `before` — форма, какой её увидела запись (глубокая копия), `settled.values` — что легло на сервер
 * в координатах формы, `settled.server` — прочитанная карточка (или null, когда чтения не было).
 *
 * ЗНАЧЕНИЯ. Ключ, который не трогали, пока запись летела, получает то, что легло (минимальными
 * путями — ни строка массива не перемонтируется, ни каретка не прыгает). Тронутый остаётся
 * операторским: его понесёт следующий цикл. У тронутых списков с серверными ключами (sign-off,
 * выкройки, BOM) операторские строки получают серверные id/дайджесты — строка, добавленная этой же
 * записью, не должна уехать ещё раз с id 0 только потому, что оператор продолжал печатать.
 * Отложенный purpose (sellable→auxiliary ждёт диалога, M-03) возвращается только поверх НЕтронутого
 * поля: переключение обратно, сделанное, пока запись летела, — последнее слово оператора (B-02).
 *
 * БАЗА — ПО КЛЮЧУ (ревью R-1). Нетронутый ключ получает базой СОБСТВЕННОЕ значение формы после записи
 * выше, а не `settled.values`: они равны для нашего сравнения (`undefined` = нет ключа, null = undefined),
 * но не для RHF, который считает ключи строго. Маппер отдаёт `pressSteam: undefined` ПРИСУТСТВУЮЩИМ
 * ключом у каждого профиля без пара, а черновик — это JSON, и у восстановленной формы ключа нет вовсе;
 * база с сервера делала такую форму «грязной» после каждой записи — и автосейв переписывал карточку
 * каждые две секунды, навсегда. Тронутый ключ и отложенный purpose получают базой то, что легло, —
 * они и должны остаться грязными. `keepBaseline` сохраняет прежнюю базу полям, которые пишет панель
 * ПОСЛЕ тела (факты стиля, StyleFactsField → UpdateStyle): иначе панель сочла бы их чистыми и сняла
 * себя с очереди посреди коммита, и упавший UpdateStyle не оставил бы ничего для повтора.
 *
 * ГРЯЗНОЕ — ЗАНОВО, ПО ВСЕЙ ФОРМЕ (B-02). Первый reset меняет только то, что значит «чисто». Второй
 * отдаёт форме её же значения с keepDefaultValues — это `getDirtyFields(база, значения)` RHF по всей
 * форме, строки массивов тоже, — а keepValues не даёт ему записать ни одного значения. Полную карту
 * RHF затем сводим к разреженной, которую ждут читатели (`sparseDirtyFields`, R-8).
 *
 * ЧТО ОТПУСКАЕТСЯ НАМЕРЕННО (R-8): опубликованные ошибки, isSubmitted, submitCount. Запись легла —
 * форма прошла проверку, сервер принял, и каждая показанная ошибка отвечена; RHF возвращается в режим
 * «до отправки» (`mode: 'onSubmit'`: поля не перепроверяются на каждое нажатие), как делал полный
 * сброс до автосейва. Касания (touched) остаются.
 */
export function settleFormAfterSave(
  form: UseFormReturn<TechCardFormData>,
  before: TechCardFormData | null,
  settled: { values: TechCardFormData; server: TechCardFormData | null },
  opts: {
    /** M-03: the purpose the write deliberately did NOT carry; it returns, still dirty. */
    keepPurpose?: string;
    /** Fields whose baseline this write must NOT move (a panel commits them after the body). */
    keepBaseline?: readonly (keyof TechCardFormData)[];
    /** The server-assigned ids/digests merged onto the operator's rows (index.tsx assignServerLists). */
    serverLists?: (typed: TechCardFormData, server: TechCardFormData) => ServerLists;
  } = {},
): void {
  const { keepPurpose, keepBaseline = [], serverLists } = opts;
  const write = (path: string, value: unknown) => form.setValue(path as never, value as never);
  const typed = form.getValues();
  const lists = settled.server && serverLists ? serverLists(typed, settled.server) : null;
  const keys = new Set([...Object.keys(typed), ...Object.keys(settled.values)]);
  const touched = new Set<string>();
  for (const key of keys) {
    const k = key as keyof TechCardFormData;
    // No copy from the start of the write (it could not be cloned): the old behaviour — the form
    // becomes what was sent.
    const isTouched = !!before && !deepEqual(typed[k], before[k]);
    if (isTouched) touched.add(key);
    const target = isTouched
      ? lists && (k === 'signoffs' || k === 'patterns' || k === 'bomItems')
        ? lists[k]
        : typed[k]
      : k === 'purpose' && keepPurpose !== undefined
        ? keepPurpose
        : settled.values[k];
    writeFormDiff(write, key, typed[k], target);
  }

  const now = form.getValues() as Record<string, unknown>;
  const landed = settled.values as Record<string, unknown>;
  const previous = form.control._defaultValues as Record<string, unknown>;
  const kept = new Set<string>(keepBaseline);
  const baseline: Record<string, unknown> = {};
  for (const key of keys) {
    // A key absent on the side it is taken from stays absent: presence is what RHF counts.
    const from = kept.has(key)
      ? previous
      : touched.has(key) || (key === 'purpose' && keepPurpose !== undefined)
        ? landed
        : now;
    if (Object.prototype.hasOwnProperty.call(from, key)) baseline[key] = from[key];
  }

  const control = form.control;
  form.reset(baseline as TechCardFormData, {
    keepValues: true,
    keepTouched: true,
    // After a reset RHF may consider the form «unmounted» until the next render when something
    // subscribes to isValid, and getValues() then answers with the DEFAULTS — the second reset would
    // read the new baseline back as the current values and find nothing dirty.
    keepIsValid: true,
  });
  if (!control._state.mount) control._state.mount = true;
  form.reset(form.getValues(), {
    keepValues: true,
    keepDefaultValues: true,
    keepTouched: true,
    keepIsValid: true,
  });
  if (!control._state.mount) control._state.mount = true;
  const sparse = (sparseDirtyFields(control._formState.dirtyFields) ??
    {}) as typeof control._formState.dirtyFields;
  control._formState.dirtyFields = sparse;
  control._subjects.state.next({ dirtyFields: sparse });
}

/** ⌘S / Ctrl+S — по ФИЗИЧЕСКОЙ клавише: на русской раскладке `e.key` у этой клавиши — «ы». */
export function isSaveShortcut(
  e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'altKey' | 'code' | 'key'>,
) {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return false;
  return e.code === 'KeyS' || e.key?.toLowerCase() === 's';
}

export type AutosaveController = AutosaveApi & {
  /** Явное сохранение: ⌘S, «save now», «retry», «keep mine». */
  saveNow: (reason: string) => Promise<FlushResult>;
  /** «keep mine» модалки конфликта — единственный, кроме ухода со страницы, выход из паузы (M-01). */
  resolveConflict: () => void;
  /** Исход записи, которую вела не машина (перевод в auxiliary, R-7). */
  settleExternal: (r: SaveResult, reason: string) => void;
  /** При `error`: идут ли ещё автоматические повторы. */
  retrying?: boolean;
  /**
   * Жесты оператора (R-9, ревью m5) — обработчики фазы захвата для КОРНЯ страницы. React ведёт их и
   * через порталы (диалог, открытый страницей, — тоже страница), глобальная шапка приложения сюда не
   * попадает, а событие, которое компонент диспатчит сам (синтетический `change` Radix Select на
   * программной записи), — не жест: считается только `isTrusted`.
   */
  gestureProps: GestureProps;
};

type GestureHandler = (e: { nativeEvent: Event }) => void;
export type GestureProps = {
  onInputCapture: GestureHandler;
  onChangeCapture: GestureHandler;
  onKeyDownCapture: GestureHandler;
  onPointerDownCapture: GestureHandler;
  onPasteCapture: GestureHandler;
  onCutCapture: GestureHandler;
  onDropCapture: GestureHandler;
};

/**
 * Провайдер автосейва для `index.tsx`. Возвращает значение для `AutosaveContext` (контракт
 * `design/autosave-contract.ts`) плюс явную дверь `saveNow`.
 *
 * Называется «controller», а не `useTechCardAutosave`, нарочно: под тем именем контракт уже отдаёт
 * ЧИТАТЕЛЯ контекста, и две функции с одним именем и разным смыслом — ровно та путаница, из-за
 * которой орган однажды смонтировал бы второй автосейв вместо того, чтобы прочитать первый.
 */
export function useTechCardAutosaveController(opts: {
  enabled: boolean;
  /**
   * Выключить СЕЙЧАС, не дожидаясь рендера, в котором `enabled` станет false: одобренный релиз
   * замораживает карточку в ту же миллисекунду, когда лёг PUT, а добирающий проход flush стартует
   * раньше, чем React успеет перерисовать страницу (B-08).
   */
  halted?: () => boolean;
  /** Диалог перевода в auxiliary открыт или переводит: запись ведёт он. */
  paused: boolean;
  form: UseFormReturn<TechCardFormData>;
  /** Ревизия очереди стейджинга (useTechCardStaging, B-03). */
  stagingRevision: number;
  /** «Есть ли что-то в очереди прямо сейчас» — из ref, а не из рендера. */
  hasStaged: () => boolean;
  save: (mode: SaveMode, reason: string) => Promise<SaveResult>;
  /** Тихая проверка (M-02): разбор схемой, ни одной ошибки на поля. */
  validate: () => Promise<{ ok: boolean; errors: number }>;
  countErrors: () => number;
  /** Только на тихом `complete` (B-03). */
  onComplete?: (reason: string) => void;
  /** Найденный на открытии черновик ждёт ответа оператора (R-11) — отдаётся органам как есть. */
  draftPending?: boolean;
  /**
   * Работа тела формы, которую может унести запись (M2: без фактов стиля — их пишет панель стиля, и
   * работой они становятся через её очередь). Без ответа — «форма грязна».
   */
  bodyWork?: () => boolean;
  debounceMs?: number;
  retryDelaysMs?: readonly number[];
}): AutosaveController {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [state, setState] = useState<MachineState>({ status: opts.enabled ? 'idle' : 'off' });
  const machineRef = useRef<AutosaveMachine | null>(null);
  // R-9: every gesture of the operator on the page, counted (capture phase, so a panel that stops
  // propagation is still heard). A panel re-staged with no gesture behind it is echoing its own commit.
  // m5: heard on the page's root (see `gestureProps`), trusted events only.
  const gestures = useRef(0);
  const gestureProps = useMemo<GestureProps>(() => {
    const bump: GestureHandler = (e) => {
      if (e.nativeEvent.isTrusted) gestures.current += 1;
    };
    return {
      onInputCapture: bump,
      onChangeCapture: bump,
      onKeyDownCapture: bump,
      onPointerDownCapture: bump,
      onPasteCapture: bump,
      onCutCapture: bump,
      onDropCapture: bump,
    };
  }, []);
  // m7: an organ asked for a save before the machine existed — the work at creation has a person behind it.
  const requestedEarly = useRef(false);
  // m7: a change heard since the machine began (an edit, a panel's queue, an organ's request).
  const heard = useRef(false);
  // m7: is a person behind the work? Work found at creation alone is not: it is not armed, and the
  // best-effort flushes on leaving (unmount, hidden, pagehide) do not write it either — opening a card
  // and leaving it writes nothing.
  const personBehind = () => gestures.current > 0 || requestedEarly.current || heard.current;

  // Машина живёт от монтирования до размонтирования и создаётся В ЭФФЕКТЕ, а не в рендере: StrictMode
  // размонтирует и монтирует эффекты заново, и машина, убитая первой уборкой, осталась бы мёртвой.
  useEffect(() => {
    const m = createAutosaveMachine({
      debounceMs: optsRef.current.debounceMs ?? AUTOSAVE_DEBOUNCE_MS,
      retryDelaysMs: optsRef.current.retryDelaysMs ?? AUTOSAVE_RETRY_MS,
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      now: () => Date.now(),
      isEnabled: () => optsRef.current.enabled && !(optsRef.current.halted?.() ?? false),
      isPaused: () => optsRef.current.paused,
      hasWork: () =>
        (optsRef.current.bodyWork?.() ?? liveIsDirty(optsRef.current.form)) ||
        optsRef.current.hasStaged(),
      // NOT `form.trigger()`: that publishes an error onto every field, so a two-second pause turned
      // an empty row the operator had just added — and every hidden tab — red (Codex M-02).
      validate: () => optsRef.current.validate(),
      save: (mode, reason) => optsRef.current.save(mode, reason),
      countErrors: () => optsRef.current.countErrors(),
      onState: setState,
      onComplete: (reason) => optsRef.current.onComplete?.(reason),
      operatorGen: () => gestures.current,
      armAtCreation: personBehind,
    });
    machineRef.current = m;
    // Already `dirty` when a child's effect dirtied the form before this one ran (R-12) — and armed only
    // when a person is behind that work (m7).
    setState(m.state());
    return () => {
      // Лучшее, что можно сделать при уходе со страницы: отправить то, что есть. Гарантия на выгрузку —
      // черновик в localStorage (useTechCardDraft), а не этот вызов (Codex M-02). Только работу, за
      // которой стоит человек (m7).
      if (personBehind()) void m.flush('unmount');
      m.dispose();
      if (machineRef.current === m) machineRef.current = null;
    };
  }, []);

  useEffect(() => {
    machineRef.current?.setEnabled(opts.enabled);
  }, [opts.enabled]);

  // m9: the convert dialog let go of the page — a cycle that came due under it is armed now.
  useEffect(() => {
    if (!opts.paused) machineRef.current?.resume();
  }, [opts.paused]);

  // Любая правка формы: значение, setValue, reset. Сброс, который делает сама запись, тоже сюда
  // попадает — машина это переживает: чистая форма в `notifyChange` ничего не взводит.
  // B-1: МИКРОЗАДАЧЕЙ ПОЗЖЕ. `reset` RHF 7.62 шлёт событие значений ДО того, как пересчитает isDirty
  // (`_reset`: `values`, потом `isDirty`), и решение по самому событию видело прежнюю чистоту: после
  // «restore» черновика машина считала форму чистой, гасила статус и не взводила ни одной записи.
  const { form } = opts;
  useEffect(() => {
    let alive = true;
    const sub = form.watch(() =>
      queueMicrotask(() => {
        if (!alive) return;
        heard.current = true;
        machineRef.current?.notifyChange();
      }),
    );
    return () => {
      alive = false;
      sub.unsubscribe();
    };
  }, [form]);

  // Движение очереди панелей (B-03). Первое значение — это «как открыли», не правка.
  const lastRevision = useRef(opts.stagingRevision);
  useEffect(() => {
    if (lastRevision.current === opts.stagingRevision) return;
    lastRevision.current = opts.stagingRevision;
    heard.current = true;
    machineRef.current?.notifyChange();
  }, [opts.stagingRevision]);

  // ⌘S / Ctrl+S — «сохранить сейчас», и браузерный диалог «сохранить страницу» при этом не нужен.
  useEffect(() => {
    if (!opts.enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isSaveShortcut(e)) return;
      e.preventDefault();
      void machineRef.current?.flush('keyboard', 'explicit');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [opts.enabled]);

  // Уход со вкладки и выгрузка — best effort (M-02): страница может не дожить до ответа сервера.
  useEffect(() => {
    if (!opts.enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && personBehind())
        void machineRef.current?.flush('hidden');
    };
    const onPageHide = () => {
      if (personBehind()) void machineRef.current?.flush('pagehide');
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [opts.enabled]);

  const draftPending = !!opts.draftPending;
  return useMemo<AutosaveController>(
    () => ({
      status: state.status,
      lastSavedAt: state.lastSavedAt,
      errorsCount: state.errorsCount,
      message: state.message,
      retrying: state.retrying,
      draftPending,
      request: () => {
        if (!machineRef.current) {
          requestedEarly.current = true;
          return;
        }
        heard.current = true;
        machineRef.current.notifyChange();
      },
      flush: (reason) => machineRef.current?.flush(reason) ?? Promise.resolve('off' as const),
      saveNow: (reason) =>
        machineRef.current?.flush(reason, 'explicit') ?? Promise.resolve('off' as const),
      resolveConflict: () => machineRef.current?.resolveConflict(),
      settleExternal: (r, reason) => machineRef.current?.settleExternal(r, reason),
      gestureProps,
    }),
    [state, draftPending, gestureProps],
  );
}
