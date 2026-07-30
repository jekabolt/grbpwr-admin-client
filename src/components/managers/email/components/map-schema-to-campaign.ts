import {
  common_ABConfig,
  common_Colorway,
  common_EmailBlock,
  common_EmailBlockTranslation,
  common_EmailCampaignFull,
  common_EmailCampaignInsert,
} from 'api/proto-http/admin';
import { LANGUAGES } from 'constants/constants';
import { EMAIL_BG_DEFAULT } from 'constants/email-campaign';
import { v4 as uuidv4 } from 'uuid';
import { CampaignSchema, defaultCampaign, EmailBlockForm } from './schema';

// background-color <-> proto boundary. The Select uses EMAIL_BG_DEFAULT for the
// "default" (no background) option (Radix forbids an empty-string item value);
// the proto uses '' for default. Convert at every crossing.
const bgToProto = (v?: string): string => (!v || v === EMAIL_BG_DEFAULT ? '' : v);
const bgToForm = (v?: string): string => (v ? v : EMAIL_BG_DEFAULT);

// ─── int64 epoch coercion ─────────────────────────────────────────────────────
// This TS client types int64 fields (schedule_at / ends_at / *_at) as `number`,
// but the grpc-gateway JSON may send them as strings; and the FORM authors these
// as RFC3339 datetime strings. Coerce explicitly at the boundary so neither the
// string-vs-number mismatch nor NaN silently drops a schedule/countdown.

