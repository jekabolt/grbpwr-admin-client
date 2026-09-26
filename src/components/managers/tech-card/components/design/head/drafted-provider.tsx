import { useMemo, useRef, type JSX, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { TechCardFormData } from '../../schema';
import { readBench } from '../bench-slot';
import {
  DraftedContext,
  useDrafted,
  type DraftedKey,
  type DraftedPresentation,
} from '../drafted-contract';
import { useDesignBand } from '../use-design-band';
import { normText, type FormSnapshot } from './construction-draft-model';
import {
  acceptPlan,
  draftedFills,
  fillIdOfDraftedKey,
  fillIdOfSlot,
  type Fill,
} from './draft-fills';
import { useCardMemory, useDraftMemory } from './use-draft-fills';

/**
 * ═══ «DRAFTED» — ОДНО СОСТОЯНИЕ НА ВСЮ СТУДИЮ, И ЭТО ЖУРНАЛ ЧЕРНОВИКА (волна 25.09, D-07') ══════
 *
 * Контракт — `../drafted-contract.ts`: органы (GENERAL INFORMATION, CONSTRUCTION, MATERIAL SLOTS,
 * бенч FLAT SLOTS) спрашивают «подсвечивать ли это поле» и «предложен ли этот слот». Здесь — его
 * ЕДИНСТВЕННАЯ реализация, и она не заводит ни одного своего хранилища: ответ считается из журнала
 * заполнений (`use-draft-fills.ts`: before/after каждой записи, флаг `accepted`, localStorage) против
 * ЖИВОЙ формы и живого верстака. Ревью Codex B-09 запретило второй стор ровно потому, что пометка
 * без `before` ломает `undo all`, а слот по имени — не личность слота.
 *
 * ПРАВИЛО ОДНО: поле подсвечено ⇔ запись журнала ЖИВАЯ (в поле стоит то, что написал черновик;
 * строка BOM ещё на карточке; слот ещё на верстаке) И НЕ ПРИНЯТА. Правка поля гасит рамку сама —
 * значение разошлось с `after`, запись перестала быть живой, — без единого события.
 *
 * ПРОВАЙДЕР ОДИН И СТОИТ У КОМПОЗИТОРА (`studio-tab.tsx`) над ВСЕМИ шагами: пометка слота рисуется
 * на шаге FLAT, пометка поля — на MOODBOARD, а журнал у них общий.
 *
 * ⚠ ЗНАЧЕНИЕ КОНТЕКСТА МЕНЯЕТСЯ ТОЛЬКО ВМЕСТЕ С НАБОРОМ ПОДСВЕЧЕННОГО. Провайдер подписан на
 * текст описания и аспектов (иначе не узнал бы, что правка погасила рамку), но отдавать новый
 * объект на каждое нажатие клавиши значило бы перерисовывать каждый потребитель — поля, строки
 * слотов, плитки бенча — на каждый символ. Поэтому значение мемоизируется по ПОДПИСИ набора
 * (`id:after` подсвеченных), а функции читают свежий журнал через ref.
 */
export function DraftedProvider({
  techCardId,
  children,
}: {
  techCardId?: number;
  children: ReactNode;
}): JSX.Element {
  const card = techCardId && techCardId > 0 ? techCardId : 0;
  const { fills } = useCardMemory(card);
  const { control, getValues } = useFormContext<TechCardFormData>();

  const fit = (useWatch({ control, name: 'fit' }) ?? '') as string;
  const concept = (useWatch({ control, name: 'concept' }) ?? '') as string;
  const details = (useWatch({ control, name: 'details' }) ?? []) as FormSnapshot['details'];
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as FormSnapshot['bomItems'];

  // Верстак — та же запись react-query, что читают композитор и черновик: второго запроса нет.
  // Не прочитан (нет полосы, сервер её не отдаёт) — `undefined`, то есть «не знаем», и слоты
  // журнала остаются живыми (`isLive` в `draft-fills.ts`).
  const { band, serverSpeaks } = useDesignBand(card || undefined);
  const detailSlots = useMemo(
    () =>
      serverSpeaks
        ? readBench(band, 'flat').details.map((s) => ({
            id: s.id ?? 0,
            name: (s.detailName ?? '').trim(),
            // Заполненный слот пометки не несёт (бенч её прячет) — и в счёт `accept all` не идёт.
            filled: (s.pictureId ?? 0) > 0,
          }))
        : undefined,
    [band, serverSpeaks],
  );

  const snapshot: FormSnapshot = useMemo(
    () => ({ fit, concept, details, bomItems, detailSlots }),
    [fit, concept, details, bomItems, detailSlots],
  );

  const drafted = useMemo(() => draftedFills(fills, snapshot), [fills, snapshot]);
  const signature = drafted.map((f) => `${f.id}\u0000${f.after}`).join('\u0001');

  const latest = useRef<{ byId: Map<string, Fill>; detailSlots: FormSnapshot['detailSlots'] }>({
    byId: new Map(),
    detailSlots: undefined,
  });
  latest.current = { byId: new Map(drafted.map((f) => [f.id, f])), detailSlots };

  const value: DraftedPresentation = useMemo(() => {
    /** Живые значения формы В МОМЕНТ ЖЕСТА — `getValues`, не снимок рендера. */
    const liveSnapshot = (): FormSnapshot => ({
      fit: (getValues('fit') ?? '') as string,
      concept: (getValues('concept') ?? '') as string,
      details: (getValues('details') ?? []) as FormSnapshot['details'],
      bomItems: (getValues('bomItems') ?? []) as FormSnapshot['bomItems'],
      detailSlots: latest.current.detailSlots,
    });
    const journal = () => useDraftMemory.getState().byCard[card]?.fills ?? [];
    const settle = (ids: ReadonlySet<string>) => {
      if (!card) return;
      const plan = acceptPlan(journal(), ids, liveSnapshot());
      const store = useDraftMemory.getState();
      if (plan.accept.length) store.accept(card, plan.accept);
      if (plan.drop.length) store.forgetMany(card, plan.drop);
    };
    return {
      count: latest.current.byId.size,
      isLive: (key: DraftedKey, current?: string | null) => {
        const f = latest.current.byId.get(fillIdOfDraftedKey(key));
        if (!f) return false;
        if (current === undefined) return true;
        return normText(current) === normText(f.after);
      },
      slotProposed: (slotId: number) => latest.current.byId.has(fillIdOfSlot(slotId)),
      acceptKey: (key: DraftedKey) => settle(new Set([fillIdOfDraftedKey(key)])),
      acceptSlot: (slotId: number) => settle(new Set([fillIdOfSlot(slotId)])),
      // РОВНО ТО, ЧТО СОСЧИТАНО И ПОДСВЕЧЕНО: `accept all N ▸` принимает N записей, и ни одной
      // больше. Прочий журнал (правленные человеком записи, слот, которого полоса ещё не вернула)
      // кнопка не трогает — число на ней и её действие не расходятся (ревью Codex, P1).
      acceptAll: () => settle(new Set(latest.current.byId.keys())),
    };
    // `signature` — вся правда о подсвеченном; `card` — чей журнал. Остальное читается через ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, card, getValues]);

  return <DraftedContext.Provider value={value}>{children}</DraftedContext.Provider>;
}

/**
 * ═══ ПРАВКА ПОЛЯ = ПРОСМОТР: `onBlur` ОТРЕДАКТИРОВАННОГО ПОЛЯ ПРИНИМАЕТ ЕГО ЗАПИСЬ ═══════════════
 *
 * Рамка гаснет сама, как только значение разошлось с написанным черновиком (`isLive`). Но стоит
 * человеку вернуть ровно тот же текст — и рамка вернулась бы: поле, которое он только что правил,
 * снова «не просмотрено». Поэтому уход из поля ПОСЛЕ правки ставит запись принятой (а не живую —
 * выбрасывает из журнала: это уже слова человека, и localStorage не копит мусор).
 *
 * «После правки» — значение на уходе отличается от значения на входе. Фокус и уход без правки
 * ничего не принимают: взгляд на поле ещё не просмотр, для этого есть `accept all N ▸`.
 */
export function useAcceptOnEdit(
  key: DraftedKey,
  value: string | null | undefined,
): { onFocus: () => void; onBlur: () => void } {
  const { acceptKey } = useDrafted();
  const at = useRef<string | null>(null);
  const now = value ?? '';
  return {
    onFocus: () => {
      at.current = now;
    },
    onBlur: () => {
      const was = at.current;
      at.current = null;
      if (was !== null && was !== now) acceptKey(key);
    },
  };
}
