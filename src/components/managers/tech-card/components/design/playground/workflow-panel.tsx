import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, useRef, useState, type JSX } from 'react';
import Text from 'ui/components/text';

import { GenerateRow, LockBar, RunRefusal } from '../render/generate-row';
import { useStartDesignRun } from '../render/use-design-run';
import { useFocusReturn } from './focus';
import {
  ColourwayRenderPicker,
  EnginePicker,
  FoldSection,
  FormatGrid,
  ImageSlots,
  ModelPhotoPicker,
  OptionRow,
  PantoneField,
  PromptField,
  Slider,
  ToggleRow,
} from './fields';
import { playgroundRunScope } from './address';
import { cardRecentTexts } from './card-recent';
import { bandSuggestsPrompts, ideasContext } from './ideas-server';
import { rememberRecentText, recentTextKey } from './recent';
import {
  chooseEngine,
  colourOf,
  drawnOn,
  drawnRatios,
  engineChoiceKeys,
  engineOf,
  formatOf,
  imageModelsOf,
  imagesOf,
  promptKeys,
  qualityOf,
  textOf,
} from './registry/common';
import type {
  Draft,
  FieldDef,
  SectionDef,
  WireCtx,
  WorkflowDef,
  WorkflowRun,
} from './registry/types';
import { WhatModelGetsPlaygroundModal } from './what-model-gets';

/**
 * ═══ THE FORM OF AN OPEN WORKFLOW (C-03) ═════════════════════════════════════════════════════════
 *
 * The workflow's sections top to bottom, each headed as the owner's references head them (glyph ·
 * title · REQUIRED · value), with generous air between them; then the doors of the run in the order
 * every generative screen of the band uses: the server's own refusal (`RunRefusal`), the free
 * refusal in words (`LockBar`), and GENERATE with the price words and the inventory door
 * (`GenerateRow`).
 *
 * ⚠ THE REQUEST IS BUILT ONCE, BY `def.run.wire`. The gate, the price words, the inventory and the
 * press all read that one object — see `registry/types.ts`.
 *
 * ⚠ «RECENTLY USED» IS WRITTEN ONLY AFTER THE DOOR ACCEPTED THE RUN. A text the server refused is
 * not a text anything was generated with (C-02 handoff).
 *
 * ⚠ THIS FORM IS UNMOUNTED WHILE ITS RUN CAN STILL BE STARTING (|→, Back, the rail, another
 * workflow), so nothing about the press may live only here: the idempotency key and «starting…»
 * are the scoped hook's (`playgroundRunScope`, G-01), and the «Recently used» write rides with the
 * press into the mutation.
 */
export function WorkflowPanel({
  def,
  run: flow,
  band,
  techCardId,
  draft,
  onDraft,
  disabled,
}: {
  def: WorkflowDef;
  run: WorkflowRun;
  band: GetDesignBandResponse;
  techCardId: number;
  draft: Draft;
  onDraft: (fn: (draft: Draft) => Draft) => void;
  disabled?: boolean;
}): JSX.Element {
  const run = useStartDesignRun(techCardId, { scope: playgroundRunScope(def.key) });
  const [inspecting, setInspecting] = useState(false);
  /* Radix restores focus to a `Dialog.Trigger`; this dialog is opened by state and has none, so the
     opener is remembered and handed focus back on close (G-01, Codex 5). */
  const inspectFocus = useFocusReturn();

  /* THE CARD CHANGED — the open inventory is about the other card (invariant 12), closed in the
     body of the render like every other screen of the band. */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (inspecting) setInspecting(false);
  }

  const ctx = useMemo(() => ({ band }), [band]);
  const refusal = useMemo(() => flow.validate(draft, ctx), [flow, draft, ctx]);
  const request = useMemo(() => flow.wire(draft, ctx), [flow, draft, ctx]);
  const shape = flow.shape(draft, request);

  const generate = () => {
    if (refusal) return;
    // The words of THIS press, captured now: the answer lands later, over a form that may have
    // moved on.
    const said = promptKeys(flow.sections).map((key) => [key, textOf(draft, key)] as const);
    run.start(request, {
      onAccepted: () => {
        for (const [key, text] of said) rememberRecentText(recentTextKey(def.key, key), text);
      },
    });
  };

  const sectionId = (key: string) => `playground-${def.key}-${key}`;

  return (
    <>
      {/* A section THIS server cannot use is not drawn (its `when`): the AI model and Format folds
          exist only where the band lists engines (C-08). */}
      {flow.sections
        .filter((section) => drawnOn(band, section))
        .map((section) => (
          <div key={section.key} id={sectionId(section.key)}>
            <PanelSection
              def={def}
              section={section}
              sections={flow.sections}
              ctx={ctx}
              band={band}
              techCardId={techCardId}
              draft={draft}
              onDraft={onDraft}
              disabled={disabled}
            />
          </div>
        ))}

      {/* A workflow bought elsewhere (tile 10: the Mask action) has no press here. */}
      {!flow.startsElsewhere && (
        <div className='flex flex-col gap-3'>
          <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />
          {/* THE REASON, NOT A DOOR. The section that lifts it is on screen a few lines up and names
            itself in the reason; a scroll-to button here was one more button for the same place
            (owner: few buttons, never two for one action). */}
          {refusal && !disabled && <LockBar reason={refusal.reason} />}
          <GenerateRow
            gate={refusal ? { ok: false, reason: refusal.reason } : { ok: true }}
            shape={shape}
            pending={run.isPending}
            disabled={disabled}
            onGenerate={generate}
            onInspect={() => {
              inspectFocus.remember();
              setInspecting(true);
            }}
          />
        </div>
      )}

      <WhatModelGetsPlaygroundModal
        open={inspecting}
        onOpenChange={setInspecting}
        onCloseAutoFocus={inspectFocus.onCloseAutoFocus}
        inventory={inspecting ? flow.inventory(draft, request, ctx) : null}
      />
    </>
  );
}

