import type {
  GetDesignBandResponse,
  common_Color,
  common_DesignColourRecipe,
  common_DesignPicture,
  common_Model,
} from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, type JSX } from 'react';
import { useFormContext, type UseFormReturn } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../../schema';
import { openDoor } from '../mint-dialog';
import { SILHOUETTE_VIEWS, viewLabel } from '../views';
import type { ThreedDraft } from './drafts';
import { Swatch } from './field-row';
import {
  FABRIC_AUTHORITY,
  benchSides,
  colourLabel,
  colourSubtitle,
  colourSwatchHex,
  fabricStatement,
  latestRenderByView,
  pictureThumb,
  renderSheetViews,
  stripProvenance,
} from './model';

/**
 * ═══ WHAT THE MODEL GETS — THE FABRIC RENDER AND 3D BRANCHES ══════════════════════════════════
 *
 * THE PROTOTYPE'S MODAL BRANCHES BY KIND (`wmgModal`, three arms), AND SO DOES THIS BAND — but the
 * arms live in two files, not one, and that is a decision rather than an accident. The FLAT arm is
 * a reader of the FORM: references, their roles, their notes, the moodboard, the concept. These two
 * are readers of the BAND: which plates stand on the bench, which renders exist at which revision,
 * and the submission draft sitting in the menu three lines below the button. Folding them into one
 * component would give it two unrelated dependency sets and one prop bag that is half-empty in
 * either direction; the shared thing between the arms is the SHAPE of the panel, and that is what
 * `Group` and `InventoryLine` below carry.
 *
 * ═══ WHY IT MAY BE OPENED AT ALL, GIVEN THAT THE PROFILE IS SERVER-SIDE ════════════════════════
 *
 * `generate-row.tsx` used to refuse this door outright, on the ground that «what the model is shown
 * is assembled server-side from a prompt profile». That sentence is true and it is still printed —
 * at the foot of this modal, where it belongs. What it is NOT is a reason to hide the panel: the
 * profile is the WRAPPER, and everything the wrapper is wrapped AROUND is on this card and is
 * knowable exactly. A person about to spend money on a render is entitled to see which four
 * drawings are going in, which colour recipe rides with them, and — the half that is easy to forget
 * — what is NOT going in, which for a render is every reference photograph on the card.
 *
 * That last group is the reason this panel earns its place on these two screens specifically. On
 * FLAT the references ARE the input and they are on screen. On FABRIC RENDER and 3D they are one
 * click away on another view, and the intuition «the model has seen my references» is wrong and
 * expensive. The panel says so in as many words.
 *
 * ═══ NOTHING HERE IS EDITABLE, AND EVERY LINE IS A DOOR ════════════════════════════════════════
 *
 * Same rule as the flat arm: an edit happens at the field's home, and a second writer for the same
 * value is a second opinion about it. Where an address exists the line walks to it (`openDoor`);
 * where the organ is on another view of the band the line SAYS which view, because a button that
 * cannot lead anywhere is worse than a sentence that can be read.
 */

export type WhatModelGetsKind = 'render' | 'threed';

/** The dictionaries the two arms consult, resolved once by the caller's own hooks. */
type Resolved = {
  colors: readonly common_Color[] | undefined;
  models: readonly common_Model[] | undefined;
  sizeName: (id: number) => string;
};

