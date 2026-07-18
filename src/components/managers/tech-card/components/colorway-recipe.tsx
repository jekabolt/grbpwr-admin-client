import {
  common_AdminColorwayRef,
  common_TechCard,
  common_TechCardColorwayUsage,
} from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardLabDipStatusOptions } from 'constants/filter';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import {
  createColorwayErrorMessage,
  recipeSaveErrorMessage,
  useCreateColorway,
  useUpdateColorwayRecipe,
} from './useColorwayRecipe';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

const REJECTED = 'TECH_CARD_LAB_DIP_STATUS_REJECTED';

// Measured sections cost by a rate (consumption, per metre/gram) and support per-size grading; the
// rest are counted (quantity, per piece). Mirrors colorways-field.tsx so the per-size grid only
// appears where it's meaningful.
const MEASURED_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INTERLINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
  'TECH_CARD_BOM_SECTION_THREAD',
]);

type BomLine = {
  id?: number;
  lineKey?: string;
  name?: string;
  section?: string;
  unit?: string;
  unitPrice?: string; // decimal string
  currency?: string;
  wastagePercent?: string; // decimal string
  composition?: string; // legacy free-text (never structured, M1)
};

type UsageDraft = {
  bomLineKey: string;
  placement: string;
  color: string;
  pantone: string;
  consumption: string;
  quantity: string;
  // preserved verbatim across the full-replace so a save never drops per-size grading / piece links.
  sizeConsumptions: { sizeId?: number; consumption?: string }[];
  pieceLineKey: string;
  // display-only (server-computed, stripped without costing:read).
  lineTotal: string;
  sizeRunTotal: string;
};

// Lab-dip editing state (M8). Local-only — see LabDipEditor for why it isn't persisted yet.
type LabDipDraft = {
  labDipStatus: string;
  labDipRound: string;
  labDipSubmittedAt: string;
  labDipDecidedAt: string;
  labDipDecidedBy: string;
  labDipRejectReason: string;
};
const emptyLabDip: LabDipDraft = {
  labDipStatus: 'TECH_CARD_LAB_DIP_STATUS_PENDING',
  labDipRound: '',
  labDipSubmittedAt: '',
  labDipDecidedAt: '',
  labDipDecidedBy: '',
  labDipRejectReason: '',
};

function measured(section?: string): boolean {
  return !section || MEASURED_SECTIONS.has(section);
}

// Resolve a stored usage into a draft. bom_line_key is the durable ref; fall back to resolving the
// server bom_item_id against the saved BOM lines so a legacy usage still points at the right line.
function fromRead(u: common_TechCardColorwayUsage, bomItems: BomLine[]): UsageDraft {
  const byId = u.bomItemId ? bomItems.find((b) => b.id === u.bomItemId)?.lineKey : undefined;
  return {
    bomLineKey: u.bomLineKey || byId || '',
    placement: u.placement || '',
    color: u.color || '',
    pantone: u.pantone || '',
    consumption: decimalToInput(u.consumption),
    quantity: decimalToInput(u.quantity),
    sizeConsumptions: (u.sizeConsumptions ?? []).map((s) => ({
      sizeId: s.sizeId,
      consumption: decimalToInput(s.consumption),
    })),
    pieceLineKey: u.pieceLineKey || '',
    lineTotal: decimalToInput(u.lineTotal),
    sizeRunTotal: decimalToInput(u.sizeRunTotal),
  };
}

function toWire(d: UsageDraft): common_TechCardColorwayUsage {
  return {
    // durable ref (§2.3); the server resolves it to the real FK — positional index/id not sent.
    bomLineKey: d.bomLineKey || '',
    bomItemIndex: undefined,
    bomItemId: undefined,
    placement: d.placement.trim(),
    color: d.color.trim(),
    pantone: d.pantone.trim(),
    consumption: inputToDecimal(d.consumption),
    quantity: inputToDecimal(d.quantity),
    sizeConsumptions: (d.sizeConsumptions ?? [])
      .filter((s) => s.sizeId)
      .map((s) => ({ sizeId: s.sizeId, consumption: inputToDecimal(s.consumption) })),
    pieceLineKey: d.pieceLineKey || '',
    pieceId: undefined,
    pieceIndex: undefined,
    // output-only — never sent
    lineTotal: undefined,
    sizeRunTotal: undefined,
  };
}

