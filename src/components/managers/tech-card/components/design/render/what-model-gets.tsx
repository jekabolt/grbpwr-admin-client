import type {
  GetDesignBandResponse,
  common_Color,
  common_DesignColourRecipe,
  common_DesignPicture,
  common_MediaFull,
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
import { openDoor, openDoorAcrossKind } from '../doors';
import { viewLabel } from '../views';
import type { ThreedDraft } from './drafts';
import { Swatch } from './field-row';
import {
  FABRIC_AUTHORITY,
  benchSides,
  colourLabel,
  colourSubtitle,
  colourSwatchHex,
  fabricStatement,
  mediaThumb,
  pictureThumb,
  renderSheetViews,
  runOfPicture,
  stripProvenance,
  threedSides,
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

/**
 * `recolor` IS THE THIRD ARM (K-17) AND IT IS THE SHORTEST, because a recolour is told the least:
 * one photograph per paid call and a target colour. That shortness is exactly why the panel earns
 * its place here — the intuition «the model can see the other shots, so it will keep them
 * consistent» is wrong and is bought one call at a time.
 */
export type WhatModelGetsKind = 'render' | 'threed' | 'recolor';

/** The screen's own name, spelled ONCE — the title and the copied text must not diverge. */
function kindLabel(kind: WhatModelGetsKind): string {
  if (kind === 'threed') return '3D';
  if (kind === 'recolor') return 'on model';
  return 'fabric render';
}

/**
 * The slice of a form callout the band reads. Deliberately a STRUCTURAL subset of `CalloutForm`
 * rather than the schema type itself: every organ here only ever reads these seven fields, and
 * naming the whole zod type would make this module refuse a callout that merely grew one.
 *
 * `posX` / `posY` are STRINGS on purpose — they are decimals on the wire and the form keeps them as
 * typed, so the reader parses rather than assuming a number arrived.
 *
 * IT LIVES HERE BECAUSE ITS READERS DO. The type was declared in `mint-dialog.tsx`, a file that was
 * only half about the mint; when the mint was removed the type would have gone down with it,
 * although it never had anything to do with minting. The «what the model gets» pair — this module
 * and its modal — are the only two readers left, so the type sits with them. A shared module for a
 * single type would be the same mistake with a better name.
 */
export type CalloutLike = {
  number?: number;
  mediaId?: number;
  description?: string;
  part?: string;
  dimensions?: string;
  posX?: string;
  posY?: string;
};

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
  sources,
  cardFit,
  models,
  sizeName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  band: GetDesignBandResponse;
  kind: WhatModelGetsKind;
  /** The colour the menu currently states. Read by the render arm and by the recolour arm. */
  recipe?: common_DesignColourRecipe;
  /** The turntable draft the 3D menu currently states. Ignored by the other arms. */
  threed?: ThreedDraft;
  /** The photographs the ON MODEL menu currently holds — one paid call each. Recolour arm only. */
  sources?: readonly common_MediaFull[];
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
  // `garmentDescription` (W-3), НЕ `concept`. Здесь стояло `concept`, и это разные документы:
  // `concept` — проза, которая печатается для цеха и входит в подпись DESIGN, а `garmentDescription`
  // — предложение, которое человек пишет ДЛЯ МОДЕЛИ и которое уходит в каждый прогон. Показывать
  // одно под именем другого значит утверждать РЯДОМ С ЦЕНОЙ, что модель получит слова, которых она
  // не получит, и одновременно прятать те, которые получит. Соседняя модалка это уже починила у
  // себя (`modals/what-model-gets-modal.tsx:101`), а этот носитель остался с дефектом — и после
  // V-16, где `concept` стал общей запиской доски, стал врать заметнее прежнего.
  const garment = ((form?.getValues('garmentDescription') as string) ?? '').trim();

  const resolved: Resolved = {
    colors: dictionary?.colors,
    models,
    sizeName: sizeName ?? ((id: number) => (id ? `size ${id}` : '')),
  };

  const body =
    kind === 'render' ? (
      <RenderBody band={band} recipe={recipe} garment={garment} resolved={resolved} />
    ) : kind === 'recolor' ? (
      <RecolorBody sources={sources} recipe={recipe} garment={garment} resolved={resolved} />
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
    () => plainText({ kind, band, recipe, threed, sources, cardFit, garment, resolved }),
    // `resolved` is rebuilt each render by design (it is three references, not state); the text is
    // recomputed from the same inputs the panel draws from, so the dictionaries are named here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, band, recipe, threed, sources, cardFit, garment, dictionary?.colors, models],
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
    /**
     * ДИАЛОГ НИЧЕГО НЕ РЕШАЕТ — ЗНАЧИТ И КНОПОК РЕШЕНИЯ У НЕГО НЕТ (L-7).
     *
     * Здесь стояли `cancelLabel='close'` И `confirmLabel='close'`, то есть ДВЕ кнопки с одним
     * словом и одним действием, плюс третий выход — ✕ в шапке. Владелец увидел это на 3D, но
     * модалка одна на три студии (рендер, 3D, on model), и лишняя кнопка была во всех трёх.
     *
     * Два органа с одним смыслом — не мелочь оформления: человек ищет между ними разницу, потому
     * что интерфейс её пообещал. `hideActions` снимает обе; ✕ в шапке остаётся и достаточен, а
     * подпись подвала — единственное, что этому диалогу в подвале нужно, — теперь переживает
     * `hideActions` (правка в самом примитиве: до неё она уходила вместе с кнопками).
     */
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      /* Обязателен по контракту примитива и при `hideActions` не вызывается ничем: кнопки, которая
         его звала, больше нет. Закрытием заведует ✕ — тот же приём, что у просмотра DXF и модели. */
      onConfirm={() => onOpenChange(false)}
      width='lg'
      title={`what the model gets — ${kindLabel(kind)}`}
      hideActions
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
                /* ЧЕРЕЗ ВИД, А НЕ НА МЕСТЕ. Панель открыта со стороны FABRIC RENDER или 3D, а
                   описание изделия живёт в INPUT — REFERENCES, то есть на FLAT: отсюда блок
                   размонтирован, и `openDoor` честно ответил бы «не на этой вкладке», оставив
                   переход человеку. Дверь закрывает панель, переводит студию и ждёт монтажа. */
                openDoorAcrossKind(
                  'garmentDescription',
                  'flat',
                  'the garment description is in INPUT — REFERENCES, on FLAT',
                  showMessage,
                  () => onOpenChange(false),
                )
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

/* ─────────────────────────── the recolour arm ─────────────────────────── */

/**
 * A RECOLOUR IS TOLD VERY LITTLE, AND THE SHORTNESS OF THIS LIST IS THE POINT.
 *
 * ONE PHOTOGRAPH PER PAID CALL, AND THE MODEL SEES ONLY THAT ONE. It is not shown the other shots,
 * it is not told they are the same garment, and it cannot make them agree by looking at them. The
 * thing that keeps four pictures the same shade is the COLOUR NAMED — which is why that line sits
 * directly under the count of calls rather than in a section of its own.
 *
 * THE CARD CONTRIBUTES ALMOST NOTHING HERE, and that is worth reading before paying per shot: no
 * bench plate, no reference, no moodboard, no fit. A recolour is about a photograph that already
 * exists; the card's drawings would be a second, contradictory description of the same garment.
 */
function RecolorBody({
  sources,
  recipe,
  garment,
  resolved,
}: {
  sources?: readonly common_MediaFull[];
  recipe?: common_DesignColourRecipe;
  garment: string;
  resolved: Resolved;
}): JSX.Element {
  const { showMessage } = useSnackBarStore();
  const shots = sources ?? [];
  const stated = fabricStatement(recipe);

  return (
    <>
      <div>
        <GroupLabel
          flush
          action={
            <Text size='micro' variant='label' component='span'>
              {shots.length} photograph{shots.length === 1 ? '' : 's'} · {shots.length} paid call
              {shots.length === 1 ? '' : 's'}
            </Text>
          }
        >
          inputs — the photographs, one call each
        </GroupLabel>
        {shots.length === 0 ? (
          <Text size='micro' variant='inactive' component='p' className='py-1 normal-case'>
            No photograph is in the menu, so there is nothing to recolour and nothing to buy.
          </Text>
        ) : (
          shots.map((media, index) => (
            <InventoryLine
              key={media.id ?? index}
              name={`photo ${index + 1}`}
              thumb={mediaThumb(media)}
              text={
                <>
                  media <b>{media.id ?? '—'}</b> — its own paid call, recoloured on its own. The
                  model is not shown the other {shots.length === 1 ? 'shots' : 'photographs'}.
                </>
              }
            />
          ))
        )}
      </div>

      <div>
        <GroupLabel>the target colour</GroupLabel>
        <div className='flex flex-wrap items-start gap-3 border-b border-hairline py-1'>
          <Swatch hex={colourSwatchHex(recipe, resolved.colors)} size={32} />
          <div className='min-w-0 flex-1'>
            <Text size='micro' component='p'>
              <b>{colourLabel(recipe, resolved.colors)}</b>
            </Text>
            <Text size='micro' variant='label' component='p' className='normal-case'>
              {colourSubtitle(recipe, resolved.colors)}
            </Text>
          </div>
        </div>
        <div className='flex items-center gap-2 border-b border-hairline py-1'>
          <Text size='micro' variant='label' component='span' className='w-[92px] shrink-0 uppercase'>
            in words
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            {stated.words ? (
              (recipe?.words ?? '').trim()
            ) : (
              <span className='text-labelColor'>nothing said in words</span>
            )}
          </Text>
        </div>
        <div className='flex items-center gap-2 border-b border-hairline py-1'>
          <Text size='micro' variant='label' component='span' className='w-[92px] shrink-0 uppercase'>
            garment
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            {garment || <span className='text-labelColor'>the card states no description</span>}
          </Text>
        </div>
      </div>

      <NotSent
        showMessage={showMessage}
        chips={[
          {
            label: 'the flats',
            title:
              'a recolour repaints a photograph that exists — the card\u2019s drawings would be a second, contradictory description of the same garment',
          },
          {
            label: 'the bench',
            title: 'the bench is what a fabric render is built from; a recolour is built from the photograph you handed it',
          },
          {
            label: 'the other photographs',
            title:
              'each shot is its own paid call and the model sees only that one — what keeps them the same shade is the colour you named, not that they went together',
          },
          { label: 'references', title: 'reference photographs belong to FLAT and never reach this run' },
          { label: 'moodboard', title: 'mood is for the human — it is never instruction' },
          { label: 'the fit', title: 'fit describes a garment being drawn; this one has already been photographed on a body' },
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
  /**
   * ⚠ ЧИТАЕТСЯ РЕНДЕР-ВЕРСТАК, А НЕ ЛЕНТА (V-14). Инвентарь обязан называть ровно те картинки,
   * которые уедут в сборку, а уедут плиты слотов `kind: render` — это отбирает сервер
   * (`designSelectBench`). Панель, считавшая «последний рендер каждой стороны» по ленте, обещала
   * человеку перед тратой денег не тот набор.
   */
  const sides = useMemo(() => threedSides(band), [band]);
  const present = sides.filter((side) => !!side.picture).length;

  return (
    <>
      <div>
        <GroupLabel
          flush
          action={
            <Text size='micro' variant='label' component='span'>
              {present} of 4 marked · front required
            </Text>
          }
        >
          inputs — renders by view
        </GroupLabel>
        {sides.map((side) => {
          const run = side.picture ? runOfPicture(band, side.picture) : null;
          return (
            <InventoryLine
              key={side.view}
              name={viewLabel(side.view)}
              picture={side.picture}
              text={
                side.picture ? (
                  [
                    run?.rrev ? `r${run.rrev}` : '',
                    run ? colourLabel(run.params?.colour, resolved.colors) : '',
                    stripProvenance(band, side.picture),
                  ]
                    .filter(Boolean)
                    .join(' · ')
                ) : side.view === 'front' ? (
                  /* ОДНА СТОРОНА ОБЯЗАТЕЛЬНА, И ЭТО ФРОНТ (K-10/K-11): без него прогон отвергается
                     бесплатно. Красным было помечено ВСЁ пустое, пока это был поворотный стол. */
                  <span className='text-error'>not marked — blocks 3D</span>
                ) : (
                  <span className='text-labelColor'>
                    not marked — optional; each extra side makes the model better
                  </span>
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
            presentation
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            {threed?.presentation === 'model'
              ? `on ${bodyLine(resolved.models, threed)} · garment ${
                  resolved.sizeName(threed?.garmentSizeId ?? 0) || '— no size chosen —'
                }`
              : 'in the air — no figure'}
          </Text>
        </div>
        {threed?.presentation === 'model' && (
          <div className='flex items-center gap-2 border-b border-hairline py-1'>
            <Text size='micro' variant='label' component='span' className='w-[92px] shrink-0 uppercase'>
              the body
            </Text>
            {/* ЧТО ИЗ ЭТОГО ДОХОДИТ ДО МОДЕЛИ, СКАЗАНО ЗДЕСЬ, потому что ради этого панель и
                открывают: слово о телосложении уезжает в промпт, а `model_id` — нет, у снимка нет
                поля ни под имя модели, ни под её мерки. Человек, тратящий деньги, обязан знать,
                какая половина его выбора управляет картинкой, а какая только записывает факт. */}
            <Text size='micro' component='span' className='min-w-0 flex-1'>
              {(threed?.bodyType ?? '').trim() ? (
                <>
                  build <b>{threed?.bodyType}</b> — travels to the model as a word.{' '}
                </>
              ) : (
                <>no build stated — the generator picks one. </>
              )}
              {threed?.modelId ? (
                <span className='text-labelColor'>
                  the chosen model is recorded on the run and is not described to the generator
                </span>
              ) : (
                <span className='text-labelColor'>no model named</span>
              )}
            </Text>
          </div>
        )}
        <div className='flex items-center gap-2 border-b border-hairline py-1'>
          <Text size='micro' variant='label' component='span' className='w-[92px] shrink-0 uppercase'>
            fit
          </Text>
          <Text size='micro' component='span' className='min-w-0 flex-1'>
            {(threed?.fitOverride ?? '').trim() ? (
              <>
                <b>{threed?.fitOverride}</b> — an override; what it produces carries the badge,
                and the card still says {cardFit || '—'}
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
              'a 3D model is built out of the marked RENDERS — the reference photographs are two ' +
              'steps upstream and are not shown to it. They are on the FLAT view of the strip',
          },
          { label: 'moodboard', title: 'mood is for the human — it is never instruction' },
          { label: 'the flats', title: '3D is built from the renders, not from the drawings underneath them' },
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
  thumb,
  text,
}: {
  name: string;
  picture?: common_DesignPicture | null;
  /**
   * An address for a line whose subject is NOT a card picture — the recolour arm's inputs are raw
   * media, and there is no `DesignPicture` to derive a thumbnail from. Supplied wins; the picture
   * is still accepted so the two older arms are untouched.
   */
  thumb?: string;
  text: React.ReactNode;
}): JSX.Element {
  const url = thumb || pictureThumb(picture);
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
 * «Vera K., a curvy build» / «a curvy build» / «Vera K.» / «— no body stated —».
 *
 * ОДИН ВОПРОС, ДВА РЕГИСТРА ОТВЕТА (V-15), поэтому и строка одна: панель повторяет то, что человек
 * только что сказал на экране, а два отдельных поля здесь читались бы как два независимых решения.
 */
function bodyLine(
  models: readonly common_Model[] | undefined,
  threed?: ThreedDraft,
): string {
  const who = modelCaptionOf(models, threed?.modelId);
  const build = (threed?.bodyType ?? '').trim();
  if (who && build) return `${who}, a ${build} build`;
  if (who) return who;
  if (build) return `a ${build} build`;
  return '— no body stated —';
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
  sources,
  cardFit,
  garment,
  resolved,
}: {
  kind: WhatModelGetsKind;
  band: GetDesignBandResponse;
  recipe?: common_DesignColourRecipe;
  threed?: ThreedDraft;
  sources?: readonly common_MediaFull[];
  cardFit: string;
  garment: string;
  resolved: Resolved;
}): string {
  const lines: string[] = [
    `what the model gets — ${kindLabel(kind)}`,
    `garment: ${garment || '—'}`,
    `fit: ${cardFit || '—'} (from the card)`,
  ];

  if (kind === 'recolor') {
    const shots = sources ?? [];
    return [
      // `fit` НЕ ПЕЧАТАЕТСЯ У РЕКОЛА, и строка выше его уже поставила: посадка описывает вещь,
      // которую рисуют, а эта уже снята на человеке. Поэтому текст рекола собирается своим
      // списком, а не дописывается к общему.
      `what the model gets — ${kindLabel(kind)}`,
      `garment: ${garment || '—'}`,
      `inputs: ${shots.length} photograph${shots.length === 1 ? '' : 's'} — ${
        shots.map((m) => `media ${m.id ?? '—'}`).join(', ') || 'none'
      }`,
      `paid calls: ${shots.length} (one per photograph; each call sees only its own picture)`,
      `target colour: ${colourLabel(recipe, resolved.colors)}`,
      `colour in words: ${(recipe?.words ?? '').trim() || '—'}`,
      'not sent: the flats, the bench, the other photographs, references, moodboard, the fit',
    ].join('\n');
  }

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

  const sides = threedSides(band);
  lines.push(
    `inputs: ${sides
      .map((side) => {
        if (!side.picture) {
          return `${viewLabel(side.view)}=${side.view === 'front' ? 'NOT MARKED (required)' : 'not marked (optional)'}`;
        }
        const rrev = runOfPicture(band, side.picture)?.rrev ?? 0;
        return `${viewLabel(side.view)}=${rrev ? `r${rrev}` : 'marked'}`;
      })
      .join(', ')}`,
    threed?.presentation === 'model'
      ? `presentation: on ${bodyLine(resolved.models, threed)} · garment ${
          resolved.sizeName(threed?.garmentSizeId ?? 0) || '—'
        }`
      : 'presentation: in the air',
    threed?.presentation === 'model'
      ? `build sent as a word: ${(threed?.bodyType ?? '').trim() || 'none — the generator picks'}`
      : 'build: not applicable in the air',
    (threed?.fitOverride ?? '').trim()
      ? `fit override: ${threed?.fitOverride} (the result is badged)`
      : 'fit override: none',
    'not sent: references, moodboard, the flats, notes',
  );
  return lines.join('\n');
}
