import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { useMemo, useState, type ReactNode } from 'react';

import {
  COLORWAY_NONE,
  colorwayOf,
  pictureBenchKind,
  refColorwayFor,
  type Representation,
} from '../bench-kinds';
import { displayDetailName, readBench } from '../bench-slot';
import { NewDetailModal } from '../modals';
import { useDesignWrites } from '../use-design-band';
import { isDetailView, normaliseViewKey, sidesLeadingWith, viewLabel } from '../views';

/**
 * THE SLOT MENU ON A TILE — «this picture goes into that slot», said from the picture's side.
 *
 * ═══ T13: IT IS A CORNER OF THE TILE NOW, NOT A `Select` UNDER IT ═════════════════════════════
 * Владелец: «в FLAT LATEST GENERATION кнопки unmark или селектор должны быть внутри плитки по
 * принципу как это сделано в flat slots». So this file no longer draws anything: it answers the
 * LIST and the WRITE (`useSlotMenu`), and `RunTile` hands them to `PictureTile.menu` — the quiet
 * `slot ▾` corner of the anatomy (20-TILE-SPEC §3). The menu holds no value, so the sentinel
 * placeholder and its phantom-write guard below are gone with the `Select` they protected.
 *
 * IT IS NOT A SECOND MECHANISM, AND THE DISTINCTION IS WORTH STATING because the band already has
 * `pick-mode.tsx`. That one runs the OTHER DIRECTION: the bench arms a slot and the feed answers by
 * becoming clickable — the gesture starts at the empty slot and ends on a picture. This one starts
 * at the picture and ends on a slot, which is the gesture the prototype puts on every unmarked tile
 * (`slotPickerHtml`) and the only one available while looking at a run's output.
 *
 * BOTH WRITE THE SAME THING THROUGH THE SAME SEAM — `SetDesignBenchSlot` via `useDesignWrites` —
 * so there is one write path, one CAS token and one invalidation. Two affordances over one verb is
 * a choice; two verbs over one relation would have been the defect.
 *
 * WHICH BENCH IT ADDRESSES: THE PICTURE'S OWN (L-1). Here stood «`kind` is left empty rather than
 * spelled, because this organ has no way to know a second bench is on screen» — a rationale that
 * outlived its cause. Both benches are live, and the picture CARRIES its bench in its own `kind`:
 * a flat addresses the flat bench, a fabric render addresses the render bench, and neither is ever
 * offered the other's slots — «во флеты не должны попадать фабрик рендеры и наоборот». A kind with
 * no bench of its own (a 3D frame, a repeating tile, anything newer) gets the REASON in this spot,
 * not a picker that would file it as a flat: silently offering the flat bench to every kind is
 * exactly the defect this comment replaces.
 */

const NEW_DETAIL = '__new_detail';

/**
 * WHY THIS PICTURE HAS NO SLOT MENU, in words — the tile's `title`, never a dead control.
 * The vocabulary is open on the wire, so an unknown kind is echoed verbatim (the `views.ts` rule):
 * inventing a bench for it is what the server would refuse as `wrong_kind`.
 */
function noBenchReason(picture: common_DesignPicture): string {
  const kind = (picture.kind ?? '').trim().toLowerCase();
  if (kind === 'threed') return 'a 3D frame stands in no slot — «chosen» is its mark';
  if (kind === 'pattern') return 'a repeating tile stands in no slot — it is cloth, not a view';
  return `no bench takes kind «${kind}»`;
}

