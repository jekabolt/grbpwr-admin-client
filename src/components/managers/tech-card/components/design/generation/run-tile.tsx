import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
} from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../../schema';
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
import type { VectorReplace } from '../modals/vector-modal';
import { usePickMode } from '../pick-mode';
import { PictureTile } from '../picture-tile';
import { mixedInputNote, provenanceLabel, readProvenance } from '../provenance';
import { RunRenderTile, useRenderHost } from '../render/render-tile';
import { isModelUrl } from '../threed/media';
import { useDesignWrites } from '../use-design-band';
import { isPictureHidden } from '../visibility';
import { isActiveView, isLegacyView, normaliseViewKey, viewLabel } from '../views';
import { closeSurface, openSurface } from './bench-store';
import { compositeTail, isCutOut, readComposite, splitVerb } from './composite';
import { DeletePictureDoor, isDerivedPicture } from './delete-picture-modal';
import { SlotPicker } from './slot-picker';
import { thumbUrl } from './thumb';

/**
 * ═══ ONE OUTPUT OF A RUN, WITH ITS DOORS — ONE TILE, TWO HOSTS (26.09, O-53) ═══════════════════
 *
 * Moved out of `generation-history.tsx` unchanged, together with the two readers only it uses
 * (`slotOfPicture`, `kindWord`), so the history row and the latest-generation workbench under
 * GENERATE (`latest-generation.tsx`, through `run-outputs.tsx`) put the SAME tile on screen: split
 * in the corner of an uncut sheet, edit that files a NEW sibling picture (`slot={null}` — the tile
 * is not a bench slot), zoom through the host's viewer group, and the footer that marks a plate
 * into FLAT SLOTS (`SlotPicker`) or takes it out (`unmark`).
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
  /** The caption's word for the place: `front`, `cuff (2)`. */
  place: string;
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
        place: viewLabel(view),
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
      place: name,
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

/* ─────────────────────── «overwrite» — when it is closed (O-53 phase 2) ─────────────────────── */

/**
 * HOW MANY PIECES CUT STRAIGHT OUT OF `sheetId` STILL STAND — the server's `cut_sheet` guard, read
 * off the row (`DesignStandingPieces`, entity/design_replace.go): a piece stands while anything
 * grown from it is visible — the piece itself, an edit that took its place (`replaced_by`, followed
 * to the end), a piece cut from any of those, and so on down the branch. Crops and edits inherit
 * their parent's run, so the row IS the whole branch.
 */
function standingPieces(pictures: readonly common_DesignPicture[], sheetId: number): number {
  const byId = new Map<number, common_DesignPicture>();
  const cutsOf = new Map<number, number[]>();
  for (const picture of pictures) {
    const id = picture.id ?? 0;
    if (id <= 0) continue;
    byId.set(id, picture);
    const parent = picture.derivedFrom ?? 0;
    if (!isCutOut(picture) || parent <= 0) continue;
    const list = cutsOf.get(parent);
    if (list) list.push(id);
    else cutsOf.set(parent, [id]);
  }
  let standing = 0;
  for (const piece of cutsOf.get(sheetId) ?? []) {
    const stack = [piece];
    const seen = new Set<number>([sheetId]);
    let stands = false;
    while (stack.length && !stands) {
      const id = stack.pop() ?? 0;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = byId.get(id);
      if (!node) continue;
      if (!isPictureHidden(node)) stands = true;
      stack.push(...(cutsOf.get(id) ?? []));
      if ((node.replacedBy ?? 0) > 0) stack.push(node.replacedBy ?? 0);
    }
    if (stands) standing += 1;
  }
  return standing;
}

