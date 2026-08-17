import type { ReactNode } from 'react';
import {
  AnnotationCanvas as UiAnnotationCanvas,
  type AnnotationValue,
} from 'ui/components/annotation/canvas';
import { ALL_KIND_KEYS, kindDef } from 'ui/components/annotation/kinds';

import type { AnnotationForm } from './schema';

// СНИМОК ШАГА СБОРКИ — ТОНКАЯ ОБЁРТКА над общим холстом указаний.
//
// Сам холст переехал в `ui/components/annotation/canvas`: указания рисуют теперь и на вложениях
// задачи, а импортировать адаптер из `managers/tech-card` в `managers/tasks` значило бы связать два
// домена через голову общего слоя. Здесь остаётся ровно доменное: тип значения (`AnnotationForm` —
// то же самое, но с сужёнными zod-энумами вида и цвета) и пикер деталей кроя, которого у задачи
// нет и быть не может.

/** Подписи и подсказки видов — из общего реестра, а не своим словарём. */
export const KIND_LABEL: Record<string, string> = Object.fromEntries(
  ALL_KIND_KEYS.map((k) => [k, kindDef(k).label]),
);
export const KIND_HINT: Record<string, string> = Object.fromEntries(
  ALL_KIND_KEYS.map((k) => [k, kindDef(k).hint]),
);

export function AnnotationCanvas({
  annotations,
  onChange,
  ...rest
}: {
  src: string;
  alt?: string;
  maxHeightClass?: string;
  heightPx?: number;
  annotations: AnnotationForm[];
  /** Отсутствует = холст только читается. Печать и архив зовут его именно так. */
  onChange?: (next: AnnotationForm[]) => void;
  frozen?: boolean;
  className?: string;
  placingKind?: string | null;
  onPlaced?: () => void;
  cornerSlot?: ReactNode;
  zoomable?: boolean;
  renderPiecePicker?: (opts: {
    selected: string[];
    onPick: (lineKey: string) => void;
  }) => ReactNode;
  pieceLabel?: (lineKey: string) => string | undefined;
  onPlacedCountChange?: (n: number) => void;
}) {
  return (
    <UiAnnotationCanvas
      {...rest}
      annotations={annotations}
      // ВИД И ЦВЕТ СУЖАЮТСЯ ЗДЕСЬ, И ЭТО ЕДИНСТВЕННОЕ МЕСТО, ГДЕ ЭТО ЗНАНИЕ ЕСТЬ. Холст работает
      // со строками: он обязан пережить незнакомый ключ с провода (реестр разрешит его в пин), а
      // форма карточки сужена zod'ом до закрытых списков. Ключи при этом приходят из ТОГО ЖЕ
      // реестра, которым zod типизирован, — расшириться за него они не могут.
      onChange={
        onChange ? (next: AnnotationValue[]) => onChange(next as AnnotationForm[]) : undefined
      }
    />
  );
}
