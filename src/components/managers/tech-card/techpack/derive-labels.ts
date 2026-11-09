import type { common_TechCard } from 'api/proto-http/admin';
import {
  effectiveLabelPart,
  LABEL_PART_NAME,
  type LabelPart,
} from 'components/managers/tech-card/care-labels/label-parts';
import {
  artworkLines,
  artworkMode,
  cellIsFull,
  isCompositionLabel,
  labelFlat,
  labelPin,
  type LabelAxes,
} from 'components/managers/tech-card/components/sewn-label-model';
import {
  garmentLabelKindNames,
  kindLabel,
} from 'components/managers/tech-card/components/tech-card-options';
import { wireInt } from 'components/managers/tech-card/components/wire-int';
import { operationHeading } from 'components/managers/tech-card/components/operation-options';
import { BUNDLED_WORK_CATALOG } from 'components/managers/tech-card/components/operation-work';
import { publicFilePageUrl } from 'components/file-share-viewer/link';
import { formatCompositionCell } from 'components/managers/materials/components/material-code';
import {
  bomColourwayName,
  bomRefs,
  clean,
  colorwayColour,
  colorwayName,
  decimal,
  mediaFromResolved,
  resolveBomRef,
  technicalMedia,
} from './derive-shared';
import type { Gap, GapSink } from './gaps';
import { englishT, own, type PdfT } from './i18n';
import {
  parseFoldLines,
  parseStitchLines,
} from 'components/managers/tech-card/components/label-fold-lines';

export type LabelsDeriveOptions = {
  sampleSizeName?: string;
  sizeNames?: Readonly<Record<number, string>>;
  /** Grade order from the dictionary; without it, ascending size ids. */
  orderSizes?: (ids: number[]) => number[];
};
export type LabelsModel = ReturnType<typeof deriveLabels>;

export type SewnTableRow = {
  key: string;
  number: number | null;
  item: string;
  location: string;
  attachment: string;
  fold: string;
  size: string;
  material: string;
  qty: number | null;
  step: string;
  note: string;
};

/** One line of the QR grid. An empty `url` prints `no file`: never a QR to nothing. */
export type SewnQrLine = {
  key: string;
  title: string;
  perSize: boolean;
  cells: { key: string; sizeLabel: string; url: string }[];
};

/** A QR on paper carries the landing page; a preview tab falls back to the server's own address. */
const printedUrl = (url?: string): string => {
  const raw = clean(url);
  return raw ? publicFilePageUrl(raw) || raw : '';
};

function labelAxes(techCard: common_TechCard, options: LabelsDeriveOptions, t: PdfT): LabelAxes {
  // The card keeps sizes in the order they were clicked; paper reads them in grade order.
  const sizeIds = (techCard.techCard?.sizeIds ?? []).map((raw) => wireInt(raw));
  const ordered = options.orderSizes?.(sizeIds) ?? [...sizeIds].sort((a, b) => a - b);
  return {
    colorways: (techCard.colorways ?? [])
      .map((colorway, index) => ({
        id: wireInt(colorway.colorwayId),
        name: colorwayName(colorway, index, t),
      }))
      .filter((colorway) => colorway.id > 0),
    sizes: ordered.map((id) => ({
      id,
      label: clean(options.sizeNames?.[id]).toUpperCase() || `#${id}`,
    })),
  };
}

