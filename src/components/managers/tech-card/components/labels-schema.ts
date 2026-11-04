import type {
  common_TechCardBomLabelPart,
  common_TechCardCareLabel,
  common_TechCardGarmentLabel,
  common_TechCardPackagingItem,
  common_MediaFull,
} from 'api/proto-http/admin';
import { z } from 'zod';
import { decimalToInput, inputToDecimal } from 'utils/decimal';
import { wireInt } from './wire-int';

/**
 * LABELS REWORK (0386) — the form shape of the composition label, the garment labels and the
 * packaging items, and the two mappers between it and the wire.
 *
 * The limits below are the backend's (internal/dto/techcard_labels.go), repeated here for ONE
 * reason: the server refuses the WHOLE card save on any of them, so a label note one character too
 * long would bounce every other tab's work. Checked here, the refusal names the field and autosave
 * simply does not write (it never writes an invalid form).
 */

export const LABEL_KEY_MAX = 64;
export const LABEL_TEXT_MAX = 255; // placement / attachment / folding / usage / packing
export const LABEL_SIZE_MAX = 64;
export const LABEL_NOTE_MAX = 2000;
export const LABEL_MEDIA_MAX = 20;
export const LABEL_ENTRIES_MAX = 100;
export const CARE_LABEL_LINES_MAX = 20;
export const CARE_LABEL_LINE_MAX = 255;
export const CARE_LABEL_QR_TEMPLATE_MAX = 512;
export const CARE_LABEL_COLOUR_NAME_MAX = 64;
export const CARE_LABEL_FIBER_CODE_MAX = 8;
/** '' = storefront (the server's default). */
export const CARE_LABEL_QR_PRESETS = ['', 'storefront', 'custom', 'fixed'] as const;

/** The parts a fibre row may name: everything printed, never UNSPECIFIED / NOT_ON_LABEL. */
export const CARE_LABEL_FIBER_PARTS: readonly common_TechCardBomLabelPart[] = [
  'TECH_CARD_BOM_LABEL_PART_SHELL',
  'TECH_CARD_BOM_LABEL_PART_BODY_LINING',
  'TECH_CARD_BOM_LABEL_PART_SLEEVE_LINING',
  'TECH_CARD_BOM_LABEL_PART_POCKET_LINING',
  'TECH_CARD_BOM_LABEL_PART_HOOD_LINING',
  'TECH_CARD_BOM_LABEL_PART_FILLING',
  'TECH_CARD_BOM_LABEL_PART_TRIM',
];

const runes = (s: string) => Array.from(s).length;

const text = (max: number, what: string) =>
  z
    .string()
    .optional()
    .default('')
    .refine((v) => runes(v) <= max, { message: `${what}: at most ${max} characters` });

const mediaIds = z
  .array(z.number())
  .default([])
  .superRefine((ids, ctx) => {
    if (ids.length > LABEL_MEDIA_MAX)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `at most ${LABEL_MEDIA_MAX} mockups` });
    const seen = new Set<number>();
    ids.forEach((id, i) => {
      if (!(id > 0))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'unknown mockup', path: [i] });
      else if (seen.has(id))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'attach each mockup once',
          path: [i],
        });
      seen.add(id);
    });
  });

const labelKey = z
  .string()
  .optional()
  .default('')
  .superRefine((k, ctx) => {
    if (!k.trim())
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'pick a known kind or type a name' });
    else if (runes(k.trim()) > LABEL_KEY_MAX)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `a name is at most ${LABEL_KEY_MAX} characters`,
      });
  });

// «How many per garment» — whole, ≥ 1. The server reads 0 as 1, so 1 is the honest default.
const qtyPerGarment = z
  .number()
  .optional()
  .default(1)
  .refine((q) => Number.isInteger(q) && q >= 1, { message: 'one or more per garment' });

// Label roll goods are authored in centimetres per garment. The backend accepts a decimal with at
// most one fractional digit; keeping the form value as text preserves an empty field and the
// operator's in-progress decimal while they type.
const labelLengthCm = z
  .string()
  .optional()
  .default('')
  .refine((value) => !value || /^\d+(?:\.\d)?$/.test(value), {
    message: 'whole or one decimal',
  });

// One artwork file of a sewn-in label (0447). 0 on an axis = «any colour» / «all sizes». `publicUrl`
// is read-only: the server fills it from the file's live link, and an empty one reads as «no file».
export const garmentLabelFileSchema = z.object({
  colorwayId: z.number().optional().default(0),
  sizeId: z.number().optional().default(0),
  libraryFileId: z.number().optional().default(0),
  sourceHash: z.string().optional().default(''),
  publicUrl: z.string().optional().default(''),
});

