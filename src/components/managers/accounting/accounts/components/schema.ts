import { z } from 'zod';
import { ACCT_SECTIONS, ACCT_STATEMENTS } from '../../utils/constants';

// Chart-of-accounts create/rename form (03 §3.1). `code` is a 4-digit string (backend
// acct_account.code CHAR(4)); `section`/`statement` are closed vocabularies mirroring the
// backend CHECK constraints (07.5). On rename only `name` is editable — code/section/statement
// are immutable server-side — but the same schema validates both flows since a stored account
// already satisfies it.
export const accountSchema = z.object({
  code: z.string().regex(/^\d{4}$/, '4-digit code'),
  name: z.string().trim().min(1, 'name required').max(120),
  section: z.enum(ACCT_SECTIONS),
  statement: z.enum(ACCT_STATEMENTS),
});

export type AccountSchema = z.infer<typeof accountSchema>;
