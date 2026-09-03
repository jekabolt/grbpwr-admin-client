import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { create } from 'zustand';

import { displayDetailName, readBench } from './bench-slot';
import { viewLabel } from './views';

/**
 * ═══ ЧТО ИЗ ФЛЕТ-СЛОТОВ ЕДЕТ К МОДЕЛИ — ОДНО СОСТОЯНИЕ НА ДВА ОРГАНА (J-10) ═══════════════════
 *
 * Владелец: «WHAT THE MODEL IS SHOWN должно быть в INPUT — REFERENCES и переключатель и сами
 * картинки должны быть в тамбнейлах с разметкой но с серой пеленой поверх типо инэктив и дожны
 * убираться по кнопке так же они всегда добавляются в конец промпта».
 *
 * ПОЧЕМУ ВООБЩЕ ХРАНИЛИЩЕ, А НЕ `useState` В ФОРМЕ. Переключатель переехал из GENERATION в
 * INPUT — REFERENCES, а нажимает GENERATE по-прежнему форма. Это два РАЗНЫХ поддерева React,
 * общего предка у них нет ближе `StudioTab`, и протаскивать пару «значение + сеттер» через всю
 * эту высоту значило бы дописать проп каждому промежуточному органу — то есть заставить пять
 * файлов знать о вопросе, который их не касается.
 *
 * ⚠ ХРАНИЛИЩЕ ПОМНИТ, ЧЬЁ ЭТО СОСТОЯНИЕ, И БЕЗ ЭТОГО ОНО БЫЛО БЫ ДЕФЕКТОМ. Модуль живёт весь
 * сеанс, а карточку в этой вкладке переключают не размонтируя (`studio-tab.tsx`). Без имени
 * карточки исключения, набранные на карточке 38, молча уехали бы в оплаченный прогон карточки 41,
 * и увидеть это на экране было бы нечем: слоты там ДРУГИЕ, их id не совпадут ни с одним
 * исключением, и полоса просто показала бы «едут все» при включённом чипе — правдоподобно и
 * неверно. Поэтому у состояния есть владелец, а чтение с чужой карточки отдаёт УМОЛЧАНИЕ.
 *
 * СБРОС БЕЗ ЭФФЕКТА, И ЭТО НАМЕРЕННО. Чистка по `useEffect` на смену карточки — это лишний
 * рендер, в течение которого организм уже нарисован с чужими данными. Здесь чужое состояние
 * недостижимо ПО ЧТЕНИЮ, поэтому неверного кадра не бывает вовсе.
 *
 * ИСКЛЮЧЕНИЕ — УТВЕРЖДЕНИЕ О СЛОТЕ, А НЕ О ПЕРЕКЛЮЧАТЕЛЕ, поэтому оно переживает выключение чипа:
 * выключил, включил обратно — «не слать левый бок» на месте. Иначе человеку пришлось бы набирать
 * свой отказ заново после каждого взгляда на «а что если без плит вообще».
 *
 * ⚠ ИД СЛОТА, А НЕ ИД МЕДИА. Человек исключает МЕСТО на верстаке («не левый бок»), а плита на нём
 * может смениться между кликом и GENERATE. Это же написано на `DesignRunParams.flat_slot_ids`, и
 * расходиться с проводом здесь нельзя: список уезжает на сервер как есть.
 */
export type FlatSlotsSend = {
  /** Едут ли плиты вообще — прежний `use_flat_slots`. Умолчание НЕТ, см. `generation-form`. */
  on: boolean;
  /** Слоты, снятые поимённо. Пусто = едут все заполненные (это же значение и у провода). */
  excluded: readonly number[];
};

const OFF: FlatSlotsSend = { on: false, excluded: [] };

type Store = FlatSlotsSend & {
  cardId: number;
  setOn: (cardId: number, on: boolean) => void;
  exclude: (cardId: number, slotId: number) => void;
  restore: (cardId: number, slotId: number) => void;
};

const useStore = create<Store>((set) => ({
  cardId: 0,
  ...OFF,
  /** Смена карточки на записи — тот же сброс: чужие исключения не переезжают на новый вопрос. */
  setOn: (cardId, on) =>
    set((s) => (s.cardId === cardId ? { on } : { cardId, on, excluded: [] })),
  exclude: (cardId, slotId) =>
    set((s) =>
      s.cardId === cardId
        ? { excluded: s.excluded.includes(slotId) ? s.excluded : [...s.excluded, slotId] }
        : { cardId, on: s.on, excluded: [slotId] },
    ),
  restore: (cardId, slotId) =>
    set((s) =>
      s.cardId === cardId
        ? { excluded: s.excluded.filter((id) => id !== slotId) }
        : { cardId, on: s.on, excluded: [] },
    ),
}));