function rfc3339ToEpochSeconds(s: string | undefined): number {
  if (!s) return 0;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

function epochSecondsToRfc3339(v: number | string | undefined): string {
  const n = typeof v === 'string' ? Number(v) : v;
  if (!n || Number.isNaN(n) || n <= 0) return '';
  return new Date(n * 1000).toISOString();
}

// ─── form → EmailCampaignInsert (write model) ─────────────────────────────────

// Carry the FULL EmailBlockTranslation superset (like hero's toCopy) — each block
// only fills the subset it uses, the rest ride through empty.
function toBlockTranslation(t: any): common_EmailBlockTranslation {
  return {
    languageId: t?.languageId,
    heading: t?.heading ?? undefined,
    subheading: t?.subheading ?? undefined,
    body: t?.body ?? undefined,
    caption: t?.caption ?? undefined,
    ctaLabel: t?.ctaLabel ?? undefined,
    ctaUrl: t?.ctaUrl ?? undefined,
    altText: t?.altText ?? undefined,
    preheader: t?.preheader ?? undefined,
    links: Array.isArray(t?.links)
      ? t.links.map((l: any) => ({ label: l?.label ?? '', url: l?.url ?? '' }))
      : undefined,
  };
}

// Every insert block must carry all payload keys (each present, possibly
// undefined) plus backgroundColor + translations; only the active payload is set.
function emptyBlock(type: any): common_EmailBlock {
  return {
    type,
    header: undefined,
    imageLink: undefined,
    richText: undefined,
    productCard: undefined,
    productGrid: undefined,
    ctaButton: undefined,
    divider: undefined,
    spacer: undefined,
    twoColumn: undefined,
    socialLinks: undefined,
    countdown: undefined,
    videoThumb: undefined,
    backgroundColor: undefined,
    translations: undefined,
  };
}

function toBlock(b: any): common_EmailBlock {
  const base = emptyBlock(b.type);
  base.backgroundColor = bgToProto(b.backgroundColor) || undefined;
  base.translations = Array.isArray(b.translations)
    ? b.translations.map(toBlockTranslation)
    : undefined;

  switch (b.type) {
    case 'EMAIL_BLOCK_TYPE_HEADER':
      return {
        ...base,
        header: {
          logoMediaId: b.header?.logoMediaId || 0,
          logoPosition: b.header?.logoPosition || 'center',
        },
      };
    case 'EMAIL_BLOCK_TYPE_IMAGE_LINK':
      return {
        ...base,
        imageLink: {
          mediaId: b.imageLink?.mediaId || 0,
          url: b.imageLink?.url || '',
          aspect: b.imageLink?.aspect || '16:9',
        },
      };
    case 'EMAIL_BLOCK_TYPE_RICH_TEXT':
      return { ...base, richText: {} };
    case 'EMAIL_BLOCK_TYPE_PRODUCT_CARD':
      return { ...base, productCard: { productId: b.productCard?.productId || 0 } };
    case 'EMAIL_BLOCK_TYPE_PRODUCT_GRID':
      return {
        ...base,
        productGrid: {
          productIds: b.productGrid?.productIds || [],
          columns: b.productGrid?.columns || 0,
        },
      };
    case 'EMAIL_BLOCK_TYPE_CTA_BUTTON':
      return {
        ...base,
        ctaButton: { style: b.ctaButton?.style || '', alignment: b.ctaButton?.alignment || '' },
      };
    case 'EMAIL_BLOCK_TYPE_DIVIDER':
      return { ...base, divider: { color: b.divider?.color || '', height: b.divider?.height || 0 } };
    case 'EMAIL_BLOCK_TYPE_SPACER':
      return { ...base, spacer: { height: b.spacer?.height || 0 } };
    case 'EMAIL_BLOCK_TYPE_TWO_COLUMN':
      return {
        ...base,
        twoColumn: {
          left: (b.twoColumn?.left || []).map(toBlock),
          right: (b.twoColumn?.right || []).map(toBlock),
        },
      };
    case 'EMAIL_BLOCK_TYPE_SOCIAL_LINKS':
      return {
        ...base,
        socialLinks: {
          links: (b.socialLinks?.links || []).map((l: any) => ({
            network: l?.network || '',
            url: l?.url || '',
          })),
        },
      };
    case 'EMAIL_BLOCK_TYPE_COUNTDOWN':
      return { ...base, countdown: { endsAt: rfc3339ToEpochSeconds(b.countdown?.endsAt) } };
    case 'EMAIL_BLOCK_TYPE_VIDEO_THUMB':
      return {
        ...base,
        videoThumb: { mediaId: b.videoThumb?.mediaId || 0, videoUrl: b.videoThumb?.videoUrl || '' },
      };
    default:
      return base;
  }
}

function toAbConfig(a: any): common_ABConfig | undefined {
  if (!a) return undefined;
  return {
    enabled: !!a.enabled,
    dimension: a.dimension || 'AB_DIMENSION_UNKNOWN',
    testPct: a.testPct || 0,
    decisionAfterMinutes: a.decisionAfterMinutes || 0,
    winnerVariantId: a.winnerVariantId || 0,
  };
}

// The subject copy lives on variant[0].subject_i18n. When A/B is enabled a second
// variant (B) is emitted so the campaign carries ≥2 variants (the backend requires
// it, and for the SUBJECT dimension the subjects must differ). Content-dimension B
// shares A's subject and inherits the campaign body (empty body = inherit).
export function mapFormToCampaignInsert(f: CampaignSchema): common_EmailCampaignInsert {
  const abEnabled = !!f.abConfig?.enabled;
  const subjectDimension = f.abConfig?.dimension === 'AB_DIMENSION_SUBJECT';

  const subjectA = (f.subjectI18n || []).map((t) => ({
    languageId: t.languageId,
    subject: t.subject,
  }));
  const subjectB = subjectDimension
    ? (f.variantB || []).map((t) => ({ languageId: t.languageId, subject: t.subject || '' }))
    : // content A/B keeps the subject; only the body differs (authored server-side /
      // future body-B editor). Share A's subject so both variants are valid.
      subjectA.map((t) => ({ ...t }));

  const variants = [
    {
      id: 0,
      label: abEnabled ? 'A' : 'default',
      subjectI18n: subjectA,
      body: [],
      isWinner: !abEnabled, // undecided while A/B is running; backend sets the winner.
    },
  ];
  if (abEnabled) {
    variants.push({
      id: 0,
      label: 'B',
      subjectI18n: subjectB,
      body: [],
      isWinner: false,
    });
  }

  return {
    name: f.name,
    topic: f.topic,
    body: (f.body || []).map(toBlock),
    backgroundColor: bgToProto(f.backgroundColor),
    fromName: f.fromName,
    fromEmail: f.fromEmail,
    replyTo: f.replyTo || '',
    // Both fields below are SERVER-OWNED on the upsert path: UpsertEmailCampaign
    // accepts only UNKNOWN/DRAFT ("campaign status is server-owned; drafts only"),
    // forces status='draft' and resets schedule_at to NULL. Scheduling happens
    // through the ScheduleCampaign RPC (the dispatch panel), never through a save —
    // so always declare DRAFT here and treat schedule_at as read-back-only.
    scheduleAt: rfc3339ToEpochSeconds(f.scheduleAt),
    abConfig: toAbConfig(f.abConfig),
    variants,
    status: 'EMAIL_CAMPAIGN_STATUS_DRAFT',
    segmentId: f.segmentId || 0,
  };
}

// ─── EmailCampaignFull → form (read model) ────────────────────────────────────

function readBlockTranslation(t: any, languageId: number): any {
  return {
    languageId,
    heading: t?.heading || '',
    subheading: t?.subheading || '',
    body: t?.body || '',
    caption: t?.caption || '',
    ctaLabel: t?.ctaLabel || '',
    ctaUrl: t?.ctaUrl || '',
    altText: t?.altText || '',
    preheader: t?.preheader || '',
    links: Array.isArray(t?.links)
      ? t.links.map((l: any) => ({ label: l?.label || '', url: l?.url || '' }))
      : [],
  };
}

// Normalise a block's translations to exactly the 7 languages (createStrict
// TranslationSchema requires all present), filling from the backend by languageId.
function readTranslations(raw: any[] | undefined): any[] {
  return LANGUAGES.map((l) => {
    const t = (raw || []).find((x: any) => x?.languageId === l.id);
    return readBlockTranslation(t, l.id);
  });
}

// productsByBlockUid records the product ids per product block uid so the builder
// can resolve them into common_Colorway for the picker's display cache (best-effort;
// the ids in the form are the source of truth and round-trip regardless).
export type ProductIdsByBlockUid = Record<string, number[]>;

function readBlock(b: any, productIdsByUid: ProductIdsByBlockUid): EmailBlockForm {
  const uid = uuidv4();
  const translations = readTranslations(b.translations);
  const base: any = { _uid: uid, backgroundColor: bgToForm(b.backgroundColor) };

  switch (b.type) {
    case 'EMAIL_BLOCK_TYPE_HEADER':
      return {
        ...base,
        type: b.type,
        header: {
          logoMediaId: b.header?.logoMediaId || undefined,
          logoPosition: b.header?.logoPosition || 'center',
        },
        translations,
      };
    case 'EMAIL_BLOCK_TYPE_IMAGE_LINK':
      return {
        ...base,
        type: b.type,
        imageLink: {
          mediaId: b.imageLink?.mediaId || undefined,
          url: b.imageLink?.url || '',
          aspect: b.imageLink?.aspect || '16:9',
        },
        translations,
      };
    case 'EMAIL_BLOCK_TYPE_RICH_TEXT':
      return { ...base, type: b.type, richText: {}, translations };
    case 'EMAIL_BLOCK_TYPE_PRODUCT_CARD':
      if (b.productCard?.productId) productIdsByUid[uid] = [b.productCard.productId];
      return { ...base, type: b.type, productCard: { productId: b.productCard?.productId || undefined } };
    case 'EMAIL_BLOCK_TYPE_PRODUCT_GRID':
      if (b.productGrid?.productIds?.length) productIdsByUid[uid] = [...b.productGrid.productIds];
      return {
        ...base,
        type: b.type,
        productGrid: {
          productIds: b.productGrid?.productIds || [],
          columns: b.productGrid?.columns || undefined,
        },
        translations,
      };
    case 'EMAIL_BLOCK_TYPE_CTA_BUTTON':
      return {
        ...base,
        type: b.type,
        ctaButton: { style: b.ctaButton?.style || '', alignment: b.ctaButton?.alignment || '' },
        translations,
      };
    case 'EMAIL_BLOCK_TYPE_DIVIDER':
      return { ...base, type: b.type, divider: { color: b.divider?.color || '', height: b.divider?.height || undefined } };
    case 'EMAIL_BLOCK_TYPE_SPACER':
      return { ...base, type: b.type, spacer: { height: b.spacer?.height || undefined } };
    case 'EMAIL_BLOCK_TYPE_TWO_COLUMN':
      return {
        ...base,
        type: b.type,
        twoColumn: {
          left: (b.twoColumn?.left || []).map((x: any) => readBlock(x, productIdsByUid)),
          right: (b.twoColumn?.right || []).map((x: any) => readBlock(x, productIdsByUid)),
        },
      };
    case 'EMAIL_BLOCK_TYPE_SOCIAL_LINKS':
      return {
        ...base,
        type: b.type,
        socialLinks: {
          links: (b.socialLinks?.links || []).map((l: any) => ({
            network: l?.network || '',
            url: l?.url || '',
          })),
        },
      };
    case 'EMAIL_BLOCK_TYPE_COUNTDOWN':
      return {
        ...base,
        type: b.type,
        countdown: { endsAt: epochSecondsToRfc3339(b.countdown?.endsAt) },
        translations,
      };
    case 'EMAIL_BLOCK_TYPE_VIDEO_THUMB':
      return {
        ...base,
        type: b.type,
        videoThumb: { mediaId: b.videoThumb?.mediaId || undefined, videoUrl: b.videoThumb?.videoUrl || '' },
        translations,
      };
    default:
      return { ...base, type: b.type, translations } as EmailBlockForm;
  }
}

export type CampaignFormWithProducts = CampaignSchema & {
  productIdsByBlockUid: ProductIdsByBlockUid;
  // Resolved products keyed by block uid — filled by the builder after a bulk
  // product fetch (empty from this sync mapper).
  productsByBlockUid: Record<string, common_Colorway[]>;
};

export function mapCampaignFullToForm(c?: common_EmailCampaignFull): CampaignFormWithProducts {
  const productIdsByBlockUid: ProductIdsByBlockUid = {};
  if (!c) {
    return {
      ...(JSON.parse(JSON.stringify(defaultCampaign)) as CampaignSchema),
      productIdsByBlockUid,
      productsByBlockUid: {},
    };
  }

  const variant0 = (c.variants || [])[0];
  const subjectI18n = LANGUAGES.map((l) => {
    const s = (variant0?.subjectI18n || []).find((x: any) => x?.languageId === l.id);
    return { languageId: l.id, subject: s?.subject || '' };
  });

  const variant1 = (c.variants || [])[1];
  const variantB = LANGUAGES.map((l) => {
    const s = (variant1?.subjectI18n || []).find((x: any) => x?.languageId === l.id);
    return { languageId: l.id, subject: s?.subject || '' };
  });

  return {
    name: c.name || '',
    topic:
      c.topic && c.topic !== 'EMAIL_CAMPAIGN_TOPIC_UNKNOWN'
        ? c.topic
        : 'EMAIL_CAMPAIGN_TOPIC_NEWSLETTER',
    fromName: c.fromName || '',
    fromEmail: c.fromEmail || '',
    replyTo: c.replyTo || '',
    backgroundColor: bgToForm(c.backgroundColor),
    segmentId: c.segmentId || undefined,
    scheduleAt: epochSecondsToRfc3339(c.scheduleAt),
    subjectI18n,
    variantB,
    body: (c.body || []).map((b: any) => readBlock(b, productIdsByBlockUid)),
    abConfig: c.abConfig
      ? {
          enabled: !!c.abConfig.enabled,
          dimension: c.abConfig.dimension || undefined,
          testPct: c.abConfig.testPct || undefined,
          decisionAfterMinutes: c.abConfig.decisionAfterMinutes || undefined,
          winnerVariantId: c.abConfig.winnerVariantId || undefined,
        }
      : { enabled: false },
    productIdsByBlockUid,
    productsByBlockUid: {},
  };
}

export { epochSecondsToRfc3339, rfc3339ToEpochSeconds };
