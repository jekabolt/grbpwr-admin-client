import { LANGUAGES } from 'constants/constants';
import {
  AB_DECISION_MAX_MINUTES,
  AB_DECISION_MIN_MINUTES,
  AB_TEST_PCT_MAX,
  AB_TEST_PCT_MIN,
  EmailBlockType,
  EmailCampaignTopic,
} from 'constants/email-campaign';
import { z } from 'zod';

const DEFAULT_LANGUAGE_ID = LANGUAGES.find((l) => l.isDefault)?.id ?? LANGUAGES[0].id;

// PROTO-INDEPENDENT local form-model for the email-campaign builder. Field
// names/shapes match the committed backend proto
// (proto/common/common/email_campaign.proto) camelCased exactly as this repo's
// typescript-http client would generate them, so the LATER proto mapper is a 1:1
// rename-free copy. The mapper + API hooks are deliberately NOT built here.
//
// Fork of hero/components/schema.ts — createStrictTranslationSchema is copied
// verbatim; the discriminant is the EmailBlockType literal set; TWO_COLUMN
// recursion is wired through z.lazy.

const requiredLanguageIds = LANGUAGES.map((l) => l.id);

// Every language must be present exactly once (fields inside may be optional).
// Verbatim fork of hero's helper.
const createStrictTranslationSchema = <T extends z.ZodType>(
  translationSchema: T,
  requiredIds: number[],
) => {
  return z
    .array(translationSchema)
    .min(1, 'At least one translation is required')
    .refine(
      (arr) => {
        const ids = arr.map((t: any) => t.languageId);
        const uniqueIds = new Set(ids);
        return uniqueIds.size === ids.length;
      },
      { message: 'Each language can only appear once' },
    )
    .refine((arr) => arr.length === requiredIds.length, {
      message: `Exactly ${requiredIds.length} language(s) required`,
    })
    .refine((arr) => requiredIds.every((id) => arr.some((t: any) => t.languageId === id)), {
      message: 'All languages must be filled',
    });
};

// EmailLink { label, url } — localized link copy used by header-style blocks.
const emailLinkSchema = z.object({
  label: z.string().default(''),
  url: z.string().default(''),
});

// EmailSocialLink { network, url } — NOT localized (lives on the block, not the
// translation).
const socialLinkSchema = z.object({
  network: z.string().default(''),
  url: z.string().default(''),
});

// ── per-block translation subsets of the EmailBlockTranslation superset ────────
// The proto carries ONE translation superset (heading/subheading/body/caption/
// cta_label/cta_url/alt_text/preheader/links) on the EmailBlock; each block type
// consumes only the fields it needs. We model each block's subset so the editor
// only surfaces the relevant fields, while the mapper still emits the superset.

const headerTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  preheader: z.string().optional(),
  heading: z.string().optional(),
  subheading: z.string().optional(),
  links: z.array(emailLinkSchema).optional(),
});

const imageLinkTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  altText: z.string().optional(),
  caption: z.string().optional(),
});

const richTextTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  // Email-safe HTML string emitted by RichTextField.
  body: z.string().min(1, 'Content is required'),
});

const productGridTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  heading: z.string().optional(),
});

const ctaButtonTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  ctaLabel: z.string().min(1, 'Button label is required'),
  ctaUrl: z.string().min(1, 'Button URL is required'),
});

const countdownTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  heading: z.string().optional(),
  caption: z.string().optional(),
});

const videoThumbTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  caption: z.string().optional(),
  altText: z.string().optional(),
});

// ── discriminated-union members (11 non-recursive; TWO_COLUMN is inlined in the
//    lazy union below because it self-references) ────────────────────────────────

const headerMember = z.object({
  type: z.literal('EMAIL_BLOCK_TYPE_HEADER'),
  _uid: z.string().optional(),
  backgroundColor: z.string().optional(),
  header: z.object({
    logoMediaId: z.number().optional(),
    // transient thumbnail url for the preview (not sent to the proto; the mapper
    // reads logoMediaId only). Mirrors hero storing mediaLandscapeUrl in-form.
    logoMediaUrl: z.string().optional(),
    // brand logo alignment: left | center | right (default center).
    logoPosition: z.string().optional(),
  }),
  translations: createStrictTranslationSchema(headerTranslation, requiredLanguageIds),
});

