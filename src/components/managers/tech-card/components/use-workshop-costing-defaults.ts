// WORKSHOP COSTING DEFAULTS (0414) — the shop's usual currency, labour rate, overhead, defect and
// margin, read only to PREFILL an empty costing and written back from the costing tab itself.
//
// The rules, in the order they bite:
//  • only a card whose costing articles are ALL empty is prefilled (decided once per card, on the
//    first look): an old card with a deliberately blank overhead is not re-filled every visit;
//  • a field anyone already holds a value in (the server's read, a person's typing) is never
//    touched, and each field is filled at most once per mount: clearing a prefill sticks;
//  • the prefill is ordinary dirty form state, i.e. a draft until the card saves;
//  • money is only derived inside ONE currency: the labour rate is in the workshop currency, so CMT
//    is derived only when the card's currency is that one; overhead's base (materials + CMT) uses
//    the server's materials, which are in the SAVED currency, so it waits for that to match.
import type { common_TechCardCosting, UpdateWorkshopSettingsRequest } from 'api/proto-http/admin';
import { EXPENSE_CURRENCIES } from 'constants/constants';
import {
  useUpdateWorkshopSettings,
  useWorkshopSettings,
} from 'components/managers/workshop/useWorkshopSettings';
import { useEffect, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import type { TechCardFormData } from './schema';

export type PrefillKey =
  | 'currency'
  | 'cmtCost'
  | 'overheadCost'
  | 'defectPercent'
  | 'targetMarginPct';

// The articles whose emptiness makes a costing "not started". Currency is not one of them: a card
// can carry a currency from creation without anyone having costed it.
const ARTICLE_KEYS = [
  'cmtCost',
  'logisticsCost',
  'overheadCost',
  'defectPercent',
  'targetMarginPct',
] as const;

const KNOWN_CURRENCIES = new Set(EXPENSE_CURRENCIES.map((c) => c.value));

const pos = (s?: string) => {
  const n = parseDecimalNumber(s);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
/** A decimal string with at most `dp` places and no trailing zeros ("0.3500" → "0.35"). */
export const fmtDecimal = (n: number, dp: number) =>
  n
    .toFixed(dp)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');

export type WorkshopCostingDefaults = {
  currency: string;
  labourRatePerMin?: number;
  overheadPct?: number;
  defectPercent?: number;
  targetMarginPct?: number;
};

export function useWorkshopCostingDefaults({
  active,
  canWrite,
  techCardId,
  saved,
  totalSam,
}: {
  /** The costing tab is on screen and editable (not frozen, costing:write). */
  active: boolean;
  /** production:write — the right every workshop-settings write needs. */
  canWrite: boolean;
  techCardId: number | undefined;
  /** The card's SAVED costing (the last read), materials rollup included. */
  saved: common_TechCardCosting | undefined;
  /** Construction total SAM, minutes (smv-else-sam), read off the form. */
  totalSam: number;
}) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const query = useWorkshopSettings();
  const update = useUpdateWorkshopSettings();
  const settings = query.data?.settings;

  const defaults: WorkshopCostingDefaults | undefined = settings
    ? {
        currency: (settings.costingCurrency ?? '').trim().toUpperCase(),
        labourRatePerMin: pos(decimalToInput(settings.labourRatePerMin)),
        overheadPct: pos(decimalToInput(settings.overheadPct)),
        defectPercent: pos(decimalToInput(settings.defectPercent)),
        targetMarginPct: pos(decimalToInput(settings.targetMarginPct)),
      }
    : undefined;

  const costing = (useWatch({ control, name: 'costing' }) ?? {}) as Partial<
    Record<PrefillKey, string>
  >;
  const materials = pos(decimalToInput(saved?.materialsPerUnit));
  const savedCurrency = saved?.currency ?? '';
  const materialsComparable = !saved?.hasUnconvertedCurrencies;

  // What this mount wrote, per field. The tag shows while the field still holds exactly that.
  const [prefilled, setPrefilled] = useState<Partial<Record<PrefillKey, string>>>({});
  const state = useRef<{
    card: number | undefined;
    eligible: boolean | null;
    done: Set<PrefillKey>;
  }>({ card: techCardId, eligible: null, done: new Set() });

  useEffect(() => {
    if (state.current.card !== techCardId) {
      state.current = { card: techCardId, eligible: null, done: new Set() };
      setPrefilled({});
    }
    if (!active || !defaults) return;
    const s = state.current;
    if (s.eligible === null) {
      const form = getValues('costing') as Partial<Record<string, string>> | undefined;
      s.eligible = ARTICLE_KEYS.every(
        (k) => !decimalToInput(saved?.[k]).trim() && !(form?.[k] ?? '').trim(),
      );
    }
    if (!s.eligible) return;

    const fill = (key: PrefillKey, value: string | undefined) => {
      if (s.done.has(key) || !value) return;
      s.done.add(key);
      if ((getValues(`costing.${key}`) ?? '').trim()) return; // someone holds a value: theirs
      setValue(`costing.${key}`, value, { shouldDirty: true });
      setPrefilled((p) => ({ ...p, [key]: value }));
    };

    if (defaults.currency && KNOWN_CURRENCIES.has(defaults.currency)) {
      fill('currency', defaults.currency);
    }
    if (defaults.defectPercent != null)
      fill('defectPercent', fmtDecimal(defaults.defectPercent, 2));
    if (defaults.targetMarginPct != null)
      fill('targetMarginPct', fmtDecimal(defaults.targetMarginPct, 2));

    const cur = (getValues('costing.currency') ?? '').trim();
    // CMT = rate × SAM, only inside the workshop's own currency and only once SAM exists.
    if (
      defaults.labourRatePerMin != null &&
      totalSam > 0 &&
      defaults.currency &&
      cur === defaults.currency
    ) {
      fill('cmtCost', (defaults.labourRatePerMin * totalSam).toFixed(2));
    }
    // overhead = pct × (materials + CMT), only when both halves of the base are known and in the
    // card's currency (materials arrive denominated in the SAVED currency).
    const cmtNow = pos(getValues('costing.cmtCost'));
    if (
      defaults.overheadPct != null &&
      materials != null &&
      cmtNow != null &&
      materialsComparable &&
      !!savedCurrency &&
      savedCurrency === cur
    ) {
      fill('overheadCost', (((materials + cmtNow) * defaults.overheadPct) / 100).toFixed(2));
    }
    // `defaults` is rebuilt every render from `settings`; the settings object is the real input.
    // The typed CMT is deliberately NOT a dependency: overhead derived from the first keystroke
    // of a CMT quote would be a number nobody meant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, settings, techCardId, totalSam, materials, savedCurrency, materialsComparable]);

  const fromWorkshop = (key: PrefillKey) =>
    prefilled[key] != null && (costing[key] ?? '') === prefilled[key];

  return { defaults, fromWorkshop, update, canWrite, loaded: !!settings };
}

/** The defaults as one hover line: what a new costing would start from today. */
export function describeDefaults(d: WorkshopCostingDefaults | undefined): string {
  if (!d) return 'workshop defaults: loading';
  const parts = [
    d.currency || 'no currency',
    d.labourRatePerMin != null ? `labour ${fmtDecimal(d.labourRatePerMin, 4)}/min` : '',
    d.overheadPct != null ? `overhead ${fmtDecimal(d.overheadPct, 2)}%` : '',
    d.defectPercent != null ? `defects ${fmtDecimal(d.defectPercent, 2)}%` : '',
    d.targetMarginPct != null ? `margin ${fmtDecimal(d.targetMarginPct, 2)}%` : '',
  ].filter(Boolean);
  return `workshop defaults now: ${parts.join(' · ')}`;
}

/**
 * The patch «save as workshop default» sends: only what the costing on screen states and what
 * differs from the stored default. Derived rates (per minute, overhead %) are only stated when
 * their base is on screen in the same currency.
 */
export function defaultsPatch({
  defaults,
  currency,
  cmt,
  totalSam,
  overhead,
  materials,
  materialsComparable,
  defectPercent,
  targetMarginPct,
}: {
  defaults: WorkshopCostingDefaults | undefined;
  currency: string;
  cmt: number;
  totalSam: number;
  overhead: number;
  materials: number;
  /** false while the costing currency is mid-switch: materials are still the old currency's. */
  materialsComparable: boolean;
  defectPercent: string;
  targetMarginPct: string;
}): Partial<UpdateWorkshopSettingsRequest> {
  const patch: Partial<UpdateWorkshopSettingsRequest> = {};
  const same = (a: number | undefined, b: string) =>
    a != null && Math.abs(a - parseDecimalNumber(b)) < 1e-9;
  const rate = cmt > 0 && totalSam > 0 && currency ? fmtDecimal(cmt / totalSam, 4) : '';
  const ohPct =
    overhead > 0 && materials > 0 && materialsComparable
      ? fmtDecimal((overhead / (materials + cmt)) * 100, 2)
      : '';
  const defect = pos(defectPercent) != null ? fmtDecimal(parseDecimalNumber(defectPercent), 2) : '';
  const margin =
    pos(targetMarginPct) != null ? fmtDecimal(parseDecimalNumber(targetMarginPct), 2) : '';

  const currencyMoves = !!currency && currency !== (defaults?.currency ?? '');
  // A rate is re-sent when the currency moves even if the number is equal: 0.35 EUR ≠ 0.35 PLN.
  if (rate && (currencyMoves || !same(defaults?.labourRatePerMin, rate)))
    patch.labourRatePerMin = { value: rate };
  if (ohPct && !same(defaults?.overheadPct, ohPct)) patch.overheadPct = { value: ohPct };
  if (defect && !same(defaults?.defectPercent, defect)) patch.defectPercent = { value: defect };
  if (margin && !same(defaults?.targetMarginPct, margin)) patch.targetMarginPct = { value: margin };
  // The money rate means nothing without its currency: the currency travels with a new rate, and
  // moves alone only when no stored rate would be silently re-denominated by it.
  if (
    currency &&
    (patch.labourRatePerMin || (currencyMoves && defaults?.labourRatePerMin == null))
  ) {
    patch.costingCurrency = currency;
  }
  return patch;
}