export function WhatModelGetsRenderModal({
  open,
  onOpenChange,
  band,
  kind,
  recipe,
  threed,
  cardFit,
  models,
  sizeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  band: GetDesignBandResponse;
  kind: WhatModelGetsKind;
  /** The colour the render menu currently states. Ignored by the 3D arm. */
  recipe?: common_DesignColourRecipe;
  /** The turntable draft the 3D menu currently states. Ignored by the render arm. */
  threed?: ThreedDraft;
  cardFit: string;
  models?: readonly common_Model[];
  sizeName?: (id: number) => string;
}): JSX.Element {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();

  // The card's own words. Read defensively: the studio is also mounted by composers that are not
  // inside a form (a print root, a harness), and `useFormContext` answers `null` there while its
  // type promises it never does. There is no error boundary over this tab.
  const form = useFormContext<TechCardFormData>() as UseFormReturn<TechCardFormData> | null;
  const garment = ((form?.getValues('concept') as string) ?? '').trim();

  const resolved: Resolved = {
    colors: dictionary?.colors,
    models,
    sizeName: sizeName ?? ((id: number) => (id ? `size ${id}` : '')),
  };

  const body =
    kind === 'render' ? (
      <RenderBody band={band} recipe={recipe} garment={garment} resolved={resolved} />
    ) : (
      <ThreedBody
        band={band}
        threed={threed}
        cardFit={cardFit}
        garment={garment}
        resolved={resolved}
      />
    );

  const words = useMemo(
    () => plainText({ kind, band, recipe, threed, cardFit, garment, resolved }),
    // `resolved` is rebuilt each render by design (it is three references, not state); the text is
    // recomputed from the same inputs the panel draws from, so the dictionaries are named here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, band, recipe, threed, cardFit, garment, dictionary?.colors, models],
  );

  const copy = async () => {
    // `navigator.clipboard`, NEVER `document.execCommand('copy')`: execCommand writes wherever the
    // document's SELECTION is, and this dialog opens over a form — the copy would land in whichever
    // text field was last focused. That has happened in this repo before.
    if (!navigator.clipboard?.writeText) {
      showMessage('this browser does not offer the clipboard — select the text and copy it', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(words);
      showMessage('copied as text', 'success');
    } catch {
      showMessage('the browser refused the clipboard — select the text and copy it', 'error');
    }
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => onOpenChange(false)}
      closeOnConfirm={false}
      width='lg'
      title={`what the model gets — ${kind === 'threed' ? '3D' : 'fabric render'}`}
      cancelLabel='close'
      confirmLabel='close'
      footerHint='nothing here is editable — every fact is edited at its own field'
    >
      <div className='space-y-stack'>
        {/* THE PROFILE SENTENCE, KEPT AND MOVED RATHER THAN DELETED. It was the whole reason this
            door was dead; it is true, and it belongs beside the inventory instead of in place of
            it — a person reading this list must know it is the PAYLOAD and not the whole prompt. */}
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>this is what this CARD contributes.</b> The prompt itself is assembled server-side
            from a prompt PROFILE — server configuration, not a card field — and the profile's name
            and version reach this screen only as the stamp on a run that has already happened. So
            the wording around these facts is not shown here, because it is not knowable here. The
            facts are, and they are the part you are paying for.
          </Text>
        </CalloutBox>

        {body}

        <div>
          <GroupLabel
            action={
              <Button variant='secondary' size='xs' onClick={copy}>
                copy as text
              </Button>
            }
          >
            words
          </GroupLabel>
          {/* A PANEL FILL, NOT A SECOND BOX — a bordered rectangle here would be a box inside a
              box, which this system forbids. */}
          <pre className='overflow-x-auto whitespace-pre-wrap break-words bg-bgSecondary p-2 text-micro'>
            {words}
          </pre>
          <div className='mt-1 flex flex-wrap gap-1.5'>
            <Button
              variant='secondary'
              size='xs'
              onClick={() =>
                openDoor('concept', 'the garment description is on STUDIO', showMessage)
              }
            >
              edit the description ▸
            </Button>
            <Button
              variant='secondary'
              size='xs'
              onClick={() => openDoor('fit', 'the fit is on the card header', showMessage)}
            >
              edit the fit ▸
            </Button>
          </div>
        </div>
      </div>
    </ConfirmationModal>
  );
}

/* ─────────────────────────── the fabric render arm ─────────────────────────── */

/**
 * INPUTS ARE THE PLATES IN THE SLOTS, and the panel counts them out of four rather than listing
 * only the ones that exist. A render is asked for exactly the FILLED slots, so an empty side is not
 * a footnote — it is a side that will not be in the sheet, and the count is what says so before the
 * money moves.
 *
 * THE FABRIC IS SHOWN AS THREE SOURCES AND A RANKING, not as one colour. Since the owner allowed
 * them to be combined they can contradict each other, and the panel exists precisely so a person
 * about to spend money sees what was actually said — including which of two disagreeing statements
 * the model is instructed to obey. The ranking is quoted from the prompt, never recomputed here.
 */