const imageLinkMember = z.object({
  type: z.literal('EMAIL_BLOCK_TYPE_IMAGE_LINK'),
  _uid: z.string().optional(),
  backgroundColor: z.string().optional(),
  imageLink: z.object({
    mediaId: z.number().optional(),
    // transient image thumbnail url for the preview (distinct from `url`, the
    // click-through link target); not sent to the proto.
    mediaUrl: z.string().optional(),
    url: z.string().optional(),
    // display aspect ratio: 16:9 | 1:1 | 4:5 (default 16:9).
    aspect: z.string().optional(),
  }),
  translations: createStrictTranslationSchema(imageLinkTranslation, requiredLanguageIds),
});

const richTextMember = z.object({
  type: z.literal('EMAIL_BLOCK_TYPE_RICH_TEXT'),
  _uid: z.string().optional(),
  backgroundColor: z.string().optional(),
  // EmailRichTextBlock {} — empty payload; the HTML lives per-language in body.
  richText: z.object({}).default({}),
  translations: createStrictTranslationSchema(richTextTranslation, requiredLanguageIds),
});

const productCardMember = z.object({
  type: z.literal('EMAIL_BLOCK_TYPE_PRODUCT_CARD'),
  _uid: z.string().optional(),
  backgroundColor: z.string().optional(),
  productCard: z.object({
    productId: z.union([z.number(), z.undefined()]).refine((v) => v !== undefined && v >= 1, {
      message: 'A product is required',
    }),
  }),
});

const productGridMember = z.object({
  type: z.literal('EMAIL_BLOCK_TYPE_PRODUCT_GRID'),
  _uid: z.string().optional(),
  backgroundColor: z.string().optional(),
  productGrid: z.object({
    productIds: z.array(z.number().min(1)).min(1, 'At least one product is required'),
    columns: z.number().optional(),
  }),
  translations: createStrictTranslationSchema(productGridTranslation, requiredLanguageIds),
});

const ctaButtonMember = z.object({
  type: z.literal('EMAIL_BLOCK_TYPE_CTA_BUTTON'),
  _uid: z.string().optional(),
  backgroundColor: z.string().optional(),
  ctaButton: z.object({
    style: z.string().optional(),
    alignment: z.string().optional(),
  }),
  translations: createStrictTranslationSchema(ctaButtonTranslation, requiredLanguageIds),
});

const dividerMember = z.object({
  type: z.literal('EMAIL_BLOCK_TYPE_DIVIDER'),
  _uid: z.string().optional(),
  backgroundColor: z.string().optional(),
  divider: z.object({
    color: z.string().optional(),
    height: z.number().optional(),
  }),
});

const spacerMember = z.object({
  type: z.literal('EMAIL_BLOCK_TYPE_SPACER'),
  _uid: z.string().optional(),
  backgroundColor: z.string().optional(),
  spacer: z.object({
    height: z.number().optional(),
  }),
});

const socialLinksMember = z.object({
  type: z.literal('EMAIL_BLOCK_TYPE_SOCIAL_LINKS'),
  _uid: z.string().optional(),
  backgroundColor: z.string().optional(),
  socialLinks: z.object({
    links: z.array(socialLinkSchema).default([]),
  }),
});

const countdownMember = z.object({
  type: z.literal('EMAIL_BLOCK_TYPE_COUNTDOWN'),
  _uid: z.string().optional(),
  backgroundColor: z.string().optional(),
  countdown: z.object({
    // EmailCountdownBlock.ends_at is int64. The FORM holds an RFC3339 string
    // (authored via ReleaseDateField, like hero DROP.releaseAt); the LATER mapper
    // coerces it to epoch-seconds — which this TS client renders as a STRING, not
    // a number. Kept a string end-to-end to avoid int64 precision loss.
    endsAt: z.string().optional(),
  }),
  translations: createStrictTranslationSchema(countdownTranslation, requiredLanguageIds),
});

const videoThumbMember = z.object({
  type: z.literal('EMAIL_BLOCK_TYPE_VIDEO_THUMB'),
  _uid: z.string().optional(),
  backgroundColor: z.string().optional(),
  videoThumb: z.object({
    mediaId: z.number().optional(),
    // transient poster thumbnail url for the preview; not sent to the proto.
    posterUrl: z.string().optional(),
    videoUrl: z.string().optional(),
  }),
  translations: createStrictTranslationSchema(videoThumbTranslation, requiredLanguageIds),
});

// ── recursive block type + schema ─────────────────────────────────────────────
// TWO_COLUMN's columns are EmailBlock[] of the SAME union, so the schema must
// self-reference. z.discriminatedUnion can't self-reference directly; z.lazy
// defers evaluation so `emailBlockSchema` is defined by the time the factory runs
// (first parse). The recursive TS type is written out and used to annotate the
// lazy schema (TS can't infer recursive types).