/**
 * ═══ ПЕРЕКРАС В СЛОТ НЕ СТАВИТСЯ ВОВСЕ (E-12) ════════════════════════════════════════════════
 *
 * Владелец, дословно: «в GENERATION HISTORY в ON MODEL в REPRESENTATION ON MODEL не должно быть
 * возможности это маркнуть в слот какой-то».
 *
 * ⚠ ЭТО ПОЧИНКА, А НЕ ЗАПРЕТ ПО ВКУСУ, И ЕЁ ЦЕНА — ЧУЖОЙ ОПЛАЧЕННЫЙ ПРОГОН. Выходы перекраса
 * приезжают с `kind: "render"` — бэкенд называет это «правдой, а не удобством», и `bench-kinds`
 * повторяет дословно: отличить фотографию человека от плиты фабрик-рендера по одной строке
 * картинки НЕЛЬЗЯ, это умеет только её ПРОГОН. Значит `pictureBenchKind` честно отвечал `render`,
 * пикер честно предлагал четыре стороны верстака рендера, и снимок на живой модели вставал в
 * слот, из которого 3D собирает сборку (`INPUT — RENDERS BY VIEW`). Дальше человек нажимал
 * GENERATE и платил за сборку, собранную из фотографии.
 *
 * ПОЭТОМУ РОД ПРОГОНА ПРИХОДИТ СВЕРХУ, А НЕ ЧИТАЕТСЯ ЗДЕСЬ. `runOfPicture` нашёл бы прогон только
 * на ПЕРВОЙ странице полосы: продолжения ленты (`useMoreHistory`) в `band.runs` не лежат, и на
 * второй странице истории гейт молча перестал бы срабатывать — то есть починка была бы
 * наполовину, а наполовину чинить деньги нельзя. Строка ленты прогон держит в руках и называет
 * его сама.
 */
const ONMODEL_NO_SLOT =
  'an on-model photograph stands in no slot — it is the garment on a person, not a plate';

export type SlotMenuItem = { value: string; label: string };

export type SlotMenu = {
  /** The rows of `slot ▾`, in the order the picture's own guess suggests. Empty when `reason`. */
  items: SlotMenuItem[];
  /** Files the picture into the chosen slot; `+ new detail…` opens the naming modal instead. */
  place: (value: string) => void;
  /** A write is in flight: the corner stays visible and says `slot…`. */
  pending: boolean;
  /**
   * WHY THIS PICTURE STANDS IN NO SLOT (no bench takes its kind, or a recolour's photograph,
   * E-12) — `null` when the menu is offered. The tile says it in its `title` only.
   */
  reason: string | null;
  /** The `+ new detail…` modal while it is open; the tile mounts it beside the frame. */
  modal: ReactNode;
};

