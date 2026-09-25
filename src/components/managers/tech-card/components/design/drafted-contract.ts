import { createContext, useContext } from 'react';

/**
 * ═══ «DRAFTED» — КАК ОРГАНЫ УЗНАЮТ, ЧТО ЗНАЧЕНИЕ НАПИСАЛ ЧЕРНОВИК, А ЧЕЛОВЕК ЕГО ЕЩЁ НЕ СМОТРЕЛ ═══
 *
 * Волна 2026-09-25 (D-07', ревью Codex B-09). Источник истины — журнал черновика конструкции
 * (`head/use-draft-fills.ts`, before/after каждой записи) с флагом `accepted` и персистом в
 * localStorage; ЭТОТ файл — только интерфейс, чтобы бенч (FLAT SLOTS), GENERAL INFORMATION,
 * CONSTRUCTION и MATERIAL SLOTS читали ОДНО состояние, а не каждый своё.
 *
 * Провайдер — `studio-tab.tsx` (обёртка над всеми шагами студии). Умолчание NONE — «ничего не
 * помечено» — для стендов и экранов без студии.
 *
 * СЕМАНТИКА ACCEPT = «просмотрено». Значения уже сохранены автосейвом; accept лишь снимает
 * подсветку. Отказаться — `undo all` в блоке черновика или обычная правка поля.
 */
export type DraftedKey = string;

/** Ключи — те же, что у журнала черновика. Печатаются здесь, чтобы не разъехаться по органам. */
export const draftedKey = {
  concept: 'concept' as DraftedKey,
  fit: 'fit' as DraftedKey,
  /** Аспект конструкции (`details[]` по ключу): silhouette, fabric, collar, … */
  detail: (key: string): DraftedKey => `details.${key}`,
  /** Строка BOM по lineKey. */
  bom: (lineKey: string): DraftedKey => `bom.${lineKey}`,
};

export type DraftedPresentation = {
  /** Сколько записей черновика ещё не просмотрены (для кнопки `accept all N ▸`). */
  count: number;
  /**
   * Подсвечивать ли поле. `current` — текущее значение поля: если оно уже не равно записанному
   * черновиком, человек его правил — подсветка снимается сама, без клика.
   */
  isLive: (key: DraftedKey, current?: string | null) => boolean;
  /** Слот бенча, созданный черновиком и ещё не принятый (по server id слота). */
  slotProposed: (slotId: number) => boolean;
  /** Снять подсветку с одного поля (onBlur после правки, клик по слоту). */
  acceptKey: (key: DraftedKey) => void;
  /** Снять подсветку со слота. */
  acceptSlot: (slotId: number) => void;
  /** Кнопка блока черновика. */
  acceptAll: () => void;
};

export const DRAFTED_NONE: DraftedPresentation = {
  count: 0,
  isLive: () => false,
  slotProposed: () => false,
  acceptKey: () => {},
  acceptSlot: () => {},
  acceptAll: () => {},
};

export const DraftedContext = createContext<DraftedPresentation>(DRAFTED_NONE);

export function useDrafted(): DraftedPresentation {
  return useContext(DraftedContext);
}
