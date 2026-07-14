// #8: mark auxiliary tech cards (dust bags, shoppers, packaging…) so a list/board reader can tell
// them apart from sellable styles at a glance. Driven by TechCardListItem.purpose, which the list
// RPCs now carry, so no N+1 GetTechCard. Renders nothing for sellable (default) cards.
export function AuxBadge({ purpose, className = '' }: { purpose?: string; className?: string }) {
  if (purpose !== 'auxiliary') return null;
  return (
    <span
      className={`inline-block shrink-0 border border-textInactiveColor px-1 text-textBaseSize uppercase leading-tight text-textInactiveColor ${className}`}
    >
      aux
    </span>
  );
}
