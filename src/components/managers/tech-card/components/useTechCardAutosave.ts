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
 *   · перед записью `form.trigger()`; невалидная форма НЕ пишется — статус `invalid` с числом ошибок;
 *   · один вызов в полёте; правки во время записи — ещё один цикл после неё, без второго параллельного;
 *   · `flush()` — немедленно и с ответом; платные двери стартуют только при `ok`/`nothing` (B-05);
 *   · ошибка → повторы через 5 / 15 / 45 с, потом `not saved · retry`;
 *   · 409 → статус `conflict`, автосейв стоит, пока человек не решит в модалке (B-02: сам автосейв
 *     НИКОГДА не выбирает «keep mine»);
 *   · `saved` и запись истории — ТОЛЬКО при исходе `complete` (B-03: `restaged`/`partial` — не сохранено).
 *
 * Машина ниже не импортирует React и не трогает window: таймеры, часы и все чтения приходят
 * зависимостями. Это не ради красоты — проба (`scripts/techcard-autosave-probe.mjs`) гоняет её в node
 * с поддельными часами и доказывает «сработал ровно через 2 с» и «не пишет невалидное» без браузера.
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
  /** Тихая проверка: выставляет ошибки полям, НЕ уводит фокус и не переключает вкладку. */
  validate: () => Promise<{ ok: boolean; errors: number }>;
  save: (mode: SaveMode, reason: string) => Promise<SaveResult>;
  countErrors: () => number;
  onState: (state: MachineState) => void;
  /** Только на `complete`: сюда вешается запись истории. */
  onComplete?: (reason: string) => void;
};

/** Внутренний исход цикла: `restaged` наружу не выходит, flush его разворачивает. */
type CycleResult = FlushResult | 'restaged';

export type AutosaveMachine = {
  state: () => MachineState;
  /** Что-то изменилось (правка формы, движение очереди, просьба органа): взвести дебаунс. */
  notifyChange: () => void;
  /** Сохранить сейчас и сказать, вышло ли. `explicit` — ⌘S / «save now»: там валидирует сам конвейер
   *  (с прыжком к полю), и только там работает диалог перевода purpose. */
  flush: (reason: string, mode?: SaveMode) => Promise<FlushResult>;
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

  const set = (patch: Partial<MachineState>) => {
    const next = { ...state, ...patch };
    if (sameState(next, state)) return;
    state = next;
    deps.onState(state);
  };
  const restingStatus = (): AutosaveStatus => (state.lastSavedAt ? 'saved' : 'idle');

  const clearTimer = () => {
    if (timer != null) deps.clearTimer(timer);
    timer = null;
  };
  const arm = (ms: number, reason: string) => {
    clearTimer();
    timer = deps.setTimer(() => {
      timer = null;
      void enqueue('silent', reason);
    }, ms);
  };

  async function runCycle(mode: SaveMode, reason: string): Promise<CycleResult> {
    if (disposed && reason !== 'unmount') return 'off';
    if (!deps.isEnabled()) {
      set({ status: 'off' });
      return 'off';
    }
    // Диалог перевода в auxiliary открыт: запись, которую он перехватил, он же и повторит.
    if (deps.isPaused()) return 'needs-confirm';
    // 409 держит автосейв, пока человек не выбрал в модалке. Явное сохранение (⌘S, «keep mine»)
    // проходит: это и есть выбор.
    if (mode === 'silent' && state.status === 'conflict') return 'conflict';
    if (!deps.hasWork()) {
      set({
        status: state.status === 'conflict' ? 'conflict' : restingStatus(),
        errorsCount: undefined,
        message: undefined,
        retrying: undefined,
      });
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

  function settle(r: SaveResult, reason: string): CycleResult {
    switch (r.outcome) {
      case 'complete': {
        retryIndex = 0;
        restagedStreak = 0;
        const at = deps.now();
        deps.onComplete?.(reason);
        if (r.pendingConfirm) {
          set({
            status: 'needs-confirm',
            lastSavedAt: at,
            errorsCount: undefined,
            message: r.message,
          });
          return 'needs-confirm';
        }
        // Правка, набранная, пока запись летела, остаётся несохранённой — «saved» над ней было бы
        // ложью. Дебаунс для неё уже взведён тем же `notifyChange`, что её заметил.
        set({
          status: deps.hasWork() ? 'dirty' : 'saved',
          lastSavedAt: at,
          errorsCount: undefined,
          message: undefined,
          retrying: undefined,
        });
        return 'ok';
      }
      case 'nothing':
        set({
          status: restingStatus(),
          errorsCount: undefined,
          message: undefined,
          retrying: undefined,
        });
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
          errorsCount: deps.countErrors() || undefined,
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
      if (state.status === 'conflict') return;
      if (running) {
        // Решим после цикла: правка во время записи — ещё один цикл, а не второй параллельный.
        arm(deps.debounceMs, 'debounce');
        return;
      }
      if (!deps.hasWork()) {
        // Правку откатили руками — сохранять нечего, и «unsaved» над чистой карточкой было бы ложью.
        if (state.status === 'dirty') set({ status: restingStatus() });
        if (state.status !== 'error') clearTimer();
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
      clearTimer();
      let r = await enqueue(mode, reason);
      // `restaged` — сервер ещё не видел последних значений панели. Для платной двери это «нет»,
      // поэтому flush доводит дело сам: ещё два цикла, и только потом отвечает ошибкой.
      for (let i = 0; r === 'restaged' && i < 2; i++) r = await enqueue(mode, reason);
      return r === 'restaged' ? 'error' : r;
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
  /** Диалог перевода в auxiliary открыт или переводит: запись ведёт он. */
  paused: boolean;
  form: UseFormReturn<TechCardFormData>;
  /** Ревизия очереди стейджинга (useTechCardStaging, B-03). */
  stagingRevision: number;
  /** «Есть ли что-то в очереди прямо сейчас» — из ref, а не из рендера. */
  hasStaged: () => boolean;
  save: (mode: SaveMode, reason: string) => Promise<SaveResult>;
  countErrors: () => number;
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
      isEnabled: () => optsRef.current.enabled,
      isPaused: () => optsRef.current.paused,
      hasWork: () => liveIsDirty(optsRef.current.form) || optsRef.current.hasStaged(),
      validate: async () => {
        const ok = await optsRef.current.form.trigger();
        return { ok, errors: optsRef.current.countErrors() };
      },
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
    }),
    [state],
  );
}