type HeaderBlockForm = z.infer<typeof headerMember>;
type ImageLinkBlockForm = z.infer<typeof imageLinkMember>;
type RichTextBlockForm = z.infer<typeof richTextMember>;
type ProductCardBlockForm = z.infer<typeof productCardMember>;
type ProductGridBlockForm = z.infer<typeof productGridMember>;
type CtaButtonBlockForm = z.infer<typeof ctaButtonMember>;
type DividerBlockForm = z.infer<typeof dividerMember>;
type SpacerBlockForm = z.infer<typeof spacerMember>;
type SocialLinksBlockForm = z.infer<typeof socialLinksMember>;
type CountdownBlockForm = z.infer<typeof countdownMember>;
type VideoThumbBlockForm = z.infer<typeof videoThumbMember>;

export type TwoColumnBlockForm = {
  type: 'EMAIL_BLOCK_TYPE_TWO_COLUMN';
  _uid?: string;
  backgroundColor?: string;
  twoColumn: {
    left: EmailBlockForm[];
    right: EmailBlockForm[];
  };
};

export type EmailBlockForm =
  | HeaderBlockForm
  | ImageLinkBlockForm
  | RichTextBlockForm
  | ProductCardBlockForm
  | ProductGridBlockForm
  | CtaButtonBlockForm
  | DividerBlockForm
  | SpacerBlockForm
  | TwoColumnBlockForm
  | SocialLinksBlockForm
  | CountdownBlockForm
  | VideoThumbBlockForm;

export const emailBlockSchema: z.ZodType<EmailBlockForm> = z.lazy(() =>
  z.discriminatedUnion('type', [
    headerMember,
    imageLinkMember,
    richTextMember,
    productCardMember,
    productGridMember,
    ctaButtonMember,
    dividerMember,
    spacerMember,
    z.object({
      type: z.literal('EMAIL_BLOCK_TYPE_TWO_COLUMN'),
      _uid: z.string().optional(),
      backgroundColor: z.string().optional(),
      twoColumn: z.object({
        left: z.array(emailBlockSchema).default([]),
        right: z.array(emailBlockSchema).default([]),
      }),
    }),
    socialLinksMember,
    countdownMember,
    videoThumbMember,
  ]),
) as z.ZodType<EmailBlockForm>;

// ── per-variant subject copy (EmailCampaignVariant.subject_i18n) ───────────────
const subjectTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  subject: z.string().min(1, 'Subject is required'),
});

// Variant B subject copy (EmailCampaignVariant[1].subject_i18n). Only meaningful
// when A/B is enabled on the SUBJECT dimension; the per-field required/distinct
// checks are enforced in the campaign-level superRefine (below) so a plain draft
// with A/B off never trips them.
const variantBSubjectTranslation = z.object({
  languageId: z.number().min(1, 'Language is required'),
  subject: z.string().optional(),
});

// ── ABConfig (Ф4; disabled panel in Ф1, but the shape is modelled now) ─────────
export const abConfigSchema = z.object({
  enabled: z.boolean().default(false),
  dimension: z
    .enum(['AB_DIMENSION_UNKNOWN', 'AB_DIMENSION_SUBJECT', 'AB_DIMENSION_CONTENT'])
    .optional(),
  testPct: z.number().optional(),
  decisionAfterMinutes: z.number().optional(),
  winnerVariantId: z.number().optional(),
});

export type ABConfigForm = z.infer<typeof abConfigSchema>;

// ── campaign envelope ─────────────────────────────────────────────────────────
const campaignBaseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  topic: z.enum([
    'EMAIL_CAMPAIGN_TOPIC_NEWSLETTER',
    'EMAIL_CAMPAIGN_TOPIC_NEW_ARRIVALS',
    'EMAIL_CAMPAIGN_TOPIC_EVENTS',
  ]),
  fromName: z.string().min(1, 'From name is required'),
  fromEmail: z.string().email('A valid from-email is required'),
  // Optional; empty string allowed (no reply-to override).
  replyTo: z.union([z.string().email(), z.literal('')]).optional(),
  backgroundColor: z.string().optional(),
  // Ф2 segment builder is stubbed. Segment is required to SEND, not to save a
  // DRAFT, so it is optional here (open question in the spec) — the send/schedule
  // gate enforces it later, not the draft form.
  segmentId: z.number().optional(),
  // RFC3339 string; the LATER mapper converts to int64 epoch-seconds (string in
  // this TS client). '' / undefined => send immediately / unscheduled.
  scheduleAt: z.string().optional(),
  subjectI18n: createStrictTranslationSchema(subjectTranslation, requiredLanguageIds),
  // Variant B subject copy (all languages present; only validated when A/B subject
  // is enabled). Empty per-language strings are fine for a plain (A/B off) draft.
  variantB: z.array(variantBSubjectTranslation).optional(),
  body: z.array(emailBlockSchema).default([]),
  abConfig: abConfigSchema.optional(),
});

