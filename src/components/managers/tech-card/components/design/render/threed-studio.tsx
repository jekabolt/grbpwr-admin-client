import type { GetDesignBandResponse, common_Model } from 'api/proto-http/admin';
import { useAllModels } from 'components/managers/models/components/useModelQuery';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useState, type JSX } from 'react';
import { Chip, ChipRow } from 'ui/components/chip';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { ViewSwitch } from 'ui/components/view-switch';

import { InertDoor } from '../bench-slot';
import { SILHOUETTE_VIEWS, viewLabel } from '../views';
import { useCardFit, useThreedDraft } from './drafts';
import { FieldRow, Hint } from './field-row';
import { GenerateRow, LockBar } from './generate-row';
import {
  FRAME_CHOICES,
  PRESENTATIONS,
  colourLabel,
  fitChoices,
  latestRenderByView,
  pictureThumb,
  renderRevisions,
  threedGate,
  turntableSourceIds,
  type Gate,
  type Presentation,
} from './model';
import { OutputsSection } from './outputs';
import { Strip, StripCell } from './strip-cell';
import { useStartDesignRun } from './use-design-run';
import { WhatModelGetsRenderModal } from './what-model-gets';

/**
 * THE 3D STUDIO — the turntable, and the four sides it is turned from.
 *
 * 3D TURNS THE RENDERS, NOT THE DRAWINGS. That single sentence is the whole shape of this screen:
 * its input strip lists RENDERS by view, not flats, and the screen is locked until all four sides
 * exist AND come from ONE revision. The second half of that condition is the one worth stating out
 * loud — four sides of different revisions are four different colours, and a rotation stitched out
 * of them looks like a rotation right up until somebody notices the back is the wrong green.
 *
 * LOCKED IS A STATE OF THE SCREEN, NOT ITS ABSENCE. A missing side draws a dashed cell that says
 * `required · blocks 3D` and offers the way out, and the bar under the strip names every side that
 * is missing. The prototype's own screenshot of this state (`proto-07-threed-locked.png`) is a full
 * screen of readable refusals, and that is the point: a technologist must be able to see why 3D is
 * not available without pressing anything.
 *
 * «ON A MODEL» IS A WINDOW INTO AN EXISTING DICTIONARY. The models are the admin's own fit-model
 * profiles (`ListModels`), not a second list invented for this menu — the run freezes a `model_id`,
 * and an id that addresses nothing would make the run panel unreadable a month later. How the
 * garment SITS (which size on which body) is free to try and changes nothing on the card.
 *
 * THE FIT OVERRIDE IS A STATED DEVIATION. It applies to this submission only, and the contract
 * stamps every frame it produces — the card stays the single place of truth about the garment's
 * fit, which is why the override is worded as a badge rather than as a setting.
 *
 * ЗУМ ЗДЕСЬ ТОТ ЖЕ, ЧТО ВЕЗДЕ (T-8). Экран держал СВОЙ `MediaViewer`, а его ряд состоял ровно из
 * четырёх сторон этой полосы — то есть увеличенный кадр турнтейбла был тупиком: ни к рендерам, ни
 * к истории прогонов, ни к флэтам из него было не перелистнуть. Своего просмотрщика больше нет:
 * плита объявляет кадр (`gallery`), а ряд собирает и показывает общий `PictureGalleryProvider`
 * студии.
 */

/** Radix forbids an empty item value, so every «nothing chosen» option here is a sentinel. */
const CARD_FIT = '__card__';
const NO_MODEL = '__nomodel__';
const NO_SIZE = '__nosize__';

const HEIGHT_MEASUREMENT = 'BODY_MEASUREMENT_NAME_HEIGHT';