function RenderBody({
  band,
  recipe,
  garment,
  resolved,
}: {
  band: GetDesignBandResponse;
  recipe?: common_DesignColourRecipe;
  garment: string;
  resolved: Resolved;
}): JSX.Element {
  const { showMessage } = useSnackBarStore();
  const sides = useMemo(() => benchSides(band), [band]);
  const filled = sides.filter((side) => !!side.picture);
  /** The sheet's own left-to-right order — the same list the run sends and the splitter labels. */
  const views = useMemo(() => renderSheetViews(band), [band]);
  const stated = fabricStatement(recipe);
  const references = (band.references ?? []).length;

  return (
    <>
      <div>
        <GroupLabel
          flush
          action={
            <Text size='micro' variant='label' component='span'>
              {filled.length} of 4 sides
            </Text>
          }
        >
          inputs — the plates in the slots
        </GroupLabel>
        {sides.map((side) => (
          <InventoryLine
            key={side.view}
            name={viewLabel(side.view)}
            picture={side.picture}
            text={
              side.picture ? (
                stripProvenance(band, side.picture)
              ) : (
                <span className='text-labelColor'>
                  empty — this side is not in the sheet and does not come back
                </span>
              )
            }
          />
        ))}
        <Text size='nano' variant='label' component='p' className='mt-1 normal-case'>
          {views.length > 1 ? (
            <>
              One picture comes back: <b>{views.length} views in a row</b> on one sheet, left to
              right — {views.map(viewLabel).join(', ')} — split into the slots afterwards.
            </>
          ) : (
            <>One picture comes back. </>
          )}{' '}
          A slot is filled on the input strip of this very screen —
          <b> input — flats of this card</b>, above the menu.
        </Text>
      </div>

      <div>
        <GroupLabel
          action={
            <Text size='micro' variant='label' component='span' className='normal-case'>
              {FABRIC_AUTHORITY}
            </Text>
          }
        >
          fabric
        </GroupLabel>
        <div className='flex items-center gap-2 border-b border-hairline py-1'>
          <Swatch hex={colourSwatchHex(recipe, resolved.colors)} size={22} />
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            <b>{colourLabel(recipe, resolved.colors)}</b> — {colourSubtitle(recipe, resolved.colors)}
          </Text>
        </div>
        <div className='flex items-center gap-2 border-b border-hairline py-1'>
          <Text size='micro' variant='label' component='span' className='w-[92px] shrink-0 uppercase'>
            photo
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            {stated.photo ? (
              <>
                media {recipe?.fabricMediaId} — goes out as an image; the weave, texture and drape
                are read from it
              </>
            ) : (
              <span className='text-labelColor'>none — no material is stated by a picture</span>
            )}
          </Text>
        </div>
        <div className='flex items-center gap-2 border-b border-hairline py-1'>
          <Text size='micro' variant='label' component='span' className='w-[92px] shrink-0 uppercase'>
            words
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            {(recipe?.words ?? '').trim() || (
              <span className='text-labelColor'>none — nothing is added beyond the two above</span>
            )}
          </Text>
        </div>
        <div className='flex items-center gap-2 border-b border-hairline py-1'>
          <Text size='micro' variant='label' component='span' className='w-[92px] shrink-0 uppercase'>
            garment
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            {garment || (
              <span className='text-error'>
                the card states no description; the render goes in unexplained
              </span>
            )}
          </Text>
        </div>
      </div>

      <NotSent
        showMessage={showMessage}
        chips={[
          {
            label: `references · ${references}`,
            title:
              'a fabric render is coloured over the FLATS of this card — the reference photographs ' +
              'were read once, when the flats were drawn, and the render never sees them. They are ' +
              'on the FLAT view of the strip above',
          },
          {
            label: 'moodboard',
            title: 'mood is for the human — it is never instruction, on any of the three views',
          },
          { label: 'callouts', title: 'the callouts on the sheet live on ARTIFACTS' },
        ]}
      />
    </>
  );
}

/* ─────────────────────────── the 3D arm ─────────────────────────── */

