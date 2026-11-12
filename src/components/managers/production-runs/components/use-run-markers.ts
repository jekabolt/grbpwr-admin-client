// «build markers» / «build lays» на странице прогона: входы из карточки, состояние сборки,
// строки таблицы. Тяжёлая часть (планировщик + воркер) — в run-markers-build, грузится по кнопке.
import { useQueryClient } from '@tanstack/react-query';
import type {
  common_Material,
  common_ProductionRun,
  common_ProductionRunLay,
  common_TechCard,
  common_TechCardMarkerSummary,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import {
  fabricScopes,
  isRollGoodsSection,
} from 'components/managers/tech-card/components/bom-purpose';
import {
  BATCH_LAY_MODE,
  batchEndLossPrefill,
} from 'components/managers/tech-card/components/nesting/batch-lay-proposal';
import type { BatchCell } from 'components/managers/tech-card/components/nesting/batch-marker-plan';
import { sizeTokensOf } from 'components/managers/tech-card/components/nesting/block-code';
import {
  markerColorways,
  slotCutWidth,
} from 'components/managers/tech-card/components/nesting/colorway-widths';
import { dxfSheetsByScope } from 'components/managers/tech-card/components/nesting/dxf-by-scope';
import { cardMarkers } from 'components/managers/tech-card/components/nesting/marker-io';
import { useDictionarySizeTokens } from 'components/managers/tech-card/components/nesting/use-block-sizes';
import { mapTechCardToForm } from 'components/managers/tech-card/components/schema';
import { useWorkshopSettings } from 'components/managers/workshop/useWorkshopSettings';
import { SECTION } from 'constants/routes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ulid } from 'utils/ulid';
import { notifyFailure } from './feedback';
import { LAY_END_LOSS_DEFAULT_CM } from './lay-editor';
import {
  buildRunMarkerRows,
  layCandidates,
  pendingPairs,
  readTablePick,
  staticRunRefusals,
  writeTablePick,
  type RunMarkerIssue,
  type TableMeters,
} from './run-markers';
import { layErrorMessage, layKeys, useSaveLay } from './useLays';

export function useRunMarkers({
  run,
  techCard,
  editable,
  runMarkers,
  lays,
  laysReady,
  colorwayLabel,
}: {
  run: common_ProductionRun;
  techCard: common_TechCard | undefined;
  /** canEdit && !locked страницы прогона. */
  editable: boolean;
  runMarkers: readonly common_TechCardMarkerSummary[];
  lays: readonly common_ProductionRunLay[];
  /** Список настилов прочитан — до этого ни строить, ни класть настилы нельзя. */
  laysReady: boolean;
  colorwayLabel: (id: number) => string;
}) {
  const qc = useQueryClient();
  const runId = run.id ?? 0;
  const techCardId = run.run?.techCardId ?? 0;
  const { canWrite } = usePermissions();

  const cells: BatchCell[] = useMemo(
    () =>
      (run.run?.lines ?? [])
        .filter((l) => (l.plannedQty ?? 0) > 0)
        .map((l) => ({
          colorwayId: Number(l.productId ?? 0),
          sizeId: Number(l.sizeId ?? 0),
          qty: Number(l.plannedQty ?? 0),
        })),
    [run],
  );
  const colorwayIds = useMemo(
    () => [...new Set(cells.map((c) => c.colorwayId))].filter((id) => id > 0),
    [cells],
  );

  // Карточка в форме — те же поля, что очередь читает из react-hook-form (bomItems, patterns, …).
  const form = useMemo(() => (techCard ? mapTechCardToForm(techCard) : undefined), [techCard]);
  const bomItems = useMemo(() => form?.bomItems ?? [], [form]);
  const lines = useMemo(
    () =>
      bomItems
        .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
        .map((b) => ({ lineKey: b.lineKey as string, name: b.name ?? '' })),
    [bomItems],
  );

  const canBuild =
    editable &&
    laysReady &&
    canWrite(SECTION.techCards) &&
    !!techCard &&
    techCardId > 0 &&
    cells.length > 0 &&
    lines.length > 0;

  const { data: materialsData } = useMaterials('', true, canBuild);
  const workshop = useWorkshopSettings(canBuild);
  const sizeById = useSizeNames();
  const orderSizes = useSizeOrdering();
  const dictTokens = useDictionarySizeTokens();

  const materialById = useMemo(() => {
    const m = new Map<number, common_Material>();
    for (const mat of materialsData?.materials ?? []) if (mat.id) m.set(Number(mat.id), mat);
    return m;
  }, [materialsData]);
  const colorways = useMemo(
    () => markerColorways(techCard, materialById),
    [techCard, materialById],
  );
  const sizeName = useCallback(
    (id: number) => formatSizeName(sizeById.get(id) ?? `#${id}`),
    [sizeById],
  );
  // Порядок градации размеров партии (XS…XL) — им идут группы стола и подписи состава.
  const sizeOrderOf = useMemo(() => {
    const order = new Map(
      orderSizes([...new Set(cells.map((c) => c.sizeId))]).map((id, i) => [id, i]),
    );
    return (id: number) => order.get(id) ?? 1e6;
  }, [orderSizes, cells]);

  // Стол раскроя: выбор помнится в браузере на прогон.
  const [pick, setPick] = useState(() => ({ runId, m: readTablePick(runId) }));
  const tableM: TableMeters = pick.runId === runId ? pick.m : readTablePick(runId);
  const pickTable = useCallback(
    (m: TableMeters) => {
      setPick({ runId, m });
      writeTablePick(runId, m);
    },
    [runId],
  );

  // Статические отказы: видны без разбора DXF, поэтому таблица верна и после перезагрузки.
  const staticRefusals = useMemo(() => {
    const rollLines = bomItems
      .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
      .map((b) => ({
        lineKey: b.lineKey as string,
        purpose: b.purpose ?? '',
        section: b.section ?? '',
        fabricWidth: b.fabricWidth ?? '',
        effectiveFabricWidthCm: b.effectiveFabricWidthCm ?? '',
        selvedgeCm: b.selvedgeCm ?? '',
      }));
    const scopes = fabricScopes(rollLines);
    const sheets = dxfSheetsByScope(form?.patterns ?? [], scopes);
    return staticRunRefusals({
      scopes: scopes.map((s) => ({
        lineKeys: s.lines.map((l) => l.lineKey),
        sheetCount: (sheets.get(s.key) ?? []).length,
        slotCutCm: s.lines.length === 1 ? slotCutWidth(s.lines[0]).cutCm : NaN,
      })),
      colorwayIds,
      pinCutCm: (cw, lineKey) =>
        colorways.find((c) => c.colorwayId === cw)?.widthByLine.get(lineKey)?.cutCm,
    });
  }, [bomItems, form?.patterns, colorwayIds, colorways]);

  const [session, setSession] = useState<{
    refusals: RunMarkerIssue[];
    failures: RunMarkerIssue[];
  }>({ refusals: [], failures: [] });
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const referencedMarkerIds = useMemo(() => {
    const ids = new Set<number>();
    for (const lay of lays)
      for (const s of lay.sections ?? []) if ((s.markerId ?? 0) > 0) ids.add(s.markerId ?? 0);
    return ids;
  }, [lays]);

  const buildMarkers = async () => {
    if (!canBuild || progress || !form) return;
    setProgress({ done: 0, total: 0 });
    setSession({ refusals: [], failures: [] });
    try {
      const { buildRunMarkers } = await import('./run-markers-build');
      const out = await buildRunMarkers({
        techCardId,
        runId,
        bomItems: form.bomItems ?? [],
        patterns: form.patterns ?? [],
        pieceDxfAliases: form.pieceDxfAliases ?? [],
        cardSeamAllowanceRaw: form.requiredSeamAllowanceMm ?? null,
        workshopSeamAllowance: workshop.data?.settings?.defaultSeamAllowanceMm,
        colorways,
        materialById,
        cells,
        sizeLabel: sizeName,
        sizeOrderOf,
        sizeTokensOf: (id) => sizeTokensOf(sizeById.get(id)),
        dictTokens,
        cardMarkers: cardMarkers(techCard?.markers),
        runMarkers,
        referencedMarkerIds,
        tableCm: tableM * 100,
        isAlive: () => aliveRef.current,
        onProgress: (done, total) => {
          if (aliveRef.current) setProgress({ done, total });
        },
      });
      if (aliveRef.current) setSession(out);
    } catch {
      if (aliveRef.current)
        setSession({
          refusals: [],
          failures: lines.flatMap((l) =>
            colorwayIds.map((cw) => ({ lineKey: l.lineKey, colorwayId: cw, word: 'error' })),
          ),
        });
    } finally {
      if (runId > 0) qc.invalidateQueries({ queryKey: layKeys.list(runId) });
      if (aliveRef.current) setProgress(null);
    }
  };

  const rows = useMemo(
    () =>
      buildRunMarkerRows({
        lines,
        colorwayIds,
        colorwayLabel,
        runMarkers,
        cells,
        sizeLabel: sizeName,
        staticRefusals,
        sessionRefusals: session.refusals,
        failures: session.failures,
        sizeOrderOf,
        tableCm: tableM * 100,
      }),
    [
      lines,
      colorwayIds,
      colorwayLabel,
      runMarkers,
      cells,
      sizeName,
      staticRefusals,
      session,
      sizeOrderOf,
      tableM,
    ],
  );

  // «build lays»: только когда у каждого строящегося материала уже есть маркер.
  const candidates = useMemo(
    () => layCandidates({ runMarkers, lays, cells }),
    [runMarkers, lays, cells],
  );
  const allBuilt =
    pendingPairs({
      lines,
      colorwayIds,
      runMarkers,
      refusals: [...staticRefusals, ...session.refusals],
    }) === 0;

  const saveLay = useSaveLay();
  const [layingLays, setLayingLays] = useState(false);
  const buildLays = async () => {
    if (layingLays || candidates.length === 0) return;
    setLayingLays(true);
    const endLoss = batchEndLossPrefill(lays).value ?? LAY_END_LOSS_DEFAULT_CM;
    try {
      let order = lays.length;
      for (const c of candidates) {
        order += 1;
        try {
          await saveLay.mutateAsync({
            runId,
            lay: {
              layKey: ulid(),
              colorwayId: c.colorwayId,
              bomLineKey: c.bomLineKey,
              mode: BATCH_LAY_MODE,
              endLossCm: { value: endLoss },
              name: '',
              note: '',
              displayOrder: order,
              lotId: 0,
              clearLot: true,
              actualQty: undefined,
              actualUom: undefined,
              actualMethod: undefined,
              clearActual: true,
              sections: [{ sectionKey: ulid(), markerId: c.markerId, plies: c.plies, position: 1 }],
            },
            expectedLockVersion: undefined,
            reaffirmQuantities: false,
          });
        } catch (e) {
          notifyFailure('LAY', 'not saved', e, layErrorMessage(e));
        }
      }
    } finally {
      if (aliveRef.current) setLayingLays(false);
    }
  };

  return {
    canBuild,
    tableM,
    pickTable,
    progress,
    buildMarkers,
    rows,
    canBuildLays: editable && laysReady && allBuilt && candidates.length > 0,
    layingLays,
    buildLays,
  };
}
