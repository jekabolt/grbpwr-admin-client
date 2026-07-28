// Email-campaign builder constants — the PROTO-INDEPENDENT foundation.
//
// These string-literal unions equal the members of the generated proto enums
// (common_EmailBlockType / common_EmailCampaignTopic / common_EmailCampaignStatus)
// exactly, so the form schema + builder UI can be authored before the proto
// client is regenerated. Once `make proto` lands the generated `common_*` types,
// these local types can be swapped for them without changing a single literal
// value (mirrors constants/constants.ts `heroTypes` / hero's SelectHeroType groups).

export type EmailBlockType =
  | 'EMAIL_BLOCK_TYPE_HEADER'
  | 'EMAIL_BLOCK_TYPE_IMAGE_LINK'
  | 'EMAIL_BLOCK_TYPE_RICH_TEXT'
  | 'EMAIL_BLOCK_TYPE_PRODUCT_CARD'
  | 'EMAIL_BLOCK_TYPE_PRODUCT_GRID'
  | 'EMAIL_BLOCK_TYPE_CTA_BUTTON'
  | 'EMAIL_BLOCK_TYPE_DIVIDER'
  | 'EMAIL_BLOCK_TYPE_SPACER'
  | 'EMAIL_BLOCK_TYPE_TWO_COLUMN'
  | 'EMAIL_BLOCK_TYPE_SOCIAL_LINKS'
  | 'EMAIL_BLOCK_TYPE_COUNTDOWN'
  | 'EMAIL_BLOCK_TYPE_VIDEO_THUMB';

export type EmailCampaignTopic =
  | 'EMAIL_CAMPAIGN_TOPIC_NEWSLETTER'
  | 'EMAIL_CAMPAIGN_TOPIC_NEW_ARRIVALS'
  | 'EMAIL_CAMPAIGN_TOPIC_EVENTS';

export type EmailCampaignStatus =
  | 'EMAIL_CAMPAIGN_STATUS_DRAFT'
  | 'EMAIL_CAMPAIGN_STATUS_SCHEDULED'
  | 'EMAIL_CAMPAIGN_STATUS_SENDING'
  | 'EMAIL_CAMPAIGN_STATUS_PAUSED'
  | 'EMAIL_CAMPAIGN_STATUS_SENT'
  | 'EMAIL_CAMPAIGN_STATUS_CANCELLED';

// The 12 block types, in palette order — mirrors `heroTypes` in constants.ts.
export const emailBlockTypes: { value: EmailBlockType; label: string }[] = [
  { value: 'EMAIL_BLOCK_TYPE_HEADER', label: 'header' },
  { value: 'EMAIL_BLOCK_TYPE_IMAGE_LINK', label: 'image link' },
  { value: 'EMAIL_BLOCK_TYPE_RICH_TEXT', label: 'rich text' },
  { value: 'EMAIL_BLOCK_TYPE_PRODUCT_CARD', label: 'product card' },
  { value: 'EMAIL_BLOCK_TYPE_PRODUCT_GRID', label: 'product grid' },
  { value: 'EMAIL_BLOCK_TYPE_CTA_BUTTON', label: 'cta button' },
  { value: 'EMAIL_BLOCK_TYPE_DIVIDER', label: 'divider' },
  { value: 'EMAIL_BLOCK_TYPE_SPACER', label: 'spacer' },
  { value: 'EMAIL_BLOCK_TYPE_TWO_COLUMN', label: 'two column' },
  { value: 'EMAIL_BLOCK_TYPE_SOCIAL_LINKS', label: 'social links' },
  { value: 'EMAIL_BLOCK_TYPE_COUNTDOWN', label: 'countdown' },
  { value: 'EMAIL_BLOCK_TYPE_VIDEO_THUMB', label: 'video thumb' },
];

// One-line summaries surfaced in the add-block palette — mirrors
// HERO_TYPE_DESCRIPTIONS in selectHeroType.tsx.
export const EMAIL_BLOCK_TYPE_DESCRIPTIONS: Record<EmailBlockType, string> = {
  EMAIL_BLOCK_TYPE_HEADER: 'Logo + preheader / nav links — the masthead of the email',
  EMAIL_BLOCK_TYPE_IMAGE_LINK: 'Single clickable image linking to a URL, with alt text + caption',
  EMAIL_BLOCK_TYPE_RICH_TEXT: 'Formatted copy — bold / italic / underline, links and lists',
  EMAIL_BLOCK_TYPE_PRODUCT_CARD: 'One product — image, name & price pulled from the catalogue',
  EMAIL_BLOCK_TYPE_PRODUCT_GRID: 'A grid of hand-picked products across N columns',
  EMAIL_BLOCK_TYPE_CTA_BUTTON: 'A call-to-action button — label + URL, style & alignment',
  EMAIL_BLOCK_TYPE_DIVIDER: 'A horizontal rule — colour + thickness',
  EMAIL_BLOCK_TYPE_SPACER: 'Vertical breathing room — a fixed-height gap',
  EMAIL_BLOCK_TYPE_TWO_COLUMN: 'Two side-by-side columns, each holding its own blocks',
  EMAIL_BLOCK_TYPE_SOCIAL_LINKS: 'A row of social icons — network + profile URL',
  EMAIL_BLOCK_TYPE_COUNTDOWN: 'A countdown to a moment — target time + heading / caption',
  EMAIL_BLOCK_TYPE_VIDEO_THUMB: 'A video poster that links out — thumbnail + video URL',
};

