import type { common_DesignBudget, googletype_Decimal } from 'api/proto-http/admin';

/**
 * MONEY, AS THE BAND SPEAKS IT — and the whole of this file is about the difference between «zero»
 * and «not stated».
 *
 * EVERY MONEY FIELD IN THIS CONTRACT IS costing-shaped: it is STRIPPED when the account lacks
 * `costing:read`. `DesignBudget` says so in as many words, and so do `price_estimate`,
 * `price_actual` and `attempt.price`. So an absent decimal here is not 0 — it is «this reader is
 * not allowed to see it», and the two must never render the same. `$0.00 of $0.00` reads as a
 * budget that is exhausted, which is a different and false statement about a card nobody can
 * generate on for a completely different reason.
 *
 * Hence: every function below answers `null` / `''` for «not stated», never a zero, and every
 * caller is expected to DROP the organ rather than draw it blank.
 *
 * THE CURRENCY IS ON THE WIRE and is never assumed to be dollars. The contract puts `currency` on
 * both the budget and the run for exactly that reason, and an unknown code is printed verbatim
 * beside the number rather than swapped for a symbol we made up.
 */

/** `{ value: "0.04" }` → 0.04. `null` for every spelling of «not stated», including a blank value. */
export function decimalToNumber(d?: googletype_Decimal | null): number | null {
  const raw = (d?.value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * `$0.04`, or `0.04 XTS` when the code is not one `Intl` knows. Empty string when the amount is not
 * stated — the caller drops the whole phrase rather than printing a currency symbol with nothing
 * after it.
 */
export function formatMoney(d?: googletype_Decimal | null, currency?: string | null): string {
  const n = decimalToNumber(d);
  if (n === null) return '';
  const code = (currency ?? '').trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(code)) {
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: code,
        // A picture costs cents. Two digits is the floor, four the ceiling — below that a $0.0004
        // provider price rounds to «free», which is the one thing a money register may not say.
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      }).format(n);
    } catch {
      // An unknown-but-well-formed code (a test currency, a new one) — say the number and the code.
      return `${d?.value ?? n} ${code}`;
    }
  }
  return code ? `${d?.value ?? n} ${code}` : String(d?.value ?? n);
}

export type BudgetRead = {
  spent: number;
  reserved: number;
  cap: number;
  currency: string;
  /**
   * `today $0.41 of $2.00` — дневная полоса. T-12 (круг 4): форма генерации её больше НЕ печатает
   * и в отказ гейта не подставляет — человеку показывается только цена самого прогона, на его
   * строке в истории. Поле живо, потому что его всё ещё читает экран рекола
   * (`history-recall.tsx`); снятие полосы там — за веткой, владеющей тем файлом.
   */
  line: string;
  /** `spent + reserved >= cap`. The gate the SERVER applies, read the same way here. */
  exhausted: boolean;
};

/**
 * The band's money bar, or `null` when this reader may not see money at all.
 *
 * TWO FIELDS, NOT ONE SUM. `spent` is what was actually charged; `reserved` is what runs in flight
 * have taken out of the day and not yet been billed for. The CEILING is checked against the sum —
 * counting only the charged half would let two simultaneous starts both pass a ceiling only one of
 * them fits under — but the reader is told what was actually PAID, because a single field holding
 * the sum would lie about that. The contract makes the same point at greater length.
 */
export function readBudget(budget?: common_DesignBudget | null): BudgetRead | null {
  if (!budget) return null;
  const spent = decimalToNumber(budget.spent);
  const cap = decimalToNumber(budget.cap);
  // `reserved` may honestly be absent while `spent` and `cap` are present; treat it as 0 THEN, and
  // only then — a missing cap means the whole bar is unreadable and there is nothing to draw.
  if (spent === null || cap === null) return null;
  const reserved = decimalToNumber(budget.reserved) ?? 0;
  const currency = (budget.currency ?? '').trim();
  const spentText = formatMoney(budget.spent, currency);
  const capText = formatMoney(budget.cap, currency);
  const held = reserved > 0 ? ` · ${formatMoney(budget.reserved, currency)} held` : '';
  return {
    spent,
    reserved,
    cap,
    currency,
    line: `today ${spentText} of ${capText}${held}`,
    exhausted: cap > 0 && spent + reserved >= cap,
  };
}
