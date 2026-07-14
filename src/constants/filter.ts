import {
  common_FittingStatus,
  common_FittingVerdict,
  common_GenderEnum,
  common_OrderFactor,
  common_OrderStatusEnum,
  common_SeasonEnum,
  common_SortFactor,
  common_TechCardApprovalState,
  common_TechCardBomSection,
  common_TechCardFabricDirection,
  common_TechCardIssueSeverity,
  common_TechCardIssueStatus,
  common_TechCardLabDipStatus,
  common_TechCardLabelType,
  common_TechCardSignoffSection,
  common_TechCardSignoffState,
  common_TechCardMeasurementUnit,
  common_TechCardMediaKind,
  common_TechCardStage,
} from 'api/proto-http/admin';

interface Colors {
  name: string;
  hex: string;
}

export const PAGE_SIZE = 16;

export const PRODUCT_LIMIT_OPTIONS = [
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 30, label: '30' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
] as const;

export const DEFAULT_PRODUCT_LIMIT = 30;

export const sortOptions: Array<{ value: common_SortFactor; label: string }> = [
  { value: 'SORT_FACTOR_CREATED_AT', label: 'Created At' },
  { value: 'SORT_FACTOR_PRICE', label: 'Price' },
  { value: 'SORT_FACTOR_UPDATED_AT', label: 'Updated At' },
  { value: 'SORT_FACTOR_NAME', label: 'Name' },
];

export const orderOptions: Array<{ value: common_OrderFactor; label: string }> = [
  { value: 'ORDER_FACTOR_ASC', label: 'Ascending' },
  { value: 'ORDER_FACTOR_DESC', label: 'Descending' },
];

export const genderOptions: Array<{ value: common_GenderEnum; label: string }> = [
  { value: 'GENDER_ENUM_FEMALE', label: 'women' },
  { value: 'GENDER_ENUM_MALE', label: 'men' },
  { value: 'GENDER_ENUM_UNISEX', label: 'unisex' },
];

export const SEASON_OPTIONS: Array<{ value: common_SeasonEnum; label: string }> = [
  { value: 'SEASON_ENUM_SS', label: 'spring/summer' },
  { value: 'SEASON_ENUM_FW', label: 'fall/winter' },
  { value: 'SEASON_ENUM_PF', label: 'pre-fall' },
  { value: 'SEASON_ENUM_RC', label: 'resort/cruise' },
];

export const statusOptions: Array<{ value: common_OrderStatusEnum; label: string }> = [
  { value: 'ORDER_STATUS_ENUM_PLACED', label: 'placed' },
  { value: 'ORDER_STATUS_ENUM_AWAITING_PAYMENT', label: 'awaiting payment' },
  { value: 'ORDER_STATUS_ENUM_CONFIRMED', label: 'confirmed' },
  { value: 'ORDER_STATUS_ENUM_SHIPPED', label: 'shipped' },
  { value: 'ORDER_STATUS_ENUM_DELIVERED', label: 'delivered' },
  { value: 'ORDER_STATUS_ENUM_CANCELLED', label: 'cancelled' },
  { value: 'ORDER_STATUS_ENUM_REFUNDED', label: 'refunded' },
  { value: 'ORDER_STATUS_ENUM_PARTIALLY_REFUNDED', label: 'partially refunded' },
  { value: 'ORDER_STATUS_ENUM_PENDING_RETURN', label: 'pending return' },
  { value: 'ORDER_STATUS_ENUM_REFUND_IN_PROGRESS', label: 'refund in progress' },
];

// Selectable fitting-session statuses (excludes the UNKNOWN/unset sentinel).
export const fittingStatusOptions: Array<{ value: common_FittingStatus; label: string }> = [
  { value: 'FITTING_STATUS_PLANNED', label: 'planned' },
  { value: 'FITTING_STATUS_DONE', label: 'done' },
  { value: 'FITTING_STATUS_CANCELLED', label: 'cancelled' },
];

