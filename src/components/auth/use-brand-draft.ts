import {
  type BrandDraft,
  type BrandKey,
  brandPayload,
  brandProblems,
  brandRefusalFields,
  emptyBrand,
} from 'lib/workspace/brand-fields';
import { useState } from 'react';

/**
 * The logo step's brand fields: `brand name` follows the team name until the person edits it
 * (clearing it counts); `back` keeps everything; checks and server refusals mark their fields.
 */
export function useBrandDraft() {
  const [brand, setBrand] = useState<BrandDraft>(() => emptyBrand());
  const [touched, setTouched] = useState(false);
  const [invalid, setInvalid] = useState<BrandKey[]>([]);

  return {
    brand,
    invalid,
    /** Entering the logo step: the brand name is the team name unless the person changed it. */
    prefill: (team: string) => {
      if (!touched) setBrand((b) => ({ ...b, brandName: team }));
    },
    set: (key: BrandKey, value: string) => {
      if (key === 'brandName') setTouched(true);
      setBrand((b) => ({ ...b, [key]: value }));
      setInvalid((i) => i.filter((k) => k !== key));
    },
    /** True when nothing would be refused; otherwise the fields turn red. */
    check: (): boolean => {
      const bad = brandProblems(brand);
      setInvalid(bad);
      return bad.length === 0;
    },
    /** A server refusal with a brand key: true when it was put on a field. */
    refused: (message: string): boolean => {
      const bad = brandRefusalFields(message, brand);
      if (bad.length) setInvalid(bad);
      return bad.length > 0;
    },
    payload: () => brandPayload(brand),
  };
}
