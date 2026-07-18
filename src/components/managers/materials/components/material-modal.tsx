import {
  common_CompositionEntry,
  common_Material,
  common_MaterialClass,
  common_MaterialPurpose,
  common_MediaFull,
  common_TechCardBomSection,
} from 'api/proto-http/admin';
import { MediaPreviewWithSelector } from 'components/managers/media/components/media-preview-with-selector';
import { techCardBomSectionOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { decimalToInput, inputToDecimal, parseDecimalNumber, sanitizeDecimal } from 'utils/decimal';
import { fieldErrorSummary } from 'utils/field-errors';
import { CompositionWizard, type CompRow } from './composition-wizard';
import { mediaThumbUrl } from './material-thumb';
import { materialPurposeOptions, resolveMaterialPurpose } from './purpose-options';
import { useSaveMaterial } from './useMaterials';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

// CTI typing (S15/PLM-rework Q5): material_class selects which typed attribute set below applies.
// MATERIAL_CLASS_UNKNOWN is not offered as a choice — legacy rows are resolved to FABRIC or OTHER
// on load (see resolveMaterialClass) and every save writes one of these five.
const materialClassOptions: Array<{ value: common_MaterialClass; label: string }> = [
  { value: 'MATERIAL_CLASS_FABRIC', label: 'fabric' },
  { value: 'MATERIAL_CLASS_HARDWARE', label: 'hardware' },
  { value: 'MATERIAL_CLASS_THREAD', label: 'thread' },
  { value: 'MATERIAL_CLASS_PACKAGING', label: 'packaging' },
  { value: 'MATERIAL_CLASS_OTHER', label: 'other' },
];

const fabricDirectionOptions: Array<{ value: string; label: string }> = [
  { value: '', label: '— unset —' },
  { value: 'lengthwise', label: 'lengthwise' },
  { value: 'crosswise', label: 'crosswise' },
  { value: 'any', label: 'any' },
];

// section -> default material_class on CREATE (defaultSection comes from e.g. the packaging aux
// output picker). Sections with no natural class (trim/label) fall back to OTHER.
const classForSection = (section: common_TechCardBomSection): common_MaterialClass => {
  switch (section) {
    case 'TECH_CARD_BOM_SECTION_PACKAGING':
      return 'MATERIAL_CLASS_PACKAGING';
    case 'TECH_CARD_BOM_SECTION_HARDWARE':
      return 'MATERIAL_CLASS_HARDWARE';
    case 'TECH_CARD_BOM_SECTION_THREAD':
      return 'MATERIAL_CLASS_THREAD';
    case 'TECH_CARD_BOM_SECTION_FABRIC':
    case 'TECH_CARD_BOM_SECTION_LINING':
    case 'TECH_CARD_BOM_SECTION_INTERLINING':
    case 'TECH_CARD_BOM_SECTION_INSULATION':
      return 'MATERIAL_CLASS_FABRIC';
    default:
      return 'MATERIAL_CLASS_OTHER';
  }
};

// Inverse of classForSection for the three classes that map 1:1 to a BOM section: the section is
// derived from the class instead of being asked for a second time (killing the class-vs-section
// contradiction). FABRIC and OTHER are intentionally absent — FABRIC fans out to
// fabric/lining/interlining/insulation and OTHER to trim/label — so those two keep an explicit
// section select. Both class AND section stay persisted regardless (see submit + draftFromMaterial).
const SECTION_FOR_CLASS: Partial<Record<common_MaterialClass, common_TechCardBomSection>> = {
  MATERIAL_CLASS_HARDWARE: 'TECH_CARD_BOM_SECTION_HARDWARE',
  MATERIAL_CLASS_THREAD: 'TECH_CARD_BOM_SECTION_THREAD',
  MATERIAL_CLASS_PACKAGING: 'TECH_CARD_BOM_SECTION_PACKAGING',
};
// A 1:1 section (control hidden, value auto-derived) for hardware/thread/packaging; undefined for
// FABRIC/OTHER, whose section stays operator-chosen via the still-visible select.
const derivedSection = (cls: common_MaterialClass): common_TechCardBomSection | undefined =>
  SECTION_FOR_CLASS[cls];

// Legacy rows predate CTI typing and carry MATERIAL_CLASS_UNKNOWN (or no typed attrs at all).
// Infer FABRIC when the old flat fields carry data (the pre-migration catalog was fabric-only),
// else OTHER — so the class select never opens on the unofferable UNKNOWN value.
const resolveMaterialClass = (m: common_Material): common_MaterialClass => {
  if (m.materialClass && m.materialClass !== 'MATERIAL_CLASS_UNKNOWN') return m.materialClass;
  const legacyHasData = !!(m.fabricWidth?.value || m.fabricWeightGsm?.value || m.composition);
  return legacyHasData ? 'MATERIAL_CLASS_FABRIC' : 'MATERIAL_CLASS_OTHER';
};

type FabricDraft = {
  widthCm: string;
  weightGsm: string;
  fabricDirection: string;
  shrinkagePct: string;
  rollLengthM: string;
};
type HardwareDraft = {
  diameterMm: string;
  dimensions: string;
  finish: string;
  baseMaterial: string;
  weightG: string;
};
type ThreadDraft = {
  ticketTex: string;
  lengthPerConeM: string;
  needleReco: string;
};
type PackagingDraft = {
  substrate: string;
  dimensions: string;
  gsm: string;
  printMethod: string;
};
// #37: CompRow (a dictionary fibre code + a percent string) is owned by the composition wizard, which
// is now the single editor of a material's fibre blend; the modal only holds/persists the rows.
// #39: one typed other-attribute (replaces the raw-JSON textarea) — a name/value pair serialized to
// the material's other_attrs JSON object on save.
type KV = { key: string; value: string };

type Draft = {
  name: string;
  section: common_TechCardBomSection;
  supplier: string;
  supplierRef: string;
  unit: string;
  materialClass: common_MaterialClass;
  fabric: FabricDraft;
  hardware: HardwareDraft;
  thread: ThreadDraft;
  packaging: PackagingDraft;
  // #37: structured fibre composition rows (persisted as composition_entries).
  compositionEntries: CompRow[];
  // Raw-JSON escape hatch, only sent when materialClass = OTHER. `kv` is the typed key/value editor
  // (#39); `raw` preserves legacy / non-object JSON that can't be shown as rows without data loss.
  otherAttrsRows: KV[];
  otherAttrsRaw: string;
  otherAttrsMode: 'kv' | 'raw';
  // Warehouse-catalog fields (new-flow NF-02).
  code: string;
  color: string;
  pantone: string;
  minStock: string;
  notes: string;
};

const emptyFabric: FabricDraft = {
  widthCm: '',
  weightGsm: '',
  fabricDirection: '',
  shrinkagePct: '',
  rollLengthM: '',
};
const emptyHardware: HardwareDraft = {
  diameterMm: '',
  dimensions: '',
  finish: '',
  baseMaterial: '',
  weightG: '',
};
const emptyThread: ThreadDraft = { ticketTex: '', lengthPerConeM: '', needleReco: '' };
const emptyPackaging: PackagingDraft = { substrate: '', dimensions: '', gsm: '', printMethod: '' };

const empty: Draft = {
  name: '',
  section: 'TECH_CARD_BOM_SECTION_FABRIC',
  supplier: '',
  supplierRef: '',
  unit: '',
  materialClass: 'MATERIAL_CLASS_FABRIC',
  fabric: emptyFabric,
  hardware: emptyHardware,
  thread: emptyThread,
  packaging: emptyPackaging,
  compositionEntries: [],
  otherAttrsRows: [],
  otherAttrsRaw: '',
  otherAttrsMode: 'kv',
  code: '',
  color: '',
  pantone: '',
  minStock: '',
  notes: '',
};

// A material_class other_attrs value is a JSON object on the wire. Parse it into typed rows when it
// is one; keep it as raw text otherwise so an odd/legacy value is never silently dropped on save.
function tryParseObject(raw?: string): Record<string, unknown> | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
function parseOtherAttrs(
  raw?: string,
): Pick<Draft, 'otherAttrsRows' | 'otherAttrsRaw' | 'otherAttrsMode'> {
  const s = (raw ?? '').trim();
  if (!s) return { otherAttrsRows: [], otherAttrsRaw: '', otherAttrsMode: 'kv' };
  const obj = tryParseObject(s);
  if (obj) {
    return {
      otherAttrsMode: 'kv',
      otherAttrsRaw: s,
      otherAttrsRows: Object.entries(obj).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      })),
    };
  }
  return { otherAttrsRows: [], otherAttrsRaw: s, otherAttrsMode: 'raw' };
}

