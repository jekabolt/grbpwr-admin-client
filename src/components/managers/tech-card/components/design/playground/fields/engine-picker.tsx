import type { DesignImageModel } from 'api/proto-http/admin';
import type { JSX } from 'react';
import Text from 'ui/components/text';

import { FieldRow } from '../../render/field-row';
import { OptionRow } from './option-row';
import { ToggleRow } from './toggle-row';

/**
 * ═══ THE AI MODEL AND ITS QUALITY (C-08, D6 — owner, tile 1: «выбор модели», «качество: пикер
 * согласно модели low mid high») ═══════════════════════════════════════════════════════════════
 *
 * Two ruled lines inside one folded section (`engineSection()` in the registry): «Model» and
 * «Quality». The fold's header already prints «GPT Image 2 · medium», so a person who never opens
 * it still knows what the run gets; nothing here repeats that summary.
 *
 * THE LIST IS THE SERVER'S. Models come from `band.imageModels`, tiers from the chosen model's own
 * `qualities`, in the server's words (low / medium / high) — never a client list that could offer
 * a tier the door refuses (`quality_not_supported`). A single model is printed, not offered: a
 * select with one entry is a control with nothing to choose.
 *
 * «Transparent background» is a third line only when the tile asks for it (`background`) AND the
 * chosen model lists `transparent`; switching to a model that does not hides it (the wire drops
 * the word the same way, `imageOptionsOf`).
 */
export type EnginePickerProps = {
  models: readonly DesignImageModel[];
  /** The chosen model's slug (already resolved to a listed one). */
  model: string;
  /** The chosen tier (already resolved to one of the model's). */
  quality: string;
  onModel: (slug: string) => void;
  onQuality: (tier: string) => void;
  /** The tile's «Transparent background» flag; absent = the tile has no such row. */
  background?: { checked: boolean; onChange: (on: boolean) => void };
  disabled?: boolean;
};

const labelOf = (m: DesignImageModel) => (m.label ?? '').trim() || (m.slug ?? '');

export function EnginePicker({
  models,
  model,
  quality,
  onModel,
  onQuality,
  background,
  disabled,
}: EnginePickerProps): JSX.Element {
  const chosen = models.find((m) => m.slug === model) ?? models[0];
  const tiers = chosen?.qualities ?? [];
  const transparent = !!background && (chosen?.backgrounds ?? []).includes('transparent');

  return (
    <div data-engine-picker=''>
      {models.length > 1 ? (
        <OptionRow
          label='Model'
          anchor='engine-model'
          value={model}
          options={models.map((m) => ({ value: m.slug ?? '', label: labelOf(m) }))}
          onChange={onModel}
          disabled={disabled}
        />
      ) : (
        <FieldRow label='Model' className='py-2' data-option-row='engine-model'>
          <Text component='span' className='ml-auto'>
            {chosen ? labelOf(chosen) : '—'}
          </Text>
        </FieldRow>
      )}
      {tiers.length > 1 ? (
        <OptionRow
          label='Quality'
          anchor='engine-quality'
          control='segmented'
          value={quality}
          options={tiers.map((t) => ({ value: t, label: t }))}
          onChange={onQuality}
          disabled={disabled}
        />
      ) : (
        tiers.length === 1 && (
          <FieldRow label='Quality' className='py-2' data-option-row='engine-quality'>
            <Text component='span' className='ml-auto'>
              {tiers[0]}
            </Text>
          </FieldRow>
        )
      )}
      {transparent && background && (
        <ToggleRow
          label='Transparent background'
          anchor='engine-background'
          checked={background.checked}
          onChange={background.onChange}
          disabled={disabled}
        />
      )}
    </div>
  );
}