export function useSlotMenu({
  band,
  techCardId,
  picture,
  rep,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  picture: common_DesignPicture;
  /**
   * Род ПРОГОНА, из которого вышла эта картинка, когда вызывающий его знает. `undefined` — «не
   * назван», и тогда решает один лишь род картинки, как было всегда. Единственное, что этот
   * ответ сегодня меняет, — перекрас (E-12, разбор у `ONMODEL_NO_SLOT` выше).
   */
  rep?: Representation | null;
  disabled?: boolean;
}): SlotMenu {
  const { setBenchSlot } = useDesignWrites(techCardId);
  const [naming, setNaming] = useState(false);

  /** The bench this picture's own kind addresses — `null` when no bench takes it. */
  const kind = pictureBenchKind(picture);
  const bench = useMemo(() => readBench(band, kind ?? 'flat'), [band, kind]);
  const pictureId = picture.id ?? 0;

  const items = useMemo(() => {
    const ghost = normaliseViewKey(picture.ghostView);
    /**
     * ═══ THE SIDE THIS PICTURE IS SAID TO BE STANDS FIRST — AND THAT IS ALL IT DOES (F-17, D-6) ═══
     *
     * On a cut piece `ghost_view` is the view the person NAMED on the frame in the split window;
     * on a root it is the machine's guess, routinely wrong on front/back. Both are expressed as
     * ORDER and nothing else: the reach is shortened, nothing is claimed — this menu's choice is
     * the input of a paid run. No «· probably» (владелец: «в GENERATION HISTORY не пиши
     * probably»). ONE SPELLING OF THE SORT for every picker of the band — `sidesLeadingWith`.
     */
    const sides = sidesLeadingWith(ghost).map((view) => ({
      value: `v:${view}`,
      label: viewLabel(view),
    }));
    // DETAILS ARE THE FLAT BENCH'S ALONE: no organ of the render bench draws detail slots, so a
    // render is offered the four sides and nothing else (three-quarters are offered by none, D-18).
    const details: SlotMenuItem[] = [];
    if (kind === 'flat') {
      bench.details.forEach((slot) => {
        if (!slot.id) return;
        details.push({ value: `d:${slot.id}`, label: displayDetailName(bench.details, slot) });
      });
      details.push({ value: NEW_DETAIL, label: '+ new detail…' });
    }
    /**
     * ═══ A PIECE CUT AS A DETAIL LEADS WITH THE DETAILS (D-6) ═══════════════════════════════════
     * Владелец: «после сплита мы уже знаем какая это деталь и в пикере отметок она должна быть
     * первой». WHICH detail is not on the wire, so the bench's named details come first, then the
     * door to mint one, then the sides. Order only: nothing is preselected.
     */
    const detailFirst = kind === 'flat' && isDetailView(ghost);
    return detailFirst ? [...details, ...sides] : [...sides, ...details];
  }, [bench.details, picture.ghostView, kind]);

  // ⚠ РОД ПРОГОНА СУДИТ РАНЬШЕ РОДА КАРТИНКИ (E-12): перекрас подписывает свои выходы словом
  // `render`, и прочитанный вторым род прогона не успел бы ничего решить.
  const reason =
    !kind || rep === 'onmodel'
      ? rep === 'onmodel'
        ? ONMODEL_NO_SLOT
        : noBenchReason(picture)
      : null;

  const place = (value: string) => {
    if (disabled || reason || !pictureId) return;
    if (value === NEW_DETAIL) {
      setNaming(true);
      return;
    }
    if (value.startsWith('v:') && kind) {
      const view = value.slice(2);
      const slot = bench.sides.find((s) => s.view === view)?.slot ?? null;
      setBenchSlot.mutate({
        // `kind` NAMES THE BENCH, and it is SPELLED (L-1): «empty means flat» would file a fabric
        // render onto the flat sheet. The slot rev beside it is read from the SAME bench (L-5).
        //
        // ═══ И КОЛОРВЕЙ БЕРЁТСЯ У САМОЙ КАРТИНКИ (L-1 → L-2) ═══════════════════════════════════
        // Плита несёт свой колорвей в себе; выбор студии отправил бы кадр ROSSO в верстак OLIVE,
        // а сервер отвечает на это `colorway_mismatch`. У флэта `refColorwayFor` всегда 0 (L-4).
        slot: { viewKey: view, kind, colorwayId: refColorwayFor(kind, colorwayOf(picture)) },
        pictureId,
        // 0 is the honest value for a side nobody has ever touched: the slot is born by this write.
        expectedSlotRev: slot?.slotRev ?? 0,
      });
      return;
    }
    if (value.startsWith('d:')) {
      const slotId = Number(value.slice(2));
      const slot = bench.details.find((d) => d.id === slotId) ?? null;
      if (!slot) return;
      setBenchSlot.mutate({
        // A minted id already names its bench AND its colourway; `kind` is IGNORED beside a
        // slot_id and a STATED colourway that disagrees is REFUSED — so neither is sent.
        slot: { slotId, kind: undefined, colorwayId: COLORWAY_NONE },
        pictureId,
        expectedSlotRev: slot.slotRev ?? 0,
      });
    }
  };

  // ИМЕНОВАНИЕ ДЕТАЛИ — МОДАЛКОЙ, А НЕ ПОЛЕМ: модалка предупреждает об ОДНОИМЁННОЙ детали (лист
  // цитирует деталь по имени). Достижима только с флэтовой плитки.
  const modal = naming ? (
    <NewDetailModal
      open
      onOpenChange={(o) => {
        if (!o) setNaming(false);
      }}
      techCardId={techCardId}
      band={band}
      picture={picture}
      disabled={disabled}
    />
  ) : null;

  return {
    items: reason || !pictureId ? [] : items,
    place,
    pending: setBenchSlot.isPending,
    reason,
    modal,
  };
}
