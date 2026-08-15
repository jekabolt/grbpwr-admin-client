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

export type SchematicMode = 'list' | 'schematic';

type Stored = {
  v: 1;
  mode?: SchematicMode;
  pos: PosOverrides;
};

const keyOf = (cardId: number) => `plm.techcard.schematic.${cardId}`;

/** Потолок ключей: выше него запись чистит позиции нод, которых в графе уже нет. */
const POS_CEILING = 200;

/** Дебаунс записи — драг генерирует поток коммитов, а localStorage синхронный. */
const WRITE_DELAY_MS = 400;

function read(cardId: number | undefined): Stored {
  if (cardId === undefined) return { v: 1, pos: {} };
  try {
    const raw = localStorage.getItem(keyOf(cardId));
    if (!raw) return { v: 1, pos: {} };
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
    return { v: 1, mode, pos };
  } catch {
    return { v: 1, pos: {} };
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

  // Карточка сменилась под тем же компонентом (переход между тех-картами) — перечитать.
  const loadedFor = useRef(cardId);
  useEffect(() => {
    if (loadedFor.current === cardId) return;
    loadedFor.current = cardId;
    const s = read(cardId);
    setPos(s.pos);
    setModeState(s.mode ?? null);
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

  const move = useCallback(
    (key: string, at: { x: number; y: number }) => {
      setPos((cur) => {
        const next: PosOverrides = { ...cur, [key]: { x: Math.max(0, at.x), y: Math.max(0, at.y) } };
        const cleaned = Object.keys(next).length > POS_CEILING ? prune(next, liveKeys()) : next;
        schedule({ v: 1, mode: mode ?? undefined, pos: cleaned });
        return cleaned;
      });
    },
    [liveKeys, mode, schedule],
  );

  const reset = useCallback(() => {
    setPos({});
    schedule({ v: 1, mode: mode ?? undefined, pos: {} });
  }, [mode, schedule]);

  const setMode = useCallback(
    (next: SchematicMode) => {
      setModeState(next);
      schedule({ v: 1, mode: next, pos });
    },
    [pos, schedule],
  );

  return { pos, move, reset, mode, setMode };
}

/** Убрать позиции нод, которых в графе больше нет. Зовётся только при переполнении потолка. */
function prune(pos: PosOverrides, live: Set<string>): PosOverrides {
  const out: PosOverrides = {};
  for (const [k, v] of Object.entries(pos)) if (live.has(k)) out[k] = v;
  return out;
}
