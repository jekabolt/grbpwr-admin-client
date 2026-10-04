import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useEffect, useState } from 'react';

import { isPickablePicture } from '../band-feed';
import {
  COLORWAY_NONE,
  benchKindOf,
  colorwayOf,
  pictureBenchKind,
  type Representation,
} from '../bench-kinds';
import { displayDetailName, readBench, refBenchKind } from '../bench-slot';
import { pictureHandle } from '../handles';
import { VectorModal } from '../modals';
import { usePickMode } from '../pick-mode';
import { PictureTile, type PictureTileFlag, type PictureTileMenu } from '../picture-tile';
import { mixedInputNote, provenanceLabel, readProvenance } from '../provenance';
import { RunRenderTile, useRenderHost } from '../render/render-tile';
import { isModelUrl } from '../threed/media';
import { useDesignWrites } from '../use-design-band';
import { isPictureHidden } from '../visibility';
import { isActiveView, isLegacyView, normaliseViewKey, viewLabel } from '../views';
import { closeSurface, openSurface } from './bench-store';
import { compositeTail, offersSplit, readComposite, readSplit, splitVerb } from './composite';
import { deleteTitle, isDerivedPicture, useDeletePicture } from './delete-picture-modal';
import { isUndoneEdit, successorStands } from './edit-chain';
import { useEditChainDoors } from './edit-chain-doors';
import { WorkbenchEditor } from './propagating-editor';
import { useSlotMenu } from './slot-picker';
import { thumbUrl } from './thumb';

/**
 * ═══ ONE OUTPUT OF A RUN, WITH ITS DOORS — ONE TILE, TWO HOSTS (26.09, O-53) ═══════════════════
 *
 * Moved out of `generation-history.tsx` unchanged, together with the two readers only it uses
 * (`slotOfPicture`, `kindWord`), so the history row and the latest-generation workbench under
 * GENERATE (`latest-generation.tsx`, through `run-outputs.tsx`) put the SAME tile on screen: split
 * in the corner of an uncut sheet, edit that files a NEW sibling picture (`slot={null}` — the tile
 * is not a bench slot), the viewer through the host's gallery group, and the two placing organs —
 * `slot ▾` (`useSlotMenu`) for a free plate, `✕` (unmark) for a plate a slot reads — IN THE FRAME
 * since T13, like FLAT SLOTS' own cells.
 */

/* ────────────────────────────── reading ────────────────────────────── */

