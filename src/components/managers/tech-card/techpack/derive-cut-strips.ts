// SECTION 06b: what the workshop cuts off the roll, and the two things the audit asks of a strip. A
// strip no step sews is a strip nobody will find; a seam that moved since the strip's length was read
// from it is a length nobody should trust.
import type { common_TechCard } from 'api/proto-http/admin';
import {
  goneSeamKeys,
  withSeamGone,
} from 'components/managers/tech-card/components/cut-strips/lengths';
import { seamLengthOnGeoms } from 'components/managers/tech-card/components/cut-strips/seam-side-length';
import {
  cutStripsOfCard,
  stripCutMm,
  stripKeysOf,
  stripName,
  type CutStripLike,
} from 'components/managers/tech-card/components/cut-strips/strip-pieces';
import {
  DEFAULT_SEAM_TOLERANCE_MM,
  lengthsDiffer,
} from 'components/managers/tech-card/components/step-seams/seam-length';
import { wireInt } from 'components/managers/tech-card/components/wire-int';
import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { splitWire } from 'lib/seams';

import type { AsmPiece } from './derive-assembly';
import { clean, decimal } from './derive-shared';
import type { Gap, GapSink } from './gaps';
import { englishT, own, type PdfT } from './i18n';

export type CutStripStep = { n: number; text: string };

export type CutStripRow = {
  key: string;
  bomLine: string;
  name: string;
  qty: number;
  widthMm: number | null;
  /** One number for all sizes: the sheet prints one column. */
  oneLength: boolean;
  /** Cut per column of the model's `sizes`; `undefined` is unknown, never 0. */
  cuts: (number | undefined)[];
  /** Cut at the base size, the step table's number. */
  baseCutMm: number | undefined;
  steps: CutStripStep[];
};

export type CutStripsModel = {
  sizes: { id: number; name: string }[];
  baseSizeName: string;
  strips: CutStripRow[];
  gaps: Gap[];
};

export type DeriveCutStripsOptions = {
  sizeNames?: Readonly<Record<number, string>>;
  orderSizes?: (ids: number[]) => number[];
  /** The drawn pieces: without them a stale seam length cannot be told. */
  pieces?: ReadonlyMap<string, AsmPiece>;
  grainDeg?: ReadonlyMap<string, number>;
  /** The verb a step prints, for a step with no note of its own. */
  verbOf?: (operationNumber: number) => string | undefined;
  t?: PdfT;
};

const widthOf = (strip: CutStripLike): number | null => {
  const raw = strip.widthMm;
  const value =
    typeof raw === 'object' && raw !== null ? decimal(raw as { value?: string }) : Number(raw);
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
};

export function deriveCutStrips(
  techCard: common_TechCard,
  o: DeriveCutStripsOptions = {},
  sink?: GapSink,
): CutStripsModel {
  const t = o.t ?? englishT;
  const raw = cutStripsOfCard(techCard);
  const ins = techCard.techCard;
  const bomLines = ins?.bomItems ?? [];
  const operations = ins?.operations ?? [];
  const seamRows = raw.length ? splitWire(techCard.seams ?? []).seams : [];
  const gone = goneSeamKeys(raw.length ? techCard.seams : []);
  const stripKeys = stripKeysOf(raw);
  const geoms = new Map<string, PieceGeom>(
    [...(o.pieces ?? [])].map(([key, piece]) => [key, piece.geom]),
  );

  const cardSizes = (ins?.sizeIds ?? []).map((id) => wireInt(id));
  const named = raw.flatMap((strip) => (strip.sizes ?? []).map((row) => wireInt(row.sizeId)));
  const ids = [...new Set(cardSizes.length ? cardSizes : named)].filter((id) => id > 0);
  const ordered = o.orderSizes?.(ids) ?? [...ids].sort((a, b) => a - b);
  const sizes = ordered.map((id) => ({ id, name: o.sizeNames?.[id] ?? String(id) }));
  const baseId = wireInt(ins?.baseSampleSizeId) || ordered[0] || 0;

  const gaps: Gap[] = [];
  const add = (gap: Gap) => gaps.push(sink?.add(gap) ?? gap);

  const strips = raw.flatMap((strip): CutStripRow[] => {
    const key = clean(strip.lineKey);
    if (!key) return [];
    const bomLine = clean(strip.bomLineKey);
    const refs = [bomLine ? `bom:${bomLine}` : '', `strip:${key}`].filter(Boolean);
    const steps = operations
      .filter((op) => (op.inputKeys?.length ? op.inputKeys : op.pieceLineKeys ?? []).includes(key))
      .map((op) => {
        const n = op.operationNumber ?? 0;
        return { n, text: own(clean(op.note) || o.verbOf?.(n) || '') };
      });
    if (steps.length === 0)
      add({
        code: 'cut_strip_unused',
        refs,
        label: t('cutStrips.unused'),
        section: '06',
        target: { tab: 'materials', bomLine, field: 'cutStrips' },
      });

    const stored = geoms.get(key)?.cutStrip?.seamMm;
    const row = strip.seamKey
      ? seamRows.find((candidate) => candidate.seamKey === strip.seamKey)
      : undefined;
    if (strip.seamKey && gone.has(strip.seamKey.trim()))
      add({
        code: 'cut_strip_seam_stale',
        refs,
        label: t('cutStrips.staleSeam'),
        section: '06',
        target: { tab: 'materials', bomLine, field: 'cutStrips' },
      });
    else if (stored !== undefined && row) {
      const today = seamLengthOnGeoms(row, stripKeys, geoms, o.grainDeg);
      if (today !== undefined && lengthsDiffer(today, stored, DEFAULT_SEAM_TOLERANCE_MM))
        add({
          code: 'cut_strip_seam_stale',
          refs,
          label: t('cutStrips.staleSeam'),
          section: '06',
          target: { tab: 'materials', bomLine, field: 'cutStrips' },
        });
    }

    const oneLength = strip.lengthMode === 'one_length';
    const measured = withSeamGone(strip, gone);
    return [
      {
        key,
        bomLine,
        name: stripName(strip, bomLines),
        qty: strip.qty || 1,
        widthMm: widthOf(strip),
        oneLength,
        cuts: oneLength
          ? [stripCutMm(measured, 0)]
          : sizes.map((size) => stripCutMm(measured, size.id)),
        baseCutMm: stripCutMm(measured, baseId),
        steps,
      },
    ];
  });

  return { sizes, baseSizeName: o.sizeNames?.[baseId] ?? '', strips, gaps };
}
