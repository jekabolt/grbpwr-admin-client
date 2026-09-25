import { useEffect, useMemo, useRef, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { AutosaveApi, AutosaveStatus, FlushResult } from './design/autosave-contract';
import type { TechCardFormData } from './schema';

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
 *     стартуют только при `ok`/`nothing` (B-05);
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
    // Диалог перевода в auxiliary открыт: запись, которую он перехватил, он же и повторит.
    if (deps.isPaused()) return 'needs-confirm';
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
          return 'error';
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

  return {
    state: () => state,

    notifyChange: () => {
      if (disposed || !deps.isEnabled()) return;
      changeGen += 1;
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
      // Карточка не затихла за FLUSH_MAX_PASSES проходов — оператор печатает, пока дверь ждёт.
      return 'error';
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
  /** При `error`: идут ли ещё автоматические повторы. */
  retrying?: boolean;
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
  debounceMs?: number;
  retryDelaysMs?: readonly number[];
}): AutosaveController {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const [state, setState] = useState<MachineState>({ status: opts.enabled ? 'idle' : 'off' });
  const machineRef = useRef<AutosaveMachine | null>(null);

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
      hasWork: () => liveIsDirty(optsRef.current.form) || optsRef.current.hasStaged(),
      // NOT `form.trigger()`: that publishes an error onto every field, so a two-second pause turned
      // an empty row the operator had just added — and every hidden tab — red (Codex M-02).
      validate: () => optsRef.current.validate(),
      save: (mode, reason) => optsRef.current.save(mode, reason),
      countErrors: () => optsRef.current.countErrors(),
      onState: setState,
      onComplete: (reason) => optsRef.current.onComplete?.(reason),
    });
    machineRef.current = m;
    setState(m.state());
    return () => {
      // Лучшее, что можно сделать при уходе со страницы: отправить то, что есть. Гарантия на выгрузку —
      // черновик в localStorage (useTechCardDraft), а не этот вызов (Codex M-02).
      void m.flush('unmount');
      m.dispose();
      if (machineRef.current === m) machineRef.current = null;
    };
  }, []);

  useEffect(() => {
    machineRef.current?.setEnabled(opts.enabled);
  }, [opts.enabled]);

  // Любая правка формы: значение, setValue, reset. Сброс, который делает сама запись, тоже сюда
  // попадает — машина это переживает: чистая форма в `notifyChange` ничего не взводит.
  const { form } = opts;
  useEffect(() => {
    const sub = form.watch(() => machineRef.current?.notifyChange());
    return () => sub.unsubscribe();
  }, [form]);

  // Движение очереди панелей (B-03). Первое значение — это «как открыли», не правка.
  const lastRevision = useRef(opts.stagingRevision);
  useEffect(() => {
    if (lastRevision.current === opts.stagingRevision) return;
    lastRevision.current = opts.stagingRevision;
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
      if (document.visibilityState === 'hidden') void machineRef.current?.flush('hidden');
    };
    const onPageHide = () => void machineRef.current?.flush('pagehide');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [opts.enabled]);

  return useMemo<AutosaveController>(
    () => ({
      status: state.status,
      lastSavedAt: state.lastSavedAt,
      errorsCount: state.errorsCount,
      message: state.message,
      retrying: state.retrying,
      request: () => machineRef.current?.notifyChange(),
      flush: (reason) => machineRef.current?.flush(reason) ?? Promise.resolve('off' as const),
      saveNow: (reason) =>
        machineRef.current?.flush(reason, 'explicit') ?? Promise.resolve('off' as const),
      resolveConflict: () => machineRef.current?.resolveConflict(),
    }),
    [state],
  );
}
