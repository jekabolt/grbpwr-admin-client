import { useQueries, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_AdminColorwayRef,
  common_Material,
  common_Sample,
  common_TechCard,
  common_TechCardBomItem,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { resolveMaterialPurpose } from 'components/managers/materials/components/purpose-options';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { notify } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { decimalToInput, inputToDecimal, parseDecimalNumber } from 'utils/decimal';
import { useAddDevExpense } from './dev-expenses-field';
import {
  fittingsNewestFirst,
  lineMaterialId,
  specQuantity,
  stockOnHand,
  todayISO,
  useStockIndex,
  useWriteoffBatch,
  type WriteoffLine,
} from './sample-panels';
import {
  saveSampleErrorMessage,
  substitutionKeys,
  usePatchSampleNow,
  useSampleFittings,
  useSamples,
  useSaveSample,
  useTechCardReleases,
} from './useSamples';
import { wireInt } from './wire-int';

// One click creates a sample (owner 16.10, samples-lite AUTO pass): every field gets a source, and a
// question is asked only when none exists — as a quiz row, never a form. Then, in order: AddSample →
// stand-in substitutions → ONE write-off batch (+ status `in sewing`) → the sewing (CMT) R&D row.
// A failure after AddSample never deletes the sample: it opens anyway and the failed steps wait in
// its header as a warning with a retry.

export const PURPOSE_ORDER = ['proto', 'fit', 'sms', 'pp'] as const;

/** proto/fit are cut from stand-in fabric, sms/pp from the final one. */
export const fabricForPurpose = (purpose: string): string =>
  purpose === 'sms' || purpose === 'pp' ? 'production' : 'sample';

/** The main fabric line(s): purpose MAIN, else the first FABRIC-section line. */
export function mainFabricLines(techCard?: common_TechCard): common_TechCardBomItem[] {
  const items = techCard?.techCard?.bomItems ?? [];
  const main = items.filter((b) => b.purpose === 'TECH_CARD_BOM_PURPOSE_MAIN');
  if (main.length) return main;
  const first = items.find((b) => b.section === 'TECH_CARD_BOM_SECTION_FABRIC');
  return first ? [first] : [];
}

const byNumberDesc = (a: common_Sample, b: common_Sample) => (b.number ?? 0) - (a.number ?? 0);

export type SamplePlan = {
  purpose: string;
  sizeId: number;
  colorwayId: number;
  fabricSource: string;
  specReleaseId: number;
  previousSampleId: number;
  /** The material the main fabric line(s) were cut from; 0 = ask (stand-in) or n/a (final). */
  standInId: number;
};

export type MaterialOption = { material: common_Material; onHand: string; tag?: string };

export type QuizStep =
  | { kind: 'size'; sizeIds: number[] }
  | { kind: 'colourway'; colorways: common_AdminColorwayRef[] }
  | { kind: 'material'; options: MaterialOption[]; own?: MaterialOption };

type Answers = { sizeId?: number; colorwayId?: number; standInId?: number };

export type CreateStep = 'subs' | 'writeoff' | 'status' | 'rnd';
export type CreateFailure = {
  sampleId: number;
  steps: CreateStep[];
  error: string;
  plan: SamplePlan;
};

export function useAutoCreateSample({
  techCardId,
  techCard,
  onOpen,
}: {
  techCardId: number;
  techCard?: common_TechCard;
  onOpen: (id: number) => void;
}) {
  const { dictionary } = useDictionary();
  const { canWriteCosting } = usePermissions();
  const qc = useQueryClient();
  const save = useSaveSample();
  const patch = usePatchSampleNow();
  const issuer = useWriteoffBatch();
  const addExpense = useAddDevExpense(techCardId);
  const stock = useStockIndex();
  const samplesQ = useSamples(techCardId);
  const samplesData = samplesQ.data;
  const fittingsQ = useSampleFittings(techCardId);
  const bySample = fittingsQ.bySample;
  const releasesQ = useTechCardReleases(techCardId);
  const releasesData = releasesQ.data;

  const samples = useMemo(
    () => [...(samplesData?.samples ?? [])].sort(byNumberDesc),
    [samplesData],
  );
  // Every earlier sample's substitutions — the stand-ins this card has been cut from before. Same
  // query keys as useSampleSubstitutions, so an open sample shares the cache.
  const subsQueries = useQueries({
    queries: samples.map((s) => ({
      queryKey: substitutionKeys.list(s.id ?? 0),
      queryFn: () => adminService.ListSampleSubstitutions({ sampleId: s.id ?? 0 }),
      enabled: !!s.id,
    })),
  });

  const subsBySample = samples.map((s, i) => ({
    sample: s,
    subs: subsQueries[i]?.data?.substitutions ?? [],
  }));

  // Never create from partial data: every source must have ANSWERED, not merely stopped loading.
  const sources = [
    { name: 'samples', ok: samplesQ.isSuccess, err: samplesQ.isError, refetch: samplesQ.refetch },
    {
      name: 'fittings',
      ok: fittingsQ.isSuccess,
      err: fittingsQ.isError,
      refetch: fittingsQ.refetch,
    },
    { name: 'stock', ok: stock.isSuccess, err: stock.isError, refetch: stock.refetch },
    {
      name: 'releases',
      ok: releasesQ.isSuccess,
      err: releasesQ.isError,
      refetch: releasesQ.refetch,
    },
    ...subsQueries.map((q) => ({
      name: 'stand-ins',
      ok: q.isSuccess,
      err: q.isError,
      refetch: q.refetch,
    })),
  ];
  const failedSources = sources.filter((x) => x.err);
  const sourceError = failedSources.length
    ? `couldn't read ${[...new Set(failedSources.map((x) => x.name))].join(', ')}`
    : '';
  const refetchSources = () => failedSources.forEach((x) => void x.refetch());
  const ready = !!techCard && !sourceError && sources.every((x) => x.ok);

  const sizeIds = techCard?.techCard?.sizeIds ?? [];
  const colorways = (techCard?.colorways ?? []).filter(
    (c) => (c.colorwayId ?? 0) > 0 && c.status !== 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED',
  );
  const mainLines = mainFabricLines(techCard);
  const mainIds = new Set(mainLines.map((b) => wireInt(b.id)).filter(Boolean));

  // ── defaults: every field from its source ───────────────────────────────────────────────────
  const prev = samples[0];
  const prevIn = prev?.sample;
  const prevVerdict = prev?.id
    ? fittingsNewestFirst(bySample.get(prev.id) ?? [])[0]?.fitting?.verdict
    : undefined;
  let purpose: string = 'proto';
  if (prevIn) {
    const at = PURPOSE_ORDER.indexOf((prevIn.purpose ?? 'proto') as (typeof PURPOSE_ORDER)[number]);
    // approved → the next step; changes after a proto → fit; otherwise the same purpose again.
    purpose =
      prevVerdict === 'FITTING_VERDICT_APPROVED'
        ? PURPOSE_ORDER[Math.min(Math.max(at, 0) + 1, PURPOSE_ORDER.length - 1)]
        : prevVerdict === 'FITTING_VERDICT_NEEDS_REWORK' && prevIn.purpose === 'proto'
          ? 'fit'
          : prevIn.purpose || 'proto';
  }
  const fabricSource = fabricForPurpose(purpose);
  const standIn = fabricSource === 'sample';

  const baseSize = techCard?.techCard?.baseSampleSizeId ?? 0;
  const autoSize = sizeIds.includes(baseSize)
    ? baseSize
    : prevIn?.sizeId && sizeIds.includes(prevIn.sizeId)
      ? prevIn.sizeId
      : sizeIds.length === 1
        ? sizeIds[0]
        : sizeIds.length === 0
          ? 0
          : undefined;

  const prevColorway = prevIn?.colorwayId ?? 0;
  const autoColorway = standIn
    ? 0
    : colorways.some((c) => c.colorwayId === prevColorway)
      ? prevColorway
      : colorways.length === 1
        ? colorways[0].colorwayId ?? 0
        : colorways.length === 0
          ? 0
          : undefined;

  // Stand-in history: newest sample first; the previous sample's choice is reused silently.
  const usedOn = new Map<number, number>(); // materialId → sample number it was used on
  let autoStandIn: number | undefined;
  for (const { sample, subs } of subsBySample) {
    for (const sub of subs) {
      const mat = wireInt(sub.substitutedMaterialId);
      if (!mat) continue;
      if (!usedOn.has(mat)) usedOn.set(mat, sample.number ?? 0);
      if (autoStandIn === undefined && mainIds.has(wireInt(sub.bomItemId))) autoStandIn = mat;
    }
  }
  const needsStandIn = standIn && mainLines.length > 0;

  const releases = releasesData?.releases ?? [];
  const latestRelease = releases.reduce<(typeof releases)[number] | undefined>(
    (best, r) => ((r.releaseNumber ?? 0) > (best?.releaseNumber ?? 0) ? r : best),
    undefined,
  );

  // ── quiz state ──────────────────────────────────────────────────────────────────────────────
  const [asking, setAsking] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<CreateFailure | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  );

  // The article the main fabric is cut from in the colourway being sewn (a colourway may pin one).
  const ownMaterialId =
    mainLines.map((b) => lineMaterialId(techCard, b, autoColorway ?? 0)).find(Boolean) ?? 0;
  const materialOptions = (): { options: MaterialOption[]; own?: MaterialOption } => {
    const fmt = (id: number) => {
      const row = stock.rowByMaterial.get(id);
      return row?.material
        ? { material: row.material, onHand: decimalToInput(row.onHand) || '0' }
        : undefined;
    };
    const out: MaterialOption[] = [];
    const seen = new Set<number>([ownMaterialId]);
    for (const [id, n] of usedOn) {
      const o = fmt(id);
      if (!o || seen.has(id)) continue;
      seen.add(id);
      out.push({ ...o, tag: n ? `used on #${n}` : undefined });
    }
    const ownClass = stock.rowByMaterial.get(ownMaterialId)?.material?.materialClass;
    const klass =
      ownClass && ownClass !== 'MATERIAL_CLASS_UNKNOWN' ? ownClass : 'MATERIAL_CLASS_FABRIC';
    const pool = stock.rows
      .filter((r) => {
        const m = r.material;
        const id = wireInt(m?.id);
        return (
          !!m &&
          !seen.has(id) &&
          !m.archived &&
          m.materialClass === klass &&
          resolveMaterialPurpose(m.purpose) !== 'MATERIAL_PURPOSE_PRODUCTION' &&
          stockOnHand(r) > 0
        );
      })
      .sort((a, b) => stockOnHand(b) - stockOnHand(a))
      .slice(0, Math.max(0, 9 - out.length));
    for (const r of pool)
      out.push({ material: r.material!, onHand: decimalToInput(r.onHand) || '0' });
    const own = ownMaterialId ? fmt(ownMaterialId) : undefined;
    return { options: out, own };
  };

  const sizeId = answers.sizeId ?? autoSize;
  const colorwayId = answers.colorwayId ?? autoColorway;
  const standInId = needsStandIn ? answers.standInId ?? autoStandIn : 0;

  const pendingStep: QuizStep | null =
    sizeId === undefined
      ? { kind: 'size', sizeIds }
      : colorwayId === undefined
        ? { kind: 'colourway', colorways }
        : standInId === undefined
          ? { kind: 'material', ...materialOptions() }
          : null;

  const plan = (a: Answers = answers): SamplePlan => ({
    purpose,
    sizeId: a.sizeId ?? autoSize ?? 0,
    colorwayId: a.colorwayId ?? autoColorway ?? 0,
    fabricSource,
    specReleaseId: latestRelease?.id ?? 0,
    previousSampleId: prev?.id ?? 0,
    standInId: needsStandIn ? a.standInId ?? autoStandIn ?? 0 : 0,
  });

  const sizeName = (id?: number) =>
    id ? String(findInDictionary(dictionary, id, 'size') || id) : '';
  const preview = [purpose, sizeName(autoSize), standIn ? 'sample' : 'final']
    .filter(Boolean)
    .join(' · ');

  const rndWillRun = () =>
    canWriteCosting && parseDecimalNumber(decimalToInput(techCard?.techCard?.costing?.cmtCost)) > 0;

  // Every line with an article and a norm, at min(spec, what is left of the stock).
  function writeoffLines(p: SamplePlan): WriteoffLine[] {
    const lines: WriteoffLine[] = [];
    // Stock left per material across lines: the batch merges lines that share a material (a
    // stand-in on two main lines), so capping each line by the full balance could overdraw it
    // and get the whole batch rejected.
    const left = new Map<number, number>();
    for (const b of techCard?.techCard?.bomItems ?? []) {
      const materialId =
        p.standInId && mainIds.has(wireInt(b.id))
          ? p.standInId
          : lineMaterialId(techCard, b, p.colorwayId);
      if (!materialId) continue;
      const spec = parseDecimalNumber(
        specQuantity(techCard, wireInt(b.id), p.colorwayId, p.sizeId),
      );
      const onHand = left.get(materialId) ?? stockOnHand(stock.rowByMaterial.get(materialId));
      if (!(spec > 0) || !(onHand > 0)) continue;
      const qty = Number(Math.min(spec, onHand).toFixed(3));
      left.set(materialId, onHand - qty);
      lines.push({
        key: `bom-${wireInt(b.id) || b.lineKey}`,
        materialId,
        label: b.name ?? '',
        unit: b.unit ?? '',
        quantity: String(qty),
      });
    }
    return lines;
  }

  // ── the steps after AddSample, re-runnable one by one ───────────────────────────────────────
  async function finish(id: number, p: SamplePlan, steps: CreateStep[]) {
    const failed: CreateStep[] = [];
    const errors: string[] = [];
    const fail = (step: CreateStep, e: unknown) => {
      failed.push(step);
      errors.push(e instanceof Error ? e.message : String(e));
    };
    const bomItems = techCard?.techCard?.bomItems ?? [];
    const own = (b: common_TechCardBomItem) => lineMaterialId(techCard, b, p.colorwayId);
    const lines = writeoffLines(p);
    const willRnd = rndWillRun();
    // Progress: AddSample is step 1 (already done when we get here, unless this is a retry).
    let done = 1;
    const total =
      1 +
      (steps.includes('subs') && p.standInId ? 1 : 0) +
      (steps.includes('writeoff') && lines.length ? 1 : 0) +
      (steps.includes('rnd') && willRnd ? 1 : 0) +
      1;
    const tick = (label: string) => setProgress({ done, total, label });

    if (steps.includes('subs') && p.standInId) {
      tick('stand-in');
      try {
        // A retry must not record a line twice.
        const have = await adminService.ListSampleSubstitutions({ sampleId: id });
        const recorded = new Set((have.substitutions ?? []).map((s) => wireInt(s.bomItemId)));
        for (const b of bomItems) {
          const bid = wireInt(b.id);
          if (!mainIds.has(bid) || recorded.has(bid) || own(b) === p.standInId) continue;
          await adminService.AddSampleSubstitution({
            substitution: {
              sampleId: id,
              bomItemId: bid,
              originalMaterialId: own(b),
              substitutedMaterialId: p.standInId,
              reason: 'stand-in',
              plannedQty: inputToDecimal(specQuantity(techCard, bid, p.colorwayId, p.sizeId)),
              actualQty: undefined,
            },
          });
        }
        qc.invalidateQueries({ queryKey: substitutionKeys.list(id) });
      } catch (e) {
        fail('subs', e);
      }
      done += 1;
    }

    let issued = false;
    if (steps.includes('writeoff')) {
      if (lines.length) {
        tick(`writing off ${lines.length} ${lines.length === 1 ? 'material' : 'materials'}`);
        const res = await issuer.run(id, lines, 'sample write-off');
        if (res.ok) issued = true;
        else fail('writeoff', res.error);
        done += 1;
      }
    }
    if (issued || steps.includes('status')) {
      try {
        await patch.mutateAsync({ id, patch: { status: 'in_sewing' } });
      } catch (e) {
        fail('status', e);
      }
    }

    const cmt = parseDecimalNumber(decimalToInput(techCard?.techCard?.costing?.cmtCost));
    if (steps.includes('rnd') && willRnd) {
      tick('sewing R&D');
      try {
        await addExpense.mutateAsync({
          techCardId,
          kind: 'labour',
          description: 'sewing (cmt)',
          amount: { value: String(cmt) },
          currency:
            techCard?.techCard?.costing?.currency ||
            stock.baseCurrency ||
            dictionary?.baseCurrency ||
            'EUR',
          fittingId: 0,
          sampleId: id,
          incurredAt: new Date().toISOString(),
        });
      } catch (e) {
        fail('rnd', e);
      }
      done += 1;
    }
    tick('opening');

    setFailure(
      failed.length ? { sampleId: id, steps: failed, error: errors.join(' · '), plan: p } : null,
    );
  }

  async function run(a: Answers) {
    const p = plan(a);
    setAsking(false);
    setAnswers({});
    setBusy(true);
    const lines = writeoffLines(p);
    setProgress({
      done: 0,
      total: 2 + (p.standInId ? 1 : 0) + (lines.length ? 1 : 0) + (rndWillRun() ? 1 : 0),
      label: 'creating sample',
    });
    try {
      let id = 0;
      try {
        id = await save.mutateAsync({
          id: 0,
          expectedLockVersion: 0,
          sample: {
            techCardId,
            purpose: p.purpose,
            sizeId: p.sizeId,
            colorwayId: p.colorwayId,
            status: 'planned',
            fabricSource: p.fabricSource,
            notes: '',
            startedAt: todayISO(),
            finishedAt: '',
            mediaIds: [],
            patternUrl: '',
            patternNote: '',
            roundNumber: 0,
            specReleaseId: p.specReleaseId,
            previousSampleId: p.previousSampleId,
          },
        });
      } catch (e) {
        notify({
          sev: 'error',
          subject: 'SAMPLE',
          text: 'not created',
          detail: saveSampleErrorMessage(e),
        });
        return;
      }
      if (!id) {
        notify({
          sev: 'warn',
          subject: 'SAMPLE',
          text: 'created',
          bad: 'not opened',
          detail: 'open it from the board',
        });
        return;
      }
      await finish(id, p, ['subs', 'writeoff', 'rnd']);
      onOpen(id);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const start = () => {
    if (!ready || busy) return;
    if (pendingStep) setAsking(true);
    else void run({});
  };

  // One click answers and moves on; the last answer creates the sample.
  const answer = (patchA: Answers) => {
    const next = { ...answers, ...patchA };
    setAnswers(next);
    const s = next.sizeId ?? autoSize;
    const c = next.colorwayId ?? autoColorway;
    const m = needsStandIn ? next.standInId ?? autoStandIn : 0;
    if (s !== undefined && c !== undefined && m !== undefined) void run(next);
  };

  const cancel = () => {
    setAsking(false);
    setAnswers({});
  };

  const retry = async () => {
    if (!failure || busy) return;
    setBusy(true);
    try {
      await finish(failure.sampleId, failure.plan, failure.steps);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  return {
    ready,
    sourceError,
    refetchSources,
    progress,
    busy,
    preview,
    previewNumber: (prev?.number ?? 0) + 1,
    purpose,
    quiz: asking && pendingStep ? pendingStep : null,
    start,
    answer,
    cancel,
    failure,
    retry,
  };
}

export type AutoCreateSample = ReturnType<typeof useAutoCreateSample>;
