import type { AiProbeResult, AiProviderInfo } from 'api/proto-http/admin';

// What the panel SAYS about a provider, as pure functions of the wire — so the probe can check the
// words without a screen, and the screen never re-derives them inline.

// The fault badge of the last 24 h of calls (`fault_code`). An unknown code from a newer server is
// still shown — in its own words — rather than dropped: a fault nobody sees is the costly kind.
const FAULT_LABEL: Record<string, string> = {
  key_rejected: 'key rejected',
  out_of_credits: 'out of credits',
  model_unknown: 'model unknown',
};

export function faultLabel(code?: string): string | null {
  const c = (code ?? '').trim();
  if (!c) return null;
  return FAULT_LABEL[c] ?? c.replace(/_/g, ' ');
}

export type KeyLine = { text: string; broken: boolean };

// "27 sep", or "27 sep 2025" outside the current year. Lowercase like every label on this screen.
export function shortDate(iso?: string, now = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === now.getFullYear();
  return d
    .toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: sameYear ? undefined : 'numeric',
    })
    .toLowerCase();
}

const last4 = (s?: string) => (s ? ` ···${s}` : '');

// The api key slot: where the key that ANSWERS comes from. "unreadable" is a stored key the
// server's master key no longer opens — the env key, when there is one, answers meanwhile.
export function keyLine(p: AiProviderInfo): KeyLine {
  switch (p.keySource) {
    case 'env':
      return { text: `key: from env${last4(p.keyLast4)}`, broken: false };
    case 'db': {
      const by = p.keyUpdatedBy ? ` · by ${p.keyUpdatedBy}` : '';
      const when = shortDate(p.keyUpdatedAt);
      return { text: `key: set${last4(p.keyLast4)}${by}${when ? ` · ${when}` : ''}`, broken: false };
    }
    case 'unreadable':
      return {
        text: p.keyLast4
          ? `key: the stored key does not open — env${last4(p.keyLast4)} answers meanwhile`
          : 'key: the stored key does not open, and there is no env key',
        broken: true,
      };
    default:
      return { text: 'key: not set', broken: false };
  }
}

// The reconciliation (admin) key slot — openai, anthropic, fal. No env fallback exists for it.
export function adminKeyLine(p: AiProviderInfo): KeyLine {
  switch (p.adminKeySource) {
    case 'db':
      return { text: `reconciliation key (optional): set${last4(p.adminKeyLast4)}`, broken: false };
    case 'unreadable':
      return { text: 'reconciliation key (optional): the stored key does not open', broken: true };
    default:
      return { text: 'reconciliation key (optional): not set', broken: false };
  }
}

// What the provider's free endpoint said about the key the moment it was saved.
const PROBE_LABEL: Record<string, string> = {
  key_rejected: 'key rejected',
  out_of_credits: 'out of credits',
  unreachable: 'unreachable',
};

export type ProbeLine = { ok: boolean; text: string; detail: string };

export function probeLine(p: AiProbeResult): ProbeLine {
  const message = (p.message ?? '').trim();
  if (p.ok) {
    return { ok: true, text: p.balance ? `ok · balance ${p.balance}` : 'ok', detail: message };
  }
  const label = PROBE_LABEL[(p.code ?? '').trim()];
  return { ok: false, text: label || message || 'the check failed', detail: label ? message : '' };
}
