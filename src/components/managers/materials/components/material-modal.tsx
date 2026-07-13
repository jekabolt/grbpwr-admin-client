import { common_Material, common_TechCardBomSection } from 'api/proto-http/admin';
import { techCardBomSectionOptions } from 'constants/filter';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
import { inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { useSaveMaterial } from './useMaterials';

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';

type Draft = {
  name: string;
  section: common_TechCardBomSection;
  supplier: string;
  supplierRef: string;
  composition: string;
  spec: string;
  unit: string;
  fabricWidth: string;
  fabricWeightGsm: string;
  // Warehouse-catalog fields (new-flow NF-02).
  code: string;
  color: string;
  pantone: string;
  minStock: string;
  notes: string;
};

const empty: Draft = {
  name: '',
  section: 'TECH_CARD_BOM_SECTION_FABRIC',
  supplier: '',
  supplierRef: '',
  composition: '',
  spec: '',
  unit: '',
  fabricWidth: '',
  fabricWeightGsm: '',
  code: '',
  color: '',
  pantone: '',
  minStock: '',
  notes: '',
};

// The unique-code guard is enforced server-side; surface its rejection in plain words.
const saveErrorMessage = (e: unknown): string => {
  const status = (e as { status?: number } | undefined)?.status;
  if (status === 400 || status === 409) return 'Material code already in use — pick a unique code';
  return e instanceof Error ? e.message : 'Failed to save material';
};

export function MaterialModal({
  open,
  onOpenChange,
  material,
  defaultSection,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  material?: common_Material;
  // Pre-select the section when creating a fresh material (e.g. packaging from the aux output picker).
  defaultSection?: common_TechCardBomSection;
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
            composition: material.composition ?? '',
            spec: material.spec ?? '',
            unit: material.unit ?? '',
            fabricWidth: material.fabricWidth?.value ?? '',
            fabricWeightGsm: material.fabricWeightGsm?.value ?? '',
            code: material.code ?? '',
            color: material.color ?? '',
            pantone: material.pantone ?? '',
            minStock: material.minStock?.value ?? '',
            notes: material.notes ?? '',
          }
        : { ...empty, section: defaultSection ?? empty.section },
    );
  }, [material, open, defaultSection]);

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));

  const submit = () => {
    if (!d.name.trim()) {
      showMessage('Name is required', 'error');
      return;
    }
    save.mutate(
      {
        id: material?.id ?? 0,
        name: d.name.trim(),
        section: d.section,
        supplier: d.supplier.trim(),
        supplierRef: d.supplierRef.trim(),
        composition: d.composition.trim(),
        spec: d.spec.trim(),
        unit: d.unit.trim(),
        fabricWidth: inputToDecimal(d.fabricWidth),
        fabricWeightGsm: inputToDecimal(d.fabricWeightGsm),
        archived: material?.archived ?? false,
        latestPrice: undefined,
        // Warehouse-catalog fields (new-flow NF-02).
        code: d.code.trim(),
        color: d.color.trim(),
        pantone: d.pantone.trim(),
        minStock: inputToDecimal(d.minStock),
        notes: d.notes.trim(),
      },
      {
        onSuccess: () => {
          showMessage(material ? 'Material updated' : 'Material created', 'success');
          onOpenChange(false);
        },
        onError: (e) => showMessage(saveErrorMessage(e), 'error'),
      },
    );
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={submit}
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
        <label className='flex flex-col gap-1'>
          <Text size='small'>supplier ref</Text>
          <input
            className={cell}
            value={d.supplierRef}
            onChange={(e) => set({ supplierRef: e.target.value })}
          />
        </label>
        <label className='col-span-2 flex flex-col gap-1'>
          <Text size='small'>composition</Text>
          <input
            className={cell}
            value={d.composition}
            onChange={(e) => set({ composition: e.target.value })}
          />
        </label>
        <label className='col-span-2 flex flex-col gap-1'>
          <Text size='small'>spec (ширина / плотность)</Text>
          <input className={cell} value={d.spec} onChange={(e) => set({ spec: e.target.value })} />
        </label>
        <label className='flex flex-col gap-1'>
          <Text size='small'>fabric width (cm)</Text>
          <input
            className={cell}
            type='number'
            step='0.1'
            min='0'
            value={d.fabricWidth}
            onChange={(e) => set({ fabricWidth: e.target.value })}
          />
        </label>
        <label className='flex flex-col gap-1'>
          <Text size='small'>weight (gsm)</Text>
          <input
            className={cell}
            type='number'
            step='1'
            min='0'
            value={d.fabricWeightGsm}
            onChange={(e) => set({ fabricWeightGsm: e.target.value })}
          />
        </label>

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
