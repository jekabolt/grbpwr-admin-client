import { common_Material } from 'api/proto-http/admin';
import { materialSpec } from 'components/managers/materials/components/material-code';
import { materialImageUrl } from 'components/managers/materials/components/material-thumb';
import { cn } from 'lib/utility';
import { Media, Tile } from 'ui';
import { decimalToInput } from 'utils/decimal';

// A material is chosen by looking at it (owner 16.10: «by the name it's hard to understand what the
// fabric is»): catalog image → the material's colour → panel grey.
export function materialSwatchColor(m?: common_Material): string | undefined {
  const c = (m?.color ?? '').trim();
  if (!c || typeof CSS === 'undefined' || !CSS.supports('color', c)) return undefined;
  return c;
}

/** `98 co 2 ea` — the structured blend as codes, else the free-text composition. */
export function compositionShort(m?: common_Material): string {
  const entries = (m?.compositionEntries ?? [])
    .map((e) => ({
      code: (e.fiberCode || e.name || '').trim().toLowerCase(),
      pct: Number(decimalToInput(e.percent)) || 0,
    }))
    .filter((e) => e.code && e.pct > 0)
    .sort((a, b) => b.pct - a.pct);
  if (entries.length) return entries.map((e) => `${e.pct} ${e.code}`).join(' ');
  return (m?.composition ?? '').trim();
}

export function MaterialSwatch({ material }: { material?: common_Material }) {
  const url = materialImageUrl(material);
  if (url) {
    return (
      <span className='block aspect-square overflow-hidden border border-borderColor'>
        <Media src={url} alt={material?.name || 'material'} aspectRatio='1/1' fit='cover' />
      </span>
    );
  }
  return (
    <span
      className='block aspect-square border border-borderColor bg-pageBg'
      style={{ background: materialSwatchColor(material) }}
    />
  );
}

/**
 * One material as a 128px tile: swatch · name · colour + composition · spec · on hand · tag. Used by
 * the create quiz and by the sample's MATERIALS (selected/hover = ink border, problem = red 2px).
 */
export function MaterialTile({
  material,
  name,
  onHand,
  tag,
  lines,
  selected,
  problem,
  onClick,
}: {
  material?: common_Material;
  /** Overrides the material's own name (e.g. `own fabric`). */
  name?: string;
  onHand?: string;
  tag?: string;
  /** Replaces the default info lines (MATERIALS: material · qty · cost). */
  lines?: React.ReactNode[];
  selected?: boolean;
  problem?: boolean;
  onClick?: () => void;
}) {
  const colourLine = [material?.color?.trim(), compositionShort(material)]
    .filter(Boolean)
    .join(' · ');
  // Spec without the composition — that already rides on the colour line.
  const spec = material
    ? materialSpec({ ...material, composition: '', compositionEntries: [] })
    : '';
  const unit = material?.unit?.trim();
  return (
    <Tile
      onClick={onClick}
      selected={selected}
      tone={problem ? 'error' : 'default'}
      className={cn(problem && 'border-2')}
      title={material?.name}
      media={<MaterialSwatch material={material} />}
      name={name ?? material?.name ?? '—'}
    >
      {(lines ?? [colourLine, spec, onHand ? `${onHand}${unit ? ` ${unit}` : ''}` : '', tag])
        .filter(Boolean)
        .map((line, i) => (
          <span key={i} className='truncate text-micro uppercase text-labelColor'>
            {line}
          </span>
        ))}
    </Tile>
  );
}
