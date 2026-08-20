import { useCallback, useEffect, useRef, useState } from 'react';

// Высоты и свёрнутость панелей фулскрина схемы — НА ПОЛЬЗОВАТЕЛЯ, а не на карточку.
//
// ПОЧЕМУ ГЛОБАЛЬНО, в отличие от соседнего `use-schematic-prefs`. Ручные позиции нод — про
// КОНКРЕТНУЮ сборку: расстановка узлов куртки ничего не говорит о брюках, и хранить её иначе как
// на карточку бессмысленно. Высота дока — про РУКИ И ЭКРАН: технолог с 13" ноутбуком хочет
// маленький док на любой карточке, а тот, кто правит длинные заметки на 27", — большой. Сделай
// это полем карточки — и каждая новая карточка встречала бы человека чужой раскладкой, которую он
// уже двадцать раз поправил.
//
// ПОЧЕМУ НЕ В ФОРМЕ. Ровно тот же инвариант, что у позиций: это ПРЕЗЕНТАЦИЯ. Потяни сплиттер — и
// форма не имеет права стать грязной; иначе «есть несохранённые правки», beforeunload и заряженный
// Save появляются от того, что человек подвинул границу панели. Хук чистый от RHF целиком, и
// ревью каждой правки этого файла обязано проверять, что так и осталось.
//
// ПОЧЕМУ ПАТЧЕМ, А НЕ ОТДЕЛЬНЫМИ ПИСАТЕЛЯМИ. Соседний модуль пересобирает хранимый объект целиком
// в каждом писателе, и это уже дало один тихий баг: поле, о котором писатель не знает, стирается
// первым же вызовом. Здесь writer один, копит именно ПАТЧ и на записи сливает его со свежим
// чтением хранилища — поле, добавленное поздней фазой или чужим инстансом, переживает любой чужой
// вызов по построению.

/**
 * Оба трека объявлены ОДНОЙ записью, и полкины поля были объявлены ЗАРАНЕЕ, за фазу до своего
 * первого читателя.
 *
 * Не «на всякий случай»: формат в localStorage переживает версии клиента, и добавить поле позже —
 * значит либо мигрировать чужое хранилище, либо смириться с тем, что у половины пользователей
 * ключ старого вида. Дешевле объявить оба трека сразу. С Ф5в полка ими пользуется.
 */
export type PanelPrefs = {
  /** Высота дока редактора шага, px. */
  dockH?: number;
  /** Высота полки деталей, px. */
  shelfH?: number;
  /** Док свёрнут. NB: ВХОД в фулскрин закрывает док независимо от этого — см. `dockStep`. */
  dockCollapsed?: boolean;
  /**
   * Полка свёрнута до своей 24px шапки. Полного скрытия у полки нет: свёрнутая, она продолжает
   * отвечать счётчиками и осями, и `[` переключает ровно эти два состояния.
   */
  shelfCollapsed?: boolean;
};

/** Один ключ на пользователя: ни карточки, ни колорвея в нём нет намеренно. */
const KEY = 'plm.techcard.schematic.panels';

/** Дебаунс записи — сплиттер генерирует поток коммитов, а localStorage синхронный. */
const WRITE_DELAY_MS = 400;

/** Клампы треков. Порт `prototype.html` (`SHELF`/`DOCK` в `setBar`). */
export const DOCK_MIN = 96;
export const DOCK_MAX = 460;
export const SHELF_MIN = 84;
export const SHELF_MAX = 300;

/** Высота дока по умолчанию — та же, что стоит фолбэком в гриде фулскрина. */
export const DOCK_DEFAULT = 280;
/** Высота полки по умолчанию — тоже фолбэк трека `--shelf-h` в гриде фулскрина. */
export const SHELF_DEFAULT = 118;

const num = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : undefined;

const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

function read(): PanelPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<PanelPrefs>;
    // Хранилище правит кто угодно и когда угодно — чужая вкладка, ручная чистка, старая версия.
    // Поэтому не «доверять и упасть», а взять только то, что похоже на правду; числа вдобавок
    // клампятся, иначе испорченная высота дока прячет полотно целиком и достать его нечем.
    return {
      dockH: num(parsed?.dockH, DOCK_MIN, DOCK_MAX),
      shelfH: num(parsed?.shelfH, SHELF_MIN, SHELF_MAX),
      dockCollapsed: bool(parsed?.dockCollapsed),
      shelfCollapsed: bool(parsed?.shelfCollapsed),
    };
  } catch {
    return {};
  }
}

/**
 * Предпочтения панелей фулскрина.
 *
 * `set` СЛИВАЕТ патч и возвращает управление сразу: запись отложена, поток движений сплиттера в
 * localStorage не уходит. `flush` на `pagehide` и на размонтировании — без него быстрый F5 в окне
 * дебаунса терял бы ровно то изменение, которое человек только что сделал и пошёл проверять.
 */
export function usePanelPrefs() {
  const [prefs, setPrefs] = useState<PanelPrefs>(read);

  const pending = useRef<PanelPrefs | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // В ХРАНИЛИЩЕ УХОДИТ ПАТЧ ПОВЕРХ СВЕЖЕГО ЧТЕНИЯ, а не состояние этого инстанса. Состояние —
  // снимок на маунте плюс свои правки: записанное как есть, оно тихо откатывало бы поля, которые
  // после маунта записал ДРУГОЙ писатель — второй инстанс хука (док и полка в разных компонентах
  // с Ф5) или соседняя вкладка. Это та же ловушка каталога, что у писателей соседнего модуля,
  // только уровнем выше: там объект пересобирал каждый писатель, здесь — каждый инстанс.
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    pending.current = null;
    if (!patch) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
    } catch {
      // Квота или запрещённое хранилище: раскладка не переживёт перезагрузку, но работать мешать
      // не должна.
    }
  }, []);

  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush(); // размонтирование — тот же случай, что уход со страницы
    };
  }, [flush]);

  const set = useCallback(
    (patch: PanelPrefs) => {
      // Побочные эффекты — ВНЕ апдейтера состояния: StrictMode зовёт апдейтеры дважды, и таймер,
      // взведённый внутри, взводился бы с ним.
      pending.current = { ...pending.current, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, WRITE_DELAY_MS);
      setPrefs((cur) => ({ ...cur, ...patch }));
    },
    [flush],
  );

  return { prefs, set };
}
