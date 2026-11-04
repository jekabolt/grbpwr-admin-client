import { create } from 'zustand';
import type { TaskFileContent } from '../../api/tasksService';

export type SheetConflict = { by: string; at: string };

/**
 * ПРАВКА ТАБЛИЦЫ ЖИВЁТ НЕ В КОМПОНЕНТЕ. Таблицу в описании и полный экран показывают один и тот же
 * файл, и правка у них одна: два токена одного файла и «open» из описания видят один черновик.
 * Уход со страницы или открытая правка описания компонент снимают, а черновик остаётся.
 *
 * `data` закрепляет чтение, с которого правка началась: фоновое перечитывание черновик не трогает.
 */
export type SheetSession = {
  editing: boolean;
  data: TaskFileContent | null;
  /** Индекс листа → адрес → набранное. */
  drafts: Record<number, Record<string, string>>;
  sheet: number;
  sel: string | null;
  active: string | null;
  /** Какая из таблиц этого файла держит поле ввода. */
  host: string | null;
  conflict: SheetConflict | null;
  closing: boolean;
  saving: boolean;
  error: string | null;
};

export const NO_SESSION: SheetSession = {
  editing: false,
  data: null,
  drafts: {},
  sheet: 0,
  sel: null,
  active: null,
  host: null,
  conflict: null,
  closing: false,
  saving: false,
  error: null,
};

type Store = {
  sessions: Record<string, SheetSession>;
  patch: (key: string, patch: Partial<SheetSession>) => void;
};

export const useSheetSessions = create<Store>((set) => ({
  sessions: {},
  patch: (key, patch) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [key]: { ...(state.sessions[key] ?? NO_SESSION), ...patch },
      },
    })),
}));

export const sheetSessionKey = (taskId: number, fileId: number) => `${taskId}:${fileId}`;

export function draftCount(drafts: SheetSession['drafts']): number {
  return Object.values(drafts).reduce((sum, sheet) => sum + Object.keys(sheet).length, 0);
}