const draftFromMaterial = (material: common_Material): Draft => ({
  name: material.name ?? '',
  section: material.section ?? 'TECH_CARD_BOM_SECTION_FABRIC',
  supplier: material.supplier ?? '',
  supplierRef: material.supplierRef ?? '',
  unit: material.unit ?? '',
  materialClass: resolveMaterialClass(material),
  fabric: material.fabricAttrs
    ? {
        widthCm: material.fabricAttrs.widthCm?.value ?? '',
        weightGsm: material.fabricAttrs.weightGsm?.value ?? '',
        fabricDirection: material.fabricAttrs.fabricDirection ?? '',
        shrinkagePct: material.fabricAttrs.shrinkagePct?.value ?? '',
        rollLengthM: material.fabricAttrs.rollLengthM?.value ?? '',
      }
    : {
        ...emptyFabric,
        // No typed attrs yet — surface the legacy flat fields so a pre-migration material opens
        // with its data visible instead of blank.
        widthCm: material.fabricWidth?.value ?? '',
        weightGsm: material.fabricWeightGsm?.value ?? '',
      },
  hardware: material.hardwareAttrs
    ? {
        diameterMm: material.hardwareAttrs.diameterMm?.value ?? '',
        dimensions: material.hardwareAttrs.dimensions ?? '',
        finish: material.hardwareAttrs.finish ?? '',
        baseMaterial: material.hardwareAttrs.baseMaterial ?? '',
        weightG: material.hardwareAttrs.weightG?.value ?? '',
      }
    : emptyHardware,
  thread: material.threadAttrs
    ? {
        ticketTex: material.threadAttrs.ticketTex ?? '',
        lengthPerConeM: material.threadAttrs.lengthPerConeM?.value ?? '',
        needleReco: material.threadAttrs.needleReco ?? '',
      }
    : emptyThread,
  packaging: material.packagingAttrs
    ? {
        substrate: material.packagingAttrs.substrate ?? '',
        dimensions: material.packagingAttrs.dimensions ?? '',
        gsm: material.packagingAttrs.gsm?.value ?? '',
        printMethod: material.packagingAttrs.printMethod ?? '',
      }
    : emptyPackaging,
  compositionEntries: (material.compositionEntries ?? []).map((e) => ({
    fiberCode: e.fiberCode ?? '',
    percent: decimalToInput(e.percent),
  })),
  ...parseOtherAttrs(material.otherAttrs),
  code: material.code ?? '',
  color: material.color ?? '',
  pantone: material.pantone ?? '',
  minStock: material.minStock?.value ?? '',
  notes: material.notes ?? '',
});