// Selectable fitting-session verdicts (excludes the UNKNOWN/unset sentinel).
export const fittingVerdictOptions: Array<{ value: common_FittingVerdict; label: string }> = [
  { value: 'FITTING_VERDICT_PENDING', label: 'pending' },
  { value: 'FITTING_VERDICT_APPROVED', label: 'approved' },
  { value: 'FITTING_VERDICT_NEEDS_REWORK', label: 'needs rework' },
  { value: 'FITTING_VERDICT_REJECTED', label: 'rejected' },
];

// Tech-card development stage (excludes the UNKNOWN sentinel; server defaults UNKNOWN→PROTO).
export const techCardStageOptions: Array<{ value: common_TechCardStage; label: string }> = [
  { value: 'TECH_CARD_STAGE_IDEA', label: 'idea' },
  { value: 'TECH_CARD_STAGE_PROTO', label: 'proto' },
  { value: 'TECH_CARD_STAGE_FIT', label: 'fit sample' },
  { value: 'TECH_CARD_STAGE_SMS', label: 'salesman sample' },
  { value: 'TECH_CARD_STAGE_PP', label: 'pre-production' },
  { value: 'TECH_CARD_STAGE_PROD', label: 'production' },
];

// NF-07: a card is either a sellable garment or an auxiliary item (dust bag, shopper…) that
// produces a packaging material instead of a product. Raw string values per the contract.
export const techCardPurposeOptions: Array<{ value: string; label: string }> = [
  { value: 'sellable', label: 'sellable garment' },
  { value: 'auxiliary', label: 'auxiliary (packaging item)' },
];

// Tech-card release gate, orthogonal to stage (server defaults UNKNOWN→DRAFT).
export const techCardApprovalStateOptions: Array<{
  value: common_TechCardApprovalState;
  label: string;
}> = [
  { value: 'TECH_CARD_APPROVAL_STATE_DRAFT', label: 'draft' },
  { value: 'TECH_CARD_APPROVAL_STATE_IN_REVIEW', label: 'in review' },
  { value: 'TECH_CARD_APPROVAL_STATE_APPROVED', label: 'approved' },
  { value: 'TECH_CARD_APPROVAL_STATE_RELEASED', label: 'released' },
  { value: 'TECH_CARD_APPROVAL_STATE_OBSOLETE', label: 'obsolete' },
];

// Tech-card geometry unit for callout dimensions (server defaults UNKNOWN→CM).
export const techCardMeasurementUnitOptions: Array<{
  value: common_TechCardMeasurementUnit;
  label: string;
}> = [
  { value: 'TECH_CARD_MEASUREMENT_UNIT_CM', label: 'cm' },
  { value: 'TECH_CARD_MEASUREMENT_UNIT_MM', label: 'mm' },
];

// Gender select including an explicit unset sentinel (tech-card target gender is optional).
export const techCardGenderOptions: Array<{ value: common_GenderEnum; label: string }> = [
  { value: 'GENDER_ENUM_UNKNOWN', label: '— unset —' },
  ...genderOptions,
];

// Tech-card sketch-media kind (excludes the UNKNOWN sentinel; new media defaults to FRONT).
export const techCardMediaKindOptions: Array<{ value: common_TechCardMediaKind; label: string }> = [
  { value: 'TECH_CARD_MEDIA_KIND_FRONT', label: 'front' },
  { value: 'TECH_CARD_MEDIA_KIND_BACK', label: 'back' },
  { value: 'TECH_CARD_MEDIA_KIND_DETAIL', label: 'detail' },
  { value: 'TECH_CARD_MEDIA_KIND_LINING', label: 'lining' },
  { value: 'TECH_CARD_MEDIA_KIND_PREVIEW', label: 'preview' },
  { value: 'TECH_CARD_MEDIA_KIND_MOODBOARD', label: 'moodboard' },
  { value: 'TECH_CARD_MEDIA_KIND_REFERENCE', label: 'reference' },
  { value: 'TECH_CARD_MEDIA_KIND_SWATCH', label: 'swatch' },
];