// A/B rules mirror the backend send/schedule gate so the form rejects early:
//  · dimension must be picked (subject | content)
//  · test % in 1…100
//  · decision window in 30…10080 minutes (a 0 silently breaks A/B — reject loudly)
//  · A/B needs ≥2 variants; for the SUBJECT dimension variant B's default-language
//    subject is required AND must differ from variant A.
export const campaignSchema = campaignBaseSchema.superRefine((val, ctx) => {
  const ab = val.abConfig;
  if (!ab?.enabled) return;

  if (!ab.dimension || ab.dimension === 'AB_DIMENSION_UNKNOWN') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['abConfig', 'dimension'],
      message: 'Pick a test dimension (subject or content)',
    });
  }

  const pct = ab.testPct ?? 0;
  if (pct < AB_TEST_PCT_MIN || pct > AB_TEST_PCT_MAX) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['abConfig', 'testPct'],
      message: `Test % must be between ${AB_TEST_PCT_MIN} and ${AB_TEST_PCT_MAX}`,
    });
  }

  const dm = ab.decisionAfterMinutes ?? 0;
  if (dm < AB_DECISION_MIN_MINUTES || dm > AB_DECISION_MAX_MINUTES) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['abConfig', 'decisionAfterMinutes'],
      message: `Decision window must be ${AB_DECISION_MIN_MINUTES}–${AB_DECISION_MAX_MINUTES} minutes (30 min to 7 days)`,
    });
  }

  if (ab.dimension === 'AB_DIMENSION_SUBJECT') {
    const bIdx = (val.variantB || []).findIndex((t) => t.languageId === DEFAULT_LANGUAGE_ID);
    const aSubj =
      (val.subjectI18n || []).find((t: any) => t.languageId === DEFAULT_LANGUAGE_ID)?.subject ?? '';
    const bSubj = bIdx >= 0 ? val.variantB?.[bIdx]?.subject ?? '' : '';
    const path = ['variantB', bIdx >= 0 ? bIdx : 0, 'subject'] as (string | number)[];
    if (bSubj.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: 'Variant B subject is required for a subject A/B test',
      });
    } else if (aSubj.trim() !== '' && aSubj.trim() === bSubj.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path,
        message: 'Variant B subject must differ from variant A',
      });
    }
  }
});

export type CampaignSchema = z.infer<typeof campaignBaseSchema>;

// Empty-campaign default for a fresh builder form.
export const defaultCampaign: CampaignSchema = {
  name: '',
  topic: 'EMAIL_CAMPAIGN_TOPIC_NEWSLETTER',
  fromName: '',
  fromEmail: '',
  replyTo: '',
  backgroundColor: '',
  segmentId: undefined,
  scheduleAt: '',
  subjectI18n: LANGUAGES.map((l) => ({ languageId: l.id, subject: '' })),
  variantB: LANGUAGES.map((l) => ({ languageId: l.id, subject: '' })),
  body: [],
  abConfig: { enabled: false },
};

// Which payload key each block type populates (mirror of the proto oneof-by-field).
export const BLOCK_PAYLOAD_KEY: Record<EmailBlockType, string> = {
  EMAIL_BLOCK_TYPE_HEADER: 'header',
  EMAIL_BLOCK_TYPE_IMAGE_LINK: 'imageLink',
  EMAIL_BLOCK_TYPE_RICH_TEXT: 'richText',
  EMAIL_BLOCK_TYPE_PRODUCT_CARD: 'productCard',
  EMAIL_BLOCK_TYPE_PRODUCT_GRID: 'productGrid',
  EMAIL_BLOCK_TYPE_CTA_BUTTON: 'ctaButton',
  EMAIL_BLOCK_TYPE_DIVIDER: 'divider',
  EMAIL_BLOCK_TYPE_SPACER: 'spacer',
  EMAIL_BLOCK_TYPE_TWO_COLUMN: 'twoColumn',
  EMAIL_BLOCK_TYPE_SOCIAL_LINKS: 'socialLinks',
  EMAIL_BLOCK_TYPE_COUNTDOWN: 'countdown',
  EMAIL_BLOCK_TYPE_VIDEO_THUMB: 'videoThumb',
};

