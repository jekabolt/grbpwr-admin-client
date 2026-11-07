import type { common_TechCard } from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { chartBasisFromReport, chartFromReport } from 'lib/pom/chart-values';
import { POM_CODES_BY_GARMENT } from 'lib/pom/chart-points';
import { garmentOf } from 'lib/pom/pieces';
import type { GarmentKind, PomReport } from 'lib/pom/types';
import type { TechCardPieceFoldWire } from 'lib/folds';
import type { TechCardSeamWire } from 'lib/seams';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useEffect, useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { pomKey, pomRequest, useDollCard } from './assembly-doll/use-doll-card';
import { requestPoms, useDollStore } from './assembly-doll/doll-store';
import { hydrateFolds } from './assembly-folds/folds-store';
import { hydrateSeams } from './assembly-seams/seams-store';
import { skeletonCategoryOf } from './assembly-skeleton-source';
import { liveCardSeamGraph } from './card-unit-pictures';
import { firstColorwayCloth, useCardCategoryNames } from './skeleton-card-inputs';
import type { CutStripLike } from './cut-strips/strip-pieces';
import { wireInt, type TechCardFormData } from './schema';
import { usePieceShapes } from './use-piece-shapes';

const norm = (value: string) => value.replace(/[<>\s]/g, '').toLowerCase();

const decimalNumber = (value: string | undefined): number | null => {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function usePatternChart({
  active,
  techCard,
  shrinkageOverride,
}: {
  active: boolean;
  techCard?: common_TechCard;
  shrinkageOverride: string;
}) {
  const pieces = (useWatch<TechCardFormData>({ name: 'pieces' }) ??
    []) as TechCardFormData['pieces'];
  const bomItems = (useWatch<TechCardFormData>({ name: 'bomItems' }) ?? []) as NonNullable<
    TechCardFormData['bomItems']
  >;
  const operations = (useWatch<TechCardFormData>({ name: 'operations' }) ??
    []) as TechCardFormData['operations'];
  const aliases = (useWatch<TechCardFormData>({ name: 'pieceDxfAliases' }) ??
    []) as TechCardFormData['pieceDxfAliases'];
  const patterns = (useWatch<TechCardFormData>({ name: 'patterns' }) ??
    []) as TechCardFormData['patterns'];
  const purpose = useWatch<TechCardFormData>({ name: 'purpose' }) as string | undefined;
  const cutStrips = useWatch<TechCardFormData>({ name: 'cutStrips' }) as
    | readonly CutStripLike[]
    | undefined;
  const categoryNames = useCardCategoryNames();
  const shapes = usePieceShapes(active);
  const cloth = useMemo(() => firstColorwayCloth(techCard, bomItems), [techCard, bomItems]);

  // The sizes tab is mounted all the time, but it owns the expensive read only while visible.
  // Hydration is idempotent and deliberately has no cleanup: switching to assembly hands the same
  // open-card stores to its existing readers instead of erasing them between tabs.
  useEffect(() => {
    if (!active || !techCard?.id) return;
    hydrateSeams(techCard.id, techCard.seams as TechCardSeamWire[] | undefined);
    hydrateFolds(techCard.id, techCard.pieceFolds as TechCardPieceFoldWire[] | undefined);
  }, [active, techCard?.id, techCard?.seams, techCard?.pieceFolds]);

  useEffect(() => {
    if (!active || !shapes.shapeByKey || pieces.length === 0) return;
    try {
      // Same live-form adapter and same seam reader as CardUnitPicturesProvider. Its decisions
      // callback publishes the facts useDollCard consumes; the graph itself remains cached work.
      liveCardSeamGraph(
        { pieces, bomItems, operations, aliases, patterns, purpose, cutStrips },
        { shapes: shapes.shapeByKey, cloth, categoryNames },
      );
    } catch {
      // A pattern that cannot be read leaves the chart manual; no chart value is invented.
    }
  }, [
    active,
    shapes.shapeByKey,
    pieces,
    bomItems,
    operations,
    aliases,
    patterns,
    purpose,
    cutStrips,
    cloth,
    categoryNames,
  ]);

  const card = useDollCard();
  const pkey = card ? pomKey(card) : null;
  useEffect(() => {
    if (!active || !shapes.hasDxf || !card || !pkey) return;
    const request = pomRequest(card);
    if (request) requestPoms(pkey, request);
  }, [active, shapes.hasDxf, card, pkey]);
  const read = useDollStore((state) => (pkey ? state.poms[pkey] : undefined));
  const report: PomReport | null = read?.status === 'done' ? read.report ?? null : null;

  const { data: materials } = useMaterials('', true, active);
  const mainFabric =
    bomItems.find((line) => line.purpose === 'TECH_CARD_BOM_PURPOSE_MAIN') ??
    bomItems.find((line) => line.section === 'TECH_CARD_BOM_SECTION_FABRIC');
  const materialId = wireInt(mainFabric?.materialId);
  const mainShrinkagePct = useMemo(() => {
    if (!materialId) return 0;
    const material = (materials?.materials ?? []).find(
      (candidate) => wireInt(candidate.id) === materialId,
    );
    return decimalNumber(material?.fabricAttrs?.shrinkagePct?.value) ?? 0;
  }, [materialId, materials?.materials]);
  const effectiveShrinkagePct = decimalNumber(shrinkageOverride) ?? mainShrinkagePct;

  const { dictionary } = useDictionary();
  const sizeIdByName = useMemo(
    () =>
      new Map(
        (dictionary?.sizes ?? []).flatMap((size) =>
          size.id && size.name ? [[norm(size.name), size.id] as const] : [],
        ),
      ),
    [dictionary?.sizes],
  );
  const sizeMap = useMemo(() => {
    const mapped = new Map<string, number>();
    if (!report || !card) return mapped;
    for (const size of report.sizes) {
      const id = sizeIdByName.get(norm(card.cardSizeOf(size.size)));
      if (id) mapped.set(size.size, id);
    }
    return mapped;
  }, [report, card, sizeIdByName]);

  const fallbackKind: GarmentKind = garmentOf(skeletonCategoryOf(categoryNames, false), []);
  const kind = report?.garment ?? fallbackKind;
  const patternValues = useMemo(
    () =>
      report
        ? chartFromReport(
            report,
            POM_CODES_BY_GARMENT[report.garment],
            sizeMap,
            effectiveShrinkagePct,
          )
        : null,
    [report, sizeMap, effectiveShrinkagePct],
  );
  const basis = useMemo(
    () => (report ? chartBasisFromReport(report, POM_CODES_BY_GARMENT[report.garment]) : new Map()),
    [report],
  );

  return {
    basis,
    effectiveShrinkagePct,
    hasPatterns: shapes.hasDxf,
    kind,
    mainShrinkagePct,
    patternValues,
    report,
  };
}
