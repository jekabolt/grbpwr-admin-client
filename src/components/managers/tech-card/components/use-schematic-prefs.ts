import { useCallback, useEffect, useRef, useState } from 'react';

import type { PosOverrides } from './assembly-positions';

// Предпочтения схемы сборки: ручные позиции нод и выбранный режим — НА КАРТОЧКУ, в localStorage.
//
// ПОЧЕМУ НЕ В ФОРМЕ И НЕ В ЧЕРНОВИКЕ. Позиции — не факт карточки: их нет на проводе, нет в
// дайджесте, они ничего не подписывают. Положи их в форму — и перетаскивание ноды взведёт
// `isDirty`: появится «есть несохранённые правки», beforeunload и заряженная кнопка Save, хотя
// карточка не менялась. Это враньё дороже любого удобства, поэтому позиции идут МИМО RHF, и
// ревью каждой правки этого файла обязано проверять, что так и осталось.
//
// ПОЧЕМУ НЕ ВНУТРИ `useTechCardDraft`. Там свой жизненный цикл: restore и clear черновика не
// должны трогать раскладку — «отменил правки» и «сбросил расстановку» суть разные намерения.
//
// Состояние живёт ВЫШЕ схемы (в `OperationsField`), потому что схема размонтируется при
// переключении режима — а именно жест «заполнил в досье, переключился, подвигал» и требуется.
//
// НА НЕСОХРАНЁННОЙ КАРТОЧКЕ (`/add-tech-card`, id нет) — только память сессии: ключа нет, писать
// некуда, и придумывать суррогатный ключ значило бы оставить мусор, который никто не свяжет с
// будущей карточкой.
//
// ПОЧЕМУ ОДИН BUILDER НА ВСЕХ ПИСАТЕЛЕЙ. Раньше хранимый объект собирался руками в четырёх местах
// (`read`, `move`, `reset`, `setMode`), и каждое новое поле приходилось помнить во всех четырёх.
// Поле, о котором писатель не знает, стирается его первым же вызовом: ось полки, переключённая
// один раз, молча возвращалась бы к дефолту после первого перетаскивания ноды — а связь между
// «подвинул узел» и «сбросилась группировка полки» с места не видна вовсе. Поэтому запись собирает
// РОВНО ОДНА чистая функция `buildStored`, писатели дают ей только патч, и поле переживает чужой
// вызов по построению, а не по внимательности. Проба — `scripts/schematic-prefs-probe.mjs`.
//
// ФОРМАТ `v: 1` НЕ ЛОМАЕТСЯ. Новые поля — только опциональные, чтение back-compat: старая запись
// без `axis` читается как есть, ось выходит `undefined`, дефолт выбирает потребитель. Поднять
// версию значило бы отбросить чужие ручные раскладки, которые никто заново не расставит.

export type SchematicMode = 'list' | 'schematic';

/** Ось группировки полки деталей на полотне: по узлам сборки или по тканям. */
export type SchematicAxis = 'unit' | 'cloth';

export type Stored = {
  v: 1;
  mode?: SchematicMode;
  pos: PosOverrides;
  axis?: SchematicAxis;
};

/** Текущее состояние записи в памяти — то, поверх чего builder кладёт патч. */
export type StoredState = {
  mode?: SchematicMode;
  pos: PosOverrides;
  axis?: SchematicAxis;
};

/**
 * ЕДИНСТВЕННОЕ место, где рождается хранимая запись. Любой писатель — включая `read` — обязан идти
 * сюда: поле, которого нет в патче, берётся из текущего состояния и потому не теряется.
 *
 * Пустые поля в объект не кладутся вовсе (не `mode: undefined`), чтобы форма записи была ровно
 * `{v, mode?, pos, axis?}` и сравнение снимков не спотыкалось о ключ со значением `undefined`.
 */
export function buildStored(cur: StoredState, patch: Partial<StoredState> = {}): Stored {
  const mode = patch.mode ?? cur.mode;
  const axis = patch.axis ?? cur.axis;
  const pos = patch.pos ?? cur.pos ?? {};
  return { v: 1, ...(mode ? { mode } : {}), pos, ...(axis ? { axis } : {}) };
}

const keyOf = (cardId: number) => `plm.techcard.schematic.${cardId}`;

/** Потолок ключей: выше него запись чистит позиции нод, которых в графе уже нет. */
const POS_CEILING = 200;

/** Дебаунс записи — драг генерирует поток коммитов, а localStorage синхронный. */
const WRITE_DELAY_MS = 400;

/**
 * Разбор хранимой записи. Функция от СТРОКИ, а не от localStorage: back-compat (старая запись без
 * `axis`) и отбраковка мусора — единственное, что тут можно сделать неправильно, и проверяться это
 * обязано пробой, а не руками в браузере.
 */
export function parseStored(raw: string | null): Stored {
  if (!raw) return buildStored({ pos: {} });
  try {
    const parsed = JSON.parse(raw) as Partial<Stored>;
    // Хранилище правит кто угодно и когда угодно — чужая вкладка, ручная чистка, старая версия.
    // Поэтому не «доверять и упасть», а взять только то, что похоже на правду.
    const pos: PosOverrides = {};
    for (const [k, v] of Object.entries(parsed?.pos ?? {})) {
      if (v && typeof v.x === 'number' && typeof v.y === 'number' && Number.isFinite(v.x) && Number.isFinite(v.y)) {
        pos[k] = { x: v.x, y: v.y };
      }
    }
    const mode = parsed?.mode === 'list' || parsed?.mode === 'schematic' ? parsed.mode : undefined;
    const axis = parsed?.axis === 'unit' || parsed?.axis === 'cloth' ? parsed.axis : undefined;
    return buildStored({ mode, pos, axis });
  } catch {
    return buildStored({ pos: {} });
  }
}