function PanelSection({
  def,
  section,
  sections,
  ctx,
  band,
  techCardId,
  draft,
  onDraft,
  disabled,
}: {
  def: WorkflowDef;
  section: SectionDef;
  sections: readonly SectionDef[];
  ctx: WireCtx;
  band: GetDesignBandResponse;
  techCardId: number;
  draft: Draft;
  onDraft: (fn: (draft: Draft) => Draft) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <FoldSection
      title={section.title}
      glyph={section.glyph}
      required={section.required}
      info={section.info}
      value={section.value?.(draft, ctx)}
      collapsible={section.collapsible ?? false}
      defaultOpen={section.defaultOpen ?? true}
      anchor={`${def.key}.${section.key}`}
    >
      <div className='flex flex-col gap-3'>
        {section.fields
          .filter((field) => drawnOn(band, field))
          .map((field) => (
            <Field
              key={field.key}
              def={def}
              field={field}
              sections={sections}
              band={band}
              techCardId={techCardId}
              draft={draft}
              onDraft={onDraft}
              disabled={disabled}
            />
          ))}
      </div>
    </FoldSection>
  );
}

/** One field, drawn by its C-02 primitive. The draft is written by field key and nothing else. */
function Field({
  def,
  field,
  sections,
  band,
  techCardId,
  draft,
  onDraft,
  disabled,
}: {
  def: WorkflowDef;
  field: FieldDef;
  sections: readonly SectionDef[];
  band: GetDesignBandResponse;
  techCardId: number;
  draft: Draft;
  onDraft: (fn: (draft: Draft) => Draft) => void;
  disabled?: boolean;
}): JSX.Element | null {
  const key = field.key;
  switch (field.type) {
    case 'prompt': {
      // THE SERVER'S IDEAS (C-15): drawn into the same `ideas ▾` menu, only where the band names the
      // assistant's model. The question is built here, per render, and costs nothing until a press.
      const from = bandSuggestsPrompts(band) ? field.ideasFrom?.(draft, { band }) : undefined;
      const serverIdeas = bandSuggestsPrompts(band)
        ? {
            techCardId,
            mediaIds: from?.mediaIds ?? [],
            context: ideasContext({
              workflowTitle: def.title,
              hint: field.hint,
              sections,
              draft,
              skip: key,
              extra: from?.context,
            }),
          }
        : undefined;
      return (
        <PromptField
          value={textOf(draft, key)}
          onChange={(text) => onDraft((d) => ({ ...d, texts: { ...d.texts, [key]: text } }))}
          label={field.label}
          placeholder={field.placeholder}
          workflowKey={def.key}
          fieldKey={key}
          hint={field.hint}
          maxLength={field.maxLength}
          disabled={disabled}
          serverIdeas={serverIdeas}
          cardRecent={cardRecentTexts(band, def.key, key)}
        />
      );
    }
    case 'images':
      return field.mode === 'grow' ? (
        <ImageSlots
          mode='grow'
          max={field.max}
          value={imagesOf(draft, key)}
          onChange={(list) => onDraft((d) => ({ ...d, images: { ...d.images, [key]: list } }))}
          band={band}
          techCardId={techCardId}
          sources={field.sources}
          purpose={field.purpose ?? def.title}
          disabled={disabled}
        />
      ) : (
        <ImageSlots
          mode='fixed'
          slots={field.slots}
          value={draft.slots[key] ?? {}}
          onChange={(next) => onDraft((d) => ({ ...d, slots: { ...d.slots, [key]: next } }))}
          band={band}
          techCardId={techCardId}
          sources={field.sources}
          purpose={field.purpose ?? def.title}
          disabled={disabled}
        />
      );
    case 'format': {
      // Bound to an AI model: what it cannot draw is dimmed, and the value shown is the snapped one
      // the header prints and the wire sends (`formatOf`).
      const model = field.boundTo === undefined ? null : engineOf(band, draft, field.boundTo);
      const label = model ? (model.label ?? '').trim() || (model.slug ?? '') : '';
      return (
        <FormatGrid
          value={formatOf(band, draft, field)}
          onChange={(ratio) => onDraft((d) => ({ ...d, choices: { ...d.choices, [key]: ratio } }))}
          ratios={drawnRatios(band, field)}
          allowed={model ? model.aspectRatios ?? [] : undefined}
          disallowedReason={model ? `not made by ${label}` : undefined}
          disabled={disabled}
        />
      );
    }
    case 'engine': {
      const models = imageModelsOf(band);
      const model = engineOf(band, draft, key);
      if (!models || !model) return null;
      const keys = engineChoiceKeys(key);
      const bg = field.backgroundKey;
      return (
        <EnginePicker
          models={models}
          model={model.slug ?? ''}
          quality={qualityOf(model, draft, key)}
          onModel={(slug) => onDraft((d) => chooseEngine(d, band, sections, key, slug))}
          onQuality={(tier) =>
            onDraft((d) => ({ ...d, choices: { ...d.choices, [keys.quality]: tier } }))
          }
          background={
            bg
              ? {
                  checked: draft.flags[bg] ?? false,
                  onChange: (on) => onDraft((d) => ({ ...d, flags: { ...d.flags, [bg]: on } })),
                }
              : undefined
          }
          disabled={disabled}
        />
      );
    }
    case 'model-profile': {
      const photoKey = field.photoKey;
      return (
        <ModelPhotoPicker
          modelId={Number(draft.choices[key] ?? 0) || 0}
          photo={imagesOf(draft, photoKey)[0] ?? null}
          onChange={({ modelId, photo }) =>
            onDraft((d) => ({
              ...d,
              choices: { ...d.choices, [key]: String(modelId) },
              images: { ...d.images, [photoKey]: photo ? [photo] : [] },
            }))
          }
          disabled={disabled}
        />
      );
    }
    case 'colourway-render': {
      const cwKey = field.colorwayKey;
      return (
        <ColourwayRenderPicker
          band={band}
          techCardId={techCardId}
          value={imagesOf(draft, key)}
          colorwayId={Number(draft.choices[cwKey] ?? 0) || 0}
          max={field.max}
          onChange={({ renders, colorwayId }) =>
            onDraft((d) => ({
              ...d,
              images: { ...d.images, [key]: renders },
              choices: { ...d.choices, [cwKey]: String(colorwayId) },
            }))
          }
          disabled={disabled}
        />
      );
    }
    case 'custom':
      return <>{field.render({ band, techCardId, draft, onDraft, disabled })}</>;
    case 'option':
      return (
        <OptionRow
          label={field.label}
          value={draft.choices[key] ?? field.initial}
          options={field.options}
          control={field.control}
          onChange={(value) => onDraft((d) => ({ ...d, choices: { ...d.choices, [key]: value } }))}
          disabled={disabled}
        />
      );
    case 'toggle':
      return (
        <ToggleRow
          label={field.label}
          checked={draft.flags[key] ?? field.initial}
          onChange={(on) => onDraft((d) => ({ ...d, flags: { ...d.flags, [key]: on } }))}
          disabled={disabled}
        />
      );
    case 'slider':
      return (
        <Slider
          label={field.label}
          steps={field.steps}
          value={draft.choices[key] ?? field.initial}
          onChange={(value) => onDraft((d) => ({ ...d, choices: { ...d.choices, [key]: value } }))}
          disabled={disabled}
        />
      );
    case 'pantone':
      return (
        <PantoneField
          name={`${def.key}.${key}`}
          value={colourOf(draft, key)}
          onChange={(colour) =>
            onDraft((d) => ({ ...d, colours: { ...d.colours, [key]: colour } }))
          }
          placeholder={field.placeholder}
          disabled={disabled}
        />
      );
    case 'note':
      return (
        <Text size='micro' variant='label' component='p' className='normal-case'>
          {field.text}
        </Text>
      );
  }
}
