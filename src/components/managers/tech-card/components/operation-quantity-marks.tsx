import { useFormContext, useWatch } from 'react-hook-form';
import { Pill, Text } from 'ui';

import type { TechCardFormData } from './schema';

type CheckOperation = {
  operationType?: string;
  machineType?: string;
  zone?: string;
  placementCount?: number | null;
  buttonHoles?: number | null;
};

export type QuantityCheck = {
  label: 'buttonholes' | 'article holes';
  value: number;
  ok: boolean;
};

const MACHINE = 'TECH_CARD_OPERATION_TYPE_MACHINE';
const BUTTON_ATTACH = 'TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH';
const BUTTONHOLE = 'TECH_CARD_MACHINE_TYPE_BUTTONHOLE';

const repeats = (operation: CheckOperation): number => {
  const count = operation.placementCount ?? 0;
  return count > 0 ? count : 1;
};

const isButtonAttach = (operation: CheckOperation): boolean =>
  operation.operationType === 'TECH_CARD_OPERATION_TYPE_BUTTON_ATTACH' ||
  (operation.operationType === MACHINE && operation.machineType === BUTTON_ATTACH);

const isButtonhole = (operation: CheckOperation): boolean =>
  operation.operationType === 'TECH_CARD_OPERATION_TYPE_BUTTONHOLE' ||
  (operation.operationType === MACHINE && operation.machineType === BUTTONHOLE);

const usableZone = (zone?: string): string => {
  const value = (zone ?? '').trim();
  return !value || value.endsWith('_UNKNOWN') ? '' : value;
};

export function buttonAttachChecks(
  operations: readonly CheckOperation[],
  index: number,
  articleHoles?: number | null,
): QuantityCheck[] {
  const operation = operations[index];
  if (!operation || !isButtonAttach(operation)) return [];

  const checks: QuantityCheck[] = [];
  const zone = usableZone(operation.zone);
  if (zone) {
    const holeSteps = operations.filter(
      (candidate) => usableZone(candidate.zone) === zone && isButtonhole(candidate),
    );
    if (holeSteps.length) {
      const count = holeSteps.reduce((sum, candidate) => sum + repeats(candidate), 0);
      checks.push({ label: 'buttonholes', value: count, ok: count >= repeats(operation) });
    }
  }

  if (articleHoles != null && articleHoles > 0) {
    checks.push({
      label: 'article holes',
      value: articleHoles,
      ok: operation.buttonHoles === articleHoles,
    });
  }
  return checks;
}

export function OperationMaterialStepQty({ qty }: { qty: number | null }) {
  if (qty == null) return null;
  return (
    <Pill
      tone='ink'
      title='step quantity'
      className='absolute right-1 top-1 z-[1] bg-textColor px-1 py-0.5 leading-none tracking-normal text-bgColor tabular-nums'
    >
      ×{qty}
    </Pill>
  );
}

export function ButtonAttachCheckLine({ checks }: { checks: readonly QuantityCheck[] }) {
  if (!checks.length) return null;
  return (
    <div data-button-attach-checks='' className='mt-1 flex flex-wrap gap-x-3 gap-y-1'>
      {checks.map((check) => (
        <Text key={check.label} component='span' size='micro' variant='label'>
          {check.label} {check.value}{' '}
          <span
            aria-label={check.ok ? 'matches' : 'mismatch'}
            className={check.ok ? 'text-success' : 'text-error'}
          >
            {check.ok ? '✓' : '✗'}
          </span>
        </Text>
      ))}
    </div>
  );
}

/** Leaf subscription: edits in another step redraw only this quiet check line. */
export function OperationButtonAttachChecks({
  index,
  articleHoles,
}: {
  index: number;
  articleHoles?: number | null;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as CheckOperation[];
  return <ButtonAttachCheckLine checks={buttonAttachChecks(operations, index, articleHoles)} />;
}
