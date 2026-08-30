import type {
  GetDesignBandResponse,
  common_MediaFull,
  common_TechCard,
  common_TechCardMediaKind,
} from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { EditHistory } from 'ui/components/annotation/history';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { ViewSwitch } from 'ui/components/view-switch';

import type { TechCardFormData } from '../schema';
import { SketchTab } from '../sketch-tab';
import { InertDoor } from './bench-slot';
import { clockStamp } from './handles';
import {
  DiffRows,
  MintDialog,
  SHEET_MINIMUM,
  SILHOUETTE_VIEWS,
  VIEW_LABELS,
  analyseMint,
  benchDiverged,
  benchDoor,
  benchMinimumMet,
  openDoor,
  readBench,
  sheetMinimumMissing,
  slotIsFilled,
  useDesignSaveHost,
  type BenchSlots,
  type CalloutLike,
  type MintOrigin,
} from './mint-dialog';
import { provenanceLabel, readProvenance } from './provenance';
import { outputsOfKind, pictureIsSelected, serverStatesSelected } from './render';
import { buildSheetSvg, downloadSvg, type SheetSvgPlate } from './sheet-svg';
import { PrintSheetButton, SheetJournal, versionShortHash } from './sheet-journal';
import { useDesignSheetVersion } from './use-design-band';

/**
 * ARTIFACTS — where the drawing is a document, and the document becomes paper.
 *
 * ═══ THE TWO STOREYS, AND WHY THEY ARE IN THIS ORDER ═══════════════════════════════════════════
 *
 * (a) THE DOCUMENT. The plates the card holds and the callouts drawn on them, editable, on every
 *     card that exists. It needs no new RPC and no bench: it reads `technicalMedia` and `callouts`
 *     off the form, exactly as they are saved by the ordinary Save. This is the storey that makes
 *     the tab useful to the whole of production on the day it ships (`17` П-Ж): every live card
 *     enters this band with its technical media full, its callouts drawn and a bench nobody has
 *     ever touched, and a screen that led with the bench would tell all of them «no plates» and ask
 *     for a re-upload of files the card already holds.
 *
 * (b) THE VERSIONS. The strip, the journal, the divergence plate, the mint. This storey is ABSENT
 *     — not empty, absent — until a version exists. There is no `SHEET v0`: a version is a frozen
 *     composition somebody minted, so a zeroth one is a sentence about nothing. What stands in its
 *     place is one plate saying versions arrive with the mint, and the act that would mint one.
 *
 * ═══ WHAT A VERSION FREEZES ════════════════════════════════════════════════════════════════════
 *
 * THE COMPOSITION OF PLATES, AND ONLY THAT. Which pictures were on the sheet, with the hash of the
 * bytes each one pinned. THE CALLOUTS ARE NOT FROZEN: paper prints the callouts the card holds at
 * the moment it is printed. That is the prototype's own division — it snapshots the plates
 * (`70-actions.js:216-222`) and draws the shapes from live state at export (`:276`) — and it is the
 * division this build follows, against the plan's extra tier of frozen callouts (`design_sheet_
 * version_callout`, migration 0342). That tier is left INERT on purpose: nothing here writes it and
 * nothing here reads it. A second, frozen copy of a callout is precisely how one signature comes to
 * cover two different factory truths — the floor reading v3's frozen note while the card's own
 * callout says something else, and neither piece of paper admitting the other exists.
 *
 * The consequence, stated so nobody re-derives it wrongly: EDITING A CALLOUT AFTER v1 DOES NOT NEED
 * v2. A version is born of an ACT — a print, a release — never of a file changing under it.
 */

/** One plate of the document: a picture with a name, wherever it came from. */
export type DocumentPlate = {
  key: string;
  name: string;
  mediaId: number;
  media?: common_MediaFull;
  /**
   * Where this plate is listed.
   *   `card`  — the card's own technical media. This is the DOCUMENT: what a callout's `media_id`
   *             points at, what prints, and what the mint freezes.
   *   `bench` — a design bench slot. The mint carries it into the card's media; until then it is
   *             visible here and cannot be drawn on.
   *   `run`   — an output of a generation run that nobody has taken onto the card yet. It exists in
   *             the band and nowhere else, which is why it gets a verb of its own.
   */
  origin: 'card' | 'bench' | 'run';
  /** The server states this picture is the one the studio settled on — `DesignPicture.selected`. */
  chosen?: boolean;
  /** Only for a bench plate: the address of its slot, for the door. */
  door?: string;
  note?: string;
};

/**
 * ═══ WHICH REPRESENTATION A PICTURE IS — the axis ARTIFACTS switches along (W-14) ══════════════
 *
 * READ OFF THE RUN THE PICTURE CAME OUT OF, and only then off the card's own `kind`. `DesignRun.
 * kind` is spelled out in the contract and frozen at launch; `TechCardMediaKind` has one member for
 * an accepted render and NONE for a turntable frame, so a card-side reading alone would file every
 * 3D frame under «flat» and the switcher would have an empty segment that is not honestly empty.
 *
 * The fallback is still needed and is still right: a render accepted onto the card months ago, on a
 * page of the feed the band no longer ships, is not in `band.runs` at all — and `kind=RENDER` on
 * the card media is exactly the statement «this is a render and it is official».
 */
export type ArtifactKind = 'flat' | 'render' | 'threed';

export const ARTIFACT_KINDS: { value: ArtifactKind; label: string; hint: string }[] = [
  { value: 'flat', label: 'flats', hint: 'the drawings — and the only thing the sheet is made of' },
  { value: 'render', label: 'renders', hint: 'coloured over the flats; not part of the sheet' },
  { value: 'threed', label: '3D', hint: 'turntable frames; not part of the sheet' },
];

export function artifactKindOf(
  mediaId: number,
  runKindByMedia: Map<number, string>,
  cardKind?: string,
): ArtifactKind {
  const fromRun = runKindByMedia.get(mediaId);
  if (fromRun === 'render') return 'render';
  if (fromRun === 'threed') return 'threed';
  if (cardKind === 'TECH_CARD_MEDIA_KIND_RENDER') return 'render';
  return 'flat';
}

/** media id → the kind of the run that produced it, for every picture on the loaded page. */
export function runKindByMediaId(band: GetDesignBandResponse): Map<number, string> {
  const map = new Map<number, string>();
  for (const run of band.runs ?? []) {
    const kind = (run.kind ?? '').trim().toLowerCase();
    if (kind !== 'render' && kind !== 'threed' && kind !== 'flat') continue;
    for (const picture of run.pictures ?? []) {
      const mediaId = picture.media?.id ?? 0;
      if (mediaId > 0) map.set(mediaId, kind);
    }
  }
  return map;
}

/**
 * ═══ THE PICTURES ARTIFACTS OFFERS TO MARK UP, BEYOND THE DOCUMENT ITSELF ═════════════════════
 *
 * The owner's sentence is «we can put callouts on the CHOSEN generated / annotated media (or ones
 * uploaded by hand), and switch between flats, renders and 3D». So the carrier of the switch is the
 * chosen pictures — not only the plates that reached the technical sheet — and «chosen» is the very
 * mark W-12 asks for on a turntable. One notion, two requirements; a second one would drift.
 *
 * THE LIST NARROWS TO THE CHOSEN ONES ONLY WHEN A CHOICE HAS BEEN MADE, and that condition is the
 * whole of the honesty here. `DesignPicture.selected` is on the contract and is read — but nothing
 * can WRITE it yet (`render/model.ts` → `SELECT_VERB_MISSING`), so on most cards nothing is marked.
 * Filtering unconditionally would leave both segments permanently and inexplicably empty on a card
 * full of renders. So: if anything of this kind is marked, the segment IS the marked ones; if
 * nothing is, it lists every unhidden picture of that kind on the loaded page — and the panel says
 * WHICH of the two lists is on screen, rather than letting «renders · 3» read as «three chosen
 * renders» when nothing has been chosen at all.
 */