/**
 * WHY «OVERWRITE» IS CLOSED FOR THIS PICTURE, as the end of «overwrite is closed: …» — or null.
 * 07-FLAT-WORKBENCH.md §3c/3d, in this order:
 *   · the server predates the verb — `replaced_by` ABSENT (not 0) on the read; the gateway emits
 *     the field on every picture of a server that has it (proto: DesignPicture.replaced_by);
 *   · an edit already took its place (only a picture held under an open editor is still drawn so on
 *     the workbench — `outputPlan`'s `keep`);
 *   · the picture carries the old hidden stamp (27.09, review r2): a stamp from before per-picture
 *     hiding was removed (T-14), which nothing on this screen can lift — the edit goes beside;
 *   · a sheet with pieces standing: they would stay cut from the original (`cut_sheet`);
 *   · the original is on the card's technical sheet (`technicalMedia`): `documentPlates` lists the
 *     card's media first and the bench plate after it, so the edit taking the slot would print a
 *     SECOND front beside the original — and its callouts would stay pinned to the original. The
 *     server refuses the same (`technical_sheet`, D-55); this reading only spares the save and the
 *     upload that its refusal would come after.
 * Every fact here can change while the editor is open — a poll brings another tab's edit or cut,
 * the card form takes a callout — so the open workbench editor re-renders the reason
 * (`WorkbenchEditor`: `useWatch`, the band) and asks for it again right before it writes
 * (`VectorReplace.closedNow`).
 */
function overwriteClosed(
  picture: common_DesignPicture,
  siblings: readonly common_DesignPicture[],
  form: { technicalMedia?: { mediaId?: number }[]; callouts?: { mediaId?: number }[] } | null,
): string | null {
  if (picture.replacedBy === undefined) return 'this server cannot replace a picture yet';
  if ((picture.replacedBy ?? 0) > 0)
    return 'an edit has already taken this picture’s place — edit that one instead';
  if (isPictureHidden(picture))
    return 'this picture is hidden — an old stamp nothing here can lift, so save the edit as new';
  const pieces = standingPieces(siblings, picture.id ?? 0);
  if (pieces > 0)
    return pieces === 1
      ? 'this sheet is already cut into 1 piece and it stays cut from the original — edit the piece instead'
      : `this sheet is already cut into ${pieces} pieces and they stay cut from the original — edit a piece instead`;
  const mediaId = picture.media?.id ?? 0;
  if (mediaId > 0 && (form?.technicalMedia ?? []).some((m) => (m.mediaId ?? 0) === mediaId)) {
    const callouts = (form?.callouts ?? []).filter((c) => (c.mediaId ?? 0) === mediaId).length;
    return callouts > 0
      ? `${callouts} callout${callouts === 1 ? '' : 's'} on the sheet ${callouts === 1 ? 'is' : 'are'} pinned to the original and would stay with it`
      : 'the original is on the card’s technical sheet and would stay there beside the edit';
  }
  return null;
}

/** The card fields `overwriteClosed` reads — one array for the life of the page (`useWatch` keys on it). */
const SHEET_FIELDS = ['technicalMedia', 'callouts'] as const;

/** Where a picture stands on `band`'s bench, in prose — the editor's toast after an overwrite (D-55). */
function slotLabelOf(band: GetDesignBandResponse, pictureId: number): string | null {
  return slotOfPicture(band, pictureId)?.label ?? null;
}

/**
 * ═══ THE WORKBENCH'S EDITOR OVER ONE TILE — AND THE ONLY WATCHER OF THE CARD FORM (review r3) ═══
 *
 * Overwrite's reasons read the card form — `technicalMedia` and `callouts` — and move with it while
 * the question stands (27.09, review r2, D-55): a snapshot read as the editor opened went stale the
 * moment somebody pinned a callout. Watched by every tile, though, a keystroke in a callout made
 * every picture of the history render again, for a question none of them can ask. Mounted only
 * while a workbench tile's editor is open, this watches for exactly one tile, and only then.
 *
 * `closedNow` is the same reading made at the moment of the call — the editor asks it right before
 * it writes an overwrite, long after the render that drew the question (`VectorReplace.closedNow`).
 */
