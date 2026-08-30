import type {
  GetDesignBandResponse,
  common_MediaFull,
  common_TechCardMediaKind,
} from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';

import type { TechCardFormData } from '../schema';
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
  /** Where this plate is listed — the card's own media, or a slot on the design bench. */
  origin: 'card' | 'bench';
  /** Only for a bench plate: the address of its slot, for the door. */
  door?: string;
  note?: string;
};

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
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
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

  const [selected, setSelected] = useState<number | null>(null);
  const [mintOrigin, setMintOrigin] = useState<MintOrigin | null>(null);
  /** Which frozen composition is on screen. 0 = the document, which is the default and the point. */
  const [inspecting, setInspecting] = useState(0);

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

  const onScreen = inspecting === 0 ? plates : frozenPlates;

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
          {onScreen.length === 0 ? (
            <EmptyDocument bench={bench} disabled={disabled} />
          ) : (
            <PlateGrid
              plates={onScreen}
              callouts={inspecting === 0 ? callouts : []}
              selected={inspecting === 0 ? selected : null}
              onSelect={setSelected}
              disabled={disabled}
            />
          )}

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
          action={<Pill tone='mut'>{callouts.length} on the sheet</Pill>}
          className='lg:w-[340px] lg:shrink-0'
        >
          <CalloutPanel
            callouts={callouts}
            plates={plates}
            selected={selected}
            onSelect={setSelected}
            disabled={disabled || inspecting > 0}
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
    </SectionStack>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

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
 */
function PlateGrid({
  plates,
  callouts,
  selected,
  onSelect,
  disabled,
}: {
  plates: DocumentPlate[];
  callouts: CalloutLike[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  disabled?: boolean;
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
 * the sketch editor uses for the same fields. They touch no array identity, so they cannot
 * desynchronise the `useFieldArray` instances that other organs hold over `callouts`; the ROOT
 * write (`setValue('callouts', next)`) is the one that re-syncs them, and this panel never needs it
 * because it never adds, removes or reorders. Drawing geometry, minting a new callout and deleting
 * one stay with the annotator, and each row carries a door to it.
 */
function CalloutPanel({
  callouts,
  plates,
  selected,
  onSelect,
  disabled,
}: {
  callouts: CalloutLike[];
  plates: DocumentPlate[];
  selected: number | null;
  onSelect: (index: number | null) => void;
  disabled?: boolean;
}) {
  const form = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const plateName = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of plates) map.set(p.mediaId, p.name);
    return map;
  }, [plates]);

  if (callouts.length === 0) {
    return (
      <Text size='micro' variant='label' component='p'>
        none yet. A callout is placed on the sheet itself — arm a kind and click the picture in the
        technical sketch editor; it appears here the moment it exists.
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
                // here. The same path the sketch editor stamps: whichever of the two is on screen,
                // the person lands on the right callout.
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
                  <Button
                    variant='secondary'
                    size='xs'
                    onClick={() =>
                      openDoor(
                        `callouts.${index}.description`,
                        `callout ${c.number || index + 1} is on the technical sketch`,
                        showMessage,
                      )
                    }
                  >
                    draw / move / delete
                  </Button>
                  <Text size='nano' variant='label' component='span'>
                    shape and position live in the sketch editor
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
function EmptyDocument({ bench, disabled }: { bench: BenchSlots; disabled?: boolean }) {
  const { showMessage } = useSnackBarStore();
  return (
    <>
      <Text size='micro' variant='label' component='p'>
        Nothing is drawn on this card yet. A sheet is made of flats — add a technical drawing on the
        sketch tab, or put a picture into a bench slot.
      </Text>
      <div className='flex flex-wrap gap-1.5'>
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