/**
 * Состояние ЭТОЙ карточки. Чужое читается как выключенное — см. шапку.
 *
 * Читается и формой (на submit), и блоком референсов (на отрисовку), поэтому ответ обязан быть
 * один и тот же объект-значение, а не два вывода из одних данных.
 */
export function useFlatSlotsSend(techCardId: number): FlatSlotsSend {
  const cardId = useStore((s) => s.cardId);
  const on = useStore((s) => s.on);
  const excluded = useStore((s) => s.excluded);
  return cardId === techCardId ? { on, excluded } : OFF;
}

/** Двери. Каждая берёт карточку явно — писатель обязан назвать, о чьём состоянии говорит. */
export function useFlatSlotsSendWrites() {
  const setOn = useStore((s) => s.setOn);
  const exclude = useStore((s) => s.exclude);
  const restore = useStore((s) => s.restore);
  return { setOn, exclude, restore };
}

/**
 * КАКИЕ СЛОТЫ РЕАЛЬНО УЕДУТ — один вывод для подписи, для номеров в промпте и для провода.
 *
 * ⚠ ТРИ ЧИТАТЕЛЯ, ОДИН ОТВЕТ, И ЭТО УСЛОВИЕ ЗАДАЧИ, А НЕ ОПРЯТНОСТЬ. Полоса печатает номера,
 * форма шлёт `flat_slot_ids`, а деньги списываются по тому, что доехало. Два независимых вывода
 * из `on`/`excluded` разошлись бы молча, и разошлись бы именно на исключении — то есть ровно там,
 * где человек ждёт, что его отказ услышан.
 *
 * ПУСТОЙ ОТВЕТ ПРИ ВЫКЛЮЧЕННОМ ЧИПЕ, а не «все»: провод читает пустой список как «все
 * заполненные», поэтому вызывающий обязан слать его ТОЛЬКО вместе с `use_flat_slots = false`.
 * Форма так и делает; здесь это сказано, чтобы следующий читатель не отправил пустоту при
 * включённом чипе, думая, что гасит плиты.
 */
export function sentFlatSlotIds(state: FlatSlotsSend, filledSlotIds: readonly number[]): number[] {
  if (!state.on) return [];
  return filledSlotIds.filter((id) => id > 0 && !state.excluded.includes(id));
}

/** Одна заполненная плита верстака — ровно то, что нужно и полосе, и подписи, и проводу. */
export type FilledFlatSlot = {
  /** `design_bench_slot.id`. У стороны он есть ровно потому, что слот уже записан. */
  slotId: number;
  /** `front` / `collar` — слово человека, не ключ. */
  label: string;
  /** Медиа плиты: им плита совпадает с референсом, если человек положил одну картинку дважды. */
  mediaId: number;
};

/**
 * ═══ ЗАПОЛНЕННЫЕ ФЛЕТ-СЛОТЫ — ОДИН ЧИТАТЕЛЬ НА ВСЕХ ═══════════════════════════════════════════
 *
 * ⚠ ПРЕДИКАТ — «В СЛОТЕ ЛЕЖИТ КАРТИНКА», И ЭТО КЛИЕНТСКАЯ ОРФОГРАФИЯ СЕРВЕРНОГО (J-5). Сервер,
 * получив `use_flat_slots`, прикладывает КАЖДЫЙ слот, у которого `Picture.MediaId > 0`; слои
 * правки ему безразличны. Прежняя редакция гейтила чип на `markedPlatesOf` — плиты С ЖИВЫМ СЛОЕМ
 * ПРАВКИ, — и это два разных множества, расходящиеся в обе стороны: при трёх заполненных слотах
 * без слоёв чип был выключен, а строка отрицала сами слоты (жалоба владельца дословно); при слое
 * на одной из трёх строка обещала «едет 1», а платили за три. Здесь предикат один и он серверный.
 *
 * ⚠ ТОЛЬКО ФЛЕТ. У флэтового верстака колорвея нет по существу (L-4), поэтому `readBench` зовётся
 * без него; слоты рендера и 3D — содержание СВОИХ видов прогона, а не опция этого.
 */
export function filledFlatSlots(band: GetDesignBandResponse): FilledFlatSlot[] {
  const bench = readBench(band, 'flat');
  const out: FilledFlatSlot[] = [];
  for (const { view, slot } of bench.sides) {
    if (!slot?.picture || (slot.pictureId ?? 0) <= 0) continue;
    out.push({
      slotId: slot.id ?? 0,
      label: viewLabel(view),
      mediaId: slot.picture.media?.id ?? 0,
    });
  }
  for (const slot of bench.details) {
    if (!slot.picture || (slot.pictureId ?? 0) <= 0) continue;
    out.push({
      slotId: slot.id ?? 0,
      label: displayDetailName(bench.details, slot),
      mediaId: slot.picture.media?.id ?? 0,
    });
  }
  return out;
}
