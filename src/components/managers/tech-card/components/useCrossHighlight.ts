import { useCallback, useMemo, useState } from 'react';

// Two views of the same garment must light each other up: hovering a row highlights its pin on the
// sketch, hovering the pin highlights the row. The construction tab has done this since it gained
// the assembly map (operation ↔ callout, operation ↔ BOM line); the pieces tab needs exactly the
// same wiring for its mini-diagram. Rather than write the state + the enter/leave/focus handlers a
// second time — and let the two copies drift — both tabs share this.
//
// `bind` is deliberately the WHOLE handler set, focus included: a hover-only cross-highlight is
// invisible to anyone driving the card from the keyboard, and every row here holds inputs.
export function useCrossHighlight<T extends string | number>() {
  const [active, setActive] = useState<T | null>(null);

  const bind = useCallback(
    (key: T | null | undefined) => ({
      onMouseEnter: () => setActive(key ?? null),
      onMouseLeave: () => setActive(null),
      onFocus: () => setActive(key ?? null),
      onBlur: () => setActive(null),
    }),
    [],
  );

  // `active` is only ever a real key or null, so a null/undefined key can never match — an
  // unpinned row must not light up just because nothing is hovered.
  const isActive = useCallback(
    (key: T | null | undefined) => key != null && active != null && key === active,
    [active],
  );

  return useMemo(() => ({ active, setActive, bind, isActive }), [active, bind, isActive]);
}
