import { useCurrentAccount } from 'components/managers/accounts/utils/hooks';
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
 *
 * ═══ КЛЮЧ — НА УЧЁТНУЮ ЗАПИСЬ, НЕ НА БРАУЗЕР (фиксап волны, ревью Codex N3) ═══════════════════════
 *
 * «На пользователя» значит на ЧЕЛОВЕКА: в одном браузере могут работать двое, и второй не должен
 * получать чужую раскладку. Ключ — `plm.techcard.moodboard.callouts.<username>` (имя учётной
 * записи из `GetCurrentAccount`, тот же запрос, что держит права). Пока учётная запись не известна,
 * читается умолчание и ничего не пишется. Ключ без имени (первая редакция волны) переезжает к
 * первой учётной записи, которая его прочтёт, и удаляется.
 *
 * Жест, сделанный ДО ответа `GetCurrentAccount` (фиксап раунда 2, MIN-8), не теряется: он стоит на
 * экране сразу и уезжает под ключ пришедшей учётной записи — поверх того, что под ним лежало. Прежде
 * приход ключа перечитывал хранилище и молча откатывал только что свёрнутую панель.
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

/** Основа ключа; сам ключ — на учётную запись (`calloutsPrefsKey`). Ни карточки, ни колорвея. */
export const CALLOUTS_PREFS_KEY = 'plm.techcard.moodboard.callouts';

/** Ключ предпочтений этой учётной записи; `null`, пока она не известна. */
export function calloutsPrefsKey(owner: string | null | undefined): string | null {
  const who = (owner ?? '').trim().toLowerCase();
  return who ? `${CALLOUTS_PREFS_KEY}.${who}` : null;
}

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

/**
 * Чтение хранилища: берётся только то, что похоже на правду; испорченное — как отсутствующее.
 * Нет своего ключа, а есть безымянный (до фиксапа) — он переезжает сюда и удаляется.
 */
export function readCalloutsPrefs(key: string | null): CalloutsPrefs {
  if (!key) return {};
  try {
    let raw = localStorage.getItem(key);
    if (!raw) {
      const legacy = localStorage.getItem(CALLOUTS_PREFS_KEY);
      if (legacy) {
        localStorage.setItem(key, legacy);
        localStorage.removeItem(CALLOUTS_PREFS_KEY);
        raw = legacy;
      }
    }
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
  const { data } = useCurrentAccount();
  const key = calloutsPrefsKey(data?.account?.username);

  // Предпочтения ТЕКУЩЕГО ключа. Ключ сменился (учётная запись пришла или сменилась) — читаются
  // заново в том же рендере, без кадра чужой раскладки.
  const [slot, setSlot] = useState<{ key: string | null; prefs: CalloutsPrefs }>(() => ({
    key,
    prefs: readCalloutsPrefs(key),
  }));
  /**
   * Жесты, сделанные, пока учётная запись не известна (MIN-8). Приход ПЕРВОГО ключа кладёт их поверх
   * прочитанного — на экран в том же рендере, в хранилище эффектом ниже. Смена одной учётной записи
   * на другую их не несёт: там ключ был и раньше, и жест принадлежал ему.
   */
  const keyless = useRef<CalloutsPrefs | null>(null);
  let current = slot;
  if (slot.key !== key) {
    const carried = slot.key === null && key ? keyless.current : null;
    current = { key, prefs: { ...readCalloutsPrefs(key), ...carried } };
    setSlot(current);
  }

  /** Патч и КЛЮЧ, под которым он сделан: смена учётной записи не переносит чужой жест. */
  const pending = useRef<{ key: string; patch: CalloutsPrefs } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const due = pending.current;
    pending.current = null;
    if (!due) return;
    try {
      localStorage.setItem(
        due.key,
        JSON.stringify({ ...readCalloutsPrefs(due.key), ...due.patch }),
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

  // Ключ пришёл — несохранённые жесты без ключа уезжают под него тем же дебаунсом, что и прочие.
  useEffect(() => {
    const carried = keyless.current;
    if (!key || !carried) return;
    keyless.current = null;
    if (pending.current && pending.current.key !== key) flush();
    pending.current = { key, patch: { ...carried, ...pending.current?.patch } };
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, WRITE_DELAY_MS);
  }, [key, flush]);

  const set = useCallback(
    (patch: CalloutsPrefs) => {
      // Побочные эффекты — вне апдейтера: StrictMode зовёт апдейтеры дважды.
      if (key) {
        if (pending.current && pending.current.key !== key) flush();
        pending.current = { key, patch: { ...pending.current?.patch, ...patch } };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, WRITE_DELAY_MS);
      } else {
        // Учётная запись ещё не известна — жест действует на экране и ждёт ключа (MIN-8).
        keyless.current = { ...keyless.current, ...patch };
      }
      setSlot((cur) => ({ key: cur.key, prefs: { ...cur.prefs, ...patch } }));
    },
    [flush, key],
  );

  return { prefs: current.prefs, set };
}
