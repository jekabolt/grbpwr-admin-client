import { TierCode } from 'api/proto-http/admin';

export interface TierOption {
  value: TierCode;
  label: string;
}

// Display labels mirror the loyalty program tiers (see admin-tier-management spec §1).
export const TIER_OPTIONS: TierOption[] = [
  { value: 'TIER_CODE_MEMBER', label: 'grbpwr' },
  { value: 'TIER_CODE_PLUS', label: 'grbpwr+' },
  { value: 'TIER_CODE_PLUS_PLUS', label: 'grbpwr++' },
  { value: 'TIER_CODE_HACKER', label: 'grbpwr hacker' },
];

// Backend filters by tier_key string; keep keys aligned with proto tier_key seed.
export const TIER_KEY_BY_CODE: Record<TierCode, string> = {
  TIER_CODE_MEMBER: 'grbpwr',
  TIER_CODE_PLUS: 'grbpwr_plus',
  TIER_CODE_PLUS_PLUS: 'grbpwr_plus_plus',
  TIER_CODE_HACKER: 'grbpwr_hacker',
};

export function formatTierLabel(tier: TierCode | undefined, fallback?: string): string {
  if (fallback) return fallback;
  return TIER_OPTIONS.find((o) => o.value === tier)?.label ?? tier ?? '-';
}

export function getTierColor(tier: TierCode | undefined): string {
  switch (tier) {
    case 'TIER_CODE_MEMBER':
      return 'bg-gray-200';
    case 'TIER_CODE_PLUS':
      return 'bg-sky-200';
    case 'TIER_CODE_PLUS_PLUS':
      return 'bg-violet-200';
    case 'TIER_CODE_HACKER':
      return 'bg-black text-white';
    default:
      return '';
  }
}

export const MEMBER_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'erased', label: 'Erased' },
];

// Only active <-> frozen are toggleable from the UI (spec §7.2).
export const TOGGLEABLE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'frozen', label: 'Frozen' },
];

export function getStatusColor(status: string | undefined): string {
  switch (status) {
    case 'active':
      return 'bg-green-200';
    case 'frozen':
      return 'bg-yellow-200';
    case 'deleted':
      return 'bg-gray-300';
    case 'erased':
      return 'bg-red-200';
    default:
      return '';
  }
}

export function formatStatusLabel(status: string | undefined): string {
  return MEMBER_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status ?? '-';
}

export function formatEur(amount: number | undefined): string {
  if (amount === undefined || amount === null) return '-';
  return `€${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
