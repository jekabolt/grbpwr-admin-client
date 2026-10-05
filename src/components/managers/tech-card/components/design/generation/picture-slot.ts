import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
} from 'api/proto-http/admin';

import { COLORWAY_NONE, benchKindOf, colorwayOf } from '../bench-kinds';
import { displayDetailName, readBench } from '../bench-slot';
import { isActiveView, isLegacyView, normaliseViewKey, viewLabel } from '../views';

/**
 * WHERE A PICTURE STANDS ON THE BENCH — moved out of `run-tile.tsx` unchanged (T59, 05.10) so every
 * host of the propagating editor (`propagating-editor.tsx`) names the slot an edit takes over.
 */
export type SlotOfPicture = {
  ref: DesignBenchSlotRef;
  /**
   * THE SLOT'S FULL NAME, FOR PROSE: `front`, or `render · front` — a bench other than the flat one
   * says its name, because «FRONT» alone names two different slots. Read by `unmark`'s label and
   * title, where the sentence has to be unambiguous on its own («take this picture out of …»).
   * ⚠ NOT the badge — see `badge` below.
   */
  label: string;
  /**
   * THE WORD ON THE TILE'S BADGE — the side, and only the side (r3 п.33). Владелец, дословно: «в
   * истории на FABRIC RENDER в миниатюрах не писать род RENDER FRONT». Род здесь сказан ДВАЖДЫ до
   * того, как его прочтут: шаг, на котором открыта история, уже сузил её до своего рода, и подпись
   * под кадром печатает его словом (`render · front`). Третье повторение на самом кадре — шум, и
   * оно съедало ширину ярлыка, у которого есть свой потолок в примитиве.
   * ⚠ ЭТО ПОЛЕ, А НЕ `label.split()` У ВЫЗЫВАЮЩЕГО: два имени одного слота обязаны считаться там
   * же, где считается его адрес, иначе они разойдутся молча — ровно как разошлись роды верстаков.
   */
  badge: string;
  rev: number;
};

/**
 * Which bench slot holds this picture, addressed the way a write to it must be addressed.
 *
 * THE ROW ITSELF NAMES ITS BENCH (L-1/L-5). This walks the raw rows: whatever bench the picture
 * actually stands on — its own, or the wrong one placed by the old defect — the unmark addresses
 * THAT row, with THAT row's kind and CAS token, which is the only ref the server will not refuse.
 * The kind is spelled from the row, never guessed from the picture.
 */
export function slotOfPicture(
  band: GetDesignBandResponse,
  pictureId: number,
): SlotOfPicture | null {
  if (!pictureId) return null;
  for (const row of band.bench ?? []) {
    if ((row.pictureId ?? 0) !== pictureId) continue;
    const view = normaliseViewKey(row.viewKey);
    // A RETIRED THREE-QUARTER IS STILL A SIDE ROW, NOT A DETAIL (D-18, Codex M-11): it is addressed
    // by its view key like any side, and prints «3/4 left (legacy)» — «not active» never means
    // «address it as a detail by id».
    if (isActiveView(view) || isLegacyView(view)) {
      const kind = benchKindOf(row);
      return {
        /* И КОЛОРВЕЙ БЕРЁТСЯ У САМОЙ СТРОКИ, А НЕ У ЭКРАНА (L-2): снятие адресует ТУ строку, в
           которой плита стоит, — со всеми тремя половинами её адреса. Разбор — один, `colorwayOf`
           в `../bench-kinds`. */
        ref: { viewKey: view, kind, colorwayId: colorwayOf(row) },
        // The flat bench keeps its bare labels — the look every tile has always had; any other
        // bench says its name, because «FRONT» alone now names two different slots. That is the
        // PROSE name; the badge on the tile carries the side alone (r3 п.33).
        label: kind === 'flat' ? viewLabel(view) : `${kind} · ${viewLabel(view)}`,
        badge: viewLabel(view),
        rev: row.slotRev ?? 0,
      };
    }
    const name = displayDetailName(readBench(band, benchKindOf(row)).details, row);
    return {
      // A minted id already names its bench AND its colourway; both are ignored/deferred to beside
      // a slot_id, so 0 here is «not stated» and lets the row's own value stand.
      ref: { slotId: row.id, kind: undefined, colorwayId: COLORWAY_NONE },
      // Именованная деталь рода не носила никогда — её имя и есть её адрес.
      label: name,
      badge: name,
      rev: row.slotRev ?? 0,
    };
  }
  return null;
}

/** Where a picture stands on `band`'s bench, in prose — the editor's toast after an overwrite (D-55). */
export function slotLabelOf(band: GetDesignBandResponse, pictureId: number): string | null {
  return slotOfPicture(band, pictureId)?.label ?? null;
}

/** The run or batch row a picture is filed in — where its edit chain lives (T28); itself alone. */
export function rowOfPicture(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
): readonly common_DesignPicture[] {
  const id = picture.id ?? 0;
  for (const row of [...(band.runs ?? []), ...(band.batches ?? [])]) {
    const pictures = row.pictures ?? [];
    if (pictures.some((p) => (p.id ?? 0) === id)) return pictures;
  }
  return [picture];
}
