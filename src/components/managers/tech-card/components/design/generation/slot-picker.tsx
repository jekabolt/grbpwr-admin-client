import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

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
 * THE PICKER ON A TILE — «this picture goes into that slot», said from the picture's side.
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
 *
 * THE PLACEHOLDER OPTION CARRIES A REAL VALUE. An empty `value` in this repository's `Select` is a
 * measured hazard — Radix keeps a hidden native select beside the list and syncs it after render,
 * and a value that is not among the options comes back as a phantom `onValueChange('')` that
 * overwrites a correct field. The primitive now guards both halves of that, but the cheapest way to
 * stay out of it entirely is to never hand it an empty string, so `— slot —` is a named sentinel.
 */

const NONE = '__slot';
const NEW_DETAIL = '__new_detail';

/**
 * WHY THIS PICTURE HAS NO PICKER, in words — drawn in the picker's place, never a dead control.
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

export function SlotPicker({
  band,
  techCardId,
  picture,
  rep,
  disabled,
  className,
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
  className?: string;
}) {
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
     * On a cut piece `ghost_view` is the view the person NAMED on the frame in the split window
     * («it becomes the crop's ghost_view», `DesignSplitFrame.view_key`); on a root it is the
     * machine's guess, routinely wrong on front/back. Both are expressed as ORDER and nothing else:
     * the reach is shortened, nothing is claimed — this picker's choice is the input of a paid
     * run, and a confirmation nobody made would cost that run.
     * ⚠ СЛОВА «· probably» БОЛЬШЕ НЕТ. Владелец: «в GENERATION HISTORY не пиши probably», а этот
     * пикер рисуется ИМЕННО ТАМ — он импортирован в `generation-history.tsx`. Догадка осталась
     * ровно тем, чем была полезна: ПОРЯДКОМ.
     * ONE SPELLING OF THE SORT for every picker of the band — `sidesLeadingWith` in `../views`;
     * the three hand-written copies that preceded it are the reason it exists (D-6).
     */
    const sides = sidesLeadingWith(ghost).map((view) => ({
      value: `v:${view}`,
      label: viewLabel(view),
    }));
    // DETAILS ARE THE FLAT BENCH'S ALONE. A detail is a named close-up the sheet cites — cuff,
    // collar — and no organ of the render bench draws detail slots at all: a detail minted there
    // would be a row no screen shows. So the render picker offers the six sides and nothing else.
    const details: { value: string; label: string }[] = [];
    if (kind === 'flat') {
      bench.details.forEach((slot) => {
        if (!slot.id) return;
        details.push({ value: `d:${slot.id}`, label: displayDetailName(bench.details, slot) });
      });
      details.push({ value: NEW_DETAIL, label: '+ new detail…' });
    }
    /**
     * ═══ A PIECE CUT AS A DETAIL LEADS WITH THE DETAILS (D-6) ═══════════════════════════════════
     *
     * Владелец, дословно: «после сплита мы уже знаем какая это деталь и в пикере отметок она
     * должна быть первой».
     *
     * A frame named `detail` in the split window comes back as a crop whose ghost is `detail` —
     * not a silhouette, so the side order above cannot say it, and before this wave the picker
     * opened on `front` for a cuff. Measured on the stand (`tmp/dsgprobe/d18r-probe.mjs`, A2):
     * the first three items after the placeholder read «front · back · side L».
     *
     * WHICH detail is not on the wire — a frame names the KIND of piece, not the slot — so the
     * bench's named details come first (the ordinary case: the cuff was described in THE PICTURES
     * before the sheet was cut), then the door to mint one, then the sides. Still order and
     * nothing else: no detail is preselected, and the label of none of them changes.
     */
    const detailFirst = kind === 'flat' && isDetailView(ghost);
    return [
      { value: NONE, label: '— slot —' },
      ...(detailFirst ? [...details, ...sides] : [...sides, ...details]),
    ];
  }, [bench.details, picture.ghostView, kind]);

  if (!pictureId) return null;

  // NO BENCH TAKES THIS KIND — the reason stands where the picker would, in the tile's own quiet
  // voice (`data-inert` with the reason, the wave's rule for a cut door: never absence, never a
  // dead control).
  //
  // ⚠ И РОД ПРОГОНА СУДИТ РАНЬШЕ РОДА КАРТИНКИ (E-12). Это единственный случай, когда они
  // расходятся, и расходятся они на проводе, а не здесь: перекрас подписывает свои выходы словом
  // `render`. Порядок веток поэтому не безразличен — прочитанный вторым, род прогона не успел бы
  // ничего решить, потому что первая ветка уже нашла бы верстак.
  if (!kind || rep === 'onmodel') {
    const reason = rep === 'onmodel' ? ONMODEL_NO_SLOT : noBenchReason(picture);
    return (
      <span data-inert={reason} title={reason} className={className}>
        <Text size='nano' variant='label' component='span'>
          {reason}
        </Text>
      </span>
    );
  }

  const place = (value: string) => {
    if (value === NONE) return;
    if (value === NEW_DETAIL) {
      setNaming(true);
      return;
    }
    if (value.startsWith('v:')) {
      const view = value.slice(2);
      const slot = bench.sides.find((s) => s.view === view)?.slot ?? null;
      setBenchSlot.mutate({
        // `kind` NAMES THE BENCH, and it is SPELLED, not left to the wire's default: the bench
        // this picker addresses is the picture's own, and «empty means flat» would file a fabric
        // render onto the flat sheet — the L-1 defect. The slot rev beside it is read from the
        // SAME bench, so the CAS token can never be the other bench's revision (L-5).
        //
        // ═══ И КОЛОРВЕЙ БЕРЁТСЯ У САМОЙ КАРТИНКИ — ТОТ ЖЕ ДОВОД, ЧТО У РОДА (L-1 → L-2) ══════
        // Плита несёт свой колорвей в себе: рендер ROSSO знает, что он ROSSO, потому что прогон,
        // родивший его, назвал цвет, а разрез и правка это унаследовали на сервере. Значит пикер
        // на плитке НЕ спрашивает у экрана, какой цвет сейчас выбран, — экран этой картинки может
        // и не показывать вовсе (лента показывает все). Подставить сюда выбор студии значило бы
        // отправить кадр ROSSO в верстак OLIVE, а сервер отвечает на это `colorway_mismatch`.
        // У флэта `refColorwayFor` возвращает 0 всегда: там оси нет (L-4).
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
        // A minted id already names its bench AND its colourway, and the contract says `kind` is
        // IGNORED beside a slot_id while a STATED colourway that disagrees is REFUSED rather than
        // dropped — so sending either could only ever be a contradiction nobody could adjudicate.
        // 0 is «not stated», which is exactly how the slot's own value is allowed to stand.
        // (Details are the flat bench's alone anyway: this branch is unreachable from a render.)
        slot: { slotId, kind: undefined, colorwayId: COLORWAY_NONE },
        pictureId,
        expectedSlotRev: slot.slotRev ?? 0,
      });
    }
  };

  // ИМЕНОВАНИЕ ДЕТАЛИ — МОДАЛКОЙ, А НЕ ПОЛЕМ В СТРОКЕ. Здесь стояло второе написание того же
  // жеста: инлайновый ввод имени, который умел ровно то же, кроме одного — он молчал про
  // ОДНОИМЁННУЮ деталь. Сервер два одинаковых имени разрешает, и лист потом цитирует деталь ПО
  // ИМЕНИ, поэтому два «cuff» — это две строки, которые невозможно различить на бумаге.
  // Прототип на это место ставит модалку (`newDetailModal`), и предупреждение живёт в ней.
  // Достижима только с флэтовой плитки: у рендера пункта «+ new detail…» нет вовсе.
  if (naming) {
    return (
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
    );
  }

  return (
    <SelectComponent
      name={`slot-of-${pictureId}`}
      items={items}
      // The control never displays a chosen slot: choosing IS the act, and the answer appears on
      // the tile as its slot badge. So it returns to `— slot —` on every render.
      value={NONE}
      disabled={disabled || setBenchSlot.isPending}
      onValueChange={place}
      className={className}
      placeholder='— slot —'
    />
  );
}