// Semantic buckets so the palette reads as a handful of groups instead of a flat
// wall of options — mirrors HERO_TYPE_GROUPS. Every block type appears once.
export const EMAIL_BLOCK_TYPE_GROUPS: { label: string; types: EmailBlockType[] }[] = [
  {
    label: 'structure',
    types: [
      'EMAIL_BLOCK_TYPE_HEADER',
      'EMAIL_BLOCK_TYPE_RICH_TEXT',
      'EMAIL_BLOCK_TYPE_DIVIDER',
      'EMAIL_BLOCK_TYPE_SPACER',
      'EMAIL_BLOCK_TYPE_TWO_COLUMN',
    ],
  },
  {
    label: 'media',
    types: ['EMAIL_BLOCK_TYPE_IMAGE_LINK', 'EMAIL_BLOCK_TYPE_VIDEO_THUMB'],
  },
  {
    label: 'products',
    types: ['EMAIL_BLOCK_TYPE_PRODUCT_CARD', 'EMAIL_BLOCK_TYPE_PRODUCT_GRID'],
  },
  {
    label: 'interactive',
    types: [
      'EMAIL_BLOCK_TYPE_CTA_BUTTON',
      'EMAIL_BLOCK_TYPE_SOCIAL_LINKS',
      'EMAIL_BLOCK_TYPE_COUNTDOWN',
    ],
  },
];

// TWO_COLUMN nests EmailBlock[] recursively; the child type-picker forbids a
// nested TWO_COLUMN so the tree can't recurse infinitely (a superRefine in the
// schema can enforce the same). Everything else is a valid column child.
export const EMAIL_CHILD_BLOCK_TYPES: EmailBlockType[] = emailBlockTypes
  .map((t) => t.value)
  .filter((v) => v !== 'EMAIL_BLOCK_TYPE_TWO_COLUMN');

export const TOPIC_LABELS: Record<EmailCampaignTopic, string> = {
  EMAIL_CAMPAIGN_TOPIC_NEWSLETTER: 'newsletter',
  EMAIL_CAMPAIGN_TOPIC_NEW_ARRIVALS: 'new arrivals',
  EMAIL_CAMPAIGN_TOPIC_EVENTS: 'events',
};

export const STATUS_LABELS: Record<EmailCampaignStatus, string> = {
  EMAIL_CAMPAIGN_STATUS_DRAFT: 'draft',
  EMAIL_CAMPAIGN_STATUS_SCHEDULED: 'scheduled',
  EMAIL_CAMPAIGN_STATUS_SENDING: 'sending',
  EMAIL_CAMPAIGN_STATUS_PAUSED: 'paused',
  EMAIL_CAMPAIGN_STATUS_SENT: 'sent',
  EMAIL_CAMPAIGN_STATUS_CANCELLED: 'cancelled',
};

// Statuses in which the builder stays editable (DRAFT/PAUSED). SCHEDULED/SENDING/
// SENT/CANCELLED are read-only to avoid corrupting an in-flight dispatch.
export const EDITABLE_STATUSES: EmailCampaignStatus[] = [
  'EMAIL_CAMPAIGN_STATUS_DRAFT',
  'EMAIL_CAMPAIGN_STATUS_PAUSED',
];

// Select items for the envelope topic picker.
export const EMAIL_TOPIC_OPTIONS: { value: EmailCampaignTopic; label: string }[] = [
  { value: 'EMAIL_CAMPAIGN_TOPIC_NEWSLETTER', label: 'newsletter' },
  { value: 'EMAIL_CAMPAIGN_TOPIC_NEW_ARRIVALS', label: 'new arrivals' },
  { value: 'EMAIL_CAMPAIGN_TOPIC_EVENTS', label: 'events' },
];

// Brand-only background tokens (grbpwr admin colour rule: brand tokens only — no
// coral/pastel washes; grays / black / white are fine). Empty = engine default.
export const EMAIL_BG_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'default' },
  { value: '#ffffff', label: 'white' },
  { value: '#f5f5f5', label: 'light gray' },
  { value: '#e5e5e5', label: 'gray' },
  { value: '#000000', label: 'black' },
];

// CTA_BUTTON presentation options (map to EmailCTAButtonBlock.style / .alignment).
export const CTA_STYLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'solid', label: 'solid' },
  { value: 'outline', label: 'outline' },
  { value: 'text', label: 'text link' },
];

export const CTA_ALIGNMENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'left', label: 'left' },
  { value: 'center', label: 'center' },
  { value: 'right', label: 'right' },
];

// Networks offered by the SOCIAL_LINKS block (map to EmailSocialLink.network).
export const SOCIAL_NETWORK_OPTIONS: { value: string; label: string }[] = [
  { value: 'instagram', label: 'instagram' },
  { value: 'tiktok', label: 'tiktok' },
  { value: 'x', label: 'x / twitter' },
  { value: 'youtube', label: 'youtube' },
  { value: 'facebook', label: 'facebook' },
  { value: 'pinterest', label: 'pinterest' },
];