/**
 * INPUTS ARE THE RENDERS BY VIEW, AND A MISSING SIDE IS NAMED IN RED. 3D turns the renders and not
 * the drawings, so a side without a render is not «one fewer angle» — it is the gate, and the panel
 * uses the gate's own words so the two cannot disagree.
 */
function ThreedBody({
  band,
  threed,
  cardFit,
  garment,
  resolved,
}: {
  band: GetDesignBandResponse;
  threed?: ThreedDraft;
  cardFit: string;
  garment: string;
  resolved: Resolved;
}): JSX.Element {
  const { showMessage } = useSnackBarStore();
  const byView = useMemo(() => latestRenderByView(band), [band]);
  const present = SILHOUETTE_VIEWS.filter((view) => !!byView[view]).length;

  return (
    <>
      <div>
        <GroupLabel
          flush
          action={
            <Text size='micro' variant='label' component='span'>
              {present} of 4
            </Text>
          }
        >
          inputs — renders by view
        </GroupLabel>
        {SILHOUETTE_VIEWS.map((view) => {
          const plate = byView[view];
          return (
            <InventoryLine
              key={view}
              name={viewLabel(view)}
              picture={plate?.picture}
              text={
                plate ? (
                  `r${plate.rrev} · ${colourLabel(plate.run.params?.colour, resolved.colors)}`
                ) : (
                  <span className='text-error'>missing — blocks 3D</span>
                )
              }
            />
          );
        })}
      </div>

      <div>
        <GroupLabel>how it sits</GroupLabel>
        <div className='flex items-center gap-2 border-b border-hairline py-1'>
          <Text size='micro' variant='label' component='span' className='w-[92px] shrink-0 uppercase'>
            frames
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            {threed?.frames ?? 0} — each frame is its own picture in the history
          </Text>
        </div>
        <div className='flex items-center gap-2 border-b border-hairline py-1'>
          <Text size='micro' variant='label' component='span' className='w-[92px] shrink-0 uppercase'>
            presentation
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            {threed?.presentation === 'model'
              ? `on ${modelCaptionOf(resolved.models, threed?.modelId) || '— no model chosen —'} · garment ${
                  resolved.sizeName(threed?.garmentSizeId ?? 0) || '— no size chosen —'
                }`
              : 'in the air — no figure'}
          </Text>
        </div>
        <div className='flex items-center gap-2 border-b border-hairline py-1'>
          <Text size='micro' variant='label' component='span' className='w-[92px] shrink-0 uppercase'>
            fit
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            {(threed?.fitOverride ?? '').trim() ? (
              <>
                <b>{threed?.fitOverride}</b> — an override; every frame it produces carries the
                badge, and the card still says {cardFit || '—'}
              </>
            ) : (
              `${cardFit || '—'} (from the card)`
            )}
          </Text>
        </div>
        <div className='flex items-center gap-2 border-b border-hairline py-1'>
          <Text size='micro' variant='label' component='span' className='w-[92px] shrink-0 uppercase'>
            garment
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            {garment || (
              <span className='text-labelColor'>the card states no description</span>
            )}
          </Text>
        </div>
      </div>

      <NotSent
        showMessage={showMessage}
        chips={[
          {
            label: 'references',
            title:
              'a turntable is built out of the four RENDERS — the reference photographs are two ' +
              'steps upstream and are not shown to it. They are on the FLAT view of the strip',
          },
          { label: 'moodboard', title: 'mood is for the human — it is never instruction' },
          { label: 'the flats', title: '3D turns the renders, not the drawings underneath them' },
          { label: 'notes', title: 'notes are internal and reach neither the factory nor a model' },
        ]}
      />
    </>
  );
}

/* ─────────────────────────── the shared shapes ─────────────────────────── */

/** One line of the inventory: a thumbnail, the name of the slot or view, and what stands in it. */
function InventoryLine({
  name,
  picture,
  text,
}: {
  name: string;
  picture?: common_DesignPicture | null;
  text: React.ReactNode;
}): JSX.Element {
  const url = pictureThumb(picture);
  return (
    <div className='flex items-center gap-2 border-b border-hairline py-1'>
      {/* мат под снимком белый (R-12) */}
      <span className='block h-10 w-8 shrink-0 border border-borderColor bg-bgColor'>
        {url ? <img src={url} alt='' loading='lazy' className='h-full w-full object-contain' /> : null}
      </span>
      <Text size='nano' variant='uppercase' component='span' className='w-[72px] shrink-0'>
        {name}
      </Text>
      <Text size='micro' component='span' className='min-w-0 flex-1'>
        {text}
      </Text>
    </div>
  );
}

