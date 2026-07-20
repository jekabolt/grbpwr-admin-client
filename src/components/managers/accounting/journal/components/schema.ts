import { addDays, format } from 'date-fns';
import { z } from 'zod';

// Manual journal entry form (03 §3.2, UX 8.4). The wire contract is AcctJournalLineInput
// {accountCode, isDebit, amount|amountSrc+currencySrc, note}; the form is deliberately looser to
// keep the UI ergonomic and converts on submit:
//   - `account` holds the ComboField label ("1010 — Cash"); the 4-digit code is extracted on
//     submit and validated here against the live chart of accounts (why the schema is a factory).
//   - `side` is a string enum (segmented control), mapped to isDebit = side === 'debit'.
//   - `amountMode` picks EUR (`amount`) vs a foreign amount (`amountSrc` + `currencySrc`) that the
//     backend converts via the costing FX rates.
// All amounts are decimal strings edited via DecimalField; convert with inputToDecimal on submit.

// Leading 4-digit account code from a combo label or free text ("1010 — Cash" -> "1010").
export function extractLeadingCode(label: string): string {
  const m = /^\s*(\d{4})(?!\d)/.exec(label ?? '');
  return m ? m[1] : '';
}

function parseAmount(s?: string): number {
  const n = parseFloat((s ?? '').replace(/,/g, '.'));
  return Number.isFinite(n) ? n : NaN;
}

// Backend rule: occurred_at must be <= today + 1 day (07 / 03 §3.2). Mirrored client-side so the
// user fails fast instead of round-tripping.
export function maxOccurredAt(): string {
  return format(addDays(new Date(), 1), 'yyyy-MM-dd');
}

// Factory: the "account code exists" check needs the current non-archived chart of accounts, so
// the schema is built per-open from that set (07.5 / UX 8.4).
export function makeManualEntrySchema(validCodes: ReadonlySet<string>) {
  const lineSchema = z
    .object({
      account: z.string().trim().min(1, 'account required'),
      side: z.enum(['debit', 'credit']),
      amountMode: z.enum(['base', 'src']),
      amount: z.string().optional(),
      amountSrc: z.string().optional(),
      currencySrc: z.string().optional(),
      note: z.string().max(255).optional(),
    })
    .superRefine((line, ctx) => {
      const code = extractLeadingCode(line.account);
      if (!code || !validCodes.has(code)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'unknown account',
          path: ['account'],
        });
      }
      if (line.amountMode === 'base') {
        if (!(parseAmount(line.amount) > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'amount must be > 0',
            path: ['amount'],
          });
        }
      } else {
        if (!(parseAmount(line.amountSrc) > 0)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'amount must be > 0',
            path: ['amountSrc'],
          });
        }
        if (!line.currencySrc) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'currency required',
            path: ['currencySrc'],
          });
        }
      }
    });

  return z
    .object({
      occurredAt: z
        .string()
        .min(1, 'date required')
        .refine((v) => v <= maxOccurredAt(), 'date cannot be in the future'),
      description: z.string().trim().min(1, 'description required').max(512),
      lines: z.array(lineSchema).min(2, 'at least 2 lines'),
    })
    .superRefine((v, ctx) => {
      // Client Σdebit == Σcredit ONLY when every line is in base (EUR) mode: with any FX line the
      // real base amount is known only after the backend converts, so balance is the server's call
      // (03 §3.2 / 06 gotcha). Leave it to the backend then.
      const allBase = v.lines.every((l) => l.amountMode === 'base');
      if (!allBase) return;
      let debit = 0;
      let credit = 0;
      for (const l of v.lines) {
        const n = parseAmount(l.amount);
        if (!Number.isFinite(n)) continue;
        if (l.side === 'debit') debit += n;
        else credit += n;
      }
      if (Math.abs(debit - credit) > 0.005) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'debits and credits must balance',
          path: ['lines'],
        });
      }
    });
}

export type ManualEntryForm = z.infer<ReturnType<typeof makeManualEntrySchema>>;
export type ManualEntryLine = ManualEntryForm['lines'][number];
