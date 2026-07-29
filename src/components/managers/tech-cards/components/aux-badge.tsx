import { common_TechCardPurpose } from 'api/proto-http/admin';
import { Pill } from 'ui/components/pill';

// #8: mark auxiliary tech cards (dust bags, shoppers, packaging…) so a list/board reader can tell
// them apart from sellable styles at a glance. Driven by TechCardListItem.purpose, which the list
// RPCs now carry, so no N+1 GetTechCard. Renders nothing for sellable (default) cards.
// Grey (`mut`) on purpose — auxiliary is a classification, not a problem.
// `purpose` is the proto enum (TECH_CARD_PURPOSE_AUXILIARY), not the bare word: it used to be typed
// as a plain string and compared against 'auxiliary', so the badge type-checked and never rendered.
export function AuxBadge({
  purpose,
  className,
}: {
  purpose?: common_TechCardPurpose;
  className?: string;
}) {
  if (purpose !== 'TECH_CARD_PURPOSE_AUXILIARY') return null;
  return (
    <Pill tone='mut' className={className}>
      aux
    </Pill>
  );
}