export function bandPlates(
  band: GetDesignBandResponse,
  kind: 'render' | 'threed',
  already: Set<number>,
): { plates: DocumentPlate[]; filteredToSelected: boolean; serverStates: boolean } {
  const outputs = outputsOfKind(band, kind);
  const serverStates = outputs.some((o) => serverStatesSelected(o.picture));
  const filteredToSelected = outputs.some((o) => pictureIsSelected(o.picture));
  const plates: DocumentPlate[] = [];
  for (const { picture, run } of outputs) {
    if (filteredToSelected && !pictureIsSelected(picture)) continue;
    const mediaId = picture.media?.id ?? 0;
    if (mediaId <= 0 || already.has(mediaId)) continue;
    already.add(mediaId);
    const view = (picture.ghostView ?? '').trim();
    plates.push({
      key: `run-${picture.id}`,
      name:
        (VIEW_LABELS[view] || view.toUpperCase() || '') ||
        `frame ${picture.ordinal ?? plates.length + 1}`,
      mediaId,
      media: picture.media,
      origin: 'run',
      chosen: pictureIsSelected(picture),
      note: `run ${run.id ?? '—'}${run.rrev ? ` · r${run.rrev}` : ''}`,
    });
  }
  return { plates, filteredToSelected, serverStates };
}

/**
 * One row of the form's `callouts` array as the FORM holds it (`z.input` — every field optional).
 *
 * Declared here and exported because two doors upstream have to name it: `ArtifactsTab` passes the
 * page's undo history down, and the history's element type is what says WHAT is being undone.
 */
export type SheetCallout = NonNullable<TechCardFormData['callouts']>[number];

/**
 * WHY A BENCH PLATE HAS NO LIVE DOOR, said once and read by both of them.
 *
 * The drawing editor draws on `technicalMedia` — the card's OWN media list, which is what a
 * callout's `media_id` points at. A bench slot is not in that list: the mint is what puts it there
 * (`injectBenchPlatesAsTechnicalMedia`, server-side, inside the mint transaction). So before a mint
 * this picture cannot carry a callout, and taking it «off the sheet» here would remove nothing —
 * the slot still holds it and the next mint would bring it straight back.
 */
const BENCH_PLATE_NOT_ON_DOCUMENT =
  'this picture stands on the bench, not in the card’s own media — the mint puts it there, and callouts are drawn on the document’s own plates';
const BENCH_PLATE_DETACH =
  'a bench plate is taken off by clearing its slot in STUDIO — dropped here it would come back with the next mint';
/**
 * A run's output lives in the band and not in the card's media, and a callout's `media_id` points
 * at the card's media. So the picture has to be taken onto the card before anything can be drawn on
 * it — and that door is right beside this one, on the same plate.
 */
const RUN_PLATE_NOT_ON_CARD =
  'this picture came out of a run and is not in the card’s own media yet — a callout addresses the card’s media, so take it in first with the door beside this one';

const CARD_PLATE_KINDS: Partial<Record<common_TechCardMediaKind, string>> = {
  TECH_CARD_MEDIA_KIND_FRONT: 'FRONT',
  TECH_CARD_MEDIA_KIND_BACK: 'BACK',
  TECH_CARD_MEDIA_KIND_SIDE_L: 'SIDE L',
  TECH_CARD_MEDIA_KIND_SIDE_R: 'SIDE R',
  TECH_CARD_MEDIA_KIND_DETAIL: 'detail',
  TECH_CARD_MEDIA_KIND_LINING: 'lining',
  TECH_CARD_MEDIA_KIND_PREVIEW: 'preview',
  TECH_CARD_MEDIA_KIND_RENDER: 'render',
};

/**
 * The document's plates, in one list keyed by MEDIA ID.
 *
 * The card's own technical media come first — they are the document, they are what a callout's
 * `media_id` points at, and they are what every existing card has. A bench slot is appended only
 * when it holds a picture the card does not already list, so the same image can never appear twice
 * under two names.
 *
 * Pure, and exported, because the precedence between the two sources is the part of this tab most
 * likely to be «simplified» later by somebody who has not opened a production card.
 */
export function documentPlates(
  formMedia: { mediaId?: number; kind?: string }[],
  resolved: Map<number, common_MediaFull>,
  bench: BenchSlots,
): DocumentPlate[] {
  const plates: DocumentPlate[] = [];
  const seen = new Set<number>();

  formMedia.forEach((item, i) => {
    const mediaId = item.mediaId ?? 0;
    if (mediaId <= 0 || seen.has(mediaId)) return;
    seen.add(mediaId);
    plates.push({
      key: `card-${mediaId}`,
      name: CARD_PLATE_KINDS[(item.kind ?? '') as common_TechCardMediaKind] ?? `image ${i + 1}`,
      mediaId,
      media: resolved.get(mediaId),
      origin: 'card',
    });
  });

  const benchSlots = [
    ...SILHOUETTE_VIEWS.map((v) => bench.byView.get(v)).filter(Boolean),
    ...bench.details,
  ];
  for (const slot of benchSlots) {
    if (!slotIsFilled(slot)) continue;
    const media = slot!.picture?.media;
    const mediaId = media?.id ?? 0;
    if (mediaId <= 0 || seen.has(mediaId)) continue;
    seen.add(mediaId);
    const view = (slot!.viewKey ?? '').trim();
    plates.push({
      key: `bench-${slot!.id}`,
      name: (slot!.detailName ?? '').trim() || VIEW_LABELS[view] || view.toUpperCase() || 'detail',
      mediaId,
      media,
      origin: 'bench',
      door: benchDoor({ viewKey: slot!.viewKey, id: slot!.id }),
      note: provenanceLabel(readProvenance(slot!.picture ?? {})),
    });
  }

  return plates;
}

