import { common_SkuSeason, common_TechCardListItem } from 'api/proto-http/admin';
import { useNavigate } from 'react-router-dom';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile } from 'ui/components/tiles';
import { AuxBadge } from './aux-badge';
import { approvalStateLabel, formatTechCardDate, stageLabel } from './utils';

// The one tech-card card. Shared by the list grid (6.1) and the pipeline swimlanes (6.2) so a
// style looks identical wherever you meet it. You recognise a garment by looking at it, so the
// sketch leads and the numbers ride underneath — and a card with NO media still renders, as the
// striped Placeholder rather than a blank cell.

const AUX_SUBTYPE_LABEL: Record<string, string> = {
  TECH_CARD_AUX_SUBTYPE_BRAND_LABEL: 'brand label',
  TECH_CARD_AUX_SUBTYPE_CARE_LABEL: 'care label',
  TECH_CARD_AUX_SUBTYPE_SIZE_LABEL: 'size label',
  TECH_CARD_AUX_SUBTYPE_HANGTAG: 'hangtag',
  TECH_CARD_AUX_SUBTYPE_STICKER: 'sticker',
  TECH_CARD_AUX_SUBTYPE_DUST_BAG: 'dust bag',
  TECH_CARD_AUX_SUBTYPE_BOX: 'box',
  TECH_CARD_AUX_SUBTYPE_INSERT: 'insert',
  TECH_CARD_AUX_SUBTYPE_HANGER: 'hanger',
  TECH_CARD_AUX_SUBTYPE_OTHER: 'other',
};

export function auxSubtypeLabel(subtype?: string): string {
  return (subtype && AUX_SUBTYPE_LABEL[subtype]) || '';
}

/** `FW 2026` for a SkuSeason, empty when the card has no season set. */
export function seasonLabel(season?: common_SkuSeason): string {
  if (!season?.code || season.code === 'SEASON_ENUM_UNKNOWN') return '';
  const code = season.code.replace('SEASON_ENUM_', '');
  return season.year ? `${code} ${season.year}` : code;
}

/** URL form of a season filter: `FW-2026`. */
export function seasonParam(season: common_SkuSeason): string {
  return `${(season.code ?? '').replace('SEASON_ENUM_', '')}-${season.year ?? 0}`;
}

// Approval maps onto the pill semantics: released/approved = done (green), in review = mid-flight
// and needs a human (blue). Draft and obsolete are the neutral default and do not earn a second
// pill — the stage pill already says where the card is.
function approvalTone(state?: string): 'ok' | 'attention' | undefined {
  switch (state) {
    case 'TECH_CARD_APPROVAL_STATE_RELEASED':
    case 'TECH_CARD_APPROVAL_STATE_APPROVED':
      return 'ok';
    case 'TECH_CARD_APPROVAL_STATE_IN_REVIEW':
      return 'attention';
    default:
      return undefined;
  }
}

export function TechCardTile({
  card,
  compact,
  action,
  className,
}: {
  card: common_TechCardListItem;
  /** Swimlane size: square thumb, name only — the lane header already carries the stage. */
  compact?: boolean;
  /** Overlaid control (the delete ✕). Rendered OUTSIDE the tile button, never nested in it. */
  action?: React.ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const id = card.id ?? 0;
  // A swimlane tile is 110px wide — the style number alone, as in the reference. The list tile
  // gets the full identity, truncated by the primitive.
  const title = compact
    ? card.styleNumber || card.name || '—'
    : [card.styleNumber, card.name].filter(Boolean).join(' ') || '—';
  const tone = approvalTone(card.approvalState);
  const season = seasonLabel(card.skuSeason);
  // Only an auxiliary card carries a subtype (UNKNOWN/unset → empty), so no purpose check.
  const subtype = auxSubtypeLabel(card.auxSubtype);
  const updated = formatTechCardDate(card.updatedAt);
  const meta = [subtype, season, updated === '—' ? '' : updated].filter(Boolean).join(' · ');

  // previewUrl is resolved server-side on the list item (moodboard image for an idea, PREVIEW
  // sketch otherwise) — no per-card request. Empty for a card with no media at all.
  const media = card.previewUrl ? (
    <img
      src={card.previewUrl}
      alt=''
      loading='lazy'
      className={`w-full border border-borderColor object-cover ${
        compact ? 'aspect-square' : 'aspect-[3/4]'
      }`}
    />
  ) : (
    <Placeholder aspect={compact ? 'square' : '3/4'} label='sketch' />
  );

  return (
    <div className={`relative ${className ?? ''}`}>
      <Tile
        media={media}
        name={title}
        onClick={() => navigate(`/tech-cards/${id}`)}
        className='h-full w-full'
      >
        {compact ? (
          <AuxBadge purpose={card.purpose} className='mt-1' />
        ) : (
          <>
            <div className='mt-1 flex flex-wrap items-center gap-1'>
              <Pill tone='mut'>{stageLabel(card.stage)}</Pill>
              {tone && <Pill tone={tone}>{approvalStateLabel(card.approvalState)}</Pill>}
              <AuxBadge purpose={card.purpose} />
            </div>
            {meta && (
              <Text size='nano' variant='label' className='mt-1 truncate uppercase'>
                {meta}
              </Text>
            )}
          </>
        )}
      </Tile>
      {action && <div className='absolute top-1 right-1'>{action}</div>}
    </div>
  );
}
