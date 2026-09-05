import { create } from 'zustand';

import type { ProposedColourway, ProposedSlotColour } from '../colourway-proposals-model';
import { mergeFill, type Fill } from './draft-fills';

/**
 * ПАМЯТЬ ЧЕРНОВИКА — ЖУРНАЛ ЗАПОЛНЕНИЙ И ПРЕДЛОЖЕННЫЕ КОЛОРВЕИ, ПЕРЕЖИВАЮЩИЕ СМЕНУ ВКЛАДКИ.
 *
 * ⚠ ЗАЧЕМ ВООБЩЕ СТОР, А НЕ `useState` НА ОРГАНЕ. Студия смонтирована УСЛОВНО
 * (`index.tsx: activeTab === 'studio' && <StudioTab …/>`), и это не случайность — она правит
 * `callouts`. Значит любое состояние органа умирает от одного захода на COLORWAYS и обратно. Для
 * ответа модели это терпимо (его можно переспросить, и это честная цена вопроса), но не для двух
 * вещей:
 *   · ЖУРНАЛ ЗАПОЛНЕНИЙ — это единственная запись о том, ЧТО СТОЯЛО ДО. Потерять её значит
 *     потерять «если мы захотим то удалим» (B-14): значения остались бы на карточке без единого
 *     следа, откуда они взялись;
 *   · ПРЕДЛОЖЕННЫЕ КОЛОРВЕИ — это то, ради чего человек как раз и ходит на COLORWAYS: посмотреть,
 *     какие цвета уже есть, и вернуться. Предложение, умирающее от этого похода, заставляет
 *     платить за прогон второй раз.
 *
 * КЛЮЧ — `techCardId`. Модульный стор переживает и размонтирование, и переход на другую карточку;
 * без ключа журнал одной карточки подсвечивал бы поля другой.
 *
 * ЧЕГО ЗДЕСЬ НЕТ: сохранения между перезагрузками. Журнал — СЕССИОННЫЙ. После F5 подсветка гаснет,
 * а значения остаются — и это правда: они уже на карточке, сохранённые как набранные руками.
 */

type CardMemory = {
  fills: Fill[];
  proposals: ProposedColourway[];
  /** Вердикт по предложению колорвея: подтверждён (с id продукта) или отклонён. */
  verdicts: Record<string, ColourwayVerdict>;
};

export type ColourwayVerdict =
  | { status: 'dismissed' }
  | {
      status: 'confirmed';
      colorwayId: number;
      /** Рецепт не сохранился, а колорвей создан: половина, о которой обязаны сказать словами. */
      recipeFailed?: string;
    };

const EMPTY: CardMemory = { fills: [], proposals: [], verdicts: {} };

type Store = {
  byCard: Record<number, CardMemory>;
  record: (card: number, fill: Fill) => void;
  forget: (card: number, id: string) => void;
  forgetMany: (card: number, ids: string[]) => void;
  setProposals: (card: number, list: ProposedColourway[]) => void;
  patchProposal: (card: number, id: string, patch: Partial<ProposedColourway>) => void;
  patchSlot: (card: number, id: string, slot: number, patch: Partial<ProposedSlotColour>) => void;
  setVerdict: (card: number, id: string, verdict: ColourwayVerdict) => void;
};

function edit(state: Store, card: number, fn: (m: CardMemory) => CardMemory): Partial<Store> {
  const cur = state.byCard[card] ?? EMPTY;
  return { byCard: { ...state.byCard, [card]: fn(cur) } };
}

export const useDraftMemory = create<Store>((set) => ({
  byCard: {},

  /**
   * ЗАПИСЬ В ЖУРНАЛ. Адрес уже занят — сливаем: `after` новый, `before` от ПЕРВОЙ записи, чтобы
   * у человека была одна отмена «как было до черновика», а не лестница черновиков (см.
   * `mergeFill`).
   */
  record: (card, fill) =>
    set((s) =>
      edit(s, card, (m) => {
        const prev = m.fills.find((f) => f.id === fill.id);
        const merged = mergeFill(prev, fill);
        return { ...m, fills: [merged, ...m.fills.filter((f) => f.id !== fill.id)] };
      }),
    ),

  forget: (card, id) =>
    set((s) => edit(s, card, (m) => ({ ...m, fills: m.fills.filter((f) => f.id !== id) }))),

  forgetMany: (card, ids) =>
    set((s) =>
      edit(s, card, (m) => {
        const drop = new Set(ids);
        return { ...m, fills: m.fills.filter((f) => !drop.has(f.id)) };
      }),
    ),

  /**
   * НОВЫЙ ОТВЕТ ЗАМЕНЯЕТ ПРЕДЛОЖЕНИЯ, НО НЕ КВИТАНЦИИ ПОДТВЕРЖДЁННЫХ.
   *
   * Предложение — это предложение, и второй прогон вправе предложить другое. А квитанция
   * `confirmed` называет НАСТОЯЩИЙ ПРОДУКТ, уже созданный на сервере: стереть её значило бы
   * предложить создать его второй раз. Отклонённые уходят вместе со своим предложением — отказ
   * был отказом ЭТОМУ предложению, а не цвету навсегда.
   */
  setProposals: (card, list) =>
    set((s) =>
      edit(s, card, (m) => {
        const kept: Record<string, ColourwayVerdict> = {};
        for (const [id, v] of Object.entries(m.verdicts)) if (v.status === 'confirmed') kept[id] = v;
        return { ...m, proposals: list, verdicts: kept };
      }),
    ),

  patchProposal: (card, id, patch) =>
    set((s) =>
      edit(s, card, (m) => ({
        ...m,
        proposals: m.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })),
    ),

  patchSlot: (card, id, slot, patch) =>
    set((s) =>
      edit(s, card, (m) => ({
        ...m,
        proposals: m.proposals.map((p) =>
          p.id === id
            ? { ...p, slots: p.slots.map((x, i) => (i === slot ? { ...x, ...patch } : x)) }
            : p,
        ),
      })),
    ),

  setVerdict: (card, id, verdict) =>
    set((s) => edit(s, card, (m) => ({ ...m, verdicts: { ...m.verdicts, [id]: verdict } }))),
}));

/** Память ЭТОЙ карточки. Одна и та же пустая ссылка для незнакомой — иначе бесконечный ререндер. */
export function useCardMemory(techCardId: number): CardMemory {
  return useDraftMemory((s) => s.byCard[techCardId] ?? EMPTY);
}
