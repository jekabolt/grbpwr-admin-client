// WORKSHOP COSTING DEFAULTS (0414) — the shop's usual currency, labour rate, overhead, defect and
// margin, offered to an empty costing and written back from the costing tab itself.
//
// NO WRITE ON VIEW. The card autosaves, so anything put into form state on its own would be saved
// by merely opening the tab. The defaults are therefore only SUGGESTIONS — ghost values in the
// empty fields — until a person presses `use workshop defaults`, which applies all of them as
// ordinary dirty form values in one gesture.
//
// The rules, in the order they bite:
//  • only a field that is EMPTY (in the form, i.e. neither the server's read nor a person's typing
//    holds a value) gets a suggestion, and applying never overwrites a value that appeared since;
//  • only with costing:write on a card that is not frozen (the caller passes `enabled`);
//  • money is only derived inside ONE currency: the labour rate is in the workshop currency, so CMT
//    is suggested only when the card's currency (or the suggested one, applied together) is that
//    one; overhead's base (materials + CMT) uses the server's materials, which are in the SAVED
//    currency, so it is suggested only when the card's currency equals the saved one.
import type { common_TechCardCosting, UpdateWorkshopSettingsRequest } from 'api/proto-http/admin';
import { EXPENSE_CURRENCIES } from 'constants/constants';
import {
  useUpdateWorkshopSettings,
  useWorkshopSettings,
} from 'components/managers/workshop/useWorkshopSettings';
import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import type { TechCardFormData } from './schema';

export type PrefillKey =
  | 'currency'
  | 'cmtCost'
  | 'overheadCost'
  | 'defectPercent'
  | 'targetMarginPct';

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

const empty = (v: string | undefined) => !(v ?? '').trim();

export function useWorkshopCostingDefaults({
  enabled,
  canWrite,
  saved,
  totalSam,
}: {
  /** costing:write on a card that is not frozen: suggestions exist only where they can be applied. */
  enabled: boolean;
  /** production:write — the right every workshop-settings write needs. */
  canWrite: boolean;
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

  // ── SUGGESTIONS: what `use workshop defaults` would put into each EMPTY field right now.
  const suggestions: Partial<Record<PrefillKey, string>> = {};
  if (enabled && defaults) {
    if (empty(costing.currency) && defaults.currency && KNOWN_CURRENCIES.has(defaults.currency))
      suggestions.currency = defaults.currency;
    if (empty(costing.defectPercent) && defaults.defectPercent != null)
      suggestions.defectPercent = fmtDecimal(defaults.defectPercent, 2);
    if (empty(costing.targetMarginPct) && defaults.targetMarginPct != null)
      suggestions.targetMarginPct = fmtDecimal(defaults.targetMarginPct, 2);

    // The currency the card will have once the suggestions are applied together.
    const cur = (costing.currency ?? '').trim() || suggestions.currency || '';
    // CMT = rate × SAM, only inside the workshop's own currency and only once SAM exists.
    if (
      empty(costing.cmtCost) &&
      defaults.labourRatePerMin != null &&
      totalSam > 0 &&
      !!defaults.currency &&
      cur === defaults.currency
    )
      suggestions.cmtCost = (defaults.labourRatePerMin * totalSam).toFixed(2);
    // overhead = pct × (materials + CMT), only when both halves of the base are known and in the
    // card's currency (materials arrive denominated in the SAVED currency).
    const cmtBase = pos(costing.cmtCost) ?? pos(suggestions.cmtCost);
    if (
      empty(costing.overheadCost) &&
      defaults.overheadPct != null &&
      materials != null &&
      cmtBase != null &&
      !saved?.hasUnconvertedCurrencies &&
      !!savedCurrency &&
      savedCurrency === cur
    )
      suggestions.overheadCost = (((materials + cmtBase) * defaults.overheadPct) / 100).toFixed(2);
  }
  const suggestionCount = Object.keys(suggestions).length;

  // What the last `use workshop defaults` wrote, per field: the tag shows while the field still
  // holds exactly that value.
  const [applied, setApplied] = useState<Partial<Record<PrefillKey, string>>>({});
  const apply = () => {
    const wrote: Partial<Record<PrefillKey, string>> = {};
    for (const [key, value] of Object.entries(suggestions) as [PrefillKey, string][]) {
      if (!empty(getValues(`costing.${key}`))) continue; // a value appeared meanwhile: theirs
      setValue(`costing.${key}`, value, { shouldDirty: true });
      wrote[key] = value;
    }
    setApplied((p) => ({ ...p, ...wrote }));
  };

  const fromWorkshop = (key: PrefillKey) =>
    applied[key] != null && (costing[key] ?? '') === applied[key];

  return {
    defaults,
    suggestions,
    suggestionCount,
    apply,
    fromWorkshop,
    update,
    canWrite,
    loaded: !!settings,
  };
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
