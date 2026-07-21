import {
  common_Material,
  common_MaterialMovement,
  common_MaterialStockRow,
  common_TechCard,
} from 'api/proto-http/admin';
import { MaterialThumb } from 'components/managers/materials/components/material-thumb';
import {
  materialPurposeLabel,
  resolveMaterialPurpose,
} from 'components/managers/materials/components/purpose-options';
import {
  useIssueMaterialStock,
  useMaterialStock,
} from 'components/managers/materials/components/useWarehouse';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import {
  sampleFabricSourceFieldLabel,
  sampleFabricSourceHint,
  sampleFabricSourceOptions,
  samplePurposeOptions,
  sampleStatusOptions,
} from './sample-options';
import { wireInt } from './schema';
import { saveSampleErrorMessage, useSaveSample } from './useSamples';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';

// Feature #47 — sample-creation material write-off wizard. Owner ask (verbatim): "создание семпла
// должно списывать ткани и т.д. (помеченные как sample) из материалов со склада → dev-стоимость.
// на карточке создания семпла можно визард: те что помечены как для семпла."
//
// A sample is a sewn prototype; sewing one consumes real stock. This wizard makes that consumption
// explicit at creation time: (1) sample basics, (2) pick the SAMPLE-marked materials + quantities
// consumed, (3) review, then on confirm it CREATES the sample and ISSUES each chosen material from
// stock attributed to the sample — writing it off and composing the sample's dev cost.
//
// Orchestration only: it drives two EXISTING RPCs client-side — AddSample (→ new id) then
// IssueMaterialStock({ sampleId }) per line (the same movement the SampleMovements panel posts, so
// the sample's cost.materials_base and the stock ledger stay one source of truth).
//
// BACKEND GAP (flagged): there is no atomic "create-sample-with-writeoff" RPC, so create + N issues
// can't be one transaction. This is best-effort: the sample is created first; if an issue then
// fails, the sample still exists and the remaining write-offs can be retried here or finished from
// its material-movements panel — a partial failure degrades gracefully, never loses data. A single
// transactional RPC would be the correct fix if strict all-or-nothing atomicity is ever required.

type Colorway = { id?: number; code?: string; name?: string };

// One material to consume: which catalog material + how much (a free-typed decimal string, edited
// as text and folded to a Decimal only at the RPC boundary, mirroring the movement modals).
type WriteoffLine = { materialId: number; quantity: string };

// Per-line outcome of the write-off pass, so a partial failure reads exactly (which issued, which
// didn't) instead of a single opaque error.
type LineResult = {
  materialId: number;
  label: string;
  qty: string;
  unit: string;
  ok: boolean;
  movement?: common_MaterialMovement;
  error?: string;
};

type Step = 'basics' | 'materials' | 'review' | 'result';

type BasicsDraft = {
  purpose: string;
  sizeId: number;
  colorwayId: number;
  status: string;
  fabricSource: string;
  startedAt: string;
  finishedAt: string;
  notes: string;
};

const emptyBasics: BasicsDraft = {
  purpose: 'proto',
  sizeId: 0,
  colorwayId: 0,
  status: 'planned',
  fabricSource: 'sample',
  startedAt: '',
  finishedAt: '',
  notes: '',
};