// BOM material family (Sheet «Спецификация»); required on each BOM line. New lines
// default to FABRIC. Excludes the UNKNOWN sentinel.
export const techCardBomSectionOptions: Array<{ value: common_TechCardBomSection; label: string }> =
  [
    { value: 'TECH_CARD_BOM_SECTION_FABRIC', label: 'fabric' },
    { value: 'TECH_CARD_BOM_SECTION_LINING', label: 'lining' },
    { value: 'TECH_CARD_BOM_SECTION_INTERLINING', label: 'interlining' },
    { value: 'TECH_CARD_BOM_SECTION_INSULATION', label: 'insulation' },
    { value: 'TECH_CARD_BOM_SECTION_HARDWARE', label: 'hardware' },
    { value: 'TECH_CARD_BOM_SECTION_THREAD', label: 'thread' },
    { value: 'TECH_CARD_BOM_SECTION_TRIM', label: 'trim (бейка / тесьма / резинка)' },
    { value: 'TECH_CARD_BOM_SECTION_LABEL', label: 'label' },
    { value: 'TECH_CARD_BOM_SECTION_PACKAGING', label: 'packaging' },
  ];

// BOM fabric cutting layout (Sheet «Спецификация», fabric lines). Includes an explicit
// unset so a non-fabric line can stay blank.
export const techCardFabricDirectionOptions: Array<{
  value: common_TechCardFabricDirection;
  label: string;
}> = [
  { value: 'TECH_CARD_FABRIC_DIRECTION_UNKNOWN', label: '— unset —' },
  { value: 'TECH_CARD_FABRIC_DIRECTION_ANY', label: 'any (no nap)' },
  { value: 'TECH_CARD_FABRIC_DIRECTION_ONE_WAY', label: 'one-way' },
  { value: 'TECH_CARD_FABRIC_DIRECTION_TWO_WAY', label: 'two-way' },
];

// Colourway lab-dip approval lifecycle (excludes UNKNOWN; server defaults UNKNOWN→PENDING).
export const techCardLabDipStatusOptions: Array<{
  value: common_TechCardLabDipStatus;
  label: string;
}> = [
  { value: 'TECH_CARD_LAB_DIP_STATUS_PENDING', label: 'pending' },
  { value: 'TECH_CARD_LAB_DIP_STATUS_SUBMITTED', label: 'submitted' },
  { value: 'TECH_CARD_LAB_DIP_STATUS_APPROVED', label: 'approved' },
  { value: 'TECH_CARD_LAB_DIP_STATUS_REJECTED', label: 'rejected' },
];

// Maker-flagged issue severity (excludes UNKNOWN; server defaults UNKNOWN→MEDIUM).
export const techCardIssueSeverityOptions: Array<{
  value: common_TechCardIssueSeverity;
  label: string;
}> = [
  { value: 'TECH_CARD_ISSUE_SEVERITY_LOW', label: 'low' },
  { value: 'TECH_CARD_ISSUE_SEVERITY_MEDIUM', label: 'medium' },
  { value: 'TECH_CARD_ISSUE_SEVERITY_HIGH', label: 'high' },
];

// Issue resolution state (excludes UNKNOWN; server defaults UNKNOWN→OPEN).
export const techCardIssueStatusOptions: Array<{
  value: common_TechCardIssueStatus;
  label: string;
}> = [
  { value: 'TECH_CARD_ISSUE_STATUS_OPEN', label: 'open' },
  { value: 'TECH_CARD_ISSUE_STATUS_RESOLVED', label: 'resolved' },
  { value: 'TECH_CARD_ISSUE_STATUS_WONTFIX', label: "won't fix" },
];

// Per-section sign-off sheet (one row per section, unique per card).
export const techCardSignoffSectionOptions: Array<{
  value: common_TechCardSignoffSection;
  label: string;
}> = [
  { value: 'TECH_CARD_SIGNOFF_SECTION_DESIGN', label: 'design' },
  { value: 'TECH_CARD_SIGNOFF_SECTION_CONSTRUCTION', label: 'construction' },
  { value: 'TECH_CARD_SIGNOFF_SECTION_MATERIALS', label: 'materials' },
  { value: 'TECH_CARD_SIGNOFF_SECTION_COLOUR', label: 'colour' },
  { value: 'TECH_CARD_SIGNOFF_SECTION_LABELS', label: 'labels' },
  { value: 'TECH_CARD_SIGNOFF_SECTION_PACKAGING', label: 'packaging' },
  { value: 'TECH_CARD_SIGNOFF_SECTION_COSTING', label: 'costing' },
];