function deriveSewn(techCard: common_TechCard, options: LabelsDeriveOptions, t: PdfT) {
  const card = techCard.techCard;
  const stored = card?.garmentLabels ?? [];
  const rows = [
    ...stored.filter((row) => isCompositionLabel(row.key)),
    ...stored.filter((row) => !isCompositionLabel(row.key)),
  ];
  const refs = bomRefs(techCard);
  const callouts = card?.callouts ?? [];
  const axes = labelAxes(techCard, options, t);
  const flatItem = labelFlat(techCard.resolvedTechnicalMedia ?? []);
  const flat = mediaFromResolved(flatItem);
  const pinned = rows.map((row) => labelPin(row, callouts));
  const stepByLabel = new Map<string, string>();
  for (const [index, operation] of (card?.operations ?? []).entries()) {
    const number = operation.operationNumber || (index + 1) * 10;
    const heading = operationHeading({
      operationType: operation.operationType,
      machineType: operation.machineType,
      zone: operation.zone,
      seamClass: operation.seamClass,
      topstitchMode: operation.topstitch?.mode,
      work: operation.work,
      workCatalog: BUNDLED_WORK_CATALOG,
      pieceNames: [],
      note: operation.note,
    }).split(' · ')[0];
    for (const key of operation.labelKeys ?? [])
      if (key?.trim()) stepByLabel.set(key.trim(), [number, heading].filter(Boolean).join(' '));
  }
  const labelMm = (value: Parameters<typeof decimal>[0]) => {
    const number = decimal(value);
    return number == null ? '' : String(number);
  };

  const foldLinesText = (csv: string | undefined, heightMm: number) => {
    const lines = parseFoldLines(csv, heightMm);
    return lines.length ? `${lines.join(' / ')} mm` : '';
  };

  const stitchLinesText = (csv: string | undefined, heightMm: number) => {
    const lines = parseStitchLines(csv, heightMm);
    return lines.length ? `stitch ${lines.join(' / ')} mm` : '';
  };

  const table: SewnTableRow[] = rows.map((row, index) => ({
    key: clean(row.key) || `label-${index}`,
    number: pinned[index]?.number ?? null,
    item: kindLabel(garmentLabelKindNames, row.key),
    location: clean(row.placement),
    attachment: clean(row.attachment),
    // A card not saved since the size/fold fields came keeps its old free text.
    fold: [
      clean(row.fold) || clean(row.folding),
      foldLinesText(row.foldLinesMm, decimal(row.heightMm) ?? 0),
      stitchLinesText(row.stitchLinesMm, decimal(row.heightMm) ?? 0),
    ]
      .filter(Boolean)
      .join(' · '),
    size:
      [labelMm(row.widthMm), labelMm(row.heightMm)].filter(Boolean).join(' × ') || clean(row.size),
    material: clean(
      resolveBomRef(refs, { bomLineKey: row.bomLineKey, bomItemId: row.bomItemId })?.item.name,
    ),
    qty: row.qtyPerGarment ?? null,
    step: stepByLabel.get(clean(row.lineKey)) ?? '',
    note: clean(row.note),
  }));

  const lines: SewnQrLine[] = rows.flatMap((row, index) => {
    const { perSize } = artworkMode(row, axes);
    const { number, item, key } = table[index];
    return artworkLines(row, axes).map((line) => ({
      key: `${key}-${line.colorwayId}`,
      title: [
        [number, own(item)].filter((word) => word != null).join(' '),
        line.colorName,
        perSize ? '' : t('labels.allSizes'),
      ]
        .filter(Boolean)
        .join(' · '),
      perSize,
      cells: line.cells.map((cell) => ({
        key: `${cell.colorwayId}-${cell.sizeId}`,
        sizeLabel: cell.sizeLabel,
        url: cellIsFull(cell) ? printedUrl(cell.file?.publicUrl) : '',
      })),
    }));
  });

  return {
    flat,
    // A pin on another picture keeps its number and its words; only this flat is drawn.
    pins: pinned.flatMap((pin) =>
      pin && flat && pin.mediaId === flat.id ? [{ label: pin.number, x: pin.x, y: pin.y }] : [],
    ),
    table,
    // Per-size lines read under one row of sizes, so the one-file lines close the grid.
    qr: [...lines.filter((line) => line.perSize), ...lines.filter((line) => !line.perSize)],
  };
}

const partFromWire = (value?: string): LabelPart => {
  const part = clean(value).replace('TECH_CARD_BOM_LABEL_PART_', '') as LabelPart;
  return part && part in LABEL_PART_NAME ? part : 'SHELL';
};

