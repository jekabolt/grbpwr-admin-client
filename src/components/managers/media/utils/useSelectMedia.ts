import { common_MediaFull } from 'api/proto-http/admin';
import { useState } from 'react';

interface UseSelectionProps {
  allowMultiple?: boolean;
  disabled?: boolean;
  /**
   * НАБОР СНАРУЖИ. Задан — он и есть истина, а свой стейт хука не читается вовсе.
   *
   * Нужно там, где набранное показывают ДВА места сразу: сетка библиотеки и лоток в подвале
   * диалога выбора. Пока у лотка был свой список, крестик в нём снимал кадр только у себя —
   * сетка о том не знала, следующий же выбор возвращал «убранное» обратно вместе со всем
   * набором, и «поставить (4)» ставило в том числе то, что человек только что убрал.
   */
  value?: common_MediaFull[];
  onSelectionChange?: (items: common_MediaFull[]) => void;
}

export function useSelection({
  allowMultiple = true,
  disabled = false,
  value,
  onSelectionChange,
}: UseSelectionProps = {}) {
  const [internal, setInternal] = useState<common_MediaFull[]>([]);
  const selectedMedia = value ?? internal;

  // Оповещение владельца — СНАРУЖИ апдейтера. Внутри `setState(prev => ...)` он побочный эффект:
  // React волен вызвать апдейтер повторно, и владелец получил бы тот же набор дважды.
  const commit = (next: common_MediaFull[]) => {
    setInternal(next);
    onSelectionChange?.(next);
  };

  const selectMedia = (media: common_MediaFull) => {
    if (disabled) return;
    commit(allowMultiple ? [...selectedMedia, media] : [media]);
  };

  const deselectMedia = (mediaId: number) => {
    if (disabled) return;
    commit(selectedMedia.filter((item) => item.id !== mediaId));
  };

  const toggleMedia = (media: common_MediaFull) => {
    if (disabled) return;

    const isSelected = selectedMedia.some((item) => item.id === media.id);

    if (isSelected) {
      deselectMedia(media.id || 0);
    } else {
      selectMedia(media);
    }
  };

  const isSelected = (mediaId: number) => {
    return selectedMedia.some((item) => item.id === mediaId);
  };

  const clearSelection = () => commit([]);

  return {
    selectedMedia,
    selectMedia,
    toggleMedia,
    isSelected,
    clearSelection,
  };
}
