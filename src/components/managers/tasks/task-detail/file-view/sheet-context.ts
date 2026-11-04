import { createContext, type ComponentType } from 'react';
import type { LibraryFile } from 'api/proto-http/admin';

/** Что нужно таблице в описании от страницы задачи. Без него токен становится просто словом. */
export type SheetEmbeds = {
  taskId: number;
  files: LibraryFile[];
  /** Прикрепить файл к задаче той же дверью, что и остальные вложения. */
  attachFile: (fileId: number) => Promise<boolean>;
  openFull: (fileId: number) => void;
  /** Сама таблица идёт через контекст: разбор описания не должен тянуть за собой сеть. */
  Embed: ComponentType<{ fileId: number }>;
};

export const SheetEmbedsContext = createContext<SheetEmbeds | null>(null);
