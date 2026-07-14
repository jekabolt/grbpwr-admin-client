// ISO-3166 alpha-2 → flag emoji + English display name. Zero-dependency: the flag is built from
// Unicode regional-indicator code points, the name from Intl.DisplayNames (built into the runtime).
// Backend sends ISO-2 country codes; GA4 demand rows may carry the "(unmatched)" sentinel for a
// GA4 country name that has no ISO mapping.

export const UNMATCHED_COUNTRY = '(unmatched)';

let regionDisplay: Intl.DisplayNames | null = null;

function regionName(cc: string): string | undefined {
  try {
    if (!regionDisplay) regionDisplay = new Intl.DisplayNames(['en'], { type: 'region' });
    return regionDisplay.of(cc) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Regional-indicator flag emoji for a 2-letter code, or '' when the code isn't ISO-2. */
function flagFor(cc: string): string {
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export interface CountryDisplay {
  flag: string;
  name: string;
  /** True for the backend "(unmatched)" GA4 sentinel — callers render it last and muted. */
  unmatched: boolean;
}

export function countryDisplay(code: string | undefined): CountryDisplay {
  const raw = (code ?? '').trim();
  if (!raw) return { flag: '', name: 'Unknown', unmatched: false };
  if (raw === UNMATCHED_COUNTRY) return { flag: '', name: UNMATCHED_COUNTRY, unmatched: true };
  const cc = raw.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return { flag: '', name: raw, unmatched: false };
  return { flag: flagFor(cc), name: regionName(cc) ?? cc, unmatched: false };
}
