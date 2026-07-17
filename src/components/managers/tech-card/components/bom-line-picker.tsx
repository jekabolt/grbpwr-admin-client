import { useFormContext, useWatch } from 'react-hook-form';
import { FormLabel } from 'ui/form';
import { TechCardFormData } from './schema';

// Shared BOM-line chooser keyed by the stable line_key (§2.3). Operations, cut-piece fabric maps and
// colourway recipes reference BOM lines through this, so adding/removing/reordering a BOM line never
// renumbers anything — the reference is the line's own key, not its position.

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

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

type BomLineLite = { lineKey?: string; name?: string; section?: string };

function sectionShort(section?: string): string {
  if (!section) return '';
  return SECTION_SHORT[section] ?? section.replace('TECH_CARD_BOM_SECTION_', '').toLowerCase();
}
function bomLineLabel(b: BomLineLite, i: number): string {
  const s = b.section ? ` · ${sectionShort(b.section)}` : '';
  return `${i + 1}. ${b.name?.trim() || 'unnamed'}${s}`;
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
