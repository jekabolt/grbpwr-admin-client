import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { displayDetailName, readBench } from '../bench-slot';
import { NewDetailModal } from '../modals';
import { useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, normaliseViewKey, viewLabel } from '../views';

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
 * THE PLACEHOLDER OPTION CARRIES A REAL VALUE. An empty `value` in this repository's `Select` is a
 * measured hazard — Radix keeps a hidden native select beside the list and syncs it after render,
 * and a value that is not among the options comes back as a phantom `onValueChange('')` that
 * overwrites a correct field. The primitive now guards both halves of that, but the cheapest way to
 * stay out of it entirely is to never hand it an empty string, so `— slot —` is a named sentinel.
 */

const NONE = '__slot';
const NEW_DETAIL = '__new_detail';

export function SlotPicker({
  band,
  techCardId,
  picture,
  disabled,
  className,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  picture: common_DesignPicture;
  disabled?: boolean;
  className?: string;
}) {
  const { setBenchSlot } = useDesignWrites(techCardId);
  const [naming, setNaming] = useState(false);

  const bench = useMemo(() => readBench(band), [band]);
  const pictureId = picture.id ?? 0;

  const items = useMemo(() => {
    const ghost = normaliseViewKey(picture.ghostView);
    // THE GUESS STANDS FIRST, and it is labelled as a guess. `ghost_view` is a hypothesis about
    // which side this is — routinely wrong on front/back — so it shortens the reach without ever
    // claiming the answer.
    const sides = [...SILHOUETTE_VIEWS].sort((a, b) => {
      if (a === ghost) return -1;
      if (b === ghost) return 1;
      return 0;
    });
    const out: { value: string; label: string }[] = [{ value: NONE, label: '— slot —' }];
    sides.forEach((view) => {
      out.push({
        value: `v:${view}`,
        label: ghost === view ? `${viewLabel(view)} · probably` : viewLabel(view),
      });
    });
    bench.details.forEach((slot) => {
      if (!slot.id) return;
      out.push({ value: `d:${slot.id}`, label: displayDetailName(bench.details, slot) });
    });
    out.push({ value: NEW_DETAIL, label: '+ new detail…' });
    return out;
  }, [bench.details, picture.ghostView]);

  if (!pictureId) return null;

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
        slot: { viewKey: view },
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
        slot: { slotId },
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