// Block types that carry a per-language EmailBlockTranslation subset (drive
// whether the editor renders UnifiedTranslationFields).
export const BLOCK_HAS_TRANSLATIONS: Record<EmailBlockType, boolean> = {
  EMAIL_BLOCK_TYPE_HEADER: true,
  EMAIL_BLOCK_TYPE_IMAGE_LINK: true,
  EMAIL_BLOCK_TYPE_RICH_TEXT: true,
  EMAIL_BLOCK_TYPE_PRODUCT_CARD: false,
  EMAIL_BLOCK_TYPE_PRODUCT_GRID: true,
  EMAIL_BLOCK_TYPE_CTA_BUTTON: true,
  EMAIL_BLOCK_TYPE_DIVIDER: false,
  EMAIL_BLOCK_TYPE_SPACER: false,
  EMAIL_BLOCK_TYPE_TWO_COLUMN: false,
  EMAIL_BLOCK_TYPE_SOCIAL_LINKS: false,
  EMAIL_BLOCK_TYPE_COUNTDOWN: true,
  EMAIL_BLOCK_TYPE_VIDEO_THUMB: true,
};

// Seed a freshly-added block with the minimal valid shape for its type (a full
// per-language translation array where the type carries copy). Keeps the
// discriminated union parseable the moment a block is appended.
export function makeEmptyBlock(type: EmailBlockType, uid: string): EmailBlockForm {
  const emptyTranslations = LANGUAGES.map((l) => ({ languageId: l.id }));
  const base = { _uid: uid, backgroundColor: '' };
  switch (type) {
    case 'EMAIL_BLOCK_TYPE_HEADER':
      return {
        ...base,
        type,
        header: { logoPosition: 'center' },
        translations: emptyTranslations,
      } as EmailBlockForm;
    case 'EMAIL_BLOCK_TYPE_IMAGE_LINK':
      return {
        ...base,
        type,
        imageLink: { url: '', aspect: '16:9' },
        translations: emptyTranslations,
      } as EmailBlockForm;
    case 'EMAIL_BLOCK_TYPE_RICH_TEXT':
      return {
        ...base,
        type,
        richText: {},
        translations: LANGUAGES.map((l) => ({ languageId: l.id, body: '' })),
      } as EmailBlockForm;
    case 'EMAIL_BLOCK_TYPE_PRODUCT_CARD':
      return { ...base, type, productCard: {} } as unknown as EmailBlockForm;
    case 'EMAIL_BLOCK_TYPE_PRODUCT_GRID':
      return {
        ...base,
        type,
        productGrid: { productIds: [], columns: 2 },
        translations: emptyTranslations,
      } as EmailBlockForm;
    case 'EMAIL_BLOCK_TYPE_CTA_BUTTON':
      return {
        ...base,
        type,
        ctaButton: { style: 'solid', alignment: 'center' },
        translations: LANGUAGES.map((l) => ({ languageId: l.id, ctaLabel: '', ctaUrl: '' })),
      } as EmailBlockForm;
    case 'EMAIL_BLOCK_TYPE_DIVIDER':
      return { ...base, type, divider: { color: '', height: 1 } } as EmailBlockForm;
    case 'EMAIL_BLOCK_TYPE_SPACER':
      return { ...base, type, spacer: { height: 32 } } as EmailBlockForm;
    case 'EMAIL_BLOCK_TYPE_TWO_COLUMN':
      return { ...base, type, twoColumn: { left: [], right: [] } } as EmailBlockForm;
    case 'EMAIL_BLOCK_TYPE_SOCIAL_LINKS':
      return { ...base, type, socialLinks: { links: [] } } as EmailBlockForm;
    case 'EMAIL_BLOCK_TYPE_COUNTDOWN':
      return {
        ...base,
        type,
        countdown: { endsAt: '' },
        translations: emptyTranslations,
      } as EmailBlockForm;
    case 'EMAIL_BLOCK_TYPE_VIDEO_THUMB':
      return {
        ...base,
        type,
        videoThumb: { videoUrl: '' },
        translations: emptyTranslations,
      } as EmailBlockForm;
    default:
      return { ...base, type, spacer: { height: 32 } } as EmailBlockForm;
  }
}

// Re-export for callers that want the union topic type without a second import.
export type { EmailBlockType, EmailCampaignTopic };