/**
 * WHAT THE MODEL HAS NO KNOWLEDGE OF — the half of the inventory that is easiest to be wrong about,
 * and the reason this panel matters more on these two screens than on FLAT.
 */
function NotSent({
  chips,
  showMessage,
}: {
  chips: { label: string; title: string }[];
  showMessage: (message: string, type: 'error' | 'success') => void;
}): JSX.Element {
  return (
    <div>
      <GroupLabel
        action={
          <Text size='micro' variant='label' component='span'>
            what a model would have no knowledge of
          </Text>
        }
      >
        not sent at all
      </GroupLabel>
      <ChipRow>
        {chips.map((chip) => (
          <Chip
            key={chip.label}
            title={chip.title}
            onClick={() => showMessage(chip.title, 'success')}
          >
            {chip.label}
          </Chip>
        ))}
      </ChipRow>
    </div>
  );
}

function modelCaptionOf(
  models: readonly common_Model[] | undefined,
  modelId?: number,
): string {
  if (!modelId) return '';
  const model = (models ?? []).find((m) => m.id === modelId);
  return (model?.model?.name ?? '').trim() || `model ${modelId}`;
}

/**
 * THE SAME FACTS AS PLAIN TEXT — what «copy as text» hands to a studio outside.
 *
 * ASSEMBLED FROM THE SAME VALUES THE PANEL DRAWS FROM, never from the DOM: a text built by walking
 * the rendered nodes would silently change whenever a label was reworded, and would carry «missing
 * — blocks 3D» into a brief as if it were an instruction.
 */
function plainText({
  kind,
  band,
  recipe,
  threed,
  cardFit,
  garment,
  resolved,
}: {
  kind: WhatModelGetsKind;
  band: GetDesignBandResponse;
  recipe?: common_DesignColourRecipe;
  threed?: ThreedDraft;
  cardFit: string;
  garment: string;
  resolved: Resolved;
}): string {
  const lines: string[] = [
    `what the model gets — ${kind === 'threed' ? '3D' : 'fabric render'}`,
    `garment: ${garment || '—'}`,
    `fit: ${cardFit || '—'} (from the card)`,
  ];

  if (kind === 'render') {
    const sides = benchSides(band);
    lines.push(
      `inputs: ${sides
        .map((side) => `${viewLabel(side.view)}=${side.picture ? 'plate' : 'empty'}`)
        .join(', ')}`,
      `sheet: ${renderSheetViews(band).map(viewLabel).join(', ') || '—'} (one picture, split afterwards)`,
      `fabric photo: ${(recipe?.fabricMediaId ?? 0) > 0 ? `media ${recipe?.fabricMediaId}` : '—'}`,
      `picked colour: ${colourLabel(recipe, resolved.colors)}`,
      `fabric in words: ${(recipe?.words ?? '').trim() || '—'}`,
      `order of authority: ${FABRIC_AUTHORITY}`,
      'not sent: references, moodboard, callouts',
    );
    return lines.join('\n');
  }

  const byView = latestRenderByView(band);
  lines.push(
    `inputs: ${SILHOUETTE_VIEWS.map((view) => {
      const plate = byView[view];
      return `${viewLabel(view)}=${plate ? `r${plate.rrev}` : 'MISSING'}`;
    }).join(', ')}`,
    `frames: ${threed?.frames ?? 0}`,
    threed?.presentation === 'model'
      ? `presentation: on ${modelCaptionOf(resolved.models, threed?.modelId) || '—'} · garment ${
          resolved.sizeName(threed?.garmentSizeId ?? 0) || '—'
        }`
      : 'presentation: in the air',
    (threed?.fitOverride ?? '').trim()
      ? `fit override: ${threed?.fitOverride} (every frame is badged)`
      : 'fit override: none',
    'not sent: references, moodboard, the flats, notes',
  );
  return lines.join('\n');
}
