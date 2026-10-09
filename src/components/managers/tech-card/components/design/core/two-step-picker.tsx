/**
 * ═══ ЧТО ОСТАЛОСЬ ОТ `TwoStepPicker` (TF6) ═══════════════════════════════════════════════════
 *
 * Сам двухшаговый пикер снят: после волны плиток (L, M) его не звал никто — `mark ▾` рендера и
 * `use for ▾` карусели стали углом-меню плитки (`CornerMenu` в `../picture-tile`) с плоским
 * списком. Остались два знания, которые читают живые органы: форма ветки и листа (`markBranches`
 * в `../render/render-tile`) и мера строки списка (`PICKER_ROW` / `PICKER_BLEED` — строки
 * `CornerMenu`).
 */

/** Лист — то, ЧТО в итоге выбирают. `note` — тихая правая приписка («replaces #31»). */
export type PickerLeaf = {
  value: string;
  label: string;
  note?: string;
  title?: string;
};

/** Ветка — то, У КОГО выбирают. `note` — тихая правая приписка («2/6»). */
export type PickerBranch = {
  id: number;
  label: string;
  note?: string;
  title?: string;
  leaves: PickerLeaf[];
};

/* Строка панели одной мерой на оба шага: 24px — та же клетка, что у пункта `ui/components/select`
   (`SelectItem`, `min-h-6 px-2.5`), и подсветка та же (`rgba(0,0,0,0.08)`). Второе написание
   всплывающего списка разошлось бы с первым на первой же правке скина.
   ⚠ `:focus`, А НЕ ТОЛЬКО `:focus-visible`: фокус сюда приводят СТРЕЛКИ, программным `focus()`, и
   браузер такой фокус законно считает не-клавиатурным — подсветки бы не было вовсе. */
const ROW =
  'flex min-h-6 w-full select-none items-center gap-2 px-2 text-left hover:bg-[rgba(0,0,0,0.08)] focus:bg-[rgba(0,0,0,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-textColor';
/* Полем панели строка не ограничена: подсветка обязана доходить до кромки, иначе она читается
   плашкой внутри списка, а не выбранной строкой списка. Отбивку панели снимает обёртка. */
const BLEED = '-mx-2 -my-1.5';
/* Та же строка и та же кромка у меню в углу плитки (`PictureTile` → `menu`): один список, не два. */
export { ROW as PICKER_ROW, BLEED as PICKER_BLEED };