export const garmentLabelSchema = z.object({
  key: labelKey,
  source: z.enum(['', 'stock', 'make']).optional().default(''),
  kind: text(LABEL_KEY_MAX, 'type'),
  madeBy: text(LABEL_KEY_MAX, 'made by'),
  printMethod: text(LABEL_KEY_MAX, 'print'),
  lengthCm: labelLengthCm,
  placement: text(LABEL_TEXT_MAX, 'placement'),
  attachment: text(LABEL_TEXT_MAX, 'attachment'),
  folding: text(LABEL_TEXT_MAX, 'folding'),
  size: text(LABEL_SIZE_MAX, 'size'),
  qtyPerGarment,
  // FK to the label material's BOM line; 0 = none.
  bomItemId: z.number().optional().default(0),
  // The same link by line key: it can name a line born in this very edit.
  bomLineKey: z.string().optional().default(''),
  note: text(LABEL_NOTE_MAX, 'note'),
  mediaIds,
  // The pin: the number of a callout on a flat; 0 = no pin.
  calloutNumber: z.number().optional().default(0),
  artworkPerSize: z.boolean().optional().default(false),
  artworkPerColorway: z.boolean().optional().default(false),
  files: z.array(garmentLabelFileSchema).default([]),
});

export const packagingItemSchema = z.object({
  key: labelKey,
  usage: text(LABEL_TEXT_MAX, 'usage'),
  packing: text(LABEL_TEXT_MAX, 'packing'),
  size: text(LABEL_SIZE_MAX, 'size'),
  qtyPerGarment,
  perOrder: z.boolean().optional().default(false),
  materialId: z.number().optional().default(0),
  auxTechCardId: z.number().optional().default(0),
  pickedName: text(LABEL_TEXT_MAX, 'name'),
  pickedThumbnail: z.custom<common_MediaFull>().optional(),
  colorwayIds: z.array(z.number()).default([]),
  bomItemId: z.number().optional().default(0),
  bomLineKey: z.string().optional().default(''),
  note: text(LABEL_NOTE_MAX, 'note'),
  mediaIds,
});

const lines = z
  .array(z.string())
  .default([])
  .superRefine((ls, ctx) => {
    if (ls.length > CARE_LABEL_LINES_MAX)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `at most ${CARE_LABEL_LINES_MAX} lines`,
      });
    ls.forEach((l, i) => {
      if (/[\r\n]/.test(l))
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'one line per row', path: [i] });
      else if (runes(l) > CARE_LABEL_LINE_MAX)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `a line is at most ${CARE_LABEL_LINE_MAX} characters`,
          path: [i],
        });
    });
  });

export const careLabelFiberSchema = z.object({
  part: z.string().optional().default('TECH_CARD_BOM_LABEL_PART_SHELL'),
  fiberCode: z.string().optional().default(''),
  pct: z.number().optional().default(0),
});

export const careLabelColorwaySchema = z
  .object({
    colorwayId: z.number(),
    colourName: text(CARE_LABEL_COLOUR_NAME_MAX, 'colour name'),
    fibers: z.array(careLabelFiberSchema).default([]),
  })
  .superRefine((cw, ctx) => {
    if (!(cw.colorwayId > 0))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'name a colourway of this style',
        path: ['colorwayId'],
      });
    const seen = new Set<string>();
    cw.fibers.forEach((f, i) => {
      if (!CARE_LABEL_FIBER_PARTS.includes(f.part as common_TechCardBomLabelPart))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'pick a part of the label',
          path: ['fibers', i, 'part'],
        });
      const code = f.fiberCode.trim();
      if (!code || code.length > CARE_LABEL_FIBER_CODE_MAX)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'pick a fibre',
          path: ['fibers', i, 'fiberCode'],
        });
      if (!Number.isInteger(f.pct) || f.pct < 1 || f.pct > 100)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '1 to 100 percent',
          path: ['fibers', i, 'pct'],
        });
      const k = `${f.part}|${code}`;
      if (code && seen.has(k))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'this fibre is already in this part — merge the two rows',
          path: ['fibers', i, 'fiberCode'],
        });
      seen.add(k);
    });
  });

export const careLabelSchema = z
  .object({
    // 0 = the brand mark.
    logoMediaId: z.number().optional().default(0),
    careProseLines: lines,
    qrPreset: z.string().optional().default(''),
    qrTemplate: text(CARE_LABEL_QR_TEMPLATE_MAX, 'QR template'),
    backCaptionLines: lines,
    addressLines: lines,
    colorways: z.array(careLabelColorwaySchema).default([]),
  })
  .superRefine((c, ctx) => {
    if (!(CARE_LABEL_QR_PRESETS as readonly string[]).includes(c.qrPreset))
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'storefront, custom or fixed',
        path: ['qrPreset'],
      });
    const seen = new Set<number>();
    c.colorways.forEach((cw, i) => {
      if (seen.has(cw.colorwayId))
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'one entry per colourway',
          path: ['colorways', i, 'colorwayId'],
        });
      seen.add(cw.colorwayId);
    });
  });