type SlotOfPicture = {
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
function slotOfPicture(band: GetDesignBandResponse, pictureId: number): SlotOfPicture | null {
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

/** The word for a run's kind on its own line: `flat · pattern · render · 3D · on model`. */
export const REP_NOUN: Record<Representation, string> = {
  flat: 'flat',
  pattern: 'pattern',
  render: 'render',
  threed: '3D',
  onmodel: 'change a colour',
  playground: 'playground',
};

function kindWord(run: Pick<common_DesignRun, 'kind'>, rep: Representation | null): string {
  const kind = (run.kind ?? '').trim().toLowerCase();
  // The two flat-coloured kinds that are not a flat drawing say their own word: a text draft is
  // not a drawing and a vector redraw is not a fresh sheet, and the history is a record.
  if (kind === 'draft_idea') return 'draft';
  if (kind === 'vector') return 'vector';
  /* THE CUT-OUT SAYS ITS OWN WORD, for the same reason `vector` and `draft` do: the two playground
     kinds are one shelf but not one act, and «playground» over a row that removed a background
     tells a person less than the row already knows. */
  if (kind === 'cutout') return 'cut-out';
  return rep ? REP_NOUN[rep] : kind || 'run';
}

/** Where a picture stands on `band`'s bench, in prose — the editor's toast after an overwrite (D-55). */
function slotLabelOf(band: GetDesignBandResponse, pictureId: number): string | null {
  return slotOfPicture(band, pictureId)?.label ?? null;
}

/**
 * ═══ THE ONE SPLIT GATE (03.10, owner items 8 and 19) ═══════════════════════════════════════════
 * A tile offers the cut where a cut is NEEDED (item 8: `readSplit` + `offersSplit`) and only where
 * the picture can be cut at all: not on a card the person cannot write, not on an old hidden stamp,
 * not on a picture an edit replaced, never on a 3D file (E-32). The SPLIT corner here and the
 * bench's inline editor (`latest-generation.tsx`, T20) read this one gate, so the bench never draws
 * an editor over a sheet whose tile would not have offered the cut. Returns the views the frames
 * are seeded from, or `null`.
 */
export function splitViewsOf(
  band: GetDesignBandResponse,
  picture: common_DesignPicture,
  siblings: readonly common_DesignPicture[] | undefined,
  run: common_DesignRun | undefined,
  disabled: boolean | undefined,
): string[] | null {
  if (disabled || isPictureHidden(picture) || (picture.replacedBy ?? 0) > 0) return null;
  const threed =
    (picture.kind ?? '').trim().toLowerCase() === 'threed' || isModelUrl(thumbUrl(picture.media));
  if (threed) return null;
  const split = readSplit(band, picture, siblings, run);
  return offersSplit(split) ? split.views : null;
}

/* ────────────────────────────── the tile ────────────────────────────── */

/** The `delete…` row of the tile's menu — a value no slot can spell (`v:` / `d:` / `__new_detail`). */
const DELETE_ITEM = '__delete';

/**
 * A run's output. THE PICTURE ITSELF IS `PictureTile` AND NOTHING ELSE (T-8): the file says WHICH
 * roles the picture has (`onSplit`, `onEdit`, a place in the gallery) and the primitive decides
 * where they sit. The tile is handed its OFFSET in a row the section assembled from the whole
 * loaded history (`galleryIndex`) — that is what makes the arrow leave the page it was opened from.
 *
 * ═══ NOTHING STANDS UNDER THE FRAME (T13, 20-TILE-SPEC §3) ═══════════════════════════════════
 * Владелец: «в FLAT LATEST GENERATION кнопки unmark или селектор должны быть внутри плитки по
 * принципу как это сделано в flat slots». The caption (`flat · not standing`) and the door row
 * (`unmark` button / `— slot —` select / `delete`) are gone: a plate a slot reads wears its side on
 * the badge and `✕` = unmark top-right (FLAT SLOTS' verb and RPC); a free plate gets the `slot ▾`
 * corner; `delete…` (workbench, derived only) is the menu's last, danger row behind the same
 * modal. States the frame cannot show (`hidden`, `replaced`, `fit ≠ card`) are the flag; the
 * address, provenance and every reason ride in the cell's `title`.
 */
export function RunTile({
  band,
  techCardId,
  picture,
  siblings,
  run,
  workbench,
  rep,
  cardFit,
  runFit,
  dim,
  disabled,
  galleryKey,
  galleryIndex,
  deckMemberOf,
  onOpen,
  onZoom,
  onSplit,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  picture: common_DesignPicture;
  /** Every picture of the run row this tile stands in — the branch `overwrite` is judged by. */
  siblings?: readonly common_DesignPicture[];
  /** The run row the tile stands in: its params tell a one-picture sheet the writer never saw. */
  run?: common_DesignRun;
  /**
   * The tile stands on the latest-generation WORKBENCH: its editor asks «overwrite or save as new»
   * (`VectorModal.replace`). In the history an edit is always new.
   */
  workbench?: boolean;
  /** The kind of the RUN this tile stands in — the row knows it, the picture does not (E-12). */
  rep: Representation | null;
  cardFit: string;
  runFit: string;
  /** Приглушить кадр: строка стоит на полке архива и на неё смотрят, а не работают ею (J-22). */
  dim?: boolean;
  disabled?: boolean;
  galleryKey: string;
  galleryIndex?: number;
  /** The sheet this piece was cut out of, when the tile stands in an OPEN deck (H-10). */
  deckMemberOf?: number;
  /** The frame's surface unfolds a closed deck instead of zooming (J-2); only the sheet has it. */
  onOpen?: () => void;
  onZoom?: (pictureId: number) => void;
  /**
   * Cut this sheet — the host's split window. `views` is the tile's own reading (`readSplit`), the
   * one the split gate offered the cut by: the window seeds its frames from it, so a `one` sheet the
   * writer never stamped (`composite_views` empty, beta) still opens as FRONT / BACK / … (R(a)).
   */
  onSplit: (picture: common_DesignPicture, views: readonly string[]) => void;
}) {
  const pick = usePickMode();
  const { setBenchSlot } = useDesignWrites(techCardId);
  /**
   * O-63: the render doors of this row — set for every plate of a render run on FABRIC RENDER, the
   * ones with the old hidden stamp too (O-63 r2, D-72 п.2: the render tile draws them with the
   * doors a hidden picture may have — `unmark ▸` of a slot SIDES does not draw among them).
   */
  const renderHost = useRenderHost(rep);
  /** Правка прямо в истории (V-10): состояние у плитки — редактор открыт над КОНКРЕТНОЙ картинкой. */
  const [editing, setEditing] = useState(false);

  const pictureId = picture.id ?? 0;
  /**
   * ═══ РЕДАКТОР — ПОВЕРХНОСТЬ ПРОГОНА, И ВЕРСТАК ОБ ЭТОМ ЗНАЕТ (26.09, O-53 review) ═══════════════
   * Пока он открыт, верстак последней генерации не меняет прогон (`bench-store.ts`): новый прогон,
   * приехавший опросом, иначе размонтировал бы эту плитку вместе с редактором — мимо его вопроса о
   * несохранённом. Открытие пишется В ЖЕСТЕ (до любого перечитывания полосы), закрытие — уборкой
   * эффекта: и закрыли, и плитку размонтировали под ним (смена карточки) — поверхность уходит.
   */
  const surfaceKey = `edit:${pictureId}`;
  useEffect(() => {
    if (!editing) return;
    return () => closeSurface(techCardId, surfaceKey);
  }, [editing, techCardId, surfaceKey]);
  const openEditor = () => {
    openSurface(techCardId, surfaceKey, picture.runId ?? 0);
    setEditing(true);
  };
  const hidden = isPictureHidden(picture);
  /**
   * AN EDIT TOOK THIS PICTURE'S PLACE (O-53 phase 2, `replaced_by`). Nothing about the picture
   * changed — it is not hidden, its pixels and crops are its own; the history says so under it,
   * «replaced by an edit», and no cut is offered (the server refuses one: `already_replaced`).
   */
  const replaced = successorStands(picture, siblings ?? [picture]);
  /** An edit the person undid (T28): hidden, its place given back to the version before it. */
  const undone = isUndoneEdit(picture);
  // WHAT THIS FILE DECLARES ABOUT ITSELF — see `composite.tsx`. Nothing here infers compositeness
  // from what the run ASKED for.
  const facts = readComposite(band, picture, siblings);
  const composite = facts.declared;
  const split = readSplit(band, picture, siblings, run);
  const provenance = readProvenance(picture);
  const handle = pictureHandle(picture);
  const inSlot = slotOfPicture(band, pictureId);
  const mixed = mixedInputNote(provenance);
  const word = kindWord({ kind: picture.kind }, rep);

  /**
   * `fit slim ≠ card oversized` — the run copied the card's fit at launch, and the card has moved
   * since. Both values must be stated for the badge to mean anything.
   */
  const fitMismatch = !!runFit && !!cardFit && runFit !== cardFit;

  const url = thumbUrl(picture.media);

  /**
   * ЭТО ФАЙЛ 3D, И У НЕГО НЕТ НИ РАЗРЕЗА, НИ ПРАВКИ (E-32): разрез режет ЛИСТ НА ВИДЫ — у сборки
   * видов нет; правка рождает СИБЛИНГА в строке прогона — растр, выдающий себя за выход сборки.
   * Прогон считается целиком: и `.glb`, и его растровая миниатюра приезжают с родом `threed`.
   */
  const threedFile = (picture.kind ?? '').trim().toLowerCase() === 'threed' || isModelUrl(url);
  /** Плитка ткани: ни в один слот не встаёт и об этом не объясняется (r3 п.20, `menu` ниже). */
  const patternTile = (picture.kind ?? '').trim().toLowerCase() === 'pattern' || rep === 'pattern';
  // The frame opens by its MEDIA (`openAt`), the offset stays the fallback.
  const galleryGroup =
    galleryIndex == null
      ? undefined
      : { key: galleryKey, index: galleryIndex, mediaId: picture.media?.id ?? 0 };

  /* ═══ «DELETE» — ON THE WORKBENCH, ON A DERIVED PICTURE ONLY (28.09, O-68, D-74) ═══════════════
     A crop or an edit of one leaves the card and the storage for good; a root plate of the run has
     no door (the server refuses it: `picture_is_root`). The history's tiles draw none of this — the
     host gates it (`workbench`). On every tile, the render tile included, it is the menu's last
     row, `delete…` (T13, T17), opening the one confirmation `useDeletePicture` owns. */
  const canDelete = !!workbench && !disabled && pictureId > 0 && isDerivedPicture(picture);
  /* Hooks above the render-host branch: a tile never changes host, but React counts calls. */
  const removal = useDeletePicture(techCardId, picture, siblings);
  const slotMenu = useSlotMenu({ band, techCardId, picture, rep, disabled });
  /* UNDO / REDO (T28): on the FLAT workbench only — where an edit takes its original's place. The
     history shows every link and walks none; a render's edit is always new. */
  const chainDoors = useEditChainDoors({
    techCardId,
    picture,
    row: siblings ?? [picture],
    slot: inSlot ? { ref: inSlot.ref, rev: inSlot.rev } : null,
    handle,
    disabled: !workbench || !!renderHost || !!disabled || threedFile,
  });

  /* ═══ A FABRIC RENDER IN A RUN ROW IS THE RENDER TILE (27.09, O-63, D-62 п.2) ═════════════════
     On FABRIC RENDER a render run's plate draws the doors RENDERS OF THIS CARD drew — `mark ▸`,
     `apply splitted`, `expand ▸`, `unmark ▸`, the states `in front` — by one set of rules
     (`render/render-tile.tsx`, the row's `RenderDoorsHost`). The row keeps what it owns: the zoom
     through its viewer row, its split window, and this tile's editor, opened as a surface of its
     run (the workbench pins it) and filing a NEW picture, as a render's edit always has. A plate
     with the old hidden stamp is drawn here too (O-63 r2) — the `hidden` branch below is the other
     steps' tile. */
  if (renderHost) {
    return (
      <RunRenderTile
        host={renderHost}
        picture={picture}
        src={url}
        dim={dim}
        deckMemberOf={deckMemberOf}
        galleryGroup={galleryGroup}
        onZoom={onZoom && pictureId ? () => onZoom(pictureId) : undefined}
        onSplit={() => onSplit(picture, split.views)}
        onEdit={openEditor}
        split={split}
        onDelete={canDelete ? removal.ask : undefined}
        deletePending={removal.pending}
      >
        {removal.modal}
        {editing && (
          <VectorModal
            open
            onOpenChange={setEditing}
            techCardId={techCardId}
            band={band}
            base={picture}
            slot={null}
            replace={null}
            disabled={disabled}
          />
        )}
      </RunRenderTile>
    );
  }

  /**
   * ONE BADGE — the mock-up's top-left tag. A plate a slot reads wears its SIDE and nothing else
   * (r3 п.33 — the bench's own name lives in the prose, `inSlot.label`); a sheet wears `N views`;
   * a picture standing nowhere wears nothing. ⚠ NOT `ghost_view`: «A guess, never a fact» by
   * contract, and a plate STANDING in front and a plate the machine merely guessed as front must
   * not wear the same word (F-17). The guess is kept where it is useful — as the ORDER of the slot
   * picker below.
   */
  const badge = composite ? `${facts.views.length} views` : inSlot ? inSlot.badge : undefined;

  /**
   * ONE FLAG — the state the frame cannot show, in this order: the old `hidden` stamp (pickers and
   * slots skip it), «replaced by an edit» (O-53 phase 2), the run's fit against the card's. Words,
   * not colour alone: `≠` carries the meaning in monochrome too.
   */
  const flag: PictureTileFlag | undefined = undone
    ? {
        word: 'undone',
        tone: 'mut',
        title: 'an undone edit: the version before it stands in its place; redo brings it back',
      }
    : hidden
      ? {
          word: 'hidden',
          tone: 'mut',
          title:
            'hidden in an earlier session, before per-picture hiding was removed — pickers and slots still skip it. Runs are archived whole now.',
        }
      : replaced
        ? {
            word: 'replaced',
            tone: 'mut',
            title:
              'replaced by an edit: the edit stands in its place in the latest generation, and this picture stays here',
          }
        : fitMismatch
          ? { word: 'fit ≠ card', tone: 'warn', title: `fit ${runFit} ≠ card ${cardFit}` }
          : undefined;

  /**
   * THE CELL'S TITLE — what the caption under the frame used to say, plus its tooltip: the kind
   * and the place, the address, the provenance, the composite tail, and the reason a picture is
   * offered no slot (E-12, `useSlotMenu.reason`; the pattern step stays silent, r3 п.20).
   */
  const cellTitle = [
    patternTile && !inSlot ? word : `${word} · ${inSlot ? inSlot.label : 'not standing'}`,
    `${handle} · ${provenanceLabel(provenance)}${compositeTail(facts)}${mixed ? ` · ${mixed}` : ''}`,
    fitMismatch && flag?.word !== 'fit ≠ card' ? `fit ${runFit} ≠ card ${cardFit}` : '',
    !patternTile && !composite && !inSlot ? slotMenu.reason ?? '' : '',
  ]
    .filter(Boolean)
    .join(' · ');

  /**
   * PICK MODE TAKES THE TILE OVER, and the picture keeps its skin while it does. The tile becomes
   * one button, so the frame is handed NO gallery and no corner roles — a button may not contain
   * buttons. THE ARMED SLOT'S BENCH GATES THE CLICK (L-1): a fabric render must not land in a flat
   * slot however it travels.
   */
  if (pick.target) {
    const targetKind = refBenchKind(band, pick.target.slot);
    const kindOk = pictureBenchKind(picture) === targetKind;
    const pickable = isPickablePicture(picture) && kindOk;
    return (
      <button
        type='button'
        data-picture={pictureId || undefined}
        data-deck-member={deckMemberOf || undefined}
        onClick={pickable ? () => pick.resolve(pictureId) : undefined}
        aria-disabled={!pickable}
        title={
          pickable
            ? `put ${handle} into ${pick.target.label}`
            : !kindOk
              ? `${pick.target.label} is a ${targetKind} slot — benches do not mix, and this picture is not a ${targetKind}`
              : composite
                ? 'a composite holds several views — split it first'
                : 'hidden pictures are not offered'
        }
        className={cn(
          'flex h-full w-full min-w-0 flex-col text-left',
          pickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-40',
        )}
      >
        {/* `w-full` НЕСУЩЕЕ: обёртка здесь — <button>, а у кнопки UA-раскладка не растягивает
            детей по поперечной оси, и кадр с одним лишь `aspect-ratio` схлопнулся бы. */}
        <PictureTile
          url={url}
          alt={handle}
          badge={badge}
          flag={flag}
          selected={pickable}
          className='w-full'
        />
      </button>
    );
  }

  /**
   * ✕ = UNMARK — exactly FLAT SLOTS' verb, word and RPC (`bench-slot.tsx`): out of the block is
   * out of the slot, and the plate stays in the history. pictureId 0 EMPTIES the slot without
   * deleting it — a different act from deleting a detail slot, and it has to stay different. A
   * hidden plate keeps no ✕: its stamp is the one fact its tile shows (as before, И-1).
   */
  const onRemove =
    inSlot && !hidden && !disabled
      ? {
          onClick: () =>
            setBenchSlot.mutate({ slot: inSlot.ref, pictureId: 0, expectedSlotRev: inSlot.rev }),
          ariaLabel: `take ${handle} off ${inSlot.label}`,
          title:
            `unmark — take this picture out of ${inSlot.label}; it stays here` +
            (canDelete ? '. To delete it for good, unmark it first' : ''),
          pending: setBenchSlot.isPending,
        }
      : undefined;

  /**
   * `slot ▾` — A FREE PLATE'S ONE PLACING ORGAN. None under a composite (a slot holds one view and
   * a sheet several: its door is `split`), none on a pattern tile (r3 п.20: the step has no
   * slots, the phrase repeated under every frame), none where no bench takes the kind (E-12 — the
   * reason is the cell's title). `delete…` rides last, in the error ink, on the workbench only;
   * a plate standing in a slot has no menu at all — unmark first, then delete.
   */
  const slotItems =
    !inSlot && !hidden && !composite && !patternTile && !disabled ? slotMenu.items : [];
  const offerDelete = canDelete && !inSlot;
  const menu: PictureTileMenu | undefined =
    slotItems.length || offerDelete
      ? {
          label: slotItems.length ? 'slot' : 'more',
          ariaLabel: slotItems.length ? `put ${handle} into a slot` : `more for ${handle}`,
          items: [
            ...slotItems,
            ...(offerDelete
              ? [
                  {
                    value: DELETE_ITEM,
                    label: 'delete…',
                    tone: 'danger' as const,
                    title: deleteTitle(removal.pieces),
                  },
                ]
              : []),
          ],
          onPick: (value) => (value === DELETE_ITEM ? removal.ask() : slotMenu.place(value)),
          pending: slotMenu.pending || removal.pending,
          'data-menu': `slot:${pictureId}`,
        }
      : undefined;

  return (
    <div
      className='group flex h-full w-full min-w-0 flex-col'
      data-picture={pictureId || undefined}
      data-deck-member={deckMemberOf || undefined}
      title={cellTitle}
    >
      <PictureTile
        url={url}
        alt={handle}
        badge={badge}
        flag={flag}
        menu={menu}
        onRemove={onRemove}
        onOpen={onOpen}
        onZoom={onZoom && pictureId ? () => onZoom(pictureId) : undefined}
        galleryGroup={galleryGroup}
        onUndo={chainDoors.onUndo}
        onRedo={chainDoors.onRedo}
        /* ПРИГЛУШАЕТСЯ СНИМОК, А НЕ ПЛИТКА (K-6): прозрачность на всей плитке глушила бы и дверь
           `edit` до 1.6:1. Флаг «hidden» состояние держит и без заливки. */
        dim={hidden || dim}
        className='w-full'
        /* SPLIT ONLY WHERE A SPLIT IS NEEDED (03.10, owner item 8: «кнопка сплит должна быть только
           на тех карточках где мы уверенны что сплит нужен»): the file declares two or more views
           (`composite_views`, written by the server for a one-image multi-view run) and nothing
           has been cut out of it yet (F-8). A single-view picture no longer offers it. Never on a
           3D file (E-32). */
        onSplit={
          splitViewsOf(band, picture, siblings, run, disabled)
            ? {
                onClick: () => onSplit(picture, split.views),
                ariaLabel: `split ${handle} into views`,
                title: `${splitVerb(split)} cut this file into pictures a slot can take`,
              }
            : undefined
        }
        /* ПРАВКА (V-10, K-6) стоит на КАЖДОМ сгенерированном растре — склейке и картинке со
           старым штампом `hidden` тоже: редактор рождает СИБЛИНГА в той же строке прогона, база не
           трогается. Единственное исключение — файл 3D (E-32): предмета нет. */
        onEdit={
          !disabled && !threedFile
            ? {
                onClick: openEditor,
                ariaLabel: `edit ${handle} — draw over this picture`,
                title:
                  (workbench
                    ? 'draw over this picture — the edit takes its place here and in its slot; undo brings this one back, and the history keeps both'
                    : 'draw over this picture — saving makes a NEW picture in this same run row; the original is never overwritten') +
                  (composite
                    ? '. This file holds several views at once, so the edit keeps them together — cut it into views first if you want them apart'
                    : '') +
                  (hidden
                    ? '. This one carries an old hidden stamp; the picture your edit makes does not'
                    : ''),
              }
            : undefined
        }
      />
      {slotMenu.modal}
      {removal.modal}

      {/* Редактор монтируется только раскрытым. `slot` НЕ ПЕРЕДАЁТСЯ НАРОЧНО: плитка истории — не
          слот верстака, и результат правки не обязан никуда вставать. На ВЕРСТАКЕ правка
          встаёт на место картинки сразу (T28, `replace.direct`; `undo` в углу — шаг назад): слот, где стоит картинка, переезжает
          на правку СЕРВЕРОМ, в той же транзакции, — клиент его не пишет. Причины закрытой
          перезаписи ЖИВЫЕ, пока редактор открыт (D-55): опрос полосы приносит чужую правку или
          разрез, форма карточки — выноску на листе; поэтому `closed` перерисовывается с полосой и
          с формой, а `closedNow` редактор спрашивает прямо перед записью. Форму смотрит ТОЛЬКО
          открытый редактор верстака (`WorkbenchEditor`, review r3): подписка на каждой плитке
          перерисовывала всю историю на каждую букву выноски. Тост после перезаписи называет слот
          по ПЕРЕЧИТАННОЙ полосе (`slotOf`), а не по вопросу. */}
      {editing &&
        (workbench && pictureId > 0 ? (
          <WorkbenchEditor
            band={band}
            techCardId={techCardId}
            picture={picture}
            siblings={siblings}
            slotLabel={inSlot?.label ?? null}
            slotOf={slotLabelOf}
            disabled={disabled}
            onOpenChange={setEditing}
          />
        ) : (
          <VectorModal
            open
            onOpenChange={setEditing}
            techCardId={techCardId}
            band={band}
            base={picture}
            slot={null}
            replace={null}
            disabled={disabled}
          />
        ))}
    </div>
  );
}