// Лента этикетки печатается как есть, на любом языке листа: это то, что пришьют на изделие.
// Переводятся только подписи страницы и пробелы — их читает фабрика.
export function deriveLabels(
  techCard: common_TechCard,
  options: LabelsDeriveOptions = {},
  sink?: GapSink,
  t: PdfT = englishT,
) {
  const card = techCard.techCard;
  const primary = techCard.colorways?.[0];
  const careOverride = card?.careLabel?.colorways?.find(
    (item) => wireInt(item.colorwayId) === wireInt(primary?.colorwayId),
  );
  const overrideFibers = careOverride?.fibers ?? [];
  const composition = overrideFibers.length
    ? [...new Set(overrideFibers.map((fiber) => partFromWire(fiber.part)))].map((part) => ({
        part: LABEL_PART_NAME[part],
        value: overrideFibers
          .filter((fiber) => partFromWire(fiber.part) === part)
          .map((fiber) =>
            [fiber.pct != null ? `${fiber.pct}%` : '', clean(fiber.fiberCode)]
              .filter(Boolean)
              .join(' '),
          )
          .filter(Boolean)
          .join(' · '),
      }))
    : bomRefs(techCard).flatMap((ref) => {
        const part = effectiveLabelPart(ref.item);
        const value = formatCompositionCell(ref.item.composition);
        return part === 'NOT_ON_LABEL' || !value ? [] : [{ part: LABEL_PART_NAME[part], value }];
      });
  const fallbackComposition = composition.length
    ? composition
    : (techCard.compositionEntries ?? []).length
      ? [
          {
            part: englishT('labels.shell'),
            value: (techCard.compositionEntries ?? [])
              .map((entry) => {
                const percentage = decimal(entry.percent);
                return [
                  percentage == null ? '' : `${percentage}%`,
                  clean(entry.name) || clean(entry.fiberCode),
                ]
                  .filter(Boolean)
                  .join(' ');
              })
              .filter(Boolean)
              .join(' · '),
          },
        ]
      : [];
  const logoId = wireInt(card?.careLabel?.logoMediaId);
  const logo = logoId
    ? mediaFromResolved(
        techCard.resolvedLabelMedia?.find((item) => wireInt(item.media?.id) === logoId),
      )
    : null;
  // «Where the label goes» for the assembly words: a label of the garment, and the composition row
  // only when it is the one row there is.
  const garmentLabels = card?.garmentLabels ?? [];
  const placementLabel =
    garmentLabels.find(
      (label) =>
        !isCompositionLabel(label.key) && /brand|main|identity|size/i.test(clean(label.key)),
    ) ??
    garmentLabels.find((label) => !isCompositionLabel(label.key)) ??
    garmentLabels[0];
  const sewn = deriveSewn(techCard, options, t);
  const hasSewn = sewn.table.length > 0;
  const add = (code: string, label: string, field: string): Gap => {
    const gap: Gap = {
      code,
      refs: [`field:${field}`],
      label,
      section: '05',
      target: { tab: 'labels', field },
    };
    return sink?.add(gap) ?? gap;
  };
  const identityName = clean(card?.name);
  const identityColour =
    clean(careOverride?.colourName) ||
    (primary ? colorwayName(primary, 0, t) : bomColourwayName(techCard));
  const identitySize =
    clean(options.sampleSizeName) || (card?.baseSampleSizeId ? `#${card.baseSampleSizeId}` : '');
  const back = technicalMedia(techCard, 'TECH_CARD_MEDIA_KIND_BACK');
  // With rows the page draws the flat they are pinned on, the same one the screen shows.
  const drawn = hasSewn ? sewn.flat : back;
  const placementMissing = hasSewn
    ? sewn.table.some((row) => !row.location)
    : !clean(placementLabel?.placement);
  const gaps = {
    name: !identityName ? add('pdf_name_missing', t('gaps.name'), 'name') : undefined,
    colour: !identityColour
      ? add('pdf_label_colour_missing', t('gaps.colour'), 'colour')
      : undefined,
    size: !identitySize ? add('pdf_sample_size_missing', t('gaps.size'), 'sample size') : undefined,
    composition: !fallbackComposition.length
      ? add('pdf_composition_missing', t('gaps.composition'), 'composition')
      : undefined,
    placement: placementMissing
      ? add('pdf_label_placement_missing', t('gaps.placement'), 'placement')
      : undefined,
    back: !drawn ? add('pdf_back_flat_missing', t('gaps.backFlat'), 'back flat') : undefined,
  };

  return {
    identity: {
      name: identityName,
      colour: identityColour,
      colourFact: colorwayColour(primary),
      size: identitySize,
      brand: clean(card?.brand) || 'GRBPWR',
      logo,
    },
    composition: fallbackComposition,
    placement: {
      name: clean(placementLabel?.placement),
      attachment: clean(placementLabel?.attachment),
      folding: clean(placementLabel?.fold),
      size: clean(placementLabel?.size),
      qty: placementLabel?.qtyPerGarment ?? null,
    },
    back,
    sewn,
    hasSewn,
    gaps,
    missing: [
      !clean(card?.name) && 'name',
      !primary && !bomColourwayName(techCard) && 'colourway',
      !fallbackComposition.length && 'composition',
      placementMissing && 'placement',
      !drawn && 'back flat',
    ].filter((value): value is string => Boolean(value)),
  };
}
