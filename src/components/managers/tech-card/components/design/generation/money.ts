import type { googletype_Decimal } from 'api/proto-http/admin';

/**
 * MONEY, AS THE BAND SPEAKS IT — and the whole of this file is about the difference between «zero»
 * and «not stated».
 *
 * WHAT IT IS MONEY *FOR*: the price of ONE RUN — `price_estimate`, `price_actual`, `attempt.price`
 * — on its history row, in its run panel, on the idea draft and in the recolour's testimony. There
 * is no daily total and no ceiling anywhere in the band; both were removed at the owner's word,
 * and the note further down says with what.
 *
 * EVERY MONEY FIELD IN THIS CONTRACT IS costing-shaped: it is STRIPPED when the account lacks
 * `costing:read`. `price_estimate`, `price_actual` and `attempt.price` all say so. So an absent
 * decimal here is not 0 — it is «this reader is not allowed to see it», and the two must never
 * render the same. A run priced `$0.00` claims the provider worked for free, which is a different
 * and false statement about a row whose price we were simply not shown.
 *
 * Hence: every function below answers `null` / `''` for «not stated», never a zero, and every
 * caller is expected to DROP the organ rather than draw it blank.
 *
 * THE CURRENCY IS ON THE WIRE and is never assumed to be dollars. The contract puts `currency` on
 * the run for exactly that reason, and an unknown code is printed verbatim beside the number
 * rather than swapped for a symbol we made up.
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

/**
 * ═══ ВТОРОГО ЧИТАТЕЛЯ ДНЕВНОГО БЮДЖЕТА ЗДЕСЬ БОЛЬШЕ НЕТ ══════════════════════════════════════
 *
 * Тут стояли `BudgetRead` и `readBudget()` — вторая копия того же чтения (первая жила в
 * `render/model.ts`), и обе существовали ради одного: полосы `today $x of $y` и флага
 * `exhausted`, которым форма запирала `GENERATE`.
 *
 * СНЯТО ВМЕСТЕ С ПОНЯТИЕМ ПОТОЛКА, а не «поднято повыше». Владелец: «у нас в принципе не должно
 * быть потолка похуй чем он съеден убери потолок». На сервере ушли колонка `daily_budget`, оба
 * отказа и повод `budget_exceeded`, а `DesignBudget.cap` стал `reserved 4` — номер поля закрыт,
 * и заполнить его снова нельзя даже случайно.
 *
 * ЧТО ИЗ ЭТОГО ФАЙЛА ЖИВО И ПОЧЕМУ. `decimalToNumber` и `formatMoney` — они читают ЦЕНУ ПРОГОНА
 * (`price_estimate`, `price_actual`, `attempt.price`) на строке истории, в панели прогона, в
 * черновике замысла и в свидетельстве рекола. Это и есть те деньги, которые владелец просил
 * оставить: заметил он $100 за прогон, а не сумму за день. Дневного итога на экране нет с круга 4
 * («нам надо показывать только цену генерации и все») и заводить его заново не надо.
 */