function read(cardId: number | undefined): Stored {
  if (cardId === undefined) return buildStored({ pos: {} });
  try {
    return parseStored(localStorage.getItem(keyOf(cardId)));
  } catch {
    // Само хранилище может быть запрещено политикой — тогда `getItem` бросает до всякого разбора.
    return buildStored({ pos: {} });
  }
}

/**
 * Ручные позиции и режим схемы для одной карточки.
 *
 * `liveKeys` — ключи нод текущего графа; нужны только гигиене записи: пока позиций меньше
 * потолка, исчезнувшие ключи НЕ вычищаются, потому что «растворил узел и передумал» — штатный
 * цикл, и терять расстановку на время небытия узла незачем.
 */
export function useSchematicPrefs(cardId: number | undefined, liveKeys: () => Set<string>) {
  const [pos, setPos] = useState<PosOverrides>(() => read(cardId).pos);
  const [mode, setModeState] = useState<SchematicMode | null>(() => read(cardId).mode ?? null);
  const [axis, setAxisState] = useState<SchematicAxis | null>(() => read(cardId).axis ?? null);

  // Полное состояние записи ОДНИМ объектом, синхронно. Писатели патчат его, а не собирают запись из
  // своих замыканий: замыкание видит только то поле, о котором писатель знал, — и остальные ушли бы
  // в хранилище пустыми (см. шапку про builder).
  const cur = useRef<StoredState>({ mode: mode ?? undefined, pos, axis: axis ?? undefined });

  // Карточка сменилась под тем же компонентом (переход между тех-картами) — перечитать.
  const loadedFor = useRef(cardId);
  useEffect(() => {
    if (loadedFor.current === cardId) return;
    loadedFor.current = cardId;
    const s = read(cardId);
    cur.current = { mode: s.mode, pos: s.pos, axis: s.axis };
    setPos(s.pos);
    setModeState(s.mode ?? null);
    setAxisState(s.axis ?? null);
  }, [cardId]);

  // Отложенная запись + её принудительный сброс. Без flush на `pagehide` быстрый F5 в окне
  // дебаунса терял бы последнее перемещение — то есть ровно то, которое пользователь только что
  // сделал и пошёл проверять.
  const pending = useRef<Stored | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    const next = pending.current;
    pending.current = null;
    if (!next || cardId === undefined) return;
    try {
      localStorage.setItem(keyOf(cardId), JSON.stringify(next));
    } catch {
      // Квота или запрещённое хранилище: расстановка не переживёт перезагрузку, но работать
      // мешать не должна.
    }
  }, [cardId]);

  const schedule = useCallback(
    (next: Stored) => {
      if (cardId === undefined) return; // несохранённая карточка — только память сессии
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, WRITE_DELAY_MS);
    },
    [cardId, flush],
  );

  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush(); // размонтирование — тот же случай, что уход со страницы
    };
  }, [flush]);

  /**
   * Единственная дорога в хранилище: патч ложится поверх полного состояния, запись пересобирается.
   */
  const commit = useCallback(
    (patch: Partial<StoredState>) => {
      const next = buildStored(cur.current, patch);
      cur.current = { mode: next.mode, pos: next.pos, axis: next.axis };
      schedule(next);
    },
    [schedule],
  );

  const move = useCallback(
    (key: string, at: { x: number; y: number }) => {
      // Побочные эффекты — ВНЕ апдейтера состояния (та же дисциплина, что записана в шапке
      // use-panel-prefs): апдейтер React вправе прогнать повторно (StrictMode — дважды всегда) и
      // выбросить, а `commit` изнутри взводил бы таймер и мутировал `cur` из фазы рендера —
      // выброшенный рендер оставил бы запись в хранилище впереди состояния. Прежние позиции
      // читаются из `cur.current.pos`: его синхронно ведут те же писатели, что и state
      // (`commit`, перечитывание при смене карточки), так что снимок один на чтение и запись.
      const next: PosOverrides = {
        ...cur.current.pos,
        [key]: { x: Math.max(0, at.x), y: Math.max(0, at.y) },
      };
      const cleaned = Object.keys(next).length > POS_CEILING ? prune(next, liveKeys()) : next;
      commit({ pos: cleaned });
      setPos(cleaned);
    },
    [commit, liveKeys],
  );

  // Сброс РАСКЛАДКИ, а не предпочтений: режим и ось — не расстановка нод, и «расставь заново»
  // не значит «забудь, как я смотрю на эту карточку».
  const reset = useCallback(() => {
    setPos({});
    commit({ pos: {} });
  }, [commit]);

  const setMode = useCallback(
    (next: SchematicMode) => {
      setModeState(next);
      commit({ mode: next });
    },
    [commit],
  );

  const setAxis = useCallback(
    (next: SchematicAxis) => {
      setAxisState(next);
      commit({ axis: next });
    },
    [commit],
  );

  return { pos, move, reset, mode, setMode, axis, setAxis };
}

/** Убрать позиции нод, которых в графе больше нет. Зовётся только при переполнении потолка. */
function prune(pos: PosOverrides, live: Set<string>): PosOverrides {
  const out: PosOverrides = {};
  for (const [k, v] of Object.entries(pos)) if (live.has(k)) out[k] = v;
  return out;
}
