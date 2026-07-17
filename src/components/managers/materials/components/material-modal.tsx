import {
  common_Material,
  common_MaterialClass,
  common_TechCardBomSection,
} from 'api/proto-http/admin';
import { techCardBomSectionOptions } from 'constants/filter';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { fieldErrorSummary } from 'utils/field-errors';
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
  // Raw-JSON escape hatch, only sent when materialClass = OTHER.
  otherAttrs: string;
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
  otherAttrs: '',
  code: '',
  color: '',
  pantone: '',
  minStock: '',
  notes: '',
};

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
  const save = useSaveMaterial();
  const [d, setD] = useState<Draft>(empty);

  useEffect(() => {
    if (!open) return;
    setD(
      material
        ? {
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
                  // No typed attrs yet — surface the legacy flat fields so a pre-migration
                  // material opens with its data visible instead of blank.
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
            otherAttrs: material.otherAttrs ?? '',
            code: material.code ?? '',
            color: material.color ?? '',
            pantone: material.pantone ?? '',
            minStock: material.minStock?.value ?? '',
            notes: material.notes ?? '',
          }
        : {
            ...empty,
            section: defaultSection ?? empty.section,
            materialClass: defaultSection
              ? classForSection(defaultSection)
              : 'MATERIAL_CLASS_FABRIC',
          },
    );
  }, [material, open, defaultSection]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const setFabric = (patch: Partial<FabricDraft>) =>
    setD((prev) => ({ ...prev, fabric: { ...prev.fabric, ...patch } }));
  const setHardware = (patch: Partial<HardwareDraft>) =>
    setD((prev) => ({ ...prev, hardware: { ...prev.hardware, ...patch } }));
  const setThread = (patch: Partial<ThreadDraft>) =>
    setD((prev) => ({ ...prev, thread: { ...prev.thread, ...patch } }));
  const setPackaging = (patch: Partial<PackagingDraft>) =>
    setD((prev) => ({ ...prev, packaging: { ...prev.packaging, ...patch } }));

  const submit = () => {
    if (!d.name.trim()) {
      showMessage('Name is required', 'error');
      return;
    }
    const payload: common_Material = {
      id: material?.id ?? 0,
      name: d.name.trim(),
      section: d.section,
      supplier: d.supplier.trim(),
      supplierRef: d.supplierRef.trim(),
      // Legacy free-text fields are deprecated in favor of the typed *Attrs below — echo them
      // back unedited so this modal never wipes an old material's composition/spec text.
      composition: material?.composition ?? '',
      spec: material?.spec ?? '',
      unit: d.unit.trim(),
      fabricWidth: undefined,
      fabricWeightGsm: undefined,
      archived: material?.archived ?? false,
      latestPrice: undefined,
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
      otherAttrs: d.materialClass === 'MATERIAL_CLASS_OTHER' ? d.otherAttrs.trim() : '',
      lockVersion: material?.lockVersion ?? 0,
      // Warehouse-catalog fields (new-flow NF-02).
      code: d.code.trim(),
      color: d.color.trim(),
      pantone: d.pantone.trim(),
      minStock: inputToDecimal(d.minStock),
      notes: d.notes.trim(),
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
      confirmDisabled={save.isPending}
    >
      <div className='grid min-w-[min(92vw,34rem)] grid-cols-2 gap-2'>
        <label className='col-span-2 flex flex-col gap-1'>
          <Text size='small'>name</Text>
          <input className={cell} value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className='flex flex-col gap-1'>
          <Text size='small'>material class</Text>
          <select
            className={cell}
            value={d.materialClass}
            onChange={(e) => set({ materialClass: e.target.value as common_MaterialClass })}
          >
            {materialClassOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
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
        <label className='col-span-2 flex flex-col gap-1'>
          <Text size='small'>supplier ref</Text>
          <input
            className={cell}
            value={d.supplierRef}
            onChange={(e) => set({ supplierRef: e.target.value })}
          />
        </label>

        <div className='col-span-2 mt-1 border-t border-textInactiveColor pt-2'>
          <Text variant='uppercase' size='small'>
            attributes
          </Text>
        </div>

        {d.materialClass === 'MATERIAL_CLASS_FABRIC' && (
          <>
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
          </>
        )}

        {d.materialClass === 'MATERIAL_CLASS_HARDWARE' && (
          <>
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
          </>
        )}

        {d.materialClass === 'MATERIAL_CLASS_THREAD' && (
          <>
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
          </>
        )}

        {d.materialClass === 'MATERIAL_CLASS_PACKAGING' && (
          <>
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
          </>
        )}

        {d.materialClass === 'MATERIAL_CLASS_OTHER' && (
          <label className='col-span-2 flex flex-col gap-1'>
            <Text size='small'>other attributes (JSON)</Text>
            <textarea
              className={cell}
              rows={3}
              placeholder='{}'
              value={d.otherAttrs}
              onChange={(e) => set({ otherAttrs: e.target.value })}
            />
          </label>
        )}

        <div className='col-span-2 mt-1 border-t border-textInactiveColor pt-2'>
          <Text variant='uppercase' size='small'>
            warehouse
          </Text>
        </div>
        <label className='flex flex-col gap-1'>
          <Text size='small'>code</Text>
          <input
            className={cell}
            placeholder='unique among active'
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
        <label className='col-span-2 flex flex-col gap-1'>
          <Text size='small'>notes</Text>
          <input
            className={cell}
            value={d.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </label>
      </div>
    </ConfirmationModal>
  );
}
