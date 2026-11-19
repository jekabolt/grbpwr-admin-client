import type { TeamBrand } from 'api/proto-http/admin';

// Where every factory paper takes its brand lines from (wave «teams», W-spec §5). Pure: no React,
// no api. One rule set for the tech pack, the classic and run packs, the invoice, the care label
// and the editor mirrors of the label:
//   (a) no team brand (`null`: teams OFF, prod) → today's literals, byte-for-byte;
//   (b) a team with data → its name / logo / legal lines; the house vector mark and the build's
//       VAT id only for the first team;
//   (c) an empty field prints nothing — GRBPWR data is never substituted for another team;
//   (d) the card's own brand / logo / address wins everywhere (callers pass the card value first).
// `unavailable` (control plane unreadable) prints nothing either; the print gate names it.

/** Today's constants: what every paper printed before teams. */
export const HOUSE = {
  name: 'GRBPWR',
  site: 'grbpwr.com',
  email: 'customercare@grbpwr.com',
  /** The brand a new card starts with. */
  cardBrand: 'grbpwr',
} as const;

/** The mark an HTML paper draws: the house vector mark, the team's raster logo, or nothing. */
export type PaperMarkKind = 'house' | 'team' | 'none';

export interface PaperSeller {
  name: string;
  site: string;
  email: string;
  vatId: string;
  /** The paper expects a VAT id (teams OFF or the first team): a missing one is flagged loudly. */
  vatExpected: boolean;
}

export interface PaperBrand {
  /** `house` = no team brand (teams OFF): every value below is today's literal. */
  mode: 'house' | 'team';
  unavailable: boolean;
  /** The name when the card has none; '' prints nothing. */
  name: string;
  mark: PaperMarkKind;
  /** The team logo URL when `mark === 'team'`. */
  logoUrl: string;
  /** Care label: the house vector mark when the card has no SVG of its own. */
  labelHouseMark: boolean;
  /** Legal lines when the card has none; `undefined` = today's `COMPANY_ADDRESS`. */
  company: readonly string[] | undefined;
  seller: PaperSeller;
  /** The brand a new card starts with. */
  cardBrand: string;
  /** The brand field's placeholder on the card. */
  placeholder: string;
}

const text = (v: string | undefined | null) => (v ?? '').trim();

/**
 * `brand` is `Workspace.brand` as the server sent it (`null`/absent = teams OFF), `logoUrl` is
 * `Workspace.logo_url`, `vatId` the build's seller VAT id (`VITE_SELLER_VAT_ID`).
 */
export function resolvePaperBrand(
  brand: TeamBrand | null | undefined,
  logoUrl = '',
  vatId = '',
): PaperBrand {
  if (!brand) {
    return {
      mode: 'house',
      unavailable: false,
      name: HOUSE.name,
      mark: 'house',
      logoUrl: '',
      labelHouseMark: true,
      company: undefined,
      seller: {
        name: HOUSE.name,
        site: HOUSE.site,
        email: HOUSE.email,
        vatId,
        vatExpected: true,
      },
      cardBrand: HOUSE.cardBrand,
      placeholder: HOUSE.name,
    };
  }
  const first = !!brand.firstTeam;
  if (brand.unavailable) {
    return {
      mode: 'team',
      unavailable: true,
      name: '',
      mark: 'none',
      logoUrl: '',
      labelHouseMark: false,
      company: [],
      seller: { name: '', site: '', email: '', vatId: '', vatExpected: false },
      cardBrand: first ? HOUSE.cardBrand : '',
      placeholder: '',
    };
  }
  const name = text(brand.brandName);
  const logo = text(logoUrl);
  const company = [text(brand.legalEntity), ...(brand.legalAddress ?? []).map(text)].filter(
    Boolean,
  );
  return {
    mode: 'team',
    unavailable: false,
    name,
    mark: logo ? 'team' : first ? 'house' : 'none',
    logoUrl: logo,
    labelHouseMark: first,
    company,
    seller: {
      name,
      site: text(brand.website),
      email: text(brand.contactEmail),
      vatId: first ? vatId : '',
      vatExpected: first,
    },
    cardBrand: first ? HOUSE.cardBrand : '',
    placeholder: name,
  };
}

/** Teams OFF: what a paper resolves to with no workspace at all. */
export const HOUSE_BRAND: PaperBrand = resolvePaperBrand(null);

/** The name a paper prints for a card: the card's own brand, else the team's (rule d). */
export const paperName = (pb: PaperBrand, cardBrand?: string | null): string =>
  text(cardBrand) || pb.name;

/**
 * The legal lines a label prints for a card: the card's own lines, else the team's; `fallback` is
 * today's `COMPANY_ADDRESS` (passed in so this file stays free of the label module).
 */
export function paperAddress(
  pb: PaperBrand,
  cardLines: readonly string[] | undefined,
  fallback: readonly string[],
): readonly string[] {
  if (cardLines?.length) return cardLines;
  return pb.company ?? fallback;
}