// The unique-code guard and the optimistic lock (S25) are enforced server-side; surface their
// rejections in plain words instead of the raw status text.
const saveErrorMessage = (e: unknown): string => {
  const err = e as { status?: number; message?: string } | undefined;
  const status = err?.status;
  const message = (err?.message ?? '').toLowerCase();
  // ABORTED (stale expected_lock_version) -> 409, with a message that names the mismatch.
  if (status === 409 && /lock|version|conflict|changed|stale|aborted/.test(message)) {
    return 'This material was changed by someone else — reload and re-apply your edits.';
  }
  if (status === 400 || status === 409) {
    return fieldErrorSummary(e, '') || 'Material code already in use — pick a unique code';
  }
  return fieldErrorSummary(e, 'Failed to save material');
};

// A titled group header — the flat 16-field dialog (#51) is now split into labelled identity /
// attributes / composition / warehouse sections so the form reads as steps, not one wall of inputs.
function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className='mt-1 flex items-center justify-between gap-2 border-b border-textInactiveColor pb-1'>
      <Text variant='uppercase' size='small'>
        {title}
      </Text>
      {right}
    </div>
  );
}

const grid = 'grid grid-cols-1 gap-2 sm:grid-cols-2';

export function MaterialModal({
  open,
  onOpenChange,
  material,
  defaultSection,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  material?: common_Material;
  // Pre-select the section (and derive the default class) when creating a fresh material (e.g.
  // packaging from the aux output picker).
  defaultSection?: common_TechCardBomSection;
  // Fired after a successful CREATE with the new id + the submitted material (id filled in), so a
  // caller (e.g. the inline BOM-picker) can immediately select the material it just made (Q9a).
  onCreated?: (id: number, material: common_Material) => void;
}) {
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  const save = useSaveMaterial();
  const [d, setD] = useState<Draft>(empty);
  // #68: the warehouse code is backend-generated; it opens locked (auto) and the operator opts into
  // a manual override rather than being asked to invent the value the system should assign.
  const [codeOverride, setCodeOverride] = useState(false);
  // #51: warehouse block is progressive-disclosure — collapsed on the common "just log a material"
  // create path, auto-expanded when editing a material that already carries warehouse data.
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  // Sourcing (supplier ref + purpose) is collapsed out of the identity block — both are edge fields
  // rarely touched on the common create path. Auto-expanded when editing a material that carries a
  // supplier ref or a non-default purpose, so a set value is never hidden. Both stay persisted.
  const [sourcingOpen, setSourcingOpen] = useState(false);
  // Fabric's secondary specs (direction / shrinkage / roll length) sit behind a disclosure so width
  // and gsm read as the primary fabric fields; auto-expanded when any of them already has a value.
  const [fabricAdvancedOpen, setFabricAdvancedOpen] = useState(false);
  // #37: the fibre blend is edited in a guided wizard (composition-wizard.tsx) launched from the
  // composition section below, not inline — so it works for any class and never dead-ends on an
  // empty fibres dictionary.
  const [compOpen, setCompOpen] = useState(false);
  // #40: sample vs production vs both — persisted via common_Material.purpose.
  const [purpose, setPurpose] = useState<common_MaterialPurpose>('MATERIAL_PURPOSE_BOTH');
  // #39: catalog image. image_id is the write-side reference; image is kept alongside it purely
  // for an immediate preview after picking (no round-trip needed to see the new thumbnail).
  const [imageId, setImageId] = useState(0);
  const [image, setImage] = useState<common_MediaFull | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const next = material
      ? draftFromMaterial(material)
      : {
          ...empty,
          section: defaultSection ?? empty.section,
          materialClass: defaultSection ? classForSection(defaultSection) : 'MATERIAL_CLASS_FABRIC',
        };
    const resolvedPurpose = resolveMaterialPurpose(material?.purpose);
    setD(next);
    setCodeOverride(false);
    setPurpose(resolvedPurpose);
    setImageId(material?.imageId ?? 0);
    setImage(material?.image);
    setWarehouseOpen(!!(next.code || next.color || next.pantone || next.minStock || next.notes));
    setSourcingOpen(!!next.supplierRef || resolvedPurpose !== 'MATERIAL_PURPOSE_BOTH');
    setFabricAdvancedOpen(
      !!(next.fabric.fabricDirection || next.fabric.shrinkagePct || next.fabric.rollLengthM),
    );
  }, [material, open, defaultSection]);

  const handleSetImage = (media: common_MediaFull[]) => {
    const m = media[0];
    if (!m) return;
    setImageId(m.id ?? 0);
    setImage(m);
  };
  const clearImage = () => {
    setImageId(0);
    setImage(undefined);
  };

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  // Changing the class keeps the section consistent (kills the class-vs-section contradiction): the
  // 1:1 classes derive their section (control hidden); FABRIC/OTHER keep the current section when it
  // already belongs to the new class's family, else reset to that family's canonical section so the
  // now-visible select never shows a mismatched value. Both fields stay persisted.
  const changeClass = (materialClass: common_MaterialClass) => {
    const derived = derivedSection(materialClass);
    if (derived) {
      set({ materialClass, section: derived });
      return;
    }
    const keep = classForSection(d.section) === materialClass;
    const fallback: common_TechCardBomSection =
      materialClass === 'MATERIAL_CLASS_FABRIC'
        ? 'TECH_CARD_BOM_SECTION_FABRIC'
        : 'TECH_CARD_BOM_SECTION_TRIM';
    set({ materialClass, section: keep ? d.section : fallback });
  };
  const setFabric = (patch: Partial<FabricDraft>) =>
    setD((prev) => ({ ...prev, fabric: { ...prev.fabric, ...patch } }));
  const setHardware = (patch: Partial<HardwareDraft>) =>
    setD((prev) => ({ ...prev, hardware: { ...prev.hardware, ...patch } }));
  const setThread = (patch: Partial<ThreadDraft>) =>
    setD((prev) => ({ ...prev, thread: { ...prev.thread, ...patch } }));
  const setPackaging = (patch: Partial<PackagingDraft>) =>
    setD((prev) => ({ ...prev, packaging: { ...prev.packaging, ...patch } }));

  // ---- composition (#37) --------------------------------------------------------------------
  // The rows themselves are edited in the CompositionWizard; the modal keeps the derived validity so
  // it can flag an off-100 blend inline and block save, and resolve fibre names for the summary.
  const fibers = useMemo(() => (dictionary?.fibers ?? []).filter((f) => f.code), [dictionary]);
  const legacyComposition = material?.composition?.trim() ?? '';
  const fiberName = (code: string) => fibers.find((f) => f.code === code)?.name || code;

  const compFilled = d.compositionEntries.filter((r) => r.fiberCode || r.percent.trim());
  const compTotal = compFilled.reduce((s, r) => {
    const n = parseDecimalNumber(r.percent);
    return s + (Number.isFinite(n) ? n : 0);
  }, 0);
  const compCodes = compFilled.map((r) => r.fiberCode);
  const compComplete = compFilled.every((r) => r.fiberCode && parseDecimalNumber(r.percent) > 0);
  const compUnique = new Set(compCodes).size === compCodes.length;
  // Valid = empty (unset, allowed) OR every row complete, no duplicate fibre, sums to 100.
  const compValid =
    compFilled.length === 0 || (compComplete && compUnique && Math.abs(compTotal - 100) < 0.01);

  // ---- other attributes (#39) ---------------------------------------------------------------
  const setKvRow = (i: number, patch: Partial<KV>) =>
    setD((prev) => ({
      ...prev,
      otherAttrsRows: prev.otherAttrsRows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  const addKvRow = () =>
    setD((prev) => ({ ...prev, otherAttrsRows: [...prev.otherAttrsRows, { key: '', value: '' }] }));
  const removeKvRow = (i: number) =>
    setD((prev) => ({
      ...prev,
      otherAttrsRows: prev.otherAttrsRows.filter((_, idx) => idx !== i),
    }));
  // #39 simplification: the editable raw-JSON hatch is gone. `raw` mode now only survives as a
  // read-only view for a legacy non-object value that the key/value rows can't represent, so
  // buildOtherAttrs still round-trips it unchanged (see the render + build below).
  const buildOtherAttrs = (): string => {
    if (d.materialClass !== 'MATERIAL_CLASS_OTHER') return '';
    if (d.otherAttrsMode === 'raw') return d.otherAttrsRaw.trim();
    const obj: Record<string, string> = {};
    d.otherAttrsRows.filter((r) => r.key.trim()).forEach((r) => (obj[r.key.trim()] = r.value));
    return Object.keys(obj).length ? JSON.stringify(obj) : '';
  };

  // #68: on CREATE, auto means "leave blank so the backend generates"; on EDIT, auto keeps the
  // existing code. Overriding unlocks the input for a manual value.
  const toggleCodeOverride = () =>
    setCodeOverride((prev) => {
      const next = !prev;
      if (!next) set({ code: material?.id ? material.code ?? '' : '' });
      return next;
    });

  const submit = () => {
    if (!d.name.trim()) {
      showMessage('Name is required', 'error');
      return;
    }
    if (compFilled.length > 0) {
      if (!compComplete) {
        showMessage('Every fibre needs a name and a percent greater than 0', 'error');
        return;
      }
      if (!compUnique) {
        showMessage('A fibre is listed twice — merge the rows', 'error');
        return;
      }
      if (Math.abs(compTotal - 100) > 0.01) {
        showMessage(`Composition must sum to 100% (now ${Number(compTotal.toFixed(2))}%)`, 'error');
        return;
      }
    }
    if (d.materialClass === 'MATERIAL_CLASS_OTHER' && d.otherAttrsMode === 'kv') {
      if (d.otherAttrsRows.some((r) => !r.key.trim() && r.value.trim())) {
        showMessage('Every attribute needs a name', 'error');
        return;
      }
      const keys = d.otherAttrsRows.filter((r) => r.key.trim()).map((r) => r.key.trim());
      if (new Set(keys).size !== keys.length) {
        showMessage('An attribute name is repeated', 'error');
        return;
      }
    }
    const compositionEntries: common_CompositionEntry[] = compFilled.map((r) => ({
      fiberCode: r.fiberCode,
      name: undefined,
      percent: inputToDecimal(r.percent),
    }));
    const payload: common_Material = {
      id: material?.id ?? 0,
      name: d.name.trim(),
      // section stays persisted — derived from the class for the 1:1 classes (its select is hidden,
      // so a stale/legacy mis-set section is never written back), else the operator-chosen section.
      section: derivedSection(d.materialClass) ?? d.section,
      supplier: d.supplier.trim(),
      supplierRef: d.supplierRef.trim(),
      // Legacy free-text `composition` is superseded by the structured entries below — echo it back
      // unedited so this modal never wipes an old material's legacy text; the entries are authoritative.
      composition: material?.composition ?? '',
      spec: material?.spec ?? '',
      unit: d.unit.trim(),
      fabricWidth: undefined,
      fabricWeightGsm: undefined,
      archived: material?.archived ?? false,
      latestPrice: undefined,
      // Catalog image (#39): image_id is the write-side reference; `image` itself is read-only
      // (server-resolved from image_id, like latest_price is resolved from AddMaterialPrice) —
      // never sent back.
      imageId,
      image: undefined,
      materialClass: d.materialClass,
      fabricAttrs:
        d.materialClass === 'MATERIAL_CLASS_FABRIC'
          ? {
              widthCm: inputToDecimal(d.fabric.widthCm),
              weightGsm: inputToDecimal(d.fabric.weightGsm),
              fabricDirection: d.fabric.fabricDirection,
              shrinkagePct: inputToDecimal(d.fabric.shrinkagePct),
              rollLengthM: inputToDecimal(d.fabric.rollLengthM),
            }
          : undefined,
      hardwareAttrs:
        d.materialClass === 'MATERIAL_CLASS_HARDWARE'
          ? {
              diameterMm: inputToDecimal(d.hardware.diameterMm),
              dimensions: d.hardware.dimensions.trim(),
              finish: d.hardware.finish.trim(),
              baseMaterial: d.hardware.baseMaterial.trim(),
              weightG: inputToDecimal(d.hardware.weightG),
            }
          : undefined,
      threadAttrs:
        d.materialClass === 'MATERIAL_CLASS_THREAD'
          ? {
              ticketTex: d.thread.ticketTex.trim(),
              lengthPerConeM: inputToDecimal(d.thread.lengthPerConeM),
              needleReco: d.thread.needleReco.trim(),
            }
          : undefined,
      packagingAttrs:
        d.materialClass === 'MATERIAL_CLASS_PACKAGING'
          ? {
              substrate: d.packaging.substrate.trim(),
              dimensions: d.packaging.dimensions.trim(),
              gsm: inputToDecimal(d.packaging.gsm),
              printMethod: d.packaging.printMethod.trim(),
            }
          : undefined,
      otherAttrs: buildOtherAttrs(),
      lockVersion: material?.lockVersion ?? 0,
      // Warehouse-catalog fields (new-flow NF-02).
      code: d.code.trim(),
      color: d.color.trim(),
      pantone: d.pantone.trim(),
      minStock: inputToDecimal(d.minStock),
      notes: d.notes.trim(),
      // #37: structured fibre composition — resolves the missing-field type error and feeds label
      // generation. Only fiber_code + percent are read on write (name resolved server-side).
      compositionEntries,
      // #40: sample vs production vs both, from the segmented control below.
      purpose,
    };
    save.mutate(payload, {
      onSuccess: (data) => {
        showMessage(material ? 'Material updated' : 'Material created', 'success');
        // CreateMaterial returns the new id; hand it (+ the submitted material) to the caller so it
        // can auto-select the just-created material without a round-trip to /materials.
        if (!material?.id) {
          const newId = (data as { id?: number } | undefined)?.id ?? 0;
          onCreated?.(newId, { ...payload, id: newId });
        }
        onOpenChange(false);
      },
      onError: (e) => showMessage(saveErrorMessage(e), 'error'),
    });
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={submit}
      // Close only in onSuccess — auto-close would wipe the draft on a validation error or a
      // duplicate-code / lock-conflict rejection.
      closeOnConfirm={false}
      title={material ? 'edit material' : 'new material'}
      confirmLabel={save.isPending ? 'saving…' : 'save'}
      // Block save while composition is present but doesn't sum to 100 (#37) — flagged inline too.
      confirmDisabled={save.isPending || !compValid}
    >
      <div className='flex w-full flex-col gap-3 lg:w-[36rem]'>
        {/* ---- IDENTITY -------------------------------------------------------------------- */}
        <SectionHeader title='identity' />
        {/* #39: catalog image — image_id is the write-side ref; MediaSelector handles upload +
            crop (reused as-is from the product/archive thumbnail pattern). */}
        <div className='flex flex-col gap-1'>
          <Text size='small'>image</Text>
          <MediaPreviewWithSelector
            mediaUrl={mediaThumbUrl(image)}
            aspectRatio={['1:1', 'Custom']}
            allowMultiple={false}
            showVideos={false}
            heightClass='h-24'
            label='add image'
            purpose='material image'
            alt={d.name || 'material image'}
            onSaveMedia={handleSetImage}
            onClear={imageId ? clearImage : undefined}
          />
        </div>
        <div className={grid}>
          <label className='sm:col-span-2 flex flex-col gap-1'>
            <Text size='small'>name *</Text>
            <input
              className={cell}
              value={d.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </label>
          <label className='flex flex-col gap-1'>
            <Text size='small'>material class</Text>
            <select
              className={cell}
              value={d.materialClass}
              onChange={(e) => changeClass(e.target.value as common_MaterialClass)}
            >
              {materialClassOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {/* section is only asked for when it's ambiguous: FABRIC (fabric/lining/interlining/
              insulation) and OTHER (trim/label). For hardware/thread/packaging it's derived 1:1 from
              the class (see changeClass + submit), so the control is hidden but the field persists. */}
          {!derivedSection(d.materialClass) && (
            <label className='flex flex-col gap-1'>
              <Text size='small'>section</Text>
              <select
                className={cell}
                value={d.section}
                onChange={(e) => set({ section: e.target.value as common_TechCardBomSection })}
              >
                {techCardBomSectionOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className='flex flex-col gap-1'>
            <Text size='small'>unit</Text>
            <input
              className={cell}
              placeholder='m / pcs / kg'
              value={d.unit}
              onChange={(e) => set({ unit: e.target.value })}
            />
          </label>
          <label className='flex flex-col gap-1'>
            <Text size='small'>supplier</Text>
            <input
              className={cell}
              value={d.supplier}
              onChange={(e) => set({ supplier: e.target.value })}
            />
          </label>
        </div>

        {/* ---- SOURCING (collapsible) — edge fields lifted out of the identity block -------- */}
        <SectionHeader
          title='sourcing'
          right={
            <button
              type='button'
              className='text-small uppercase underline'
              onClick={() => setSourcingOpen((v) => !v)}
            >
              {sourcingOpen ? 'hide' : 'show'}
            </button>
          }
        />
        {sourcingOpen && (
          <div className={grid}>
            <label className='sm:col-span-2 flex flex-col gap-1'>
              <Text size='small'>supplier ref</Text>
              <input
                className={cell}
                value={d.supplierRef}
                onChange={(e) => set({ supplierRef: e.target.value })}
              />
            </label>
            {/* #40: sample vs production vs both — persisted on common_Material.purpose (defaults to
                BOTH; a legacy/unset value round-trips as BOTH via resolveMaterialPurpose). */}
            <div className='sm:col-span-2 flex flex-col gap-1'>
              <Text size='small'>purpose</Text>
              <div className='flex gap-2'>
                {materialPurposeOptions.map((o) => (
                  <Button
                    key={o.value}
                    type='button'
                    variant={purpose === o.value ? 'main' : 'secondary'}
                    className='uppercase'
                    onClick={() => setPurpose(o.value)}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ---- ATTRIBUTES ------------------------------------------------------------------ */}
        <SectionHeader title='attributes' />
        {d.materialClass === 'MATERIAL_CLASS_FABRIC' && (
          <div className='flex flex-col gap-2'>
            <div className={grid}>
              <label className='flex flex-col gap-1'>
                <Text size='small'>width (cm)</Text>
                <input
                  className={cell}
                  inputMode='decimal'
                  value={d.fabric.widthCm}
                  onChange={(e) => setFabric({ widthCm: sanitizeDecimal(e.target.value) })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>weight (gsm)</Text>
                <input
                  className={cell}
                  inputMode='decimal'
                  value={d.fabric.weightGsm}
                  onChange={(e) => setFabric({ weightGsm: sanitizeDecimal(e.target.value) })}
                />
              </label>
            </div>
            {/* direction / shrinkage / roll length behind a disclosure so width + gsm stay the
                primary fabric fields; all three still persist on fabricAttrs regardless of state. */}
            <button
              type='button'
              className='w-fit text-small uppercase underline'
              onClick={() => setFabricAdvancedOpen((v) => !v)}
            >
              {fabricAdvancedOpen ? 'hide advanced specs' : 'advanced fabric specs'}
            </button>
            {fabricAdvancedOpen && (
              <div className={grid}>
                <label className='flex flex-col gap-1'>
                  <Text size='small'>fabric direction</Text>
                  <select
                    className={cell}
                    value={d.fabric.fabricDirection}
                    onChange={(e) => setFabric({ fabricDirection: e.target.value })}
                  >
                    {fabricDirectionOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='flex flex-col gap-1'>
                  <Text size='small'>shrinkage (%)</Text>
                  <input
                    className={cell}
                    inputMode='decimal'
                    value={d.fabric.shrinkagePct}
                    onChange={(e) => setFabric({ shrinkagePct: sanitizeDecimal(e.target.value) })}
                  />
                </label>
                <label className='flex flex-col gap-1'>
                  <Text size='small'>roll length (m)</Text>
                  <input
                    className={cell}
                    inputMode='decimal'
                    value={d.fabric.rollLengthM}
                    onChange={(e) => setFabric({ rollLengthM: sanitizeDecimal(e.target.value) })}
                  />
                </label>
              </div>
            )}
          </div>
        )}

        {d.materialClass === 'MATERIAL_CLASS_HARDWARE' && (
          <div className={grid}>
            <label className='flex flex-col gap-1'>
              <Text size='small'>diameter (mm)</Text>
              <input
                className={cell}
                inputMode='decimal'
                value={d.hardware.diameterMm}
                onChange={(e) => setHardware({ diameterMm: sanitizeDecimal(e.target.value) })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>dimensions</Text>
              <input
                className={cell}
                value={d.hardware.dimensions}
                onChange={(e) => setHardware({ dimensions: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>finish</Text>
              <input
                className={cell}
                value={d.hardware.finish}
                onChange={(e) => setHardware({ finish: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>base material</Text>
              <input
                className={cell}
                value={d.hardware.baseMaterial}
                onChange={(e) => setHardware({ baseMaterial: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>weight (g)</Text>
              <input
                className={cell}
                inputMode='decimal'
                value={d.hardware.weightG}
                onChange={(e) => setHardware({ weightG: sanitizeDecimal(e.target.value) })}
              />
            </label>
          </div>
        )}

        {d.materialClass === 'MATERIAL_CLASS_THREAD' && (
          <div className={grid}>
            <label className='flex flex-col gap-1'>
              <Text size='small'>ticket / tex</Text>
              <input
                className={cell}
                value={d.thread.ticketTex}
                onChange={(e) => setThread({ ticketTex: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>length per cone (m)</Text>
              <input
                className={cell}
                inputMode='decimal'
                value={d.thread.lengthPerConeM}
                onChange={(e) => setThread({ lengthPerConeM: sanitizeDecimal(e.target.value) })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>needle reco</Text>
              <input
                className={cell}
                value={d.thread.needleReco}
                onChange={(e) => setThread({ needleReco: e.target.value })}
              />
            </label>
          </div>
        )}

        {d.materialClass === 'MATERIAL_CLASS_PACKAGING' && (
          <div className={grid}>
            <label className='flex flex-col gap-1'>
              <Text size='small'>substrate</Text>
              <input
                className={cell}
                value={d.packaging.substrate}
                onChange={(e) => setPackaging({ substrate: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>dimensions</Text>
              <input
                className={cell}
                value={d.packaging.dimensions}
                onChange={(e) => setPackaging({ dimensions: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>gsm</Text>
              <input
                className={cell}
                inputMode='decimal'
                value={d.packaging.gsm}
                onChange={(e) => setPackaging({ gsm: sanitizeDecimal(e.target.value) })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>print method</Text>
              <input
                className={cell}
                value={d.packaging.printMethod}
                onChange={(e) => setPackaging({ printMethod: e.target.value })}
              />
            </label>
          </div>
        )}

        {/* #39: MATERIAL_CLASS_OTHER — typed key/value rows. The editable raw-JSON hatch is gone; a
            legacy non-object value the rows can't represent is shown read-only (never dropped). */}
        {d.materialClass === 'MATERIAL_CLASS_OTHER' && (
          <div className='flex flex-col gap-2'>
            {d.otherAttrsMode === 'kv' ? (
              <>
                {d.otherAttrsRows.length === 0 ? (
                  <Text variant='inactive' size='small'>
                    e.g. finish → matte · gsm → 180 · country → IT
                  </Text>
                ) : (
                  d.otherAttrsRows.map((r, i) => (
                    <div key={i} className='flex items-center gap-2'>
                      <input
                        className={`${cell} min-w-0 flex-1`}
                        placeholder='name'
                        value={r.key}
                        onChange={(e) => setKvRow(i, { key: e.target.value })}
                      />
                      <input
                        className={`${cell} min-w-0 flex-1`}
                        placeholder='value'
                        value={r.value}
                        onChange={(e) => setKvRow(i, { value: e.target.value })}
                      />
                      <Button
                        type='button'
                        variant='secondary'
                        className='shrink-0'
                        aria-label='remove attribute'
                        onClick={() => removeKvRow(i)}
                      >
                        ✕
                      </Button>
                    </div>
                  ))
                )}
                <div>
                  <Button
                    type='button'
                    variant='secondary'
                    className='uppercase'
                    onClick={addKvRow}
                  >
                    + field
                  </Button>
                </div>
              </>
            ) : (
              // Legacy non-object JSON — can't be split into name/value rows, so it's shown read-only
              // and round-trips unchanged on save (buildOtherAttrs returns otherAttrsRaw for raw mode).
              <div className='flex flex-col gap-1'>
                <Text variant='label' size='small'>
                  legacy value — read-only
                </Text>
                <div className='overflow-x-auto whitespace-pre-wrap break-words border border-textInactiveColor bg-bgColor px-2 py-1 text-small text-labelColor'>
                  {d.otherAttrsRaw}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- COMPOSITION (#37) — guided wizard ------------------------------------------- */}
        <SectionHeader
          title='composition'
          right={
            compFilled.length > 0 ? (
              <Text variant={compValid ? 'label' : 'error'} size='small'>
                total {Number(compTotal.toFixed(2))}%{compValid ? ' ✓' : ' / 100'}
              </Text>
            ) : undefined
          }
        />
        <div className='flex flex-col gap-2'>
          {legacyComposition && (
            <Text variant='inactive' size='small'>
              legacy text: “{legacyComposition}” — re-enter as structured fibres in the wizard
            </Text>
          )}
          {compFilled.length > 0 ? (
            <div className='flex flex-wrap gap-1.5'>
              {compFilled.map((r, i) => (
                <div
                  key={i}
                  className='flex items-baseline gap-1.5 border border-textInactiveColor px-2 py-1'
                >
                  <Text size='small'>{fiberName(r.fiberCode)}</Text>
                  <Text size='small' variant='inactive'>
                    {r.percent.trim() ? `${r.percent}%` : '—'}
                  </Text>
                </div>
              ))}
            </div>
          ) : (
            <Text variant='inactive' size='small'>
              {d.materialClass === 'MATERIAL_CLASS_FABRIC'
                ? 'no fibre blend yet — recommended for fabrics'
                : 'no fibre blend yet (optional)'}
            </Text>
          )}
          {compFilled.length > 0 && !compValid && (
            <Text variant='error' size='small'>
              composition must sum to 100% — open the wizard to fix
            </Text>
          )}
          <div>
            <Button
              type='button'
              variant='secondary'
              className='uppercase'
              onClick={() => setCompOpen(true)}
            >
              {compFilled.length > 0 ? 'edit composition' : '＋ add composition'}
            </Button>
          </div>
        </div>

        <CompositionWizard
          open={compOpen}
          onOpenChange={setCompOpen}
          initialEntries={d.compositionEntries}
          onSave={(entries) => set({ compositionEntries: entries })}
        />

        {/* ---- WAREHOUSE (collapsible, #51) ------------------------------------------------ */}
        <SectionHeader
          title='warehouse'
          right={
            <button
              type='button'
              className='text-small uppercase underline'
              onClick={() => setWarehouseOpen((v) => !v)}
            >
              {warehouseOpen ? 'hide' : 'show'}
            </button>
          }
        />
        {warehouseOpen && (
          <div className={grid}>
            {/* #68: code is backend-generated; locked/auto by default with an explicit override. */}
            <label className='flex flex-col gap-1'>
              <div className='flex items-center justify-between gap-2'>
                <Text size='small'>code {codeOverride ? '' : '(auto)'}</Text>
                <button
                  type='button'
                  className='text-small uppercase underline'
                  onClick={toggleCodeOverride}
                >
                  {codeOverride ? 'use auto' : 'customize'}
                </button>
              </div>
              <input
                className={cn(cell, !codeOverride && 'cursor-not-allowed text-textInactiveColor')}
                readOnly={!codeOverride}
                placeholder={
                  codeOverride
                    ? 'unique among active'
                    : material?.code
                      ? ''
                      : 'auto — generated on save'
                }
                value={d.code}
                onChange={(e) => set({ code: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>min stock ({d.unit.trim() || 'unit'})</Text>
              <input
                className={cell}
                inputMode='decimal'
                placeholder='low-stock alert'
                value={d.minStock}
                onChange={(e) => set({ minStock: sanitizeDecimal(e.target.value) })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>color</Text>
              <input
                className={cell}
                value={d.color}
                onChange={(e) => set({ color: e.target.value })}
              />
            </label>
            <label className='flex flex-col gap-1'>
              <Text size='small'>pantone</Text>
              <input
                className={cell}
                value={d.pantone}
                onChange={(e) => set({ pantone: e.target.value })}
              />
            </label>
            <label className='sm:col-span-2 flex flex-col gap-1'>
              <Text size='small'>notes</Text>
              <input
                className={cell}
                value={d.notes}
                onChange={(e) => set({ notes: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}