/** `Vera K. · 178 cm · base M` — the model as the picker says it, from the dictionary's own facts. */
function modelCaption(model: common_Model, sizeName: (id: number) => string): string {
  const parts: string[] = [(model.model?.name ?? '').trim() || `model ${model.id ?? 0}`];
  const heightMm = (model.model?.measurements ?? []).find(
    (m) => m.name === HEIGHT_MEASUREMENT,
  )?.valueMm;
  // Body measurements are stored in MILLIMETRES; a model is spoken of in centimetres.
  if (typeof heightMm === 'number' && heightMm > 0) parts.push(`${Math.round(heightMm / 10)} cm`);
  const base = (model.model?.defaultSizeIds ?? [])[0];
  const label = base ? sizeName(base) : '';
  if (label) parts.push(`base ${label}`);
  return parts.join(' · ');
}

export function ThreedStudio({
  band,
  techCardId,
  disabled,
  /**
   * Switch the band's strip to another representation — what the prototype's `ask for it ▸` and the
   * two doors of the lock bar do. The studio does not own the strip, so when the composer does not
   * hand this in the doors become inert WITH THEIR REASON rather than vanishing.
   */
  onGoToKind,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  onGoToKind?: (kind: 'flat' | 'render') => void;
}): JSX.Element {
  const { draft, patch } = useThreedDraft();
  const cardFit = useCardFit();
  const { dictionary } = useDictionary();
  const { data: models } = useAllModels();
  const run = useStartDesignRun(techCardId);
  /** The prompt inventory. A modal is its own surface, so it is mounted beside the blocks. */
  const [inspecting, setInspecting] = useState(false);

  const byView = useMemo(() => latestRenderByView(band), [band]);
  const present = SILHOUETTE_VIEWS.filter((view) => !!byView[view]);
  const revisions = renderRevisions(byView);

  const sizes = dictionary?.sizes ?? [];
  const sizeName = (id: number) =>
    (sizes.find((s) => s.id === id)?.name ?? '').trim() || (id ? `size ${id}` : '');

  const gate: Gate = useMemo(() => {
    const base = threedGate(band);
    if (!base.ok) return base;
    if (draft.presentation === 'model') {
      if (!draft.modelId) {
        return { ok: false, reason: 'pick which model it sits on, or turn it in the air instead' };
      }
      if (!draft.garmentSizeId) {
        return {
          ok: false,
          reason: 'pick which garment size sits on that body — a fit on a figure has to name one',
        };
      }
    }
    return { ok: true };
  }, [band, draft.presentation, draft.modelId, draft.garmentSizeId]);

  const shape =
    revisions.length === 1
      ? `${draft.frames} frame${draft.frames === 1 ? '' : 's'} · four sides of r${revisions[0]}`
      : `${draft.frames} frame${draft.frames === 1 ? '' : 's'}`;

  const fitOptions = useMemo(() => fitChoices(cardFit), [cardFit]);

  const generate = () => {
    const sourcePictureIds = turntableSourceIds(byView);
    // The gate already refuses an incomplete set; this is the second, cheap guard, because sending
    // a turntable with no sources would freeze a run nobody can ever read back.
    if (!sourcePictureIds.length) return;
    run.start({
      kind: 'threed',
      ask: '',
      params: {
        views: [...SILHOUETTE_VIEWS],
        // Деталей этот прогон не просит, и список пуст ЯВНО: сервер сверяет его длину с числом
      // элементов `detail` в `views`, и «поле не задано» здесь означало бы то же, что пустой
      // список, только молча.
      detailSlotIds: [],
      layout: '',
        colour: undefined,
        threed: {
          frames: draft.frames,
          presentation: draft.presentation,
          modelId: draft.presentation === 'model' ? draft.modelId : 0,
          garmentSizeId: draft.presentation === 'model' ? draft.garmentSizeId : 0,
          fitOverride: draft.fitOverride,
          sourcePictureIds,
        },
        fixTarget: '',
        extraInputMediaIds: [],
        // NOT A FIX, AND SAID EXPLICITLY IN BOTH SPELLINGS. `fix_target` is the frozen scalar the
        // history already states; `fix_targets`/`fix_slot_ids` are the selection a new run uses.
        // Empty in all three is «this run corrects nothing», which is what these two screens do.
        fixTargets: [],
        fixSlotIds: [],
        // `auto_split` is only meaningful with layout = one, and neither of these screens produces
        // a composite: a render comes back one picture per filled slot, a turntable frame by frame.
        autoSplit: false,
      },
    });
  };

  return (
    <>
      <Section
        title='input — renders by view'
        question='— 3D turns the renders, not the drawings'
        action={
          <Text size='micro' variant='label' component='span' className='uppercase'>
            {present.length} of 4
          </Text>
        }
      >
        <Strip>
          {SILHOUETTE_VIEWS.map((view) => {
            const plate = byView[view];
            if (!plate) {
              return (
                <StripCell
                  key={view}
                  alt={viewLabel(view)}
                  empty={
                    <span className='flex flex-col gap-0.5'>
                      <span>{viewLabel(view)}</span>
                      <span className='text-labelColor'>no render</span>
                    </span>
                  }
                  lines={[
                    'required',
                    <span key='blocks' className='text-error'>
                      blocks 3D
                    </span>,
                  ]}
                  action={
                    onGoToKind ? (
                      <button
                        type='button'
                        onClick={() => onGoToKind('render')}
                        className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                      >
                        <Text size='nano' variant='label' component='span'>
                          ask for it ▸
                        </Text>
                      </button>
                    ) : (
                      <InertDoor
                        label='ask for it ▸'
                        reason='switch to FABRIC RENDER on the strip above and render this side — 3D reads the renders, and this one does not exist yet'
                      />
                    )
                  }
                />
              );
            }
            return (
              <StripCell
                key={view}
                emphasis
                src={pictureThumb(plate.picture)}
                alt={viewLabel(view)}
                badge={viewLabel(view)}
                gallery={
                  plate.picture.media ? mediaFullToViewerItem(plate.picture.media) : undefined
                }
                lines={[
                  `latest · ${viewLabel(view)}`,
                  `r${plate.rrev} · ${colourLabel(plate.run.params?.colour, dictionary?.colors)}`,
                ]}
              />
            );
          })}
        </Strip>

        {!gate.ok && (
          <LockBar reason={gate.reason}>
            {onGoToKind ? (
              <>
                <button
                  type='button'
                  onClick={() => onGoToKind('flat')}
                  className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  <Text size='micro' variant='label' component='span'>
                    generate a flat ▸
                  </Text>
                </button>
                <button
                  type='button'
                  onClick={() => onGoToKind('render')}
                  className='cursor-pointer underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  <Text size='micro' variant='label' component='span'>
                    generate a render ▸
                  </Text>
                </button>
              </>
            ) : (
              <InertDoor
                label='generate a render ▸'
                reason='the way out is the strip of representations above — FLAT draws the missing side, FABRIC RENDER colours it, and 3D turns what comes out'
              />
            )}
          </LockBar>
        )}
      </Section>

      <Section title='generation — 3D' question='— frames and how it sits'>
        <FieldRow label='frames'>
          <ChipRow>
            {FRAME_CHOICES.map((choice) => (
              <Chip
                key={choice.frames}
                selected={draft.frames === choice.frames}
                pressed={draft.frames === choice.frames}
                onClick={disabled ? undefined : () => patch({ frames: choice.frames })}
              >
                {choice.label}
              </Chip>
            ))}
          </ChipRow>
          <Hint>each frame is its own picture in the history</Hint>
        </FieldRow>

        <FieldRow label='presentation'>
          {/* A SEGMENTED STRIP, NOT A SELECT. Both options are on screen at all times, so the strip
              states where you are rather than naming where you could go — and its width does not
              change with the choice, which matters here because two pickers appear beside it. */}
          <ViewSwitch<Presentation>
            className='shrink-0'
            label='presentation'
            value={draft.presentation}
            disabled={disabled}
            options={PRESENTATIONS.map((p) => ({ value: p.value, label: p.label }))}
            onChange={(next) => patch({ presentation: next })}
          />

          {/* THE MODEL AND THE SIZE APPEAR ONLY FOR «ON A MODEL». A picker for a figure that is not
              in the picture is a control with no effect, and the run's own snapshot would freeze a
              model nobody chose to use. */}
          {draft.presentation === 'model' ? (
            <>
              <div className='w-[240px] shrink-0'>
                <SelectComponent
                  name='design-threed-model'
                  value={draft.modelId ? String(draft.modelId) : NO_MODEL}
                  placeholder='which model'
                  disabled={disabled}
                  items={[
                    { value: NO_MODEL, label: '— model —' },
                    ...(models ?? [])
                      .filter((m) => (m.id ?? 0) > 0)
                      .map((m) => ({ value: String(m.id), label: modelCaption(m, sizeName) })),
                  ]}
                  onValueChange={(value: string) =>
                    patch({ modelId: value === NO_MODEL ? 0 : Number(value) || 0 })
                  }
                  fullWidth
                />
              </div>
              <div className='w-[130px] shrink-0'>
                <SelectComponent
                  name='design-threed-size'
                  value={draft.garmentSizeId ? String(draft.garmentSizeId) : NO_SIZE}
                  placeholder='which size'
                  disabled={disabled}
                  items={[
                    { value: NO_SIZE, label: '— size —' },
                    ...sizes
                      .filter((s) => (s.id ?? 0) > 0)
                      .map((s) => ({
                        value: String(s.id),
                        label: `size ${(s.name ?? '').trim() || s.id}`,
                      })),
                  ]}
                  onValueChange={(value: string) =>
                    patch({ garmentSizeId: value === NO_SIZE ? 0 : Number(value) || 0 })
                  }
                  fullWidth
                />
              </div>
              <Hint>
                how it SITS: this garment size on this body — free to try, changes nothing on the
                card
              </Hint>
            </>
          ) : (
            <Hint>no figure — the garment turns alone</Hint>
          )}
        </FieldRow>

        <FieldRow label='fit'>
          <div className='w-[210px] shrink-0'>
            <SelectComponent
              name='design-threed-fit'
              value={draft.fitOverride || CARD_FIT}
              placeholder={`card · ${cardFit || 'not stated'}`}
              disabled={disabled}
              items={[
                { value: CARD_FIT, label: `card · ${cardFit || 'not stated'}` },
                ...fitOptions.map((fit) => ({ value: fit, label: fit })),
              ]}
              onValueChange={(value: string) =>
                patch({ fitOverride: value === CARD_FIT ? '' : value })
              }
              fullWidth
            />
          </div>
          {draft.fitOverride ? (
            <Pill tone='attention'>≠ card — every frame will carry the badge</Pill>
          ) : (
            <Pill>from classification</Pill>
          )}
          <Hint>
            a one-run override for the turntable only — the card stays the single place of truth
          </Hint>
        </FieldRow>

        <GenerateRow
          band={band}
          gate={gate}
          shape={shape}
          pending={run.isPending}
          disabled={disabled}
          onGenerate={generate}
          onInspect={() => setInspecting(true)}
        />
      </Section>

      {/* The turntables this page of the band holds — the outputs, where the mark «chosen» lives
          and is SET (W-12). One shared section with FABRIC RENDER; see `./outputs`. */}
      <OutputsSection band={band} techCardId={techCardId} kind='threed' disabled={disabled} />

      <WhatModelGetsRenderModal
        open={inspecting}
        onOpenChange={setInspecting}
        band={band}
        kind='threed'
        threed={draft}
        cardFit={cardFit}
        models={models}
        sizeName={sizeName}
      />
    </>
  );
}

