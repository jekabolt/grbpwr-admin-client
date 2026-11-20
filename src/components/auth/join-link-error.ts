import { errMessage, isRefusal } from './api-error';

/** A short sheet-header word for the public join flow's documented refusals. */
export function joinErrorWord(e: unknown, refusal = 'check fields'): string {
  const reason = errMessage(e).replace(/[\s-]+/g, '_');
  if (reason.includes('join_queue_full')) return 'queue full';
  if (reason.includes('rate_limited')) return 'rate limited';
  if (reason.includes('confirm_email')) return 'confirm email';
  if (reason.includes('bad_code') || reason.includes('invalid_code')) return 'wrong code';
  if (reason.includes('wrong_password')) return 'wrong password';
  if (/link_(invalid|expired|not_found)/.test(reason)) return 'link expired';
  return isRefusal(e) ? refusal : 'try again';
}