/** A bounded keyed list. Some lists also require unique keys; packaging explicitly allows repeats. */
export function keyedList<T extends z.ZodTypeAny>(row: T, what: string, unique = true) {
  return z
    .array(row)
    .default([])
    .superRefine((list, ctx) => {
      const rows = list as { key?: string }[];
      if (rows.length > LABEL_ENTRIES_MAX)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `at most ${LABEL_ENTRIES_MAX} ${what}`,
        });
      if (!unique) return;
      const seen = new Set<string>();
      rows.forEach((r, i) => {
        const k = (r.key ?? '').trim().toLowerCase();
        if (k && seen.has(k))
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `«${(r.key ?? '').trim()}» is already on this card`,
            path: [i, 'key'],
          });
        seen.add(k);
      });
    });
}

export type FormGarmentLabel = z.input<typeof garmentLabelSchema>;
export type FormPackagingItem = z.input<typeof packagingItemSchema>;
export type FormCareLabel = z.input<typeof careLabelSchema>;
export type FormCareLabelColorway = z.input<typeof careLabelColorwaySchema>;
export type FormCareLabelFiber = z.input<typeof careLabelFiberSchema>;

export const emptyCareLabel: z.output<typeof careLabelSchema> = {
  logoMediaId: 0,
  careProseLines: [],
  qrPreset: '',
  qrTemplate: '',
  backCaptionLines: [],
  addressLines: [],
  colorways: [],
};

/** A fresh empty record — never share the constant's arrays with a live form. */
export const newCareLabel = (): z.output<typeof careLabelSchema> => ({
  ...emptyCareLabel,
  careProseLines: [],
  backCaptionLines: [],
  addressLines: [],
  colorways: [],
});

// ─── server → form ────────────────────────────────────────────────────────────────────────────

export function careLabelToForm(c?: common_TechCardCareLabel): FormCareLabel {
  if (!c) return newCareLabel();
  return {
    logoMediaId: wireInt(c.logoMediaId),
    careProseLines: [...(c.careProseLines ?? [])],
    // The server answers «storefront» for a stored default; the form keeps what it read.
    qrPreset: c.qrPreset || '',
    qrTemplate: c.qrTemplate || '',
    backCaptionLines: [...(c.backCaptionLines ?? [])],
    addressLines: [...(c.addressLines ?? [])],
    colorways: (c.colorways ?? []).map((cw) => ({
      colorwayId: wireInt(cw.colorwayId),
      colourName: cw.colourName || '',
      fibers: (cw.fibers ?? []).map((f) => ({
        part: f.part || 'TECH_CARD_BOM_LABEL_PART_UNSPECIFIED',
        fiberCode: f.fiberCode || '',
        pct: wireInt(f.pct),
      })),
    })),
  };
}

export function garmentLabelsToForm(ls?: common_TechCardGarmentLabel[]): FormGarmentLabel[] {
  return (ls ?? []).map((l) => ({
    key: l.key || '',
    source: l.source === 'stock' || l.source === 'make' ? l.source : '',
    kind: l.kind || '',
    madeBy: l.madeBy || '',
    printMethod: l.printMethod || '',
    lengthCm: decimalToInput(l.lengthCm),
    placement: l.placement || '',
    attachment: l.attachment || '',
    folding: l.folding || '',
    size: l.size || '',
    qtyPerGarment: wireInt(l.qtyPerGarment) || 1,
    bomItemId: wireInt(l.bomItemId),
    bomLineKey: l.bomLineKey || '',
    note: l.note || '',
    mediaIds: (l.mediaIds ?? []).map(wireInt),
    calloutNumber: wireInt(l.calloutNumber),
    artworkPerSize: !!l.artworkPerSize,
    artworkPerColorway: !!l.artworkPerColorway,
    files: (l.files ?? []).map((f) => ({
      colorwayId: wireInt(f.colorwayId),
      sizeId: wireInt(f.sizeId),
      libraryFileId: wireInt(f.libraryFileId),
      sourceHash: f.sourceHash || '',
      publicUrl: f.publicUrl || '',
    })),
  }));
}