// Sign-off decision (excludes UNKNOWN; server defaults UNKNOWN→PENDING).
export const techCardSignoffStateOptions: Array<{
  value: common_TechCardSignoffState;
  label: string;
}> = [
  { value: 'TECH_CARD_SIGNOFF_STATE_PENDING', label: 'pending' },
  { value: 'TECH_CARD_SIGNOFF_STATE_APPROVED', label: 'approved' },
  { value: 'TECH_CARD_SIGNOFF_STATE_REJECTED', label: 'rejected' },
];

// Label / tag type (Sheet «Этикетки и упаковка»); required on each label. New labels
// default to MAIN. Excludes the UNKNOWN sentinel.
export const techCardLabelTypeOptions: Array<{ value: common_TechCardLabelType; label: string }> = [
  { value: 'TECH_CARD_LABEL_TYPE_MAIN', label: 'main (brand)' },
  { value: 'TECH_CARD_LABEL_TYPE_SIZE', label: 'size' },
  { value: 'TECH_CARD_LABEL_TYPE_CARE', label: 'care' },
  { value: 'TECH_CARD_LABEL_TYPE_ORIGIN', label: 'origin' },
  { value: 'TECH_CARD_LABEL_TYPE_FLAG', label: 'flag' },
  { value: 'TECH_CARD_LABEL_TYPE_HANGTAG', label: 'hangtag' },
  { value: 'TECH_CARD_LABEL_TYPE_BARCODE', label: 'barcode / RFID' },
  { value: 'TECH_CARD_LABEL_TYPE_SPECIAL', label: 'special' },
];

export const colors: Colors[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Red', hex: '#FF0000' },
  { name: 'Blue', hex: '#0000FF' },
  { name: 'Green', hex: '#008000' },
  { name: 'Navy', hex: '#000080' },
  { name: 'Gray', hex: '#808080' },
  { name: 'Yellow', hex: '#FFFF00' },
  { name: 'Pink', hex: '#FFC0CB' },
  { name: 'Beige', hex: '#F5F5DC' },
  { name: 'Crimson', hex: '#DC143C' },
  { name: 'Orange', hex: '#FFA500' },
  { name: 'Purple', hex: '#800080' },
  { name: 'Teal', hex: '#008080' },
  { name: 'Lime', hex: '#00FF00' },
  { name: 'Silver', hex: '#C0C0C0' },
  { name: 'Maroon', hex: '#800000' },
  { name: 'Olive', hex: '#808000' },
  { name: 'Brown', hex: '#A52A2A' },
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Cyan', hex: '#00FFFF' },
  { name: 'Magenta', hex: '#FF00FF' },
  { name: 'Ivory', hex: '#FFFFF0' },
  { name: 'Coral', hex: '#FF7F50' },
  { name: 'Chocolate', hex: '#D2691E' },
  { name: 'Mint Green', hex: '#98FF98' },
  { name: 'Light Blue', hex: '#ADD8E6' },
  { name: 'Peach', hex: '#FFE5B4' },
  { name: 'Lavender', hex: '#E6E6FA' },
  { name: 'Turquoise', hex: '#40E0D0' },
  { name: 'Indigo', hex: '#4B0082' },
  { name: 'Mustard', hex: '#FFDB58' },
  { name: 'Plum', hex: '#DDA0DD' },
  { name: 'Violet', hex: '#EE82EE' },
  { name: 'Sand', hex: '#C2B280' },
  { name: 'Off White', hex: '#F8F8FF' },
  { name: 'Hot Pink', hex: '#FF69B4' },
];

export const STATUS = {
  confirmed: 'bg-green-300',
  denied: 'bg-red-300',
};
