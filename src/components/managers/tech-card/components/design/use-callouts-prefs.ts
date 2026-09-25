import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ═══ ШИРИНА И СВЁРНУТОСТЬ ПАНЕЛИ CALLOUTS — НА ПОЛЬЗОВАТЕЛЯ, НЕ НА КАРТОЧКУ (волна 25.09, D-11) ═══
 *
 * Образец — `../use-panel-prefs.ts` (доки фулскрина схемы), и довод тот же: ширина панели указаний
 * — про РУКИ И ЭКРАН. Технолог на 13" хочет узкую панель на любой карточке, тот, кто пишет длинные
 * записки на 27", — широкую. Поле карточки встречало бы каждого чужой раскладкой.
 *
 * ⚠ ЭТО ПРЕЗЕНТАЦИЯ, И ФОРМА ОБ ЭТОМ НЕ УЗНАЁТ НИКОГДА. Потянуть разделитель или свернуть панель —
 * не правка карточки: ни dirty, ни автосейва, ни «есть несохранённые изменения». Хук не знает RHF
 * целиком, и ревью каждой правки этого файла обязано проверять, что так и осталось.
 *
 * ПАТЧ ПОВЕРХ СВЕЖЕГО ЧТЕНИЯ, как у образца: писатель один, копит патч и сливает его с тем, что
 * лежит в хранилище СЕЙЧАС, — поле, записанное соседней вкладкой, не откатывается.
 */
export type CalloutsPrefs = {
  /** Ширина раскрытой панели, px (от `lg`; ниже панель стоит под доской во всю ширину). */
  w?: number;
  /**
   * Свёрнута ли. `undefined` — предпочтения НЕТ, и тогда решает число указаний (`calloutsCollapsed`):
   * пустая доска держит панель свёрнутой, первое указание раскрывает её само. Явный клик пишет
   * `true`/`false`, и с этой минуты число больше не решает ничего.
   */
  collapsed?: boolean;
};

/** Один ключ на пользователя: ни карточки, ни колорвея в нём нет намеренно. */
export const CALLOUTS_PREFS_KEY = 'plm.techcard.moodboard.callouts';

/** Дебаунс записи — разделитель рождает поток движений, а localStorage синхронный. */
const WRITE_DELAY_MS = 400;

/** Клампы ширины: пол — чтобы строка меню ещё читалась, потолок — чтобы доске осталось место. */
export const CALLOUTS_MIN_W = 240;
export const CALLOUTS_MAX_W = 720;
/** Доля ряда «доска + панель», больше которой панель не бывает (60%). */
export const CALLOUTS_MAX_SHARE = 0.6;
/** Ширина без предпочтения — та, что стояла гвоздём до волны (`lg:w-[340px]`). */
export const CALLOUTS_DEFAULT_W = 340;
/** Шаг ←/→ на разделителе в фокусе. */
export const CALLOUTS_KEY_STEP = 16;
/** Свёрнутая панель — вертикальная полоска этой ширины. */
export const CALLOUTS_STRIP_W = 28;

/**
 * Потолок ширины для ряда шириной `rowW`. Ряд ещё не измерен (0) — потолок абсолютный: иначе на
 * первом кадре панель схлопнулась бы до пола и прыгнула бы назад после замера.
 */
export function calloutsMaxWidth(rowW: number): number {
  if (!(rowW > 0)) return CALLOUTS_MAX_W;
  return Math.max(CALLOUTS_MIN_W, Math.min(CALLOUTS_MAX_W, Math.floor(rowW * CALLOUTS_MAX_SHARE)));
}

/** Ширина, которую панель РЕАЛЬНО получит в ряду `rowW`. */
export function clampCalloutsWidth(w: number | undefined, rowW: number): number {
  const want = typeof w === 'number' && Number.isFinite(w) ? w : CALLOUTS_DEFAULT_W;
  return Math.min(calloutsMaxWidth(rowW), Math.max(CALLOUTS_MIN_W, Math.round(want)));
}

/** Свёрнута ли панель: явное предпочтение побеждает, без него — пустая доска свёрнута. */
export function calloutsCollapsed(pref: boolean | undefined, count: number): boolean {
  return pref ?? count === 0;
}

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v)
    ? Math.min(CALLOUTS_MAX_W, Math.max(CALLOUTS_MIN_W, Math.round(v)))
    : undefined;

const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

/** Чтение хранилища: берётся только то, что похоже на правду; испорченное — как отсутствующее. */
export function readCalloutsPrefs(): CalloutsPrefs {
  try {
    const raw = localStorage.getItem(CALLOUTS_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<CalloutsPrefs> | null;
    return { w: num(parsed?.w), collapsed: bool(parsed?.collapsed) };
  } catch {
    return {};
  }
}

/**
 * Предпочтения панели указаний. `set` сливает патч и возвращает управление сразу; в хранилище
 * патч уходит через 400 мс тишины, а на `pagehide` и размонтировании — немедленно (быстрый F5 в
 * окне дебаунса иначе терял бы ровно то, что человек только что сделал).
 */
export function useCalloutsPrefs() {
  const [prefs, setPrefs] = useState<CalloutsPrefs>(readCalloutsPrefs);

  const pending = useRef<CalloutsPrefs | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = null;
    if (!patch) return;
    try {
      localStorage.setItem(
        CALLOUTS_PREFS_KEY,
        JSON.stringify({ ...readCalloutsPrefs(), ...patch }),
      );
    } catch {
      // Квота или запрещённое хранилище: раскладка не переживёт перезагрузку, и только.
    }
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  const set = useCallback(
    (patch: CalloutsPrefs) => {
      // Побочные эффекты — вне апдейтера: StrictMode зовёт апдейтеры дважды.
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, WRITE_DELAY_MS);
      setPrefs((cur) => ({ ...cur, ...patch }));
    },
    [flush],
  );

  return { prefs, set };
}