function todayISO(): string {
  // Local wall-clock date (not toISOString) — mirrors the warehouse movement modals so a write-off
  // is dated the operator's "today", not a UTC day-off around midnight.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

const materialLabel = (m?: common_Material): string =>
  `${m?.code ? `${m.code} · ` : ''}${m?.name ?? `#${m?.id ?? '?'}`}`;

const colorwayText = (c?: Colorway): string =>
  c ? c.name || c.code || `колорвей #${c.id ?? '?'}` : '—';

// Owner prefers card/wizard layouts (MEMORY: scannable cards over dense lists). This replaces the
// create-mode sample editor with a guided 3-step flow; the full editor (photos, provenance,
// fittings, more dev expenses) takes over once the sample exists.
export function SampleCreationWizard({
  techCardId,
  techCard,
  colorways,
  canEdit,
  canReadCosting,
  onCancel,
  onCreated,
}: {
  techCardId: number;
  techCard?: common_TechCard;
  // Resolved by the parent (SamplesTab) off the live techCard — passed in to avoid a circular import.
  colorways: Colorway[];
  canEdit: boolean;
  canReadCosting: boolean;
  onCancel: () => void;
  // Called with the fresh server id — the parent swaps in the full sample editor (its sub-panels
  // need a saved id).
  onCreated: (id: number) => void;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const save = useSaveSample();
  const issue = useIssueMaterialStock();
  const busy = save.isPending || issue.isPending;

  const [step, setStep] = useState<Step>('basics');
  const [d, setD] = useState<BasicsDraft>(emptyBasics);
  const set = (patch: Partial<BasicsDraft>) => setD((prev) => ({ ...prev, ...patch }));

  const [lines, setLines] = useState<WriteoffLine[]>([]);
  const [q, setQ] = useState('');

  // Post-confirm state: the created sample's id + the per-line write-off outcomes (drives the
  // result step). createdId is the guard that a second confirm/retry can never re-create the sample.
  const [createdId, setCreatedId] = useState(0);
  const [results, setResults] = useState<LineResult[]>([]);

  const sizeIds = techCard?.techCard?.sizeIds ?? [];

  // Sample-marked stock: one row per catalog material with its on-hand balance + moving-average
  // valuation. Filter to purpose SAMPLE ∪ BOTH (resolveMaterialPurpose folds legacy/UNKNOWN → BOTH,
  // the write-side default), i.e. everything NOT production-only — those are "помеченные как для
  // семпла". Money fields are absent without costing:read; the write-off itself doesn't need them.
  const {
    data: stockData,
    isLoading: stockLoading,
    isError: stockError,
  } = useMaterialStock({
    withStockOnly: false,
  });
  const sampleRows = useMemo(
    () =>
      (stockData?.rows ?? []).filter(
        (r) =>
          !!r.material?.id &&
          resolveMaterialPurpose(r.material?.purpose) !== 'MATERIAL_PURPOSE_PRODUCTION',
      ),
    [stockData],
  );
  // Keyed by a COERCED id. Material.id is int64, which grpc-gateway serialises as a STRING while
  // the generated type claims `number` — so keying on the raw value built a Map of "12" that
  // `rowById.get(12)` could never hit. That is what made the write-off preview render a nameless row
  // with no on-hand and no cost, and it is the same trap that broke BOM material linking.
  const rowById = useMemo(() => {
    const m = new Map<number, common_MaterialStockRow>();
    for (const r of sampleRows) {
      const id = wireInt(r.material?.id);
      if (id) m.set(id, r);
    }
    return m;
  }, [sampleRows]);
  const baseCurrency = sampleRows.find((r) => r.baseCurrency)?.baseCurrency ?? '';

  // Materials offered by the picker: sample-marked, not already added, matching the free-text query.
  const pickerRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const chosen = new Set(lines.map((l) => l.materialId));
    return sampleRows.filter((r) => {
      // Same coercion as rowById: comparing a wire string against the numeric ids held in `lines`
      // never matched, so an already-added material stayed in the picker as if nothing happened.
      const id = wireInt(r.material?.id);
      if (chosen.has(id)) return false;
      if (!needle) return true;
      const m = r.material;
      return (
        (m?.name ?? '').toLowerCase().includes(needle) ||
        (m?.code ?? '').toLowerCase().includes(needle) ||
        (m?.supplierRef ?? '').toLowerCase().includes(needle)
      );
    });
  }, [sampleRows, lines, q]);

  const addLine = (materialId: number) => {
    if (!materialId || lines.some((l) => l.materialId === materialId)) return;
    setLines((prev) => [...prev, { materialId, quantity: '' }]);
  };
  const setLineQty = (materialId: number, quantity: string) =>
    setLines((prev) => prev.map((l) => (l.materialId === materialId ? { ...l, quantity } : l)));
  const removeLine = (materialId: number) =>
    setLines((prev) => prev.filter((l) => l.materialId !== materialId));

  // A line counts only once its quantity is a real positive number; an incomplete line blocks
  // advancing so a half-filled row can't be silently dropped.
  const lineQtyNum = (l: WriteoffLine) => parseDecimalNumber(l.quantity);
  const validLines = lines.filter((l) => {
    const n = lineQtyNum(l);
    return Number.isFinite(n) && n > 0;
  });
  const incompleteLines = lines.length - validLines.length;
  const materialsError =
    incompleteLines > 0 ? 'Enter a quantity (> 0) for every material, or remove it.' : '';

  // Client-side dev-cost preview (авторитетная величина считается на бэке = sample.cost.materials_base
  // после списаний). Per line: qty × moving-average unit cost, summed in the base currency.
  const linePreview = (materialId: number, qty: string): number | null => {
    const r = rowById.get(materialId);
    const avg = parseDecimalNumber(decimalToInput(r?.avgUnitCostBase));
    const n = parseDecimalNumber(qty);
    if (!Number.isFinite(avg) || !Number.isFinite(n)) return null;
    return avg * n;
  };
  const devCostPreview = validLines.reduce((sum, l) => {
    const c = linePreview(l.materialId, l.quantity);
    return c == null ? sum : sum + c;
  }, 0);
  const previewHasCost =
    canReadCosting && validLines.some((l) => linePreview(l.materialId, l.quantity) != null);

  // Actual written-off value, summed from the posted movements (qty × unit_cost_base) — this is the
  // real dev cost the sample now carries.
  const postedDevCost = results.reduce((sum, r) => {
    if (!r.ok) return sum;
    const qn = Number(r.movement?.quantity?.value);
    const cn = Number(r.movement?.unitCostBase?.value);
    return Number.isFinite(qn) && Number.isFinite(cn) ? sum + qn * cn : sum;
  }, 0);
  const postedHasCost =
    canReadCosting && results.some((r) => r.ok && r.movement?.unitCostBase?.value != null);
  const okCount = results.filter((r) => r.ok).length;
  const failCount = results.length - okCount;

  const money = (n: number) => `${Number(n.toFixed(2))}${baseCurrency ? ` ${baseCurrency}` : ''}`;

  // Issue each line from stock, attributed to the sample. Sequential (not parallel) so a partial
  // failure is deterministic and the "which failed" list reads cleanly. Never throws — every line
  // resolves to an ok/failed outcome.
  const issueLines = async (sampleId: number, toIssue: WriteoffLine[]): Promise<LineResult[]> => {
    const out: LineResult[] = [];
    for (const l of toIssue) {
      const r = rowById.get(l.materialId);
      const base = {
        materialId: l.materialId,
        label: materialLabel(r?.material),
        qty: l.quantity,
        unit: r?.material?.unit ?? '',
      };
      try {
        const res = await issue.mutateAsync({
          materialId: l.materialId,
          quantity: inputToDecimal(l.quantity),
          productionRunId: 0,
          sampleId,
          isReturn: false,
          occurredAt: todayISO(),
          comment: 'sample creation write-off',
          productId: 0,
          lotId: 0,
        });
        out.push({ ...base, ok: true, movement: res.movement });
      } catch (e) {
        out.push({ ...base, ok: false, error: e instanceof Error ? e.message : 'issue failed' });
      }
    }
    return out;
  };

  const confirm = async () => {
    if (!canEdit || busy) return;
    // 1) Create the sample. Advanced fields (photos, provenance, pattern) are added afterwards in the
    //    full editor — the wizard keeps creation focused on basics + the write-off.
    let newId = 0;
    try {
      newId = await save.mutateAsync({
        id: 0,
        expectedLockVersion: 0,
        sample: {
          techCardId,
          purpose: d.purpose,
          sizeId: d.sizeId || 0,
          colorwayId: d.colorwayId || 0,
          status: d.status,
          fabricSource: d.fabricSource,
          notes: d.notes.trim(),
          startedAt: d.startedAt,
          finishedAt: d.finishedAt,
          mediaIds: [],
          patternUrl: '',
          patternNote: '',
          roundNumber: 0,
          specReleaseId: 0,
          previousSampleId: 0,
        },
      });
    } catch (e) {
      showMessage(saveSampleErrorMessage(e), 'error');
      return;
    }
    if (!newId) {
      showMessage('Sample created, but its id was not returned — open it from the board.', 'error');
      return;
    }
    setCreatedId(newId);

    // 2) No materials to write off → straight into the sample editor.
    if (validLines.length === 0) {
      showMessage('Sample created', 'success');
      onCreated(newId);
      return;
    }

    // 3) Write off the chosen materials, then show the outcome (dev cost + per-line status).
    const res = await issueLines(newId, validLines);
    setResults(res);
    setStep('result');
    const failed = res.filter((r) => !r.ok).length;
    if (failed === 0) {
      showMessage(`Sample created · ${res.length} material(s) written off`, 'success');
    } else {
      showMessage(
        `Sample created, but ${failed} of ${res.length} write-off(s) failed — retry below or finish in the movements panel`,
        'error',
      );
    }
  };

  // Re-issue only the still-failed lines against the already-created sample (never re-creates it).
  const retryFailed = async () => {
    if (!createdId || busy) return;
    const failedLines = results
      .filter((r) => !r.ok)
      .map((r) => ({ materialId: r.materialId, quantity: r.qty }));
    if (!failedLines.length) return;
    const retried = await issueLines(createdId, failedLines);
    setResults((prev) =>
      prev.map((p) => (p.ok ? p : retried.find((x) => x.materialId === p.materialId) ?? p)),
    );
    const stillFailed = retried.filter((r) => !r.ok).length;
    showMessage(
      stillFailed === 0
        ? 'All remaining materials written off'
        : `${stillFailed} material(s) still could not be written off`,
      stillFailed === 0 ? 'success' : 'error',
    );
  };

  const steps: { key: Step; label: string }[] = [
    { key: 'basics', label: 'basics' },
    { key: 'materials', label: 'write-off' },
    { key: 'review', label: 'review' },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className='flex flex-col border border-textInactiveColor'>
      {/* step indicator — mirrors the OPEX wizard's chrome */}
      {step === 'result' ? (
        <div className='border-b border-textInactiveColor px-4 py-2'>
          <Text size='small' variant='uppercase'>
            {failCount === 0 ? '✓ sample created' : 'sample created — some write-offs failed'}
          </Text>
        </div>
      ) : (
        <div className='flex items-center gap-1 border-b border-textInactiveColor px-4 py-2'>
          {steps.map((s, i) => (
            <div key={s.key} className='flex items-center gap-1'>
              <span
                className={`text-small uppercase ${
                  i === stepIndex
                    ? 'text-textColor'
                    : i < stepIndex
                      ? 'text-textColor/60'
                      : 'text-textInactiveColor'
                }`}
              >
                {i + 1}. {s.label}
              </span>
              {i < steps.length - 1 && <span className='text-textInactiveColor'>›</span>}
            </div>
          ))}
        </div>
      )}

      <div className='flex flex-col gap-3 p-4'>
        {/* ---- STEP 1 · BASICS (что / когда) ---- */}
        {step === 'basics' && (
          <>
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3'>
              <label className='flex flex-col gap-1'>
                <Text size='small'>purpose</Text>
                <select
                  className={cell}
                  disabled={!canEdit}
                  value={d.purpose}
                  onChange={(e) => set({ purpose: e.target.value })}
                >
                  {samplePurposeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>size</Text>
                <select
                  className={cell}
                  disabled={!canEdit}
                  value={d.sizeId || 0}
                  onChange={(e) => set({ sizeId: Number(e.target.value) || 0 })}
                >
                  <option value={0}>— unset —</option>
                  {sizeIds.map((sid) => (
                    <option key={sid} value={sid}>
                      {findInDictionary(dictionary, sid, 'size') || sid}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>colourway</Text>
                <select
                  className={cell}
                  disabled={!canEdit || colorways.length === 0}
                  value={d.colorwayId || 0}
                  onChange={(e) => set({ colorwayId: Number(e.target.value) || 0 })}
                >
                  <option value={0}>— unset —</option>
                  {colorways.map((c) => (
                    <option key={c.id} value={c.id ?? 0}>
                      {colorwayText(c)}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>status</Text>
                <select
                  className={cell}
                  disabled={!canEdit}
                  value={d.status}
                  onChange={(e) => set({ status: e.target.value })}
                >
                  {sampleStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>started</Text>
                <input
                  className={cell}
                  type='date'
                  disabled={!canEdit}
                  value={d.startedAt}
                  onChange={(e) => set({ startedAt: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>finished</Text>
                <input
                  className={cell}
                  type='date'
                  disabled={!canEdit}
                  value={d.finishedAt}
                  onChange={(e) => set({ finishedAt: e.target.value })}
                />
              </label>
            </div>

            <label className='flex flex-col gap-1'>
              <Text size='small'>{sampleFabricSourceFieldLabel}</Text>
              <select
                className={`${cell} sm:w-1/2`}
                disabled={!canEdit}
                value={d.fabricSource}
                onChange={(e) => set({ fabricSource: e.target.value })}
              >
                {sampleFabricSourceOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Text variant='inactive' size='small'>
                {sampleFabricSourceHint}
              </Text>
            </label>

            <label className='flex flex-col gap-1'>
              <Text size='small'>notes</Text>
              <input
                className={cell}
                disabled={!canEdit}
                value={d.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </label>

            <Text variant='inactive' size='small'>
              Photos, fittings, provenance (round · spec release · previous sample) and extra dev
              expenses are added next, in the sample editor.
            </Text>
          </>
        )}

        {/* ---- STEP 2 · WRITE-OFF (списание материалов) ---- */}
        {step === 'materials' && (
          <>
            <Text variant='inactive' size='small'>
              Pick the sample-marked materials (purpose <b>sample</b> or <b>both</b>) consumed
              sewing this prototype, and how much of each. On confirm they're issued from stock —
              written off and attributed to this sample.
            </Text>

            {stockError ? (
              <div className='border border-textInactiveColor p-3'>
                <Text size='small'>
                  Stock is unavailable — the warehouse backend may not be deployed. You can still
                  create the sample now and record its material write-offs later from its
                  material-movements panel.
                </Text>
              </div>
            ) : sampleRows.length === 0 && !stockLoading ? (
              <div className='border border-textInactiveColor p-3'>
                <Text size='small'>No sample-marked materials in the catalog.</Text>
                <Text variant='inactive' size='small'>
                  Mark materials as “sample” or “both” in Materials → catalog to write them off
                  here.
                </Text>
              </div>
            ) : (
              <>
                {/* purpose-filtered picker (search + native select, sourced from stock so on-hand
                    shows inline). Selecting a row adds a write-off line. */}
                <div className='flex flex-col gap-1'>
                  <input
                    className={cell}
                    placeholder='search sample-marked material by name / code'
                    value={q}
                    disabled={!canEdit}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <select
                    className={cell}
                    value={0}
                    disabled={!canEdit || stockLoading}
                    onChange={(e) => {
                      addLine(Number(e.target.value) || 0);
                      setQ('');
                    }}
                  >
                    <option value={0}>
                      {stockLoading ? 'loading…' : '+ add material to write off'}
                    </option>
                    {pickerRows.map((r) => (
                      <option key={r.material?.id} value={r.material?.id}>
                        {materialLabel(r.material)} · {materialPurposeLabel(r.material?.purpose)} ·
                        on hand {decimalToInput(r.onHand) || '0'} {r.material?.unit ?? ''}
                      </option>
                    ))}
                  </select>
                </div>

                {lines.length === 0 ? (
                  <Text variant='inactive' size='small'>
                    No materials added yet — a sample can be created with no write-off, but its dev
                    cost stays 0 until materials are issued.
                  </Text>
                ) : (
                  <div className='flex flex-col gap-2'>
                    {lines.map((l) => {
                      const r = rowById.get(l.materialId);
                      const m = r?.material;
                      const unit = m?.unit ?? '';
                      const onHand = parseDecimalNumber(decimalToInput(r?.onHand));
                      const qn = lineQtyNum(l);
                      const over = Number.isFinite(qn) && Number.isFinite(onHand) && qn > onHand;
                      const avg = r?.avgUnitCostBase?.value;
                      const preview = linePreview(l.materialId, l.quantity);
                      return (
                        <div
                          key={l.materialId}
                          className='flex flex-wrap items-start gap-3 border border-textInactiveColor p-2'
                        >
                          <MaterialThumb material={m} size='sm' />
                          <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                            <Text size='small'>{materialLabel(m)}</Text>
                            <Text variant='inactive' size='small'>
                              {materialPurposeLabel(m?.purpose)} · on hand{' '}
                              {decimalToInput(r?.onHand) || '0'} {unit}
                              {canReadCosting && avg
                                ? ` · avg ${decimalToInput(r?.avgUnitCostBase)} ${baseCurrency}/${unit || 'unit'}`
                                : ''}
                            </Text>
                            {over ? (
                              <Text size='small' className='text-warning'>
                                ! exceeds stock by {(qn - onHand).toFixed(2)} {unit}
                              </Text>
                            ) : null}
                          </div>
                          <div className='flex flex-col gap-0.5'>
                            <input
                              className={`${cell} w-28`}
                              inputMode='decimal'
                              placeholder={`qty ${unit}`.trim()}
                              disabled={!canEdit}
                              value={l.quantity}
                              onChange={(e) =>
                                setLineQty(l.materialId, sanitizeDecimal(e.target.value))
                              }
                            />
                            {previewHasCost && preview != null ? (
                              <Text variant='inactive' size='small' className='text-right'>
                                ≈ {money(preview)}
                              </Text>
                            ) : null}
                          </div>
                          <Button
                            type='button'
                            variant='secondary'
                            className='uppercase'
                            onClick={() => removeLine(l.materialId)}
                          >
                            remove
                          </Button>
                        </div>
                      );
                    })}

                    {/* running dev-cost preview */}
                    <div className='flex items-center justify-between border-t border-textInactiveColor pt-2'>
                      <Text size='small' variant='uppercase'>
                        {validLines.length} material(s) to write off
                      </Text>
                      {previewHasCost ? (
                        <Text size='small'>dev cost ≈ {money(devCostPreview)}</Text>
                      ) : canReadCosting ? (
                        <Text variant='inactive' size='small'>
                          dev cost ≈ — (no unit cost on these materials yet)
                        </Text>
                      ) : (
                        <Text variant='inactive' size='small'>
                          dev cost hidden (no costing access)
                        </Text>
                      )}
                    </div>
                  </div>
                )}

                {materialsError ? (
                  <Text variant='error' size='small'>
                    {materialsError}
                  </Text>
                ) : null}
              </>
            )}
          </>
        )}

        {/* ---- STEP 3 · REVIEW ---- */}
        {step === 'review' && (
          <div className='flex flex-col gap-3'>
            <div className='border border-textInactiveColor'>
              <SummaryRow label='purpose' value={labelOf(samplePurposeOptions, d.purpose)} />
              <SummaryRow
                label='size'
                value={
                  d.sizeId
                    ? String(findInDictionary(dictionary, d.sizeId, 'size') || d.sizeId)
                    : '—'
                }
              />
              <SummaryRow
                label='colourway'
                value={colorwayText(colorways.find((c) => c.id === d.colorwayId))}
              />
              <SummaryRow label='status' value={labelOf(sampleStatusOptions, d.status)} />
              <SummaryRow
                label='fabric'
                value={labelOf(sampleFabricSourceOptions, d.fabricSource)}
              />
              {d.startedAt || d.finishedAt ? (
                <SummaryRow
                  label='dates'
                  value={`${d.startedAt || '—'} → ${d.finishedAt || '—'}`}
                />
              ) : null}
              {d.notes.trim() ? <SummaryRow label='notes' value={d.notes.trim()} /> : null}
            </div>

            <div className='flex flex-col gap-1'>
              <Text size='small' variant='uppercase'>
                materials to write off
              </Text>
              {validLines.length === 0 ? (
                <Text variant='inactive' size='small'>
                  None — the sample is created with no stock write-off (dev cost 0).
                </Text>
              ) : (
                <div className='border border-textInactiveColor'>
                  {validLines.map((l) => {
                    const r = rowById.get(l.materialId);
                    const preview = linePreview(l.materialId, l.quantity);
                    return (
                      <SummaryRow
                        key={l.materialId}
                        label={`${l.quantity} ${r?.material?.unit ?? ''}`.trim()}
                        value={`${materialLabel(r?.material)}${previewHasCost && preview != null ? ` · ≈ ${money(preview)}` : ''}`}
                      />
                    );
                  })}
                  {previewHasCost ? (
                    <div className='flex items-center justify-between px-3 py-1.5'>
                      <Text size='small' variant='uppercase'>
                        dev cost
                      </Text>
                      <Text size='small'>≈ {money(devCostPreview)}</Text>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            <Text variant='inactive' size='small'>
              On confirm: the sample is created, then each material above is issued from stock
              (attributed to this sample) — writing it off and composing the sample's dev cost. If a
              write-off fails, the sample is still created and you can retry or finish it from the
              movements panel.
            </Text>
            {!canEdit ? (
              <Text variant='error' size='small'>
                You don't have permission to create samples on this card.
              </Text>
            ) : null}
          </div>
        )}

        {/* ---- STEP 4 · RESULT (после списания) ---- */}
        {step === 'result' && (
          <div className='flex flex-col gap-3'>
            <Text size='small'>
              {okCount} of {results.length} material(s) written off
              {failCount > 0 ? ` · ${failCount} failed` : ''}.
            </Text>
            <div className='border border-textInactiveColor'>
              {results.map((r) => (
                <div
                  key={r.materialId}
                  className='flex items-start justify-between gap-3 border-b border-textInactiveColor/40 px-3 py-1.5 last:border-b-0'
                >
                  <div className='flex min-w-0 flex-col'>
                    <Text size='small'>{r.label}</Text>
                    <Text variant='inactive' size='small'>
                      {r.qty} {r.unit}
                      {r.ok && r.movement
                        ? ` · on hand ${decimalToInput(r.movement.onHandBefore) || '0'} → ${decimalToInput(r.movement.onHandAfter) || '0'}`
                        : ''}
                      {!r.ok && r.error ? ` · ${r.error}` : ''}
                    </Text>
                  </div>
                  <Text size='small' className={r.ok ? 'text-success' : 'text-error'}>
                    {r.ok ? '✓ issued' : '✗ failed'}
                  </Text>
                </div>
              ))}
            </div>

            {postedHasCost ? (
              <div className='flex items-center justify-between border-t border-textInactiveColor pt-2'>
                <Text size='small' variant='uppercase'>
                  dev cost written off
                </Text>
                <Text size='small'>{money(postedDevCost)}</Text>
              </div>
            ) : canReadCosting ? (
              <Text variant='inactive' size='small'>
                Dev cost composes from these movements — see the sample's cost in its editor.
              </Text>
            ) : null}

            {failCount > 0 ? (
              <Text variant='inactive' size='small'>
                The sample already exists. Retry the failed write-offs, or open the sample and
                finish them from its material-movements panel.
              </Text>
            ) : null}
          </div>
        )}
      </div>

      {/* footer nav */}
      <div className='sticky bottom-0 flex items-center justify-between gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
        {step === 'result' ? (
          <>
            <div>
              {failCount > 0 ? (
                <Button
                  type='button'
                  variant='secondary'
                  size='lg'
                  className='uppercase'
                  disabled={busy}
                  onClick={retryFailed}
                >
                  {busy ? 'issuing…' : 'retry failed'}
                </Button>
              ) : null}
            </div>
            <Button
              type='button'
              variant='main'
              size='lg'
              className='uppercase'
              onClick={() => onCreated(createdId)}
            >
              open sample →
            </Button>
          </>
        ) : (
          <>
            <div>
              <Button
                type='button'
                variant='secondary'
                size='lg'
                className='uppercase'
                onClick={() => {
                  if (step === 'basics') onCancel();
                  else setStep(step === 'review' ? 'materials' : 'basics');
                }}
              >
                {step === 'basics' ? 'cancel' : 'back'}
              </Button>
            </div>
            <div className='flex gap-2'>
              {step === 'basics' && (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='uppercase'
                  disabled={!canEdit}
                  onClick={() => setStep('materials')}
                >
                  materials →
                </Button>
              )}
              {step === 'materials' && (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='uppercase'
                  disabled={!canEdit || !!materialsError}
                  onClick={() => setStep('review')}
                >
                  review →
                </Button>
              )}
              {step === 'review' && (
                <Button
                  type='button'
                  variant='main'
                  size='lg'
                  className='uppercase'
                  disabled={!canEdit || busy}
                  onClick={confirm}
                >
                  {busy
                    ? 'creating…'
                    : validLines.length > 0
                      ? `create & write off ${validLines.length}`
                      : 'create sample'}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function labelOf(opts: { value: string; label: string }[], v: string): string {
  return opts.find((o) => o.value === v)?.label ?? v ?? '—';
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-start justify-between gap-3 border-b border-textInactiveColor/40 px-3 py-1.5 last:border-b-0'>
      <Text size='small' variant='inactive' className='uppercase'>
        {label}
      </Text>
      <Text size='small' className='text-right'>
        {value}
      </Text>
    </div>
  );
}
