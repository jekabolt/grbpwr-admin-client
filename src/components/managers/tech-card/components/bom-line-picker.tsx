import { useFormContext, useWatch } from 'react-hook-form';
import { FormLabel } from 'ui/form';
import { TechCardFormData } from './schema';

// Shared BOM-line chooser keyed by the stable line_key (§2.3). Operations, cut-piece fabric maps and
// colourway recipes reference BOM lines through this, so adding/removing/reordering a BOM line never
// renumbers anything — the reference is the line's own key, not its position.

// Same box metrics as <Input>/<Select> so a BOM-line reference is indistinguishable from any
// other field on the card.
const cell =
  'block min-h-[22px] w-full appearance-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none disabled:bg-bgZebra disabled:text-labelColor';

const SECTION_SHORT: Record<string, string> = {
  TECH_CARD_BOM_SECTION_FABRIC: 'fabric',
  TECH_CARD_BOM_SECTION_LINING: 'lining',
  TECH_CARD_BOM_SECTION_INTERLINING: 'interlining',
  TECH_CARD_BOM_SECTION_INSULATION: 'insulation',
  TECH_CARD_BOM_SECTION_HARDWARE: 'hardware',
  TECH_CARD_BOM_SECTION_THREAD: 'thread',
  TECH_CARD_BOM_SECTION_LABEL: 'label',
  TECH_CARD_BOM_SECTION_PACKAGING: 'packaging',
  TECH_CARD_BOM_SECTION_TRIM: 'trim',
  TECH_CARD_BOM_SECTION_DECORATION: 'decoration',
};

type BomLineLite = {
  lineKey?: string;
  name?: string;
  section?: string;
  supplierRef?: string;
  // Server PK. 0 = the row has never been saved, so it exists only in this form.
  id?: number;
};

// The one-word section name. `techCardBomSectionOptions` carries operator-facing labels with
// parentheticals ("hardware (пуговицы / молнии / кнопки)") that don't fit a Pill, so the BOM tile
// and the catalog plate badge read from here instead.
export function sectionShort(section?: string): string {
  if (!section) return '';
  return SECTION_SHORT[section] ?? section.replace('TECH_CARD_BOM_SECTION_', '').toLowerCase();
}
function bomLineLabel(b: BomLineLite, i: number): string {
  const s = b.section ? ` · ${sectionShort(b.section)}` : '';
  // The supplier's article, when the line has one: two lines can share a role name ("подкладка")
  // and be different articles, and the article is what the operator reads off the BOM tab.
  const ref = b.supplierRef?.trim() ? ` · ${b.supplierRef.trim()}` : '';
  return `${i + 1}. ${b.name?.trim() || 'unnamed'}${s}${ref}`;
}

// Controlled variant (value = line_key). Use where the selection lives outside a plain RHF path,
// e.g. the sparse piece×colourway fabric-map cells.
export function BomLineSelect({
  value,
  onChange,
  sections,
  noneLabel = '— none —',
  className,
  disabled,
}: {
  value: string;
  onChange: (lineKey: string) => void;
  sections?: string[];
  noneLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as BomLineLite[];
  const options = bomItems
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !!b.lineKey && (!sections || sections.includes(b.section ?? '')));
  // Keep the current choice selectable even if a section filter (or a later section change) would
  // hide it — so editing never silently blanks a stored reference.
  const currentIndex = value ? bomItems.findIndex((b) => b.lineKey === value) : -1;
  const currentShown = !value || options.some(({ b }) => b.lineKey === value);

  return (
    <select
      className={className ?? cell}
      value={value || ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value=''>{noneLabel}</option>
      {options.map(({ b, i }) => (
        <option key={b.lineKey} value={b.lineKey}>
          {bomLineLabel(b, i)}
        </option>
      ))}
      {!currentShown && currentIndex >= 0 && (
        <option value={value}>{bomLineLabel(bomItems[currentIndex], currentIndex)}</option>
      )}
    </select>
  );
}

export type BomItemIdOption = { value: string | number; label: string; disabled?: boolean };

// Options for the ONE BOM reference on the card that is still expressed as a server FK instead of a
// line_key: TechCardLabel.bom_item_id (§2.8 — the bridge from a label SPEC to the physical material
// it prints on). The wire message carries `bom_item_id` and nothing else, so a BOM row that has
// never been saved has no identity this reference can address yet.
//
// Such rows are listed DISABLED rather than hidden: «the line is right there and I still cannot
// pick it» is the question hiding them would leave unanswered. The hint is one click from being
// resolved — a body save re-seeds BOM ids from the server by line_key (withServerAssignedValues),
// so the row becomes pickable without a reload.
//
// `currentId` is the value the field holds now: an id matching no current line (deleted by another
// editor, or written against another card) is kept as its own visible option and reported back as
// `dangling`, so opening a card and saving it cannot quietly drop a link this screen is unable to
// explain — the operator is told instead, and re-points or clears it deliberately.
export function useBomItemIdOptions(currentId: number): {
  options: BomItemIdOption[];
  dangling: boolean;
} {
  const { control } = useFormContext<TechCardFormData>();
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as BomLineLite[];

  const options: BomItemIdOption[] = [{ value: 0, label: '— not linked —' }];
  bomItems.forEach((b, i) => {
    const id = b.id ?? 0;
    options.push(
      id > 0
        ? { value: id, label: bomLineLabel(b, i) }
        : {
            // Never selectable, so the value only has to be unique among the options.
            value: `unsaved-${b.lineKey || i}`,
            label: `${bomLineLabel(b, i)} · сначала сохраните карту`,
            disabled: true,
          },
    );
  });
  const dangling = currentId > 0 && !bomItems.some((b) => (b.id ?? 0) === currentId);
  if (dangling) options.push({ value: currentId, label: `#${currentId} · строка BOM удалена?` });
  return { options, dangling };
}

// RHF-bound variant: pass the form path (…​.bomLineKey). Renders a label + the select.
export function BomLinePicker({
  name,
  label,
  sections,
  noneLabel,
}: {
  name: string;
  label?: string;
  sections?: string[];
  noneLabel?: string;
}) {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const value = (useWatch({ control, name: name as never }) as string) || '';
  return (
    <div className='space-y-1'>
      {label && <FormLabel>{label}</FormLabel>}
      <BomLineSelect
        value={value}
        sections={sections}
        noneLabel={noneLabel}
        onChange={(lk) => setValue(name as never, lk as never, { shouldDirty: true })}
      />
    </div>
  );
}