// Client-side preview of the whole-run spend for a measured usage (the backend computes the
// authoritative size_run_total): Σ(consumption_size × orderQty_size) × price × (1 + wastage%).
function runTotalPreview(
  sizeIds: number[],
  consumptionBySize: Map<number, string>,
  orderQtyBySize: Map<number, number>,
  unitPrice: string,
  wastagePercent: string,
): string {
  const price = Number(unitPrice);
  if (!unitPrice.trim() || Number.isNaN(price)) return '';
  let units = 0;
  let any = false;
  for (const id of sizeIds) {
    const raw = consumptionBySize.get(id);
    const c = Number(raw);
    if (raw?.trim() && !Number.isNaN(c)) {
      units += c * (orderQtyBySize.get(id) ?? 0);
      any = true;
    }
  }
  if (!any || units === 0) return '';
  const wastage = Number(wastagePercent) || 0;
  const total = units * price * (1 + wastage / 100);
  return Number.isFinite(total) ? String(Number(total.toFixed(2))) : '';
}

// #29 — best-effort DERIVED fibre composition for a colourway, computed from its recipe's BOM lines.
// The BOM line `composition` is legacy FREE TEXT (never structured, M1), so this parses "NN% fibre"
// tokens and weights each line's fibres by that usage's per-garment consumption (fallback: equal
// weight), then normalises to 100%. Approximate by construction — flagged in the UI. A precise
// weighted composition needs a structured per-material composition on the backend (see report).
function deriveComposition(
  usages: UsageDraft[],
  bomItems: BomLine[],
): { fibers: { name: string; percent: number }[]; skipped: number } {
  const totals = new Map<string, number>();
  let skipped = 0;
  for (const u of usages) {
    if (!u.bomLineKey) continue;
    const line = bomItems.find((b) => b.lineKey === u.bomLineKey);
    const comp = line?.composition?.trim();
    const weight = Number(u.consumption) > 0 ? Number(u.consumption) : 1;
    const tokens = comp ? [...comp.matchAll(/(\d+(?:\.\d+)?)\s*%\s*([\p{L}][\p{L} .\-/]*)/gu)] : [];
    if (tokens.length === 0) {
      skipped += 1;
      continue;
    }
    for (const t of tokens) {
      const pct = Number(t[1]);
      const name = t[2].trim().toLowerCase();
      if (!name || !Number.isFinite(pct)) continue;
      totals.set(name, (totals.get(name) ?? 0) + (pct / 100) * weight);
    }
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  if (sum <= 0) return { fibers: [], skipped };
  const fibers = [...totals.entries()]
    .map(([name, v]) => ({ name, percent: Math.round((v / sum) * 1000) / 10 }))
    .sort((a, b) => b.percent - a.percent);
  return { fibers, skipped };
}

// Per-size consumption grading for one measured usage (ported from colorways-field.tsx into the
// live local-state editor, M8/§296). A toggle switches «один на изделие» (the single consumption)
// ↔ «по размерам» (one input per declared card size), with a live run-cost preview using the
// referenced article's price/wastage.
function UsagePerSizeLocal({
  draft,
  sizeIds,
  sizeQuantities,
  article,
  canEdit,
  sizeNameById,
  onChange,
}: {
  draft: UsageDraft;
  sizeIds: number[];
  sizeQuantities: { sizeId?: number; orderQty?: number }[];
  article?: BomLine;
  canEdit: boolean;
  sizeNameById: Map<number, string>;
  onChange: (patch: Partial<UsageDraft>) => void;
}) {
  const perSize = draft.sizeConsumptions.length > 0;
  const lastPerSize = useRef<{ sizeId: number; consumption: string }[]>([]);

  const consumptionBySize = new Map<number, string>();
  for (const e of draft.sizeConsumptions)
    if (e.sizeId != null) consumptionBySize.set(e.sizeId, e.consumption ?? '');
  const orderQtyBySize = new Map<number, number>();
  for (const q of sizeQuantities) if (q.sizeId) orderQtyBySize.set(q.sizeId, q.orderQty ?? 0);

  const enablePerSize = () => {
    if (perSize) return;
    const prior = new Map(lastPerSize.current.map((e) => [e.sizeId, e.consumption]));
    onChange({
      sizeConsumptions: sizeIds.map((id) => ({
        sizeId: id,
        consumption: prior.get(id) ?? draft.consumption ?? '',
      })),
    });
  };
  const disablePerSize = () => {
    if (!perSize) return;
    lastPerSize.current = draft.sizeConsumptions.map((e) => ({
      sizeId: e.sizeId ?? 0,
      consumption: e.consumption ?? '',
    }));
    onChange({ sizeConsumptions: [] });
  };
  const setSizeCell = (sizeId: number, value: string) => {
    const clean = sanitizeDecimal(value);
    const next = [...draft.sizeConsumptions];
    const i = next.findIndex((x) => x.sizeId === sizeId);
    if (i >= 0) next[i] = { sizeId, consumption: clean };
    else next.push({ sizeId, consumption: clean });
    onChange({ sizeConsumptions: next });
  };

  const preview = runTotalPreview(
    sizeIds,
    consumptionBySize,
    orderQtyBySize,
    article?.unitPrice ?? '',
    article?.wastagePercent ?? '',
  );
  const currency = article?.currency ?? '';
  const unit = article?.unit?.trim() || '';
  const hasOrderQty = sizeIds.some((id) => (orderQtyBySize.get(id) ?? 0) > 0);
  const hasAnyConsumption = sizeIds.some((id) => consumptionBySize.get(id)?.trim());

  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <Text variant='uppercase' size='small'>
          consumption{unit ? ` (${unit})` : ''}
        </Text>
        {sizeIds.length > 0 && canEdit && (
          <div className='flex gap-1'>
            <button
              type='button'
              onClick={disablePerSize}
              className={cn(
                'border px-2 py-1 text-textBaseSize uppercase transition-colors',
                !perSize
                  ? 'border-textColor bg-textColor text-bgColor'
                  : 'border-textInactiveColor text-textColor',
              )}
            >
              один на изделие
            </button>
            <button
              type='button'
              onClick={enablePerSize}
              className={cn(
                'border px-2 py-1 text-textBaseSize uppercase transition-colors',
                perSize
                  ? 'border-textColor bg-textColor text-bgColor'
                  : 'border-textInactiveColor text-textColor',
              )}
            >
              по размерам
            </button>
          </div>
        )}
      </div>

      {!perSize ? (
        <input
          className={cell}
          inputMode='decimal'
          disabled={!canEdit}
          placeholder='per garment'
          value={draft.consumption}
          onChange={(e) => onChange({ consumption: sanitizeDecimal(e.target.value) })}
        />
      ) : (
        <div className='space-y-2'>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'>
            {sizeIds.map((id) => (
              <div key={id} className='space-y-1'>
                <Text variant='uppercase' size='small'>
                  {formatSizeName(sizeNameById.get(id) ?? `#${id}`)}
                </Text>
                <input
                  className={cell}
                  inputMode='decimal'
                  disabled={!canEdit}
                  placeholder='0.00'
                  value={consumptionBySize.get(id) ?? ''}
                  onChange={(e) => setSizeCell(id, e.target.value)}
                />
              </div>
            ))}
          </div>
          <div className='flex flex-wrap items-baseline gap-x-3 gap-y-1'>
            <Text variant='uppercase' size='small'>
              расход на партию ≈ {preview ? `${preview} ${currency}`.trim() : '—'}
            </Text>
            {draft.sizeRunTotal && (
              <Text variant='inactive' size='small'>
                сохранённое: {draft.sizeRunTotal} {currency}
              </Text>
            )}
          </div>
          {hasAnyConsumption && !hasOrderQty && (
            <Text size='small' className='block text-warning'>
              заполните тираж по размерам (patterns → size run), чтобы посчитать расход на партию
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

// One usage row = one material on one part in this colourway.
function UsageRowEditor({
  index,
  draft,
  bomItems,
  sizeIds,
  sizeQuantities,
  sizeNameById,
  canEdit,
  colorwayColorLabel,
  onChange,
  onRemove,
}: {
  index: number;
  draft: UsageDraft;
  bomItems: BomLine[];
  sizeIds: number[];
  sizeQuantities: { sizeId?: number; orderQty?: number }[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  colorwayColorLabel: string;
  onChange: (patch: Partial<UsageDraft>) => void;
  onRemove: () => void;
}) {
  const article = draft.bomLineKey
    ? bomItems.find((b) => b.lineKey === draft.bomLineKey)
    : undefined;
  const isMeasured = measured(article?.section);
  const unit = article?.unit?.trim() || '';

  return (
    <div className='flex flex-col gap-2 border border-textInactiveColor p-2'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          {draft.placement.trim() || `material ${index + 1}`}
          {article?.name?.trim() ? ` · ${article.name.trim()}` : ''}
        </Text>
        {canEdit && (
          <Button type='button' variant='secondary' aria-label='remove material' onClick={onRemove}>
            ✕
          </Button>
        )}
      </div>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <label className='flex flex-col gap-1'>
          <Text size='small'>BOM article *</Text>
          <select
            className={cn(cell, !draft.bomLineKey && 'border-error')}
            disabled={!canEdit}
            value={draft.bomLineKey}
            onChange={(e) => onChange({ bomLineKey: e.target.value })}
          >
            <option value=''>— select article —</option>
            {/* keep an unknown stored key selectable so a save never silently drops it */}
            {draft.bomLineKey && !bomItems.some((b) => b.lineKey === draft.bomLineKey) ? (
              <option value={draft.bomLineKey}>(unknown / removed article)</option>
            ) : null}
            {bomItems.map((b, bi) => (
              <option key={b.lineKey} value={b.lineKey}>
                {bi + 1}. {b.name?.trim() || 'unnamed'}
              </option>
            ))}
          </select>
        </label>
        <label className='flex flex-col gap-1'>
          <Text size='small'>placement (part)</Text>
          <input
            className={cell}
            disabled={!canEdit}
            placeholder='outer / lining / collar…'
            value={draft.placement}
            onChange={(e) => onChange({ placement: e.target.value })}
          />
        </label>
      </div>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
        <label className='flex flex-col gap-1'>
          <Text size='small'>colour (override)</Text>
          <input
            className={cell}
            disabled={!canEdit}
            placeholder={colorwayColorLabel || 'colourway colour'}
            value={draft.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </label>
        <label className='flex flex-col gap-1'>
          <Text size='small'>pantone (override)</Text>
          <input
            className={cell}
            disabled={!canEdit}
            placeholder='colourway pantone'
            value={draft.pantone}
            onChange={(e) => onChange({ pantone: e.target.value })}
          />
        </label>
      </div>

      {/* measured articles cost by a rate (per-size gradable); counted ones by a flat quantity (M14) */}
      {isMeasured ? (
        <UsagePerSizeLocal
          draft={draft}
          sizeIds={sizeIds}
          sizeQuantities={sizeQuantities}
          article={article}
          canEdit={canEdit}
          sizeNameById={sizeNameById}
          onChange={onChange}
        />
      ) : (
        <label className='flex flex-col gap-1'>
          <Text size='small'>quantity{unit ? ` (${unit})` : ''}</Text>
          <input
            className={cell}
            inputMode='decimal'
            disabled={!canEdit}
            value={draft.quantity}
            onChange={(e) => onChange({ quantity: sanitizeDecimal(e.target.value) })}
          />
        </label>
      )}

      {/* server-computed spend — present only with costing:read (stripped otherwise) */}
      {(draft.lineTotal || draft.sizeRunTotal) && (
        <Text variant='inactive' size='small'>
          {draft.lineTotal ? `per garment ${draft.lineTotal}` : ''}
          {draft.lineTotal && draft.sizeRunTotal ? ' · ' : ''}
          {draft.sizeRunTotal ? `run ${draft.sizeRunTotal}` : ''}
        </Text>
      )}
    </div>
  );
}

// Lab-dip approval lifecycle (M8). BACKEND GAP: the tech-card read model (AdminColorwayRef) exposes
// NO lab-dip fields, and the write RPC (UpdateColorway.development) needs the colourway's own
// lockVersion (also absent from AdminColorwayRef) + is a shared submessage that also carries the
// recipe usages / merch dev fields, so a blind write would clobber them. Until the backend surfaces
// lab-dip on the read path (and a safe, field-masked write keyed by a readable version), this editor
// is LOCAL-ONLY — it is wired as far as it safely can be, and clearly flagged as non-persistent so no
// one mistakes it for saved. See report for the exact backend requirements.
function LabDipEditor({ canEdit }: { canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LabDipDraft>(emptyLabDip);
  const set = (patch: Partial<LabDipDraft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className='border-t border-textInactiveColor pt-3'>
      <button
        type='button'
        className='flex w-full items-center justify-between gap-2 text-left'
        onClick={() => setOpen((o) => !o)}
      >
        <Text variant='uppercase' size='small'>
          {open ? '▾' : '▸'} lab-dip
        </Text>
        <Text variant='inactive' size='small'>
          not persisted yet
        </Text>
      </button>
      {open && (
        <div className='mt-3 flex flex-col gap-3'>
          <div className='border border-warning bg-highlightColor/10 p-2'>
            <Text size='small' className='text-warning'>
              Lab-dip approval is not saved yet — the tech-card read model exposes no lab-dip fields
              to load or persist against (backend gap). Edits here are local only.
            </Text>
          </div>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <label className='flex flex-col gap-1'>
              <Text size='small'>status</Text>
              <select
                className={cell}
                disabled={!canEdit}
                value={draft.labDipStatus}
                onChange={(e) => set({ labDipStatus: e.target.value })}
              >
                {techCardLabDipStatusOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>round</Text>
              <input
                className={cell}
                type='number'
                min='0'
                disabled={!canEdit}
                value={draft.labDipRound}
                onChange={(e) => set({ labDipRound: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>submitted</Text>
              <input
                className={cell}
                type='date'
                disabled={!canEdit}
                value={draft.labDipSubmittedAt}
                onChange={(e) => set({ labDipSubmittedAt: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>decided</Text>
              <input
                className={cell}
                type='date'
                disabled={!canEdit}
                value={draft.labDipDecidedAt}
                onChange={(e) => set({ labDipDecidedAt: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>decided by</Text>
              <input
                className={cell}
                disabled={!canEdit}
                value={draft.labDipDecidedBy}
                onChange={(e) => set({ labDipDecidedBy: e.target.value })}
              />
            </label>
          </div>
          {draft.labDipStatus === REJECTED && (
            <label className='flex flex-col gap-1'>
              <Text size='small'>reject reason</Text>
              <textarea
                className={cell}
                rows={2}
                maxLength={1000}
                disabled={!canEdit}
                value={draft.labDipRejectReason}
                onChange={(e) => set({ labDipRejectReason: e.target.value })}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}

function ColorwayRecipeEditor({
  colorway,
  bomItems,
  sizeIds,
  sizeQuantities,
  sizeNameById,
  lockVersion,
  techCardId,
  canEdit,
}: {
  colorway: common_AdminColorwayRef;
  bomItems: BomLine[];
  sizeIds: number[];
  sizeQuantities: { sizeId?: number; orderQty?: number }[];
  sizeNameById: Map<number, string>;
  lockVersion: number;
  techCardId: number;
  canEdit: boolean;
}) {
  const { showMessage } = useSnackBarStore();
  const save = useUpdateColorwayRecipe(techCardId);
  const { dictionary } = useDictionary();
  // #34: a usage row's color/pantone is an OPTIONAL override — resolve the colourway's own dictionary
  // colour once so every row can placeholder/hint against it.
  const colorwayColor = useMemo(
    () => (dictionary?.colors ?? []).find((c) => c.code === colorway.colorCode),
    [dictionary?.colors, colorway.colorCode],
  );
  const colorwayColorLabel = colorwayColor?.name?.trim() || colorway.colorCode?.trim() || '';
  const [open, setOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  // CRITICAL (full-replace): initialise from the LIVE read (colorway.usages), never from empty. Re-sync
  // when the read changes (after a save's refetch) unless the user has unsaved edits.
  const [usages, setUsages] = useState<UsageDraft[]>(() =>
    (colorway.usages ?? []).map((u) => fromRead(u, bomItems)),
  );
  useEffect(() => {
    if (dirty) return;
    setUsages((colorway.usages ?? []).map((u) => fromRead(u, bomItems)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorway.usages, dirty]);

  const setRow = (i: number, patch: Partial<UsageDraft>) => {
    setDirty(true);
    setUsages((prev) => prev.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
  };
  const addRow = () => {
    setDirty(true);
    setUsages((prev) => [
      ...prev,
      {
        bomLineKey: '',
        placement: '',
        color: '',
        pantone: '',
        consumption: '',
        quantity: '',
        sizeConsumptions: [],
        pieceLineKey: '',
        lineTotal: '',
        sizeRunTotal: '',
      },
    ]);
  };
  const removeRow = (i: number) => {
    setDirty(true);
    setUsages((prev) => prev.filter((_, idx) => idx !== i));
  };

  const submit = () => {
    // M8: never silently drop a half-filled row. A usage without a BOM article can't be persisted
    // (bom_line_key is the recipe key) — block the save and name the offending rows instead of the
    // old `usages.filter(u => u.bomLineKey)` that made them vanish with a bare "Recipe saved".
    const incomplete = usages.map((u, i) => (u.bomLineKey ? -1 : i + 1)).filter((n) => n > 0);
    if (incomplete.length > 0) {
      showMessage(
        `Pick a BOM article for material ${incomplete.join(', ')} (or remove ${
          incomplete.length === 1 ? 'it' : 'them'
        }) before saving`,
        'error',
      );
      return;
    }
    save.mutate(
      {
        colorwayId: colorway.colorwayId ?? 0,
        expectedColorwayVersion: lockVersion,
        usages: usages.map(toWire),
      },
      {
        onSuccess: () => {
          setDirty(false);
          showMessage('Recipe saved', 'success');
        },
        onError: (e) => showMessage(recipeSaveErrorMessage(e), 'error'),
      },
    );
  };

  const title = `${colorway.colorCode?.trim() || colorway.baseSku?.trim() || `#${colorway.colorwayId}`}`;
  const swatchHex = colorwayColor?.hex;
  const derived = useMemo(() => deriveComposition(usages, bomItems), [usages, bomItems]);

  return (
    <div className='border border-textInactiveColor'>
      <button
        type='button'
        className='flex w-full items-center justify-between gap-2 p-3 text-left'
        onClick={() => setOpen((o) => !o)}
      >
        <span className='flex min-w-0 items-center gap-2'>
          {/* P2: swatch tile in the collapsed row, not only once expanded */}
          <span
            className='size-3.5 shrink-0 border border-textInactiveColor'
            style={swatchHex ? { backgroundColor: swatchHex } : undefined}
            title={swatchHex || undefined}
            aria-hidden
          />
          <Text variant='uppercase' size='small' className='truncate'>
            {open ? '▾' : '▸'} {title}
            {colorway.baseSku ? ` · ${colorway.baseSku}` : ''}
          </Text>
        </span>
        <Text variant='inactive' size='small'>
          {usages.length} material{usages.length === 1 ? '' : 's'}
          {dirty ? ' · unsaved' : ''}
        </Text>
      </button>

      {open && (
        <div className='flex flex-col gap-3 border-t border-textInactiveColor p-3'>
          <Text variant='inactive' size='small'>
            Colour / pantone below are optional per-material overrides — leave them empty to use
            this colourway’s own colour
            {colorwayColorLabel ? ` (${colorwayColorLabel})` : ''}
            {swatchHex ? (
              <span
                className='ml-1.5 inline-block h-3 w-3 shrink-0 translate-y-[1px] border border-textInactiveColor align-middle'
                style={{ backgroundColor: swatchHex }}
                title={swatchHex}
              />
            ) : null}
            . Set them only when this article is dyed differently for this colourway or is a
            contrast trim/hardware.
          </Text>
          {usages.length === 0 ? (
            <Text variant='inactive' size='small'>
              no materials in this colourway’s recipe yet
            </Text>
          ) : (
            usages.map((u, i) => (
              <UsageRowEditor
                key={i}
                index={i}
                draft={u}
                bomItems={bomItems}
                sizeIds={sizeIds}
                sizeQuantities={sizeQuantities}
                sizeNameById={sizeNameById}
                canEdit={canEdit}
                colorwayColorLabel={colorwayColorLabel}
                onChange={(patch) => setRow(i, patch)}
                onRemove={() => removeRow(i)}
              />
            ))
          )}

          {/* #29 derived composition — approximate, parsed from BOM free-text, weighted by consumption */}
          {derived.fibers.length > 0 && (
            <div className='border border-textInactiveColor p-2'>
              <Text variant='uppercase' size='small'>
                derived composition (approx · from BOM)
              </Text>
              <Text size='small' className='mt-1'>
                {derived.fibers.map((f) => `${f.percent}% ${f.name}`).join(' · ')}
              </Text>
              <Text variant='inactive' size='small' className='mt-1 block'>
                parsed from each article’s free-text composition, weighted by consumption
                {derived.skipped > 0
                  ? ` · ${derived.skipped} article${derived.skipped > 1 ? 's' : ''} excluded (no readable composition)`
                  : ''}
              </Text>
            </div>
          )}

          <LabDipEditor canEdit={canEdit} />

          {canEdit && (
            <div className='flex items-center justify-between'>
              <Button
                type='button'
                variant='secondary'
                className='uppercase'
                disabled={bomItems.length === 0}
                onClick={addRow}
              >
                + material
              </Button>
              <Button
                type='button'
                variant='main'
                size='lg'
                className='uppercase'
                disabled={save.isPending || !dirty}
                loading={save.isPending}
                onClick={submit}
              >
                save recipe
              </Button>
            </div>
          )}
          {canEdit && bomItems.length === 0 && (
            <Text variant='inactive' size='small'>
              add BOM articles first — then pick them here for each part of the garment
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

// #35: inline "create colourway" — until now the recipe editor could only edit EXISTING colourways
// (techCard.colorways); making a new one meant leaving for the product manager and coming back
// (ping-pong). This spins up a minimal DRAFT (colour only, via CreateColorway) without leaving the
// tech card; onCreated (the caller's query invalidation) refreshes techCard.colorways so the new
// colourway's recipe editor appears in the list immediately.
function CreateColorwayInline({
  techCardId,
  usedCodes,
  canEdit,
}: {
  techCardId: number;
  usedCodes: Set<string>;
  canEdit: boolean;
}) {
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  const create = useCreateColorway(techCardId);
  const [open, setOpen] = useState(false);
  const [colorCode, setColorCode] = useState('');

  if (!canEdit) return null;

  const availableColors = (dictionary?.colors ?? []).filter((c) => !c.archived && c.code);

  const close = () => {
    setOpen(false);
    setColorCode('');
  };

  const submit = () => {
    if (!colorCode) {
      showMessage('Pick a colour', 'error');
      return;
    }
    create.mutate(colorCode, {
      onSuccess: () => {
        showMessage('Draft colourway created', 'success');
        close();
      },
      onError: (e) => showMessage(createColorwayErrorMessage(e), 'error'),
    });
  };

  if (!open) {
    return (
      <Button type='button' variant='secondary' className='uppercase' onClick={() => setOpen(true)}>
        + create colourway
      </Button>
    );
  }

  return (
    <div className='flex flex-col gap-2 border border-textInactiveColor p-3'>
      <Text variant='uppercase' size='small'>
        new colourway
      </Text>
      {availableColors.length === 0 ? (
        <Text variant='inactive' size='small'>
          no colours in the dictionary yet — add them under settings › colors
        </Text>
      ) : (
        <div className='flex flex-wrap items-end gap-2'>
          <label className='flex flex-col gap-1'>
            <Text size='small'>colour</Text>
            <select
              className={cell}
              value={colorCode}
              onChange={(e) => setColorCode(e.target.value)}
            >
              <option value=''>— select colour —</option>
              {availableColors.map((c) => (
                <option key={c.code} value={c.code} disabled={usedCodes.has(c.code ?? '')}>
                  {c.code} · {c.name}
                  {usedCodes.has(c.code ?? '') ? ' (already on this style)' : ''}
                </option>
              ))}
            </select>
          </label>
          <Button
            type='button'
            variant='main'
            disabled={create.isPending || !colorCode}
            loading={create.isPending}
            onClick={submit}
          >
            create
          </Button>
          <Button type='button' variant='secondary' onClick={close}>
            cancel
          </Button>
        </div>
      )}
      <Text variant='inactive' size='small'>
        Creates a DRAFT colourway (colour only) so its recipe can be edited below — add media, price
        and the rest from the product manager afterwards.
      </Text>
    </div>
  );
}

// Colourway recipes (H1/§2.3): the constructor view of each colourway's material recipe, now that the
// read-path surfaces usages. Edited per colourway and saved via UpdateColorwayRecipe (full-replace).
export function ColorwayRecipes({
  techCard,
  techCardId,
  canEdit,
}: {
  techCard?: common_TechCard;
  techCardId: number;
  canEdit: boolean;
}) {
  const { dictionary } = useDictionary();
  const colorways = techCard?.colorways ?? [];
  // Enrich BOM lines with the fields the recipe editor now needs: price/wastage/unit for the run-cost
  // preview (per-size grading) and the legacy composition string for the derived-composition summary.
  const bomItems = useMemo<BomLine[]>(
    () =>
      (techCard?.techCard?.bomItems ?? [])
        .filter((b) => !!b.lineKey)
        .map((b) => ({
          id: b.id,
          lineKey: b.lineKey,
          name: b.name,
          section: b.section,
          unit: b.unit,
          unitPrice: decimalToInput(b.unitPrice),
          currency: b.currency,
          wastagePercent: decimalToInput(b.wastagePercent),
          composition: b.composition,
        })),
    [techCard?.techCard?.bomItems],
  );
  const sizeIds = (techCard?.techCard?.sizeIds ?? []) as number[];
  const sizeQuantities = (techCard?.techCard?.sizeQuantities ?? []) as {
    sizeId?: number;
    orderQty?: number;
  }[];
  const sizeNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);
  const lockVersion = techCard?.lockVersion ?? 0;
  const usedCodes = useMemo(
    () => new Set(colorways.map((c) => c.colorCode ?? '').filter(Boolean)),
    [colorways],
  );

  if (colorways.length === 0) {
    return (
      <div className='flex flex-col gap-3'>
        <Text variant='inactive' size='small'>
          no colourways yet — a colourway is a product. Create a draft below, or from the product
          manager, then its material recipe is edited here.
        </Text>
        <CreateColorwayInline techCardId={techCardId} usedCodes={usedCodes} canEdit={canEdit} />
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-3'>
      <Text variant='inactive' size='small'>
        Which catalog article goes on which part, in what colour and at what consumption — per
        colourway. Saved independently (does not ride the tech-card save).
      </Text>
      {colorways.map((cw) => (
        <ColorwayRecipeEditor
          key={cw.colorwayId}
          colorway={cw}
          bomItems={bomItems}
          sizeIds={sizeIds}
          sizeQuantities={sizeQuantities}
          sizeNameById={sizeNameById}
          lockVersion={lockVersion}
          techCardId={techCardId}
          canEdit={canEdit}
        />
      ))}
      <CreateColorwayInline techCardId={techCardId} usedCodes={usedCodes} canEdit={canEdit} />
    </div>
  );
}
