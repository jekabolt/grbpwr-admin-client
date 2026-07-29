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
// The "add block" palette. Deliberately omits two_column (no real use), social_links (useless)
// and video_thumb (email clients don't play video — use an image-link block with an animated GIF
// instead). The underlying block types still exist so any legacy campaign keeps rendering.
export const emailBlockTypes: { value: EmailBlockType; label: string }[] = [
  { value: 'EMAIL_BLOCK_TYPE_HEADER', label: 'header' },
  { value: 'EMAIL_BLOCK_TYPE_IMAGE_LINK', label: 'image / gif' },
  { value: 'EMAIL_BLOCK_TYPE_RICH_TEXT', label: 'rich text' },
  { value: 'EMAIL_BLOCK_TYPE_PRODUCT_CARD', label: 'product card' },
  { value: 'EMAIL_BLOCK_TYPE_PRODUCT_GRID', label: 'product grid' },
  { value: 'EMAIL_BLOCK_TYPE_CTA_BUTTON', label: 'cta button' },
  { value: 'EMAIL_BLOCK_TYPE_DIVIDER', label: 'divider' },
  { value: 'EMAIL_BLOCK_TYPE_SPACER', label: 'spacer' },
  { value: 'EMAIL_BLOCK_TYPE_COUNTDOWN', label: 'countdown' },
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
// Radix Select forbids an empty-string item value (it reserves '' for clearing),
// so "default" (= no background, engine default) uses a non-empty sentinel that
// the schema<->proto mapper converts to/from '' at the boundary.
export const EMAIL_BG_DEFAULT = '__default__';
export const EMAIL_BG_COLOR_OPTIONS: { value: string; label: string }[] = [
  { value: EMAIL_BG_DEFAULT, label: 'default' },
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

// Header logo alignment (EmailHeaderBlock.logoPosition). The logo itself is the
// locked brand default — only its position is authorable.
export const LOGO_POSITION_OPTIONS: { value: string; label: string }[] = [
  { value: 'left', label: 'left' },
  { value: 'center', label: 'center' },
  { value: 'right', label: 'right' },
];

// Image block display aspect ratio (EmailImageLinkBlock.aspect). Drives both the
// media-picker crop target and the rendered max-width.
export const IMAGE_ASPECT_OPTIONS: { value: string; label: string }[] = [
  { value: '16:9', label: 'horizontal (16:9)' },
  { value: '1:1', label: 'square (1:1)' },
  { value: '4:5', label: 'vertical (4:5)' },
];

// Spacer presets (EmailSpacerBlock.height in px) — a few sizes instead of a raw
// number input.
export const SPACER_HEIGHT_OPTIONS: { value: number; label: string }[] = [
  { value: 16, label: 'small (16px)' },
  { value: 32, label: 'medium (32px)' },
  { value: 56, label: 'large (56px)' },
  { value: 80, label: 'x-large (80px)' },
];

// ── A/B testing (ABConfig) ─────────────────────────────────────────────────────
// ABDimension enum members (subject vs. content); UNKNOWN is not offerable.
export type ABDimension = 'AB_DIMENSION_SUBJECT' | 'AB_DIMENSION_CONTENT';

export const AB_DIMENSION_OPTIONS: { value: ABDimension; label: string }[] = [
  { value: 'AB_DIMENSION_SUBJECT', label: 'subject line' },
  { value: 'AB_DIMENSION_CONTENT', label: 'content (body)' },
];

// The backend rejects a decision window outside 30 min … 7 days (10080 min) and a
// test % outside 1…100. Mirror those bounds client-side so the form rejects early.
export const AB_DECISION_MIN_MINUTES = 30;
export const AB_DECISION_MAX_MINUTES = 10080;
export const AB_TEST_PCT_MIN = 1;
export const AB_TEST_PCT_MAX = 100;

// ── dispatch ledger labels (EmailCampaignRecipientStatus / EmailCampaignCohort) ──
export const RECIPIENT_STATUS_LABELS: Record<string, string> = {
  EMAIL_CAMPAIGN_RECIPIENT_STATUS_UNKNOWN: 'unknown',
  EMAIL_CAMPAIGN_RECIPIENT_STATUS_PENDING: 'pending',
  EMAIL_CAMPAIGN_RECIPIENT_STATUS_SENT: 'sent',
  EMAIL_CAMPAIGN_RECIPIENT_STATUS_FAILED: 'failed',
  EMAIL_CAMPAIGN_RECIPIENT_STATUS_SKIPPED: 'skipped',
};

// Sentinel for the "no filter" option — a Radix Select.Item can't take an empty
// string value, so the un-filtered choice uses this and the table maps it to null.
export const RECIPIENT_FILTER_ALL = '__all__';

// Filter options for the recipients table (client-side over loaded rows — the
// GetCampaignRecipients RPC takes only id/afterId/limit, no server-side filters).
export const RECIPIENT_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: RECIPIENT_FILTER_ALL, label: 'all statuses' },
  { value: 'EMAIL_CAMPAIGN_RECIPIENT_STATUS_PENDING', label: 'pending' },
  { value: 'EMAIL_CAMPAIGN_RECIPIENT_STATUS_SENT', label: 'sent' },
  { value: 'EMAIL_CAMPAIGN_RECIPIENT_STATUS_FAILED', label: 'failed' },
  { value: 'EMAIL_CAMPAIGN_RECIPIENT_STATUS_SKIPPED', label: 'skipped' },
];

export const COHORT_LABELS: Record<string, string> = {
  EMAIL_CAMPAIGN_COHORT_UNKNOWN: '—',
  EMAIL_CAMPAIGN_COHORT_AB: 'A/B test',
  EMAIL_CAMPAIGN_COHORT_REMAINDER: 'remainder',
};

export const COHORT_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: RECIPIENT_FILTER_ALL, label: 'all cohorts' },
  { value: 'EMAIL_CAMPAIGN_COHORT_AB', label: 'A/B test' },
  { value: 'EMAIL_CAMPAIGN_COHORT_REMAINDER', label: 'remainder' },
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
