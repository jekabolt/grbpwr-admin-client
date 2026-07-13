import { common_Material, common_TechCardBomSection } from 'api/proto-http/admin';
import { techCardBomSectionOptions } from 'constants/filter';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useState } from 'react';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';
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
};

export function MaterialModal({
  open,
  onOpenChange,
  material,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  material?: common_Material;
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
          }
        : empty,
    );
  }, [material, open]);

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
        fabricWidth: d.fabricWidth.trim() ? { value: d.fabricWidth.trim() } : undefined,
        fabricWeightGsm: d.fabricWeightGsm.trim() ? { value: d.fabricWeightGsm.trim() } : undefined,
        archived: material?.archived ?? false,
        latestPrice: undefined,
      },
      {
        onSuccess: () => {
          showMessage(material ? 'Material updated' : 'Material created', 'success');
          onOpenChange(false);
        },
        onError: (e) =>
          showMessage(e instanceof Error ? e.message : 'Failed to save material', 'error'),
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
      </div>
    </ConfirmationModal>
  );
}
