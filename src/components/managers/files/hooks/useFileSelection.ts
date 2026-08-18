import { useCallback, useState } from 'react';
import type { LibraryFile } from 'api/proto-http/admin';

/**
 * Набор выделенных файлов.
 *
 * Хранятся ЦЕЛИКОМ объекты, а не одни id: групповые действия называют файлы по именам
 * («эти три держат задачи») и качают их по `download_url`, а перечитывать выдачу ради
 * имени того, что человек только что выбрал глазами, — лишний повод для расхождения.
 *
 * Образец — `media/utils/useSelectMedia.ts`; здесь та же механика, без внешнего владельца
 * набора (у файлов нет второго места, где выбранное показывают одновременно).
 */
export function useFileSelection() {
  const [selected, setSelected] = useState<LibraryFile[]>([]);

  const isSelected = useCallback(
    (id: number) => selected.some((f) => Number(f.id) === id),
    [selected],
  );

  const toggle = useCallback((file: LibraryFile) => {
    const id = Number(file.id);
    setSelected((prev) =>
      prev.some((f) => Number(f.id) === id)
        ? prev.filter((f) => Number(f.id) !== id)
        : [...prev, file],
    );
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  /** Убрать из набора то, чего больше нет (удалили — своей рукой или чужой). */
  const drop = useCallback((ids: number[]) => {
    const gone = new Set(ids);
    setSelected((prev) => prev.filter((f) => !gone.has(Number(f.id))));
  }, []);

  /**
   * Оставить в наборе только то, что отвечает условию, — не сбрасывая остальное на ноль.
   *
   * Нужно ровно там, где следующий экран УЖЕ, но не другой: выбор, набранный в разделе проекта,
   * переживает переход в плоскую сетку этого же раздела, а файлы, которых там не будет, уходят
   * сами. Полное `clear` в этом месте стирало бы работу, а полное сохранение — обещало бы
   * действие над тем, чего на экране нет.
   */
  const keep = useCallback((fits: (file: LibraryFile) => boolean) => {
    setSelected((prev) => prev.filter(fits));
  }, []);

  return { selected, isSelected, toggle, clear, drop, keep };
}
