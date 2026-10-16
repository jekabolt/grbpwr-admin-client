import { useFormContext } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';

import { revealField } from 'utils/field-errors';

/**
 * A warning about the CARD's own data (a BOM line's fabric direction…) is fixed on the card, not
 * in the marker: close the marker, switch the card to the tab that owns the field and pulse it.
 * Same walk index.tsx does for a failed save — tab param first, then revealField, which retries
 * until the tab's panel and any fold that owns the field have committed.
 */
export function useGoToBomLineField() {
  const form = useFormContext() as ReturnType<typeof useFormContext> | null;
  const [params, setParams] = useSearchParams();
  return (lineKey: string | undefined, field: string, close: () => void) => {
    if (!lineKey || !form) return undefined;
    const items = (form.getValues('bomItems') ?? []) as Array<{ lineKey?: string }>;
    const index = items.findIndex((b) => b.lineKey === lineKey);
    if (index < 0) return undefined;
    return () => {
      close();
      const next = new URLSearchParams(params);
      next.set('tab', 'bom');
      setParams(next, { replace: true });
      const path = `bomItems.${index}.${field}`;
      window.setTimeout(() => {
        try {
          form.setFocus(path);
        } catch {
          // a Radix select keeps no focusable ref — the pulse below still lands on its anchor
        }
        revealField(path);
      }, 120);
    };
  };
}
