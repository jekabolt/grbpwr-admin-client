import manifest from './garment-manifest.json';

/**
 * ONE SOURCE OF TRUTH for the garment vocabulary (95-GARMENT-TAXONOMY §3): families, their parts
 * and views, the category → family rules and the detail-word refinements. The backend embeds a
 * byte-identical copy (`internal/apisrv/admin/garment-manifest.json`); `scripts/sync-garment-manifest.sh`
 * copies it and prints the sha256 both tests pin. Geometry stays in TypeScript (garment-pictograms,
 * garment-parts, garment-shapes/b1..b9) — the server never draws.
 */
export const GARMENT_MANIFEST = manifest;

export type GarmentFamily = keyof typeof manifest.families;
export type PartKey = keyof typeof manifest.part_labels;
export type ManifestView = 'front' | 'back' | 'side_l';
export type ManifestPart = { key: PartKey; view: ManifestView; zone: boolean };

/** Имена уровней категории, как их называет словарь (`common_Category.name`). */
export type FamilyInput = {
  top?: string | null;
  sub?: string | null;
  type?: string | null;
};

/** A card's construction-description row (form `details[]`, backend `tech_card_detail`). */
export type CardDetail = { key?: string | null; text?: string | null };

type FamilyEntry = {
  label: string;
  group: string;
  traits: string[];
  base: string;
  status: string;
  parts: string;
};

const FAMILY_TABLE = manifest.families as Record<GarmentFamily, FamilyEntry>;
const CATEGORIES = manifest.categories as Record<string, string>;
const PART_LABELS = manifest.part_labels as Record<PartKey, string>;

/** Every family, manifest order: the 30 kept first, then the new ones by group. */
export const FAMILIES = Object.keys(FAMILY_TABLE) as GarmentFamily[];
const FAMILY_SET: ReadonlySet<string> = new Set(FAMILIES);

export function isGarmentFamily(value: string): value is GarmentFamily {
  return FAMILY_SET.has(value);
}

/** The existing drawing a family borrows until its own is drawn; '' for the 30 kept families. */
export function baseOf(family: GarmentFamily): GarmentFamily | '' {
  const base = FAMILY_TABLE[family].base;
  return isGarmentFamily(base) ? base : '';
}

export function groupOf(family: GarmentFamily): string {
  return FAMILY_TABLE[family].group;
}

export function traitsOf(family: GarmentFamily): readonly string[] {
  return FAMILY_TABLE[family].traits;
}

export function labelOf(part: PartKey): string {
  return PART_LABELS[part];
}

const VIEW_CODE: Record<string, ManifestView> = { f: 'front', b: 'back', s: 'side_l' };

function parsePartTable(spec: string): ManifestPart[] {
  return spec
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const [key, raw = ''] = token.split(':');
      const zone = raw.endsWith('(z)');
      const view = VIEW_CODE[zone ? raw.slice(0, -3) : raw];
      if (!view || !(key in PART_LABELS)) throw new Error(`garment manifest: bad part ${token}`);
      return { key: key as PartKey, view, zone };
    });
}

const PARTS = {} as Record<GarmentFamily, readonly ManifestPart[]>;
for (const family of FAMILIES) PARTS[family] = parsePartTable(FAMILY_TABLE[family].parts);

/** The family's parts in manifest order, `whole` first. */
export function partsOf(family: GarmentFamily): readonly ManifestPart[] {
  return PARTS[family];
}

type Refinement = {
  id: string;
  detail_keys: string[];
  any_words: string[];
  from_to: Record<string, string>;
};
const REFINEMENTS = manifest.refinements as Refinement[];

/**
 * Category → family (§3.2), identical to the backend's `designQuizFamily` + `designQuizRefineFamily`:
 * lower-case + trim, first hit of `top/sub/type`, `top/sub`, `top`, else ''. Then the card's own
 * detail words may move the family to a sibling of the same group (§3.4) — never from ''.
 */
export function familyFor(
  c: FamilyInput,
  details?: readonly CardDetail[] | null,
): GarmentFamily | '' {
  const top = (c.top ?? '').trim().toLowerCase();
  const sub = (c.sub ?? '').trim().toLowerCase();
  const type = (c.type ?? '').trim().toLowerCase();
  let family = '';
  for (const key of [`${top}/${sub}/${type}`, `${top}/${sub}`, top]) {
    const hit = CATEGORIES[key];
    if (hit !== undefined) {
      family = hit;
      break;
    }
  }
  if (!isGarmentFamily(family)) return '';
  return refineFamily(family, details);
}

/** §3.4: whole-word match on the detail rows named by each refinement; only `from_to` siblings. */
export function refineFamily(
  family: GarmentFamily,
  details?: readonly CardDetail[] | null,
): GarmentFamily {
  if (!details?.length) return family;
  let out: GarmentFamily = family;
  for (const r of REFINEMENTS) {
    const to = r.from_to[out];
    if (!to || !isGarmentFamily(to)) continue;
    const keys = new Set(r.detail_keys.map((k) => k.toLowerCase()));
    const text = details
      .filter((d) => keys.has((d.key ?? '').trim().toLowerCase()))
      .map((d) => d.text ?? '')
      .join(' ')
      .toLowerCase();
    if (!text) continue;
    const words = new Set(text.match(/[a-z]+/g) ?? []);
    const hit = r.any_words.some((w) => (w.includes(' ') ? text.includes(w) : words.has(w)));
    if (hit) out = to;
  }
  return out;
}
