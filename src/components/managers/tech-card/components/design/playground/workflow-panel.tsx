import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { useMemo, useRef, useState, type JSX } from 'react';
import Text from 'ui/components/text';

import { GenerateRow, LockBar, RunRefusal } from '../render/generate-row';
import { useStartDesignRun } from '../render/use-design-run';
import {
  FoldSection,
  FormatGrid,
  ImageSlots,
  OptionRow,
  PantoneField,
  PromptField,
  Slider,
  ToggleRow,
} from './fields';
import { rememberRecentText, recentTextKey } from './recent';
import { colourOf, imagesOf, promptKeys, textOf } from './registry/common';
import type { Draft, FieldDef, SectionDef, WorkflowDef, WorkflowRun } from './registry/types';
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
  const run = useStartDesignRun(techCardId);
  const [inspecting, setInspecting] = useState(false);

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
      {flow.sections.map((section) => (
        <div key={section.key} id={sectionId(section.key)}>
          <PanelSection
            def={def}
            section={section}
            band={band}
            techCardId={techCardId}
            draft={draft}
            onDraft={onDraft}
            disabled={disabled}
          />
        </div>
      ))}

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
          onInspect={() => setInspecting(true)}
        />
      </div>

      <WhatModelGetsPlaygroundModal
        open={inspecting}
        onOpenChange={setInspecting}
        inventory={inspecting ? flow.inventory(draft, request, ctx) : null}
      />
    </>
  );
}

function PanelSection({
  def,
  section,
  band,
  techCardId,
  draft,
  onDraft,
  disabled,
}: {
  def: WorkflowDef;
  section: SectionDef;
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
      value={section.value?.(draft)}
      collapsible={section.collapsible ?? false}
      defaultOpen={section.defaultOpen ?? true}
      anchor={`${def.key}.${section.key}`}
    >
      <div className='flex flex-col gap-3'>
        {section.fields.map((field) => (
          <Field
            key={field.key}
            def={def}
            field={field}
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
  band,
  techCardId,
  draft,
  onDraft,
  disabled,
}: {
  def: WorkflowDef;
  field: FieldDef;
  band: GetDesignBandResponse;
  techCardId: number;
  draft: Draft;
  onDraft: (fn: (draft: Draft) => Draft) => void;
  disabled?: boolean;
}): JSX.Element {
  const key = field.key;
  switch (field.type) {
    case 'prompt':
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
        />
      );
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
          reuseLabel={field.reuseLabel}
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
          reuseLabel={field.reuseLabel}
          disabled={disabled}
        />
      );
    case 'format':
      return (
        <FormatGrid
          value={draft.choices[key] ?? field.initial}
          onChange={(ratio) => onDraft((d) => ({ ...d, choices: { ...d.choices, [key]: ratio } }))}
          ratios={field.ratios}
          disabled={disabled}
        />
      );
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