export function ArtifactsPanel({
  techCardId,
  band,
  disabled,
  techCard,
  calloutHistory,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
  /**
   * The loaded card, for the drawing editor: it resolves a `media_id` to a picture through
   * `resolvedTechnicalMedia`. Optional because a harness may mount this panel with a form and no
   * card — and then the door says so instead of opening onto blank frames.
   */
  techCard?: common_TechCard;
  /**
   * The form's ONE undo history over `callouts`, handed down from the page.
   *
   * NOT made here. The page resets it whenever the form is re-seeded from the server
   * (`calloutHistory.reset()` after a save), and a history minted inside this panel would survive
   * that reset — ⌘Z would then restore callouts the card no longer holds, silently.
   */
  calloutHistory?: EditHistory<SheetCallout>;
}): JSX.Element {
  const form = useFormContext<TechCardFormData>();
  const host = useDesignSaveHost();
  const { showMessage } = useSnackBarStore();
  // The SAME cache entry the page reads and re-primes after every save. Not a second fetch.
  const { data: card } = useTechCard(techCardId);

  const callouts = (useWatch({ control: form.control, name: 'callouts' }) ?? []) as CalloutLike[];
  const technicalMedia = (useWatch({ control: form.control, name: 'technicalMedia' }) ?? []) as {
    mediaId?: number;
    kind?: string;
  }[];

  const resolved = useMemo(() => {
    const map = new Map<number, common_MediaFull>();
    for (const item of card?.resolvedTechnicalMedia ?? []) {
      if (item.media?.id != null) map.set(item.media.id, item.media);
    }
    return map;
  }, [card?.resolvedTechnicalMedia]);

  const bench = useMemo(() => readBench(band), [band]);
  const plates = useMemo(
    () => documentPlates(technicalMedia, resolved, bench),
    [technicalMedia, resolved, bench],
  );
  const diverged = useMemo(() => benchDiverged(band.latestVersion, bench), [band, bench]);

  /**
   * ═══ THE THREE REPRESENTATIONS OF THIS CARD, AS ONE LIST PER SEGMENT (W-14) ═════════════════
   *
   * Each segment is the DOCUMENT's plates of that kind FIRST — those are the ones a callout can be
   * drawn on today — and then the chosen pictures of that kind that nobody has taken onto the card
   * yet. The order is the argument: what is already part of the card outranks what is offered to
   * become part of it, and the door between the two states is one button on the offered plate.
   */
  const runKinds = useMemo(() => runKindByMediaId(band), [band]);
  const cardKindOf = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of technicalMedia) {
      if ((item.mediaId ?? 0) > 0) map.set(item.mediaId as number, item.kind ?? '');
    }
    return map;
  }, [technicalMedia]);

  /**
   * The media ids the server states are CHOSEN — read once, applied to every plate whatever list it
   * came from. Without this the mark would vanish at the exact moment it starts to matter: taking a
   * chosen turntable onto the card turns it into a `card` plate, built by `documentPlates`, which
   * knows nothing about runs — and the badge would silently disappear as a REWARD for accepting it.
   */
  const chosenMedia = useMemo(() => {
    const ids = new Set<number>();
    for (const run of band.runs ?? []) {
      for (const picture of run.pictures ?? []) {
        const mediaId = picture.media?.id ?? 0;
        if (mediaId > 0 && pictureIsSelected(picture)) ids.add(mediaId);
      }
    }
    return ids;
  }, [band.runs]);

  const segments = useMemo(() => {
    const of = (p: DocumentPlate) => artifactKindOf(p.mediaId, runKinds, cardKindOf.get(p.mediaId));
    const mark = (list: DocumentPlate[]) =>
      list.map((p) => (p.chosen || !chosenMedia.has(p.mediaId) ? p : { ...p, chosen: true }));
    const flat = plates.filter((p) => of(p) === 'flat');
    const onCard = new Set(plates.map((p) => p.mediaId));
    const renderBand = bandPlates(band, 'render', new Set(onCard));
    const threedBand = bandPlates(band, 'threed', new Set(onCard));
    return {
      flat: { plates: mark(flat), filteredToSelected: false, serverStates: true },
      render: {
        plates: mark([...plates.filter((p) => of(p) === 'render'), ...renderBand.plates]),
        filteredToSelected: renderBand.filteredToSelected,
        serverStates: renderBand.serverStates,
      },
      threed: {
        plates: mark([...plates.filter((p) => of(p) === 'threed'), ...threedBand.plates]),
        filteredToSelected: threedBand.filteredToSelected,
        serverStates: threedBand.serverStates,
      },
    };
  }, [plates, band, runKinds, cardKindOf, chosenMedia]);

  const [selected, setSelected] = useState<number | null>(null);
  const [mintOrigin, setMintOrigin] = useState<MintOrigin | null>(null);
  /** Which representation is on screen. `flat` is the default because the SHEET is made of flats. */
  const [kind, setKind] = useState<ArtifactKind>('flat');
  /** The «replace the sheet with a file» explanation — a procedure, not a button. */
  const [replacing, setReplacing] = useState(false);
  /** Which frozen composition is on screen. 0 = the document, which is the default and the point. */
  const [inspecting, setInspecting] = useState(0);
  /** The drawing editor, as a modal over this tab. */
  const [drawing, setDrawing] = useState(false);
  /** The plate whose detach is waiting on a human, because callouts stand on it. */
  const [detaching, setDetaching] = useState<DocumentPlate | null>(null);

  const versionNumbers = useMemo(
    () => [...(band.versionNumbers ?? [])].sort((a, b) => b - a),
    [band.versionNumbers],
  );
  const latest = band.latestVersion?.versionNumber ?? 0;
  const hasVersions = versionNumbers.length > 0 || latest > 0;

  const frozen = useDesignSheetVersion(
    techCardId,
    inspecting > 0 && inspecting !== latest ? inspecting : undefined,
  );
  const shownVersion =
    inspecting === 0
      ? undefined
      : inspecting === latest
        ? band.latestVersion
        : frozen.data?.version;

  const frozenPlates: DocumentPlate[] = useMemo(() => {
    const source = shownVersion?.plates ?? [];
    return source.map((plate, i) => ({
      key: `frozen-${i}`,
      name:
        (plate.detailName ?? '').trim() ||
        VIEW_LABELS[plate.viewKey ?? ''] ||
        (plate.viewKey ?? 'plate'),
      mediaId: plate.media?.id ?? 0,
      media: plate.media,
      origin: 'card' as const,
      note: (plate.contentHash ?? '').trim()
        ? `froze ${(plate.contentHash ?? '').slice(0, 8)}`
        : 'no hash — predates 0336',
    }));
  }, [shownVersion]);

  /**
   * A FROZEN VERSION HAS NO REPRESENTATIONS TO SWITCH BETWEEN. It froze a composition of flats and
   * that is all it is; offering «renders» over it would draw a segment that could only ever be
   * empty and would read as a defect. So inspecting a version drops back to the frozen list whole.
   */
  const segment = segments[kind];
  const onScreen = inspecting === 0 ? segment.plates : frozenPlates;

  /**
   * ═══ THE DRAWING EDITOR, AND WHY IT IS MOUNTED HERE AND NOT IN THE STUDIO ════════════════════
   *
   * Placing a callout, moving it and drawing its shape (arrow, arc, dashed, filled) live in ONE
   * component — `SketchTab` — and it is mounted here, over the ARTIFACTS document, as a modal.
   *
   * NOT IN THE STUDIO, and the reason is mechanical rather than a matter of taste. `useMoodCallouts`
   * (`design/mood-callouts.tsx`) holds the single `useFieldArray` over `callouts` in the whole
   * studio tree, and `SketchTab` holds one of its own. In react-hook-form 7.62 the array mutators do
   * not emit `_subjects.array`, so two instances over one name do not synchronise — the second loses
   * the first's rows silently. This tab has NO field array over `callouts` at all (the panel writes
   * leaf paths by index), so mounting the editor here creates no second instance of anything.
   *
   * The tabs are mounted CONDITIONALLY on `activeTab` in the page, so the studio's array and this
   * editor's array are never alive at the same time either.
   */
  const editorCard = techCard ?? card;
  const canDraw = !!calloutHistory && !!editorCard;
  const drawInert =
    inspecting > 0
      ? `v${inspecting} is a record of what was minted — switch to “the document” to draw`
      : 'the drawing editor was not handed to this screen: it needs the loaded card and the form’s undo history';

  /** How many callouts stand on a plate — the number the confirmation has to say out loud. */
  const calloutsOn = (mediaId: number) =>
    callouts.filter((c) => (c.mediaId ?? 0) === mediaId).length;

  /**
   * TAKE A PLATE OFF THE DOCUMENT — the rule carried over WORD FOR WORD from `removeMedia` in
   * `sketch-tab.tsx`, which was the only place that could do this while the sketch tab existed.
   *
   * THE TEXT OF A CALLOUT SURVIVES THE PICTURE: a person wrote it, and it is what the server takes a
   * cut piece's name from. THE ANCHOR DOES NOT. `pos_x/pos_y` and `points` are fractions of a FRAME,
   * and a fraction only means something on its own picture — carried onto another plate the shape
   * would land somewhere else entirely and look perfectly normal doing it.
   *
   * THE ARRAY IS WRITTEN AT ITS ROOT, never through a field-array mutator. That is the convention of
   * these files and it exists because the mutators do not broadcast; a root `setValue` does, so
   * every other reader of the path re-syncs. The callout fields below are LEAF writes on a dotted
   * path, which touch no array identity at all.
   */
  function detachPlate(plate: DocumentPlate) {
    const media = form.getValues('technicalMedia') ?? [];
    form.setValue(
      'technicalMedia',
      media.filter((m) => (m.mediaId ?? 0) !== plate.mediaId),
      { shouldDirty: true },
    );
    const cs = form.getValues('callouts') ?? [];
    cs.forEach((c, index) => {
      if ((c.mediaId ?? 0) !== plate.mediaId) return;
      form.setValue(`callouts.${index}.mediaId`, 0, { shouldDirty: true });
      form.setValue(`callouts.${index}.posX`, '', { shouldDirty: true });
      form.setValue(`callouts.${index}.posY`, '', { shouldDirty: true });
      form.setValue(`callouts.${index}.kind`, 'pin', { shouldDirty: true });
      form.setValue(`callouts.${index}.points`, [], { shouldDirty: true });
    });
  }

  /** Silent when nothing is pinned; a question naming the COUNT when something is. */
  function askDetach(plate: DocumentPlate) {
    if (calloutsOn(plate.mediaId) === 0) {
      detachPlate(plate);
      return;
    }
    setDetaching(plate);
  }

  const detachInert =
    inspecting > 0
      ? `v${inspecting} is a record of what was minted — nothing on this tab edits it`
      : 'the card is released: its sheet is frozen';

  /**
   * ═══ TAKE A GENERATED PICTURE ONTO THE CARD — the verb the switcher needs (W-14) ════════════
   *
   * A callout's `media_id` addresses the card's OWN media, and the drawing editor resolves it
   * through `resolvedTechnicalMedia`. So a render that lives only in the band cannot carry a
   * callout: it has to become part of the card first, and that is a decision a person makes, not a
   * side effect of looking at it.
   *
   * `kind=RENDER` IS THE CARD'S OWN WORD FOR IT, and it means what the contract says it means: «an
   * ACCEPTED render — one that leaves the studio and goes out with the card». A turntable frame
   * accepted here is filed under the same kind because the card's vocabulary HAS NO 3D MEMBER; the
   * segment it appears in afterwards is still right, because the segment is read off the RUN that
   * produced the picture and not off the card's label. Said plainly on the button's own row.
   *
   * WRITTEN AT THE ROOT OF THE ARRAY, never through a field-array mutator — the convention of these
   * files, and the reason is that the mutators do not broadcast while a root `setValue` does.
   */
  function takeIntoCard(plate: DocumentPlate) {
    const media = form.getValues('technicalMedia') ?? [];
    if (media.some((m) => (m.mediaId ?? 0) === plate.mediaId)) return;
    form.setValue(
      'technicalMedia',
      [...media, { mediaId: plate.mediaId, kind: 'TECH_CARD_MEDIA_KIND_RENDER', caption: '' }],
      { shouldDirty: true },
    );
    showMessage(
      'taken into the card’s media — it is not on the technical sheet, and callouts drawn on it are not either',
      'success',
    );
  }

  /**
   * ═══ `download SVG` — THE SHEET AS ONE FILE ═════════════════════════════════════════════════
   *
   * EXPORTS THE FLATS AND THEIR CALLOUTS, whatever segment is on screen, and that is deliberate.
   * The sheet IS the flats — the mint composes it from them and nothing else — so an export that
   * followed the switcher would produce a file called «sheet» containing three turntable frames.
   * The button says which composition it took.
   */
  const exportPlates: DocumentPlate[] =
    inspecting === 0 ? segments.flat.plates : frozenPlates;

  const downloadSheet = async () => {
    // READ THROUGH `getValues`, NOT THROUGH THE WATCHED LIST. `callouts` above is narrowed to
    // `CalloutLike`, which carries only the fields the rest of this tab writes — the SHAPE
    // (`kind`, `points`, `dashed`, `filled`, `color`) is on the form row and is exactly what the
    // export must not lose. A cast would have compiled and shipped pins where arrows were drawn.
    const rows = (form.getValues('callouts') ?? []) as SheetCallout[];
    const svgPlates: SheetSvgPlate[] = exportPlates.map((plate) => ({
      name: plate.name,
      url:
        plate.media?.media?.fullSize?.mediaUrl ||
        plate.media?.media?.compressed?.mediaUrl ||
        plate.media?.media?.thumbnail?.mediaUrl ||
        '',
      callouts: rows
        .map((c, index) => ({ c, index }))
        .filter(({ c }) => (c.mediaId ?? 0) === plate.mediaId)
        .map(({ c, index }) => {
          const px = Number(c.posX ?? '');
          const py = Number(c.posY ?? '');
          return {
            number: c.number || index + 1,
            kind: c.kind ?? 'pin',
            points: (c.points ?? []).map((p) => ({
              x: Number(p.x ?? '') || 0,
              y: Number(p.y ?? '') || 0,
            })),
            label: {
              x: Number.isFinite(px) ? px : 0.5,
              y: Number.isFinite(py) ? py : 0.5,
            },
            hasText: !!(c.description ?? '').trim(),
            color: c.color ?? '',
            dashed: !!c.dashed,
            filled: !!c.filled,
          };
        }),
    }));

    const style = (card?.techCard?.styleNumber ?? '').trim() || `card-${techCardId}`;
    const version = inspecting === 0 ? (latest ? `v${latest}` : 'draft') : `v${inspecting}`;
    const pinned = svgPlates.reduce((n, p) => n + p.callouts.length, 0);
    try {
      const markup = await buildSheetSvg({
        title: `${style} · sheet ${version} · ${pinned} callout${pinned === 1 ? '' : 's'}`,
        plates: svgPlates,
      });
      downloadSvg(`${style}-sheet-${version}.svg`, markup);
    } catch (error) {
      showMessage(
        `the sheet could not be written: ${(error as Error)?.message || 'unknown failure'}`,
        'error',
      );
    }
  };

  /** Приколотая выноска стоит на картинке; у откреплённой `media_id` равен нулю. */
  const pinnedCount = callouts.filter((c) => (c.mediaId ?? 0) > 0).length;
  const strayCount = callouts.length - pinnedCount;

  /** Read once, so the question and the act cannot disagree about how many are at stake. */
  const detachCount = detaching ? calloutsOn(detaching.mediaId) : 0;

  return (
    <SectionStack>
      {/* ─── STOREY (a): THE DOCUMENT ─────────────────────────────────────────────────────── */}
      <SectionStack row>
        <Section
          title={inspecting === 0 ? 'the sheet' : `sheet v${inspecting} — frozen`}
          question={
            inspecting === 0
              ? '— the document as it stands; every change here is saved by the card’s own Save'
              : '— the composition this version pinned; nothing on this tab edits it'
          }
          action={
            hasVersions ? (
              <ChipRow>
                <Chip
                  selected={inspecting === 0}
                  pressed={inspecting === 0}
                  onClick={() => setInspecting(0)}
                >
                  the document
                </Chip>
                {versionNumbers.map((n) => (
                  <Chip
                    key={n}
                    selected={inspecting === n}
                    pressed={inspecting === n}
                    onClick={() => setInspecting(n)}
                  >
                    v{n}
                  </Chip>
                ))}
              </ChipRow>
            ) : undefined
          }
          className='min-w-0 flex-1'
        >
          {inspecting === 0 && (
            <>
              {/* THE SWITCH IS A `lead`, NOT AN `action`. It belongs to the label it sits beside, so
                  its position must not depend on how wide the block happens to be in the current
                  layout — the version chips already own the right edge of the header above. */}
              <GroupLabel
                flush
                lead={
                  <ViewSwitch<ArtifactKind>
                    label='representation'
                    value={kind}
                    options={ARTIFACT_KINDS}
                    onChange={setKind}
                  />
                }
                action={
                  <Text size='micro' variant='label' component='span'>
                    {segment.plates.length} picture{segment.plates.length === 1 ? '' : 's'}
                    {kind !== 'flat' &&
                      (segment.filteredToSelected
                        ? ' · the chosen ones'
                        : ' · everything on this page')}
                  </Text>
                }
              >
                what you are marking up
              </GroupLabel>

              <SheetMembershipWarning
                kind={kind}
                filteredToSelected={segment.filteredToSelected}
                serverStates={segment.serverStates}
                hasPictures={segment.plates.length > 0}
              />
            </>
          )}

          {onScreen.length === 0 ? (
            kind === 'flat' || inspecting > 0 ? (
              <EmptyDocument
                bench={bench}
                disabled={disabled}
                onDraw={inspecting === 0 && canDraw ? () => setDrawing(true) : undefined}
                drawInert={drawInert}
              />
            ) : (
              <Text size='micro' variant='label' component='p'>
                nothing of this kind on the loaded page of the band.{' '}
                {kind === 'render'
                  ? 'A fabric render is made on STUDIO, from the flats standing in the bench slots.'
                  : 'A turntable is made on STUDIO, and it turns the renders — so the renders come first.'}
              </Text>
            )
          ) : (
            <PlateGrid
              plates={onScreen}
              callouts={inspecting === 0 ? callouts : []}
              selected={inspecting === 0 ? selected : null}
              onSelect={setSelected}
              disabled={disabled}
              onDraw={inspecting === 0 && canDraw ? () => setDrawing(true) : undefined}
              drawInert={drawInert}
              onDetach={inspecting === 0 && !disabled ? askDetach : undefined}
              detachInert={detachInert}
              onTakeIn={inspecting === 0 && !disabled ? takeIntoCard : undefined}
              offSheet={kind !== 'flat'}
            />
          )}

          {/* ─── THE TWO DOORS OF THE DOCUMENT ITSELF ─────────────────────────────────────── */}
          <div className='flex flex-wrap items-center gap-1.5 pt-1'>
            {exportPlates.length ? (
              <Button variant='secondary' size='sm' onClick={downloadSheet}>
                download SVG
              </Button>
            ) : (
              <InertDoor
                label='download SVG'
                reason='there is nothing on the sheet to write: no flat plate stands on this card yet'
              />
            )}
            <Button variant='secondary' size='sm' onClick={() => setReplacing(true)}>
              replace the sheet with a file ▸
            </Button>
            <Text size='nano' variant='label' component='span' className='min-w-0 normal-case'>
              the file carries the <b>flats</b> and the callouts standing on them — {exportPlates.length}{' '}
              plate{exportPlates.length === 1 ? '' : 's'} — whichever representation is on screen,
              because the sheet is made of flats. Pictures are LINKED by address, not embedded.
            </Text>
          </div>

          {inspecting > 0 && (
            <CalloutBox tone='note'>
              <Text size='micro' component='p'>
                <b>v{inspecting} as it was minted.</b> A version freezes the COMPOSITION — which
                pictures are on the sheet.{' '}
                {versionShortHash(shownVersion) && (
                  <>
                    Its first plate pinned bytes <code>{versionShortHash(shownVersion)}</code>.{' '}
                  </>
                )}
                The callouts are not frozen: printing v{inspecting} prints the callouts the card
                holds now, which is why fixing a note never needs a new version.
              </Text>
            </CalloutBox>
          )}
        </Section>

        <Section
          title='callouts'
          question='— a number is minted once and never reused'
          action={
            /* СЧИТАЮТСЯ ПРИКОЛОТЫЕ, А НЕ ВСЕ. `callouts.length` под подписью «on the sheet» врал:
               выноска с `media_id = 0` ни на каком листе не стоит, и соседняя строка тут же метит
               её `unpinned`. Раньше такие приезжали только из старых карточек, теперь их создаёт
               открепление плиты — то есть ложь стала частой. Открепившиеся названы отдельно. */
            <ChipRow>
              <Pill tone='mut'>{pinnedCount} on the sheet</Pill>
              {strayCount > 0 && <Pill tone='warn'>{strayCount} unpinned</Pill>}
            </ChipRow>
          }
          className='lg:w-[340px] lg:shrink-0'
        >
          <CalloutPanel
            callouts={callouts}
            plates={plates}
            selected={selected}
            onSelect={setSelected}
            disabled={disabled || inspecting > 0}
            onDraw={inspecting === 0 && canDraw ? () => setDrawing(true) : undefined}
            drawInert={drawInert}
          />
        </Section>
      </SectionStack>

      {/* ─── STOREY (b): THE VERSIONS ─────────────────────────────────────────────────────── */}
      {hasVersions ? (
        <>
          {diverged && (
            <Section
              title={`differs from v${latest}`}
              question='— the composition has moved on; the paper has not'
              action={
                <Pill tone='attention'>
                  {diverged.length} change{diverged.length === 1 ? '' : 's'}
                </Pill>
              }
            >
              <Text size='micro' component='p'>
                <b>{diverged.join(', ').toLowerCase()}</b> — pieces and print stay on v{latest}{' '}
                until a new version is minted. Nothing here is broken: a version is born of an act,
                so v{latest + 1} appears when somebody prints or releases, not when a picture
                changes.
              </Text>
              <div>
                <GroupLabel>v{latest} → the bench</GroupLabel>
                <DiffRows version={band.latestVersion} bench={bench} />
              </div>
              <PrintSheetButton
                techCardId={techCardId}
                band={band}
                diverged={diverged}
                disabled={disabled}
                onMintFirst={setMintOrigin}
              />
            </Section>
          )}

          <SectionStack row>
            <Section
              title={`v${latest}`}
              question={
                <>
                  — minted by {(band.latestVersion?.mintedBy ?? '').trim() || '—'}{' '}
                  {clockStamp(band.latestVersion?.mintedAt)}
                  {band.latestVersion?.mintedVia ? ` · via ${band.latestVersion.mintedVia}` : ''}
                  {band.latestVersion?.mixedConsent ? ' · mixed composition accepted' : ''}
                </>
              }
              action={
                <PrintSheetButton
                  techCardId={techCardId}
                  band={band}
                  diverged={diverged}
                  disabled={disabled}
                  onMintFirst={setMintOrigin}
                />
              }
              className='min-w-0 flex-1'
            >
              <Row
                label={
                  <Text size='micro' component='span'>
                    versions minted
                  </Text>
                }
                value={versionNumbers.length}
              />
              <Row
                label={
                  <Text size='micro' component='span'>
                    plates frozen in v{latest}
                  </Text>
                }
                value={band.latestVersion?.plates?.length ?? 0}
              />
              <Text size='micro' variant='label' component='p'>
                No QR is printed in this wave. There is no public viewer behind one yet, and paper
                carrying a code that answers nothing dies silently on the shop floor — so the sheet
                carries its version number instead.
              </Text>
            </Section>

            <Section
              title='journal'
              question='— what left the building, and when'
              className='lg:w-[340px] lg:shrink-0'
            >
              <SheetJournal journal={band.journal} />
              <Text size='nano' variant='label' component='p' className='uppercase'>
                a reprint is a line here, never a new version
              </Text>
            </Section>
          </SectionStack>
        </>
      ) : (
        <NoVersionsYet
          bench={bench}
          plates={plates}
          disabled={disabled}
          onMint={setMintOrigin}
          say={showMessage}
        />
      )}

      {!host && (
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>the mint is not wired to this card’s save path.</b> A version is written by the same
            transaction that saves the document, so it cannot be minted until this tab is mounted
            inside <code>DesignSaveHostProvider</code>. Everything above works; only minting does
            not.
          </Text>
        </CalloutBox>
      )}

      {mintOrigin && (
        <MintDialog
          open
          onOpenChange={(open) => !open && setMintOrigin(null)}
          techCardId={techCardId}
          band={band}
          origin={mintOrigin}
          disabled={disabled}
          onMinted={() => setInspecting(0)}
        />
      )}

      {/* THE DRAWING EDITOR. A modal is its own surface, so it is not wrapped in a `Section` — but
          `SketchTab` IS a block, and a block belongs on the grey ground rather than on the modal's
          white stock, which is what the bleeding wrapper is for. Same arrangement as the page it
          used to live on: ground behind, one white block on it. */}
      {drawing && calloutHistory && editorCard && (
        <ConfirmationModal
          open
          onOpenChange={(open) => !open && setDrawing(false)}
          onConfirm={() => setDrawing(false)}
          hideActions
          width='lg'
          title='draw on the technical sheet'
        >
          <div className='-m-2.5 bg-pageBg p-2.5'>
            <SketchTab
              techCard={editorCard}
              view='sketch'
              active
              frozen={!!disabled}
              calloutHistory={calloutHistory}
            />
          </div>
        </ConfirmationModal>
      )}

      {/* ═══ «REPLACE THE SHEET WITH A FILE» — A PROCEDURE, EXPLAINED, NOT A BUTTON THAT DOES IT ══
          The prototype's own modal of this name explains rather than acts, and this build keeps the
          division for a reason it can state exactly: replacing the picture under a sheet means every
          callout on it has to be WALKED to a new address by hand. `pos_x/pos_y` and `points` are
          fractions of a FRAME; carried onto a different drawing they land somewhere else entirely
          and look perfectly normal doing it. A one-press «replace» would therefore either lose the
          markup or silently misplace it, and the second is worse. What this admin already has is
          the honest version of the same walk, spread over controls that each do one thing. */}
      {replacing && (
        <ConfirmationModal
          open
          onOpenChange={(open) => !open && setReplacing(false)}
          onConfirm={() => setReplacing(false)}
          title='replace the sheet with a file'
          confirmLabel='close'
          cancelLabel='close'
          width='md'
        >
          <div className='space-y-stack'>
            <Text size='micro' component='p'>
              There is no single «replace» here, and that is deliberate. A callout stores its
              position as a <b>fraction of its own picture</b>. Swap the picture underneath it and
              the marker keeps the fraction: it lands somewhere else on the garment and looks
              entirely normal doing it. So the exchange is done as three visible acts instead of one
              invisible one.
            </Text>
            <div>
              <GroupLabel>the walk</GroupLabel>
              <Row
                label={<Text size='micro' component='span'>1 · bring the file in</Text>}
                value={<Text size='micro' component='span'>uploads shelf on STUDIO</Text>}
              />
              <Row
                label={<Text size='micro' component='span'>2 · put it in the slot it replaces</Text>}
                value={<Text size='micro' component='span'>the bench, same view</Text>}
              />
              <Row
                label={<Text size='micro' component='span'>3 · move the callouts across</Text>}
                value={<Text size='micro' component='span'>detach here, re-pin in the editor</Text>}
              />
            </div>
            <Text size='micro' component='p'>
              <b>Detaching keeps the text and the number</b> and drops only the anchor — the
              callouts reappear in the list beside the sheet marked <b>unpinned</b>, and the drawing
              editor lists them under «callouts without an image», where each is put back on the new
              plate <b>keeping its number</b>. Nothing is renumbered and nothing is lost; what it
              costs is one deliberate click per callout, which is the price of not misplacing them.
            </Text>
          </div>
        </ConfirmationModal>
      )}

      {detaching && (
        <ConfirmationModal
          open
          onOpenChange={(open) => !open && setDetaching(null)}
          onConfirm={() => detachPlate(detaching)}
          title={`take ${detaching.name} off the sheet`}
          confirmLabel='take it off'
          width='sm'
        >
          <div className='space-y-stack'>
            <Text size='micro' component='p'>
              <b>
                {detachCount} callout{detachCount === 1 ? '' : 's'} stand
                {detachCount === 1 ? 's' : ''} on this plate.
              </b>{' '}
              Their TEXT is kept — a person wrote it and it outlives the picture, and the server
              takes a cut piece’s name from it. What goes is the anchor: the marker, its position
              and any shape drawn on it, because a fraction of a frame only means something on its
              own picture.
            </Text>
            <Text size='micro' component='p'>
              They stay in the callout list beside the sheet, marked <b>unpinned</b>, and the
              drawing editor lists them under “callouts without an image” — where each can be put
              back on another plate KEEPING ITS NUMBER, or deleted.
            </Text>
          </div>
        </ConfirmationModal>
      )}
    </SectionStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ═══ SAID BEFORE THE PENCIL IS PICKED UP, NOT AFTER ═══════════════════════════════════════════
 *
 * THE DEFECT THIS EXISTS TO PREVENT. The technical sheet is composed of FLATS ONLY: the mint takes
 * the bench's flat plates and nothing else, and the server's `freezeCallouts` then keeps the
 * callouts that stand ON THOSE PLATES — SILENTLY DROPPING every other one. So a person who opens
 * ARTIFACTS, switches to «renders», carefully annotates a fabric render and mints a version gets a
 * sheet with none of that work on it, no error, no warning, and no line in the journal saying
 * anything went missing. The annotation is not corrupted; it simply is not there.
 *
 * WHY IT IS A BLUE BOX AND NOT A GREY FOOTNOTE. This is the mid-flight, needs-a-human tone of the
 * system, and it is the correct one: nothing is broken, and the person is not doing anything wrong
 * — annotating a render is a perfectly good thing to do, it just does not reach paper. Red would
 * claim a fault; a grey hint at the bottom of the block would be read after the drawing, which is
 * exactly too late. It sits ABOVE the pictures, tied to the representation that is on screen.
 *
 * IT IS NOT SHOWN ON `flat`, and that is the point of tying it to the kind: a warning that is
 * always on screen is furniture, and furniture is not read.
 */
function SheetMembershipWarning({
  kind,
  filteredToSelected,
  serverStates,
  hasPictures,
}: {
  kind: ArtifactKind;
  filteredToSelected: boolean;
  serverStates: boolean;
  hasPictures: boolean;
}): JSX.Element | null {
  if (kind === 'flat') return null;
  const what = kind === 'render' ? 'a fabric render' : 'a turntable frame';
  return (
    <CalloutBox tone='warning'>
      <Text size='micro' component='p'>
        <b>callouts drawn here do not reach the technical sheet.</b> The sheet is composed of{' '}
        <b>flats</b> and nothing else — the mint takes the bench’s flat plates, and the freeze then
        keeps only the callouts standing on them. A callout you place on {what} stays on the card
        and stays in the list beside this block, but it is <b>silently left out</b> of every version
        minted from now on, and no message says so at the time. Mark up {what} for the studio and
        for yourself; mark up the <b>flats</b> for the factory.
      </Text>
      {/* THE PROVENANCE OF THE LIST IS ONLY WORTH A SENTENCE WHEN THERE IS A LIST. With nothing of
          this kind on the page, «nothing is marked as chosen» and «this server does not state the
          mark» are both true and both useless — and the second one names a server defect that may
          not exist, because an empty page gives nothing to sample the flag from. */}
      {hasPictures && !filteredToSelected && (
        <Text size='nano' variant='label' component='p' className='mt-1 normal-case'>
          {serverStates
            ? 'Nothing of this kind is marked as chosen on this card, so the segment lists every one on the loaded page. The mark is read here and set elsewhere — no verb writes it yet.'
            : 'This server does not state the mark at all — a binary older than the field — so the segment lists every picture of this kind on the loaded page.'}
        </Text>
      )}
    </CalloutBox>
  );
}

/**
 * The plates, with their numbered markers on them.
 *
 * THE FRAME IS CUT TO THE PICTURE'S OWN PROPORTIONS, and that is not a nicety. A callout stores
 * `pos_x` / `pos_y` as fractions of the picture. Put that picture in a frame of a different ratio —
 * letterboxed by `object-contain`, or cropped by `object-cover` — and the same fraction lands in a
 * different place on the garment: the marker drifts off the seam it was pinned to, and nothing on
 * screen admits it. So the box takes its aspect ratio from the media's own width and height, and
 * the image fills it exactly.
 *
 * A picture whose dimensions the server did not state gets no markers rather than markers in the
 * wrong place — an absent mark is a gap, a misplaced one is a lie.
 *
 * EVERY PLATE CARRIES ITS TWO DOORS, and a door that cannot act is DRAWN INERT WITH ITS REASON
 * rather than omitted. Absence teaches that the flow does not exist; a dead control with a reason
 * teaches which of the four true things is in the way — a frozen version, a released card, a bench
 * plate that is not on the document yet, or a screen mounted without the editor.
 */
function PlateGrid({
  plates,
  callouts,
  selected,
  onSelect,
  disabled,
  onDraw,
  drawInert,
  onDetach,
  detachInert,
  onTakeIn,
  offSheet,
}: {
  plates: DocumentPlate[];
  callouts: CalloutLike[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  disabled?: boolean;
  /** Open the drawing editor, or `undefined` — and then `drawInert` says why not. */
  onDraw?: () => void;
  drawInert: string;
  /** Take a plate off the document, or `undefined` — and then `detachInert` says why not. */
  onDetach?: (plate: DocumentPlate) => void;
  detachInert: string;
  /** Put a run's output into the card's own media, so a callout can address it at all. */
  onTakeIn?: (plate: DocumentPlate) => void;
  /** This segment is not what the sheet is made of — every plate says so on its own face. */
  offSheet?: boolean;
}) {
  return (
    <div className='grid gap-2 sm:grid-cols-2 lg:grid-cols-3'>
      {plates.map((plate) => {
        const info = plate.media?.media?.fullSize ?? plate.media?.media?.thumbnail;
        const url = plate.media?.media?.thumbnail?.mediaUrl ?? info?.mediaUrl ?? '';
        const w = info?.width ?? 0;
        const h = info?.height ?? 0;
        const ratioKnown = w > 0 && h > 0;
        const mine = callouts
          .map((c, index) => ({ c, index }))
          .filter(({ c }) => (c.mediaId ?? 0) === plate.mediaId);

        // Neither a bench plate nor a run's output is in `technicalMedia`, so neither door can
        // honestly act on them — but for DIFFERENT reasons, and only one of the two has a way out
        // that lives on this tab, which is why the reasons are separate strings.
        const drawReason = !onDraw
          ? drawInert
          : plate.origin === 'bench'
            ? BENCH_PLATE_NOT_ON_DOCUMENT
            : plate.origin === 'run'
              ? RUN_PLATE_NOT_ON_CARD
              : null;
        const detachReason = !onDetach
          ? detachInert
          : plate.origin === 'bench'
            ? BENCH_PLATE_DETACH
            : plate.origin === 'run'
              ? 'this picture is not in the card’s media, so there is nothing here to take off'
              : null;

        return (
          <div
            key={plate.key}
            data-field={plate.door}
            className='min-w-0 border border-borderColor p-1'
          >
            <div className='flex items-baseline gap-1.5'>
              <Text
                size='nano'
                variant='uppercase'
                tracking='label'
                component='span'
                className='min-w-0 truncate'
              >
                {plate.name}
              </Text>
              {plate.origin === 'bench' && <Pill tone='mut'>bench</Pill>}
              {plate.origin === 'run' && <Pill tone='mut'>not on the card</Pill>}
              {plate.chosen && <Pill tone='ok'>chosen</Pill>}
              {/* THE PLATE SAYS IT ITSELF, not only the box above the grid. The warning is read
                  once, on arrival; the badge is on screen for as long as the picture is, and it is
                  what a person sees when they come back to this tab an hour later. */}
              {offSheet && <Pill tone='attention'>not on the sheet</Pill>}
              <Text size='nano' variant='label' component='span' className='ml-auto shrink-0'>
                {mine.length || ''}
              </Text>
            </div>

            <div
              className='relative mt-1 w-full bg-bgSecondary'
              style={{ aspectRatio: ratioKnown ? `${w} / ${h}` : '4 / 5' }}
            >
              {url ? (
                <img src={url} alt={plate.name} className='block h-full w-full' loading='lazy' />
              ) : (
                <div className='flex h-full w-full items-center justify-center'>
                  <Text size='nano' variant='label' component='span' className='uppercase'>
                    media {plate.mediaId}
                  </Text>
                </div>
              )}

              {ratioKnown &&
                mine.map(({ c, index }) => {
                  const x = Number(c.posX ?? '');
                  const y = Number(c.posY ?? '');
                  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                  const active = selected === index;
                  return (
                    <button
                      key={index}
                      type='button'
                      disabled={disabled}
                      onClick={() => onSelect(active ? null : index)}
                      title={(c.description ?? '').trim() || 'no text'}
                      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                      className={cn(
                        'absolute flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center border text-nano',
                        active
                          ? 'border-textColor bg-textColor text-bgColor'
                          : 'border-textColor bg-bgColor text-textColor',
                      )}
                    >
                      {c.number || '·'}
                    </button>
                  );
                })}
            </div>

            <Text size='nano' variant='label' component='p' className='mt-1 truncate'>
              {plate.note ?? (ratioKnown ? `${w}×${h}` : 'dimensions unknown — markers not drawn')}
            </Text>

            <div className='mt-1 flex flex-wrap items-center gap-1'>
              {plate.origin === 'run' &&
                (onTakeIn ? (
                  <Button
                    variant='secondary'
                    size='xs'
                    onClick={() => onTakeIn(plate)}
                    title='put this picture into the card’s own media, so a callout can address it'
                  >
                    take into the card’s media ▸
                  </Button>
                ) : (
                  <InertDoor
                    label='take into the card’s media ▸'
                    reason='this card is read-only for you, or a frozen version is on screen — taking a picture onto the card is an edit of the card'
                  />
                ))}
              {drawReason ? (
                <InertDoor label='draw ▸' reason={drawReason} />
              ) : (
                <Button
                  variant='secondary'
                  size='xs'
                  onClick={onDraw}
                  title='place, move and shape callouts on the pictures the document lists'
                >
                  draw ▸
                </Button>
              )}
              {detachReason ? (
                <InertDoor label='detach' reason={detachReason} />
              ) : (
                <Button
                  variant='secondary'
                  size='xs'
                  onClick={() => onDetach?.(plate)}
                  title='take this picture off the sheet — the callouts on it keep their text'
                >
                  detach
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The callout panel — and ONE EDIT ON SCREEN AT A TIME, which is the invariant this component
 * exists to hold. Every row is a line; the selected one, and only it, opens its fields. Two open
 * editors on one sheet is how a person types into the wrong callout.
 *
 * WHAT IS WRITTEN HERE AND WHAT IS NOT.
 * Writes are LEAF writes on a dotted path — `callouts.3.description` — which is the same mechanism
 * the drawing editor uses for the same fields. They touch no array identity, so they cannot
 * desynchronise the `useFieldArray` instances that other organs hold over `callouts`; the ROOT
 * write (`setValue('callouts', next)`) is the one that re-syncs them, and this panel never needs it
 * because it never adds, removes or reorders. Drawing geometry, minting a new callout and deleting
 * one stay with the annotator — which now opens as a modal over this very tab, so the door on each
 * row leads somewhere instead of naming a place.
 */
function CalloutPanel({
  callouts,
  plates,
  selected,
  onSelect,
  disabled,
  onDraw,
  drawInert,
}: {
  callouts: CalloutLike[];
  plates: DocumentPlate[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  disabled?: boolean;
  /** Open the drawing editor, or `undefined` — and then `drawInert` says why not. */
  onDraw?: () => void;
  drawInert: string;
}) {
  const form = useFormContext<TechCardFormData>();
  const plateName = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of plates) map.set(p.mediaId, p.name);
    return map;
  }, [plates]);

  if (callouts.length === 0) {
    return (
      <Text size='micro' variant='label' component='p'>
        none yet. A callout is placed on the picture itself — press <b>draw ▸</b> on a plate above,
        arm a kind and click the picture; it appears here the moment it exists.
      </Text>
    );
  }

  const write = (index: number, field: 'description' | 'part' | 'dimensions', value: string) => {
    form.setValue(`callouts.${index}.${field}` as const, value, { shouldDirty: true });
  };

  return (
    <div>
      {callouts.map((c, index) => {
        const open = selected === index;
        const anchored = (c.mediaId ?? 0) > 0;
        const where = anchored ? plateName.get(c.mediaId ?? 0) : null;
        return (
          <div key={index} className='border-b border-hairline py-1'>
            <div className='flex items-center gap-2'>
              <Text size='nano' variant='uppercase' component='span' className='w-5 shrink-0'>
                {c.number || '—'}
              </Text>
              <button
                type='button'
                onClick={() => onSelect(open ? null : index)}
                aria-expanded={open}
                className='min-w-0 flex-1 cursor-pointer text-left'
              >
                <Text size='micro' component='span' className='block truncate'>
                  {(c.description ?? '').trim() || (c.part ?? '').trim() || 'no text'}
                </Text>
              </button>
              {anchored && where ? (
                <Pill tone='mut'>{where}</Pill>
              ) : anchored ? (
                <Pill tone='warn'>off the sheet</Pill>
              ) : (
                <Pill tone='mut'>unpinned</Pill>
              )}
            </div>

            {open && (
              <div
                className='mt-1 space-y-1'
                // The canonical anchor for this callout, so a server refusal naming the field walks
                // here. THE ONLY ONE: the annotation editor stamps no `data-field` of its own, so
                // this row is where `revealField('callouts.N.description')` lands, and it is on the
                // tab the editor now opens over.
                data-field={`callouts.${index}.description`}
              >
                {/* CONTROLLED, NOT DEFAULT-VALUED, and the difference is a bug that would only
                    show up after a successful save. The page resets the form to what the SERVER
                    returned (`form.reset(settled.values)` — and the mint does the same), and an
                    uncontrolled field keeps whatever was typed into it: the screen would go on
                    showing a note the card no longer holds, with nothing saying so. The value is
                    read back through the same `useWatch` that feeds this list, so a draft restore
                    and an undo land here too. */}
                <Textarea
                  name={`artifacts-callout-${index}-description`}
                  value={c.description ?? ''}
                  disabled={disabled}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    write(index, 'description', e.target.value)
                  }
                />
                <div className='flex gap-1'>
                  <Input
                    name={`artifacts-callout-${index}-part`}
                    value={c.part ?? ''}
                    disabled={disabled}
                    placeholder='part'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      write(index, 'part', e.target.value)
                    }
                  />
                  <Input
                    name={`artifacts-callout-${index}-dimensions`}
                    value={c.dimensions ?? ''}
                    disabled={disabled}
                    placeholder='dimensions'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      write(index, 'dimensions', e.target.value)
                    }
                  />
                </div>
                <div className='flex flex-wrap items-center gap-1.5'>
                  {/* THE SAME MODAL THE PLATES OPEN. It used to be `openDoor`, which is a DOM walk
                      to `[data-field]` — and on this tab the nearest such anchor is the row the
                      person is already looking at, so the door pulsed itself and led nowhere. */}
                  {onDraw ? (
                    <Button variant='secondary' size='xs' onClick={onDraw}>
                      draw / move / delete
                    </Button>
                  ) : (
                    <InertDoor label='draw / move / delete' reason={drawInert} />
                  )}
                  <Text size='nano' variant='label' component='span'>
                    shape and position are drawn on the picture — this opens it
                  </Text>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Text size='micro' variant='label' component='p' className='mt-2'>
        The server takes a cut piece’s name from its callout text, and paper always prints these —
        the current ones, never a frozen copy. A deleted number leaves a hole; numbers are never
        reused.
      </Text>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Nothing is drawn at all. Say what would make a sheet, and open the door to each thing. */
function EmptyDocument({
  bench,
  disabled,
  onDraw,
  drawInert,
}: {
  bench: BenchSlots;
  disabled?: boolean;
  onDraw?: () => void;
  drawInert: string;
}) {
  const { showMessage } = useSnackBarStore();
  return (
    <>
      <Text size='micro' variant='label' component='p'>
        Nothing is drawn on this card yet. A sheet is made of flats — open the drawing editor and
        add a technical drawing to it, or put a picture into a bench slot in <b>STUDIO</b>, which
        the mint carries into the card’s own media.
      </Text>
      <div className='flex flex-wrap gap-1.5'>
        {onDraw ? (
          <Button variant='secondary' size='sm' onClick={onDraw}>
            add a drawing ▸
          </Button>
        ) : (
          <InertDoor label='add a drawing ▸' reason={drawInert} />
        )}
        {SHEET_MINIMUM.map((view) => (
          <Button
            key={view}
            variant='secondary'
            size='sm'
            disabled={disabled}
            onClick={() =>
              openDoor(
                benchDoor({ viewKey: view }),
                `the ${VIEW_LABELS[view]} slot is on the bench`,
                showMessage,
              )
            }
          >
            {VIEW_LABELS[view]} slot {slotIsFilled(bench.byView.get(view)) ? '✓' : '✗'}
          </Button>
        ))}
      </div>
    </>
  );
}

/**
 * The version storey when there is no version.
 *
 * IT IS A PLATE, NOT AN EMPTY SECTION, AND THERE IS NO `SHEET v0`. A version numbered zero is a
 * sentence about a thing that does not exist; the truthful screen says versions arrive with the
 * mint and shows what the mint is waiting for. Every line is a door (Г10 — the lock used to name a
 * tab and offer no way to reach it).
 *
 * The two informational lines are informational on purpose: an uploaded plate states no fit of its
 * own and a mixed composition is legal with consent, so both are questions the mint ASKS rather
 * than conditions this list enforces. Marking them red would teach people that the list lies.
 */
function NoVersionsYet({
  bench,
  plates,
  disabled,
  onMint,
  say,
}: {
  bench: BenchSlots;
  plates: DocumentPlate[];
  disabled?: boolean;
  onMint: (origin: MintOrigin) => void;
  say: (m: string, t: 'error') => void;
}) {
  const analysis = useMemo(() => analyseMint(bench, []), [bench]);
  const missing = sheetMinimumMissing(bench);
  const ready = benchMinimumMet(bench);

  return (
    <Section
      title='versions'
      question='— none yet; a version arrives with the mint'
      action={
        <Button
          variant='main'
          size='sm'
          disabled={disabled || !ready}
          onClick={() => onMint('print')}
          title={ready ? undefined : 'the sheet minimum is not met'}
        >
          print — mints v1
        </Button>
      }
    >
      <Text size='micro' component='p'>
        Nothing has been minted. A version freezes <b>which pictures are on the sheet</b>, so that a
        printed page can name one composition and be checked against it later. Callouts are not part
        of that freeze — paper always prints the current ones — which is why a version is only ever
        born of an act: the first print or release mints v1.
        {plates.length > 0 && ' The document above is already usable and already prints.'}
      </Text>

      <div>
        <GroupLabel>what the mint needs</GroupLabel>
        {SHEET_MINIMUM.map((view) => {
          const filled = slotIsFilled(bench.byView.get(view));
          return (
            <div key={view} className='flex items-center gap-2 border-b border-hairline py-1'>
              <Text size='micro' component='span' className='min-w-0 flex-1'>
                {VIEW_LABELS[view]} slot
              </Text>
              <Text size='micro' variant='label' component='span'>
                {filled ? 'filled ✓' : 'empty ✗'}
              </Text>
              <Pill tone={filled ? 'ok' : 'warn'}>{filled ? 'ready' : 'blocks the mint'}</Pill>
              {!filled && (
                <Button
                  variant='secondary'
                  size='xs'
                  disabled={disabled}
                  onClick={() =>
                    openDoor(
                      benchDoor({ viewKey: view }),
                      `the ${VIEW_LABELS[view]} slot is on the bench`,
                      say,
                    )
                  }
                >
                  go to it
                </Button>
              )}
            </div>
          );
        })}
        <Row
          label={
            <Text size='micro' component='span'>
              fit on plates brought by hand
            </Text>
          }
          value={<Pill tone='mut'>asked at mint</Pill>}
        />
        {analysis.mixed && (
          <Row
            label={
              <Text size='micro' component='span'>
                mixed composition
              </Text>
            }
            value={<Pill tone='mut'>consent asked at mint</Pill>}
          />
        )}
      </div>

      {missing.length > 0 && (
        <Text size='micro' variant='label' component='p'>
          The bench is free to hold any view; the minimum lives here, at the mint — a sheet without{' '}
          {SHEET_MINIMUM.map((v) => VIEW_LABELS[v]).join(' and ')} is not a sheet somebody can cut
          from.
        </Text>
      )}
    </Section>
  );
}