export function packagingItemsToForm(ls?: common_TechCardPackagingItem[]): FormPackagingItem[] {
  return (ls ?? []).map((l) => ({
    key: l.key || '',
    usage: l.usage || '',
    packing: l.packing || '',
    size: l.size || '',
    qtyPerGarment: wireInt(l.qtyPerGarment) || 1,
    perOrder: !!l.perOrder,
    materialId: wireInt(l.materialId),
    auxTechCardId: wireInt(l.auxTechCardId),
    pickedName: l.pickedName || '',
    pickedThumbnail: l.pickedThumbnail,
    colorwayIds: (l.colorwayIds ?? []).map(wireInt).filter((id) => id > 0),
    bomItemId: wireInt(l.bomItemId),
    bomLineKey: l.bomLineKey || '',
    note: l.note || '',
    mediaIds: (l.mediaIds ?? []).map(wireInt),
  }));
}

// ─── form → server ────────────────────────────────────────────────────────────────────────────

/**
 * ALWAYS a message, never undefined. On the wire an absent care_label means «keep the stored
 * record»; this client owns the record, so it always says what the record is — an empty message is
 * «every line derived». Colourways sorted by id and empty entries dropped: that is how the server
 * stores and returns them, so a read written back unchanged is byte-identical (bodyMoved).
 */
export function careLabelOut(c?: FormCareLabel): common_TechCardCareLabel {
  const src = c ?? emptyCareLabel;
  const colorways = (src.colorways ?? [])
    .map((cw) => ({
      colorwayId: cw.colorwayId,
      colourName: cw.colourName?.trim() || '',
      fibers: (cw.fibers ?? []).map((f) => ({
        part: (f.part || 'TECH_CARD_BOM_LABEL_PART_UNSPECIFIED') as common_TechCardBomLabelPart,
        fiberCode: f.fiberCode?.trim() || '',
        pct: f.pct ?? 0,
      })),
    }))
    .filter((cw) => cw.colourName || cw.fibers.length > 0)
    .sort((a, b) => a.colorwayId - b.colorwayId);
  return {
    logoMediaId: src.logoMediaId || 0,
    careProseLines: [...(src.careProseLines ?? [])],
    qrPreset: src.qrPreset || '',
    qrTemplate: src.qrTemplate?.trim() || '',
    backCaptionLines: [...(src.backCaptionLines ?? [])],
    addressLines: [...(src.addressLines ?? [])],
    colorways,
  };
}

export function garmentLabelsOut(ls?: FormGarmentLabel[]): common_TechCardGarmentLabel[] {
  return (ls ?? []).map((l) => ({
    key: l.key?.trim() || '',
    // Presence is the compatibility bit for the stock/make contract. Every row written by this
    // screen sends it, including '' for a legacy row or an explicitly cleared source.
    source: l.source || '',
    kind: l.kind?.trim() || '',
    madeBy: l.madeBy?.trim() || '',
    printMethod: l.printMethod?.trim() || '',
    lengthCm: inputToDecimal(l.lengthCm),
    placement: l.placement?.trim() || '',
    attachment: l.attachment?.trim() || '',
    folding: l.folding?.trim() || '',
    size: l.size?.trim() || '',
    qtyPerGarment: l.qtyPerGarment || 1,
    bomItemId: wireInt(l.bomItemId),
    bomLineKey: l.bomLineKey?.trim() || '',
    note: l.note?.trim() || '',
    mediaIds: [...(l.mediaIds ?? [])],
    calloutNumber: wireInt(l.calloutNumber),
    // ALWAYS sent: this bit says «this client knows the artwork block», so a save that sends no
    // files means «no files», while a bundle older than 0447 stays silent and the server carries.
    artworkPerSize: !!l.artworkPerSize,
    artworkPerColorway: !!l.artworkPerColorway,
    files: (l.files ?? []).map((f) => ({
      colorwayId: wireInt(f.colorwayId),
      sizeId: wireInt(f.sizeId),
      libraryFileId: wireInt(f.libraryFileId),
      sourceHash: f.sourceHash ?? '',
      publicUrl: f.publicUrl ?? '',
    })),
  }));
}

export function packagingItemsOut(ls?: FormPackagingItem[]): common_TechCardPackagingItem[] {
  return (ls ?? []).map(
    (l) =>
      ({
        key: l.key?.trim() || '',
        usage: l.usage?.trim() || '',
        packing: l.packing?.trim() || '',
        size: l.size?.trim() || '',
        qtyPerGarment: l.qtyPerGarment || 1,
        materialId: wireInt(l.materialId),
        auxTechCardId: wireInt(l.auxTechCardId),
        perOrder: !!l.perOrder,
        pickedName: undefined,
        pickedThumbnail: undefined,
        colorwayIds: [...(l.colorwayIds ?? [])].filter((id) => id > 0),
        bomItemId: wireInt(l.bomItemId),
        bomLineKey: l.bomLineKey?.trim() || '',
        note: l.note?.trim() || '',
        mediaIds: [...(l.mediaIds ?? [])],
      }) as common_TechCardPackagingItem,
  );
}
