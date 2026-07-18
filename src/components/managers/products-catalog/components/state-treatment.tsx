import { ArchiveIcon, EyeNoneIcon, Pencil1Icon } from '@radix-ui/react-icons';
import { common_Colorway, common_ColorwayLifecycleStatus } from 'api/proto-http/admin';
import Text from 'ui/components/text';

// Catalog-scoped lifecycle presentation.
//
// The owner's problem: on a dense grid, HIDDEN and ARCHIVED (and DRAFT) all looked alike — a tiny
// corner pill plus one identical dimming overlay. Here each off-storefront state is made mutually
// unmistakable with THREE redundant, monochrome-safe cues so state reads instantly, not by hunting:
//   1. badge fill      — hollow / solid-black / solid-grey (a luminance ramp, works without colour)
//   2. glyph           — pencil / eye-off / archive box   (shape, language-independent)
//   3. media treatment — 75% dim / 50% dim / greyscale+40% (the big at-a-glance signal)
//
// ACTIVE is deliberately unstyled: a live colourway needs no marker, so "any treatment == not fully
// live" becomes the rule the eye learns. Badges carry a self-contained fill so they stay legible over
// any thumbnail; every colour used is a committed token (#000 / #fff / #666 == labelColor, ~5.7:1).

type StateKey = 'DRAFT' | 'HIDDEN' | 'ARCHIVED';

const STATE_UI: Record<
  StateKey,
  {
    label: string;
    Icon: typeof ArchiveIcon;
    badgeClass: string;
    mediaClass: string;
  }
> = {
  DRAFT: {
    label: 'draft',
    Icon: Pencil1Icon,
    badgeClass: 'border border-textColor bg-bgColor text-textColor',
    mediaClass: 'opacity-75',
  },
  HIDDEN: {
    label: 'hidden',
    Icon: EyeNoneIcon,
    badgeClass: 'bg-textColor text-bgColor',
    mediaClass: 'opacity-50',
  },
  ARCHIVED: {
    label: 'archived',
    Icon: ArchiveIcon,
    badgeClass: 'bg-labelColor text-bgColor',
    mediaClass: 'opacity-40 grayscale',
  },
};

function toStateKey(status?: common_ColorwayLifecycleStatus): StateKey | null {
  switch (status) {
    case 'COLORWAY_LIFECYCLE_STATUS_DRAFT':
      return 'DRAFT';
    case 'COLORWAY_LIFECYCLE_STATUS_HIDDEN':
      return 'HIDDEN';
    case 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED':
      return 'ARCHIVED';
    default:
      return null; // ACTIVE / UNKNOWN / unset → no treatment (reads as live)
  }
}

// Tailwind classes for the thumbnail wrapper. Empty for live colourways.
export function getCatalogStateMediaClass(status?: common_ColorwayLifecycleStatus): string {
  const key = toStateKey(status);
  return key ? STATE_UI[key].mediaClass : '';
}

// The primary state marker: a worded, glyphed pill for every off-storefront lifecycle state.
export function CatalogStateBadge({ status }: { status?: common_ColorwayLifecycleStatus }) {
  const key = toStateKey(status);
  if (!key) return null;
  const { label, Icon, badgeClass } = STATE_UI[key];
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 leading-none ${badgeClass}`}>
      <Icon className='h-3 w-3 shrink-0' aria-hidden />
      <Text size='small' variant='uppercase' component='span'>
        {label}
      </Text>
    </span>
  );
}

// Secondary commerce markers (sale / preorder / sold out) the owner also flagged. Kept visually
// subordinate to the lifecycle badge — hollow white chips so they read on any photo without competing
// with the black/grey state pill.
export function CatalogCommerceTags({ product }: { product: common_Colorway }) {
  const m = product.display?.merchandising;
  const tags: string[] = [];

  const salePct = parseFloat(m?.salePercentage?.value ?? '0');
  if (!Number.isNaN(salePct) && salePct >= 1) tags.push(`-${Math.round(salePct)}%`);
  else if (!Number.isNaN(salePct) && salePct > 0) tags.push('sale');

  const preorder = m?.preorder;
  if (preorder) {
    const t = new Date(preorder).getTime();
    if (!Number.isNaN(t) && t > Date.now()) tags.push('preorder');
  }

  if (product.soldOut) tags.push('sold out');

  if (!tags.length) return null;
  return (
    <>
      {tags.map((tag) => (
        <span
          key={tag}
          className='border border-textInactiveColor bg-bgColor px-1 py-0.5 leading-none'
        >
          <Text size='small' variant='label' component='span'>
            {tag}
          </Text>
        </span>
      ))}
    </>
  );
}