function WorkbenchEditor({
  band,
  techCardId,
  picture,
  siblings,
  slotLabel,
  disabled,
  onOpenChange,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  picture: common_DesignPicture;
  siblings?: readonly common_DesignPicture[];
  slotLabel: string | null;
  disabled?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const form = useFormContext<TechCardFormData>();
  const [technicalMedia, callouts] = useWatch({ control: form.control, name: SHEET_FIELDS });
  /** The picture and its row as of the last render — what `closedNow` judges. */
  const latest = useRef({ picture, siblings });
  latest.current = { picture, siblings };
  const closedNow = useCallback(() => {
    const { picture: p, siblings: row } = latest.current;
    return overwriteClosed(
      p,
      row ?? [p],
      form.getValues() as Parameters<typeof overwriteClosed>[2],
    );
  }, [form]);
  return (
    <VectorModal
      open
      onOpenChange={onOpenChange}
      techCardId={techCardId}
      band={band}
      base={picture}
      slot={null}
      replace={
        {
          pictureId: picture.id ?? 0,
          slotLabel,
          closed: overwriteClosed(picture, siblings ?? [picture], { technicalMedia, callouts }),
          closedNow,
          slotOf: slotLabelOf,
        } satisfies VectorReplace
      }
      disabled={disabled}
    />
  );
}

/* ────────────────────────────── the tile ────────────────────────────── */

/**
 * A run's output. THE PICTURE ITSELF IS `PictureTile` AND NOTHING ELSE (T-8): the file says WHICH
 * roles the picture has (`onSplit`, `onEdit`, a place in the gallery) and the primitive decides
 * where they sit. The tile is handed its OFFSET in a row the section assembled from the whole
 * loaded history (`galleryIndex`) — that is what makes the arrow leave the page it was opened from.
 *
 * WHAT IS LOCAL IS THE CAPTION AND THE FOOTER, the mock-up's `histTile`: `flat · front` under the
 * frame, then `UNMARK` for a plate a slot reads (И-1 — neither a ✕ nor a picker), the slot picker
 * for a free picture, nothing under a sheet (its one door is the split in the corner).
 */
export function RunTile({
  band,
  techCardId,
  picture,
  siblings,
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
  onSplit: (picture: common_DesignPicture) => void;
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
  const replaced = (picture.replacedBy ?? 0) > 0;
  // WHAT THIS FILE DECLARES ABOUT ITSELF — see `composite.tsx`. Nothing here infers compositeness
  // from what the run ASKED for.
  const facts = readComposite(band, picture);
  const composite = facts.declared;
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
  /** Плитка ткани: ни в один слот не встаёт и об этом не объясняется (r3 п.20, `footer` ниже). */
  const patternTile = (picture.kind ?? '').trim().toLowerCase() === 'pattern' || rep === 'pattern';
  // The frame opens by its MEDIA (`openAt`), the offset stays the fallback.
  const galleryGroup =
    galleryIndex == null
      ? undefined
      : { key: galleryKey, index: galleryIndex, mediaId: picture.media?.id ?? 0 };

  /* ═══ «DELETE» — ON THE WORKBENCH, ON A DERIVED PICTURE ONLY (28.09, O-68, D-74) ═══════════════
     A crop or an edit of one leaves the card and the storage for good; a root plate of the run has
     no door (the server refuses it: `picture_is_root`). The history's tiles draw none of this — the
     host gates it (`workbench`). The last door of the row, one step away from the others. */
  const deleteDoor =
    workbench && !disabled && pictureId > 0 && isDerivedPicture(picture) ? (
      <DeletePictureDoor techCardId={techCardId} picture={picture} siblings={siblings} />
    ) : null;

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
        onSplit={() => onSplit(picture)}
        onEdit={openEditor}
        trailingDoor={deleteDoor}
      >
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
  const place = inSlot ? inSlot.place : 'not standing';
  /**
   * «REPLACED BY AN EDIT» TAKES THE CAPTION'S ROOM (O-53 phase 2). It is the one fact about the tile
   * that the frame does not show, and «flat · replaced by an edit» does not fit the history's 148px
   * track — measured: it cut at «replaced by an e…». The kind word goes (only a flat is ever replaced:
   * the question lives on the FLAT workbench); a slot the original was put back into stays named.
   */
  const replacedCaption = replaced
    ? inSlot
      ? `${inSlot.place} · replaced by an edit`
      : 'replaced by an edit'
    : null;

  // `flat · front` — the mock-up's `picName`. The address (`run 7 · b`), the provenance and the
  // composite tail ride in the title: the row already says which run, and the caption is one line.
  //
  // ⚠ У ПЛИТКИ ТКАНИ ВТОРОЙ ПОЛОВИНЫ НЕТ (r3 п.20, вторая половина того же пункта). «pattern · not
  // standing» — то же самое утверждение, что и снятая фраза «стоит не в слоте», сказанное мельче:
  // паттерн НЕ СТОИТ НИГДЕ ПО УСТРОЙСТВУ, и «не стоит» под каждым кадром ленты — это не факт о
  // работе, а повторение определения. Остаётся род, который на смешанной ленте ещё различает кадры.
  // ⚠ У ЛИСТА ПОДПИСИ НЕТ (владелец, 2026-09-07 утро: «flat · sheet of 6 — этот текст убрать»):
  // бейдж `N views` уже несёт единственный факт, который эта строка повторяла словами.
  const caption = (
    <>
      {/* A REPLACED SHEET SAYS SO TOO: the owner took «flat · sheet of 6» off the sheet because the
          badge already said it; «replaced by an edit» is a state no badge carries. */}
      {(!composite || replaced) && (
        <Text
          size='micro'
          component='p'
          className='mt-1 truncate'
          title={`${handle} · ${provenanceLabel(provenance)}${compositeTail(facts)}${mixed ? ` · ${mixed}` : ''}${replaced ? ' · replaced by an edit: the edit stands in its place in the latest generation, and this picture stays here' : ''}`}
        >
          {replacedCaption ?? (patternTile && !inSlot ? word : `${word} · ${place}`)}
        </Text>
      )}
      {fitMismatch && (
        // Слово, а не только цвет: система обязана читаться в монохроме, и «≠» здесь несёт смысл
        // сама по себе. Обе величины названы — расхождение без второй половины ничего не значит.
        <Text size='nano' component='p' className='truncate uppercase text-error'>
          fit {runFit} ≠ card {cardFit}
        </Text>
      )}
    </>
  );

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
        <PictureTile url={url} alt={handle} badge={badge} selected={pickable} className='w-full' />
        {caption}
      </button>
    );
  }

  let footer: React.ReactNode = null;
  if (hidden) {
    /**
     * A STATE, NOT AN ORGAN. Hiding one picture is gone (T-14) and so is its undo; what is left is
     * a stamp some earlier session wrote, which every picker still obeys.
     */
    footer = (
      <Pill
        tone='mut'
        title='hidden in an earlier session, before per-picture hiding was removed — pickers and slots still skip it. Runs are archived whole now.'
      >
        hidden
      </Pill>
    );
  } else if (inSlot) {
    // И-1: a plate that a slot reads carries neither a ✕ nor a picker — both would be refused — so
    // the one honest door is the one that undoes the placement. Full width, as the mock-up's.
    footer = (
      <Button
        variant='secondary'
        size='xs'
        className='w-full'
        disabled={disabled || setBenchSlot.isPending}
        onClick={() =>
          setBenchSlot.mutate({
            slot: inSlot.ref,
            // 0 is UNMARK: empty the slot without deleting it. A different act from deleting a
            // detail slot, and it has to stay different.
            pictureId: 0,
            expectedSlotRev: inSlot.rev,
          })
        }
        aria-label={`take ${handle} off ${inSlot.label}`}
        title={disabled ? undefined : `take this picture out of ${inSlot.label}`}
      >
        unmark
      </Button>
    );
  } else if (!composite && !patternTile) {
    // NO SLOT PICKER UNDER A COMPOSITE, AND THAT IS THE RULE: a slot holds one view and that file
    // holds several, so its only door is the split in the corner. `rep` — the RUN'S kind — is
    // load-bearing (E-12): a recolour's outputs say «render» on the wire.
    // ⚠ И НИ ПИКЕРА, НИ ФРАЗЫ ПОД ПЛИТКОЙ ПАТТЕРНА (r3 п.20). Владелец, дословно: «в истории на
    // PATTERN убрать текст a repeating tile stands in no slot — it is cloth, not a view». Пикер
    // рисовал на её месте объяснение, почему двери нет, — по общему правилу волны «никогда не
    // отсутствие, никогда мёртвый орган». Правило верно там, где человек ИЩЕТ дверь; здесь он её
    // не ищет: шаг называется PATTERN, и ни одна плитка на нём в слот не встаёт, так что фраза
    // повторялась под КАЖДЫМ кадром ленты, одна и та же. Объяснение живёт там, где оно ещё нужно,
    // — у 3D-кадра и у снимка на модели, где рядом СТОЯТ плитки, у которых дверь есть.
    // `min-h`, not `h`: one branch of the picker draws a phrase, not a control, and a fixed height
    // painted it over the next row's meta line (measured on beta, tab ALL, 1400 wide).
    footer = !disabled && (
      <SlotPicker
        band={band}
        techCardId={techCardId}
        picture={picture}
        rep={rep}
        className='min-h-[20px] w-full'
      />
    );
  }

  return (
    <div
      className='flex h-full w-full min-w-0 flex-col'
      data-picture={pictureId || undefined}
      data-deck-member={deckMemberOf || undefined}
    >
      <PictureTile
        url={url}
        alt={handle}
        badge={badge}
        onOpen={onOpen}
        onZoom={onZoom && pictureId ? () => onZoom(pictureId) : undefined}
        galleryGroup={galleryGroup}
        /* ПРИГЛУШАЕТСЯ СНИМОК, А НЕ ПЛИТКА (K-6): прозрачность на всей плитке глушила бы и дверь
           `edit` до 1.6:1. Слово «hidden» под кадром состояние держит и без заливки. */
        dim={hidden || dim}
        className='w-full'
        /* РЕЗ ПРЕДЛАГАЕТСЯ НА ЖИВОЙ И ЕЩЁ НЕ РАЗРЕЗАННОЙ КАРТИНКЕ. Этот экран и есть то место, где
           человек ОБЪЯВЛЯЕТ свой лист многовидовым (полосы входов показывают колоды только для
           машинных композитов). У уже разрезанной угла нет (F-8). У файла 3D — тем более (E-32). */
        onSplit={
          !disabled && !hidden && !replaced && !threedFile && facts.splitInto === 0
            ? {
                onClick: () => onSplit(picture),
                ariaLabel: `split ${handle} into views`,
                title: `${splitVerb(facts)} cut this file into pictures a slot can take`,
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
                    ? 'draw over this picture — saving asks whether the edit takes this picture’s place in the latest generation or stands beside it; the original stays in the history either way'
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
      {caption}
      {/* THE DOOR ROW. With «delete» (D-74) the row is one line: the footer's door keeps the width
          it had (`flex-1`), «delete» stands last, one step (16px) away from it — twice the gap
          between doors — and never wraps under it. Without it, the row is what it always was. */}
      {deleteDoor ? (
        <div className='mt-1 flex items-center'>
          {footer && <div className='flex min-w-0 flex-1 items-center gap-x-2'>{footer}</div>}
          <div className={footer ? 'ml-4 shrink-0' : 'shrink-0'}>{deleteDoor}</div>
        </div>
      ) : (
        footer && (
          <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5'>{footer}</div>
        )
      )}

      {/* Редактор монтируется только раскрытым. `slot` НЕ ПЕРЕДАЁТСЯ НАРОЧНО: плитка истории — не
          слот верстака, и результат правки не обязан никуда вставать. На ВЕРСТАКЕ правка
          спрашивает «overwrite или save as new» (`replace`): слот, где стоит картинка, переезжает
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
