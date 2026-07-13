import { useQueryClient } from '@tanstack/react-query';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
import {
  IssueStockModal,
  MovementTarget,
} from 'components/managers/materials/components/movement-modals';
import { MovementsList } from 'components/managers/materials/components/movements-tab';
import { useTechCardFittings } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { sampleKeys } from './useSamples';

// Material issued to / returned from this sample (NF-01), plus a one-click issue: pick a material,
// then the shared warehouse Issue modal opens locked to this sample. Reuses the run detail's
// building blocks so the sample cost (materials_base) and the ledger stay one source of truth.
export function SampleMovements({ sampleId }: { sampleId: number }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<MovementTarget | undefined>();
  const [open, setOpen] = useState(false);

  return (
    <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-2'>
      <Text variant='uppercase' size='small'>
        material movements
      </Text>
      <div className='flex flex-wrap items-end gap-2'>
        <div className='w-64'>
          <MaterialPicker
            value={picked?.materialId ?? 0}
            onChange={(id, m) =>
              setPicked(
                id
                  ? {
                      materialId: id,
                      materialLabel: `${m?.code ? `${m.code} · ` : ''}${m?.name ?? `#${id}`}`,
                      unit: m?.unit ?? '',
                    }
                  : undefined,
              )
            }
            placeholder='material to issue'
          />
        </div>
        <Button
          type='button'
          variant='secondary'
          size='lg'
          className='uppercase'
          disabled={!picked}
          onClick={() => setOpen(true)}
        >
          issue…
        </Button>
      </div>

      <MovementsList filter={{ sampleId }} />

      {picked ? (
        <IssueStockModal
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            // A booking changes the sample's composed cost — refresh GetSample.
            if (!v) qc.invalidateQueries({ queryKey: sampleKeys.all });
          }}
          target={picked}
          defaultTarget={{ sampleId }}
          lockTarget
        />
      ) : null}
    </div>
  );
}

// Fittings that tried this sample on (NF-04). Filtered from the card's fittings by sample_id, with
// a shortcut to record a new one that returns here after saving (R-5).
export function SampleFittings({
  sampleId,
  techCardId,
  returnTo,
}: {
  sampleId: number;
  techCardId: number;
  returnTo: string;
}) {
  const { data } = useTechCardFittings(techCardId);
  const fittings = (data ?? []).filter((f) => f.fitting?.sampleId === sampleId);
  const addHref = `${ROUTES.addFitting}?techCardId=${techCardId}&sampleId=${sampleId}&returnTo=${encodeURIComponent(
    returnTo,
  )}`;

  return (
    <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-2'>
      <div className='flex items-center justify-between'>
        <Text variant='uppercase' size='small'>
          fittings with this sample
        </Text>
        <Button asChild variant='secondary' size='lg' className='uppercase'>
          <Link to={addHref}>+ fitting</Link>
        </Button>
      </div>
      {fittings.length === 0 ? (
        <Text variant='inactive' size='small'>
          no fittings tried this sample yet
        </Text>
      ) : (
        <div className='flex flex-col gap-1'>
          {fittings.map((f) => (
            <Link key={f.id} to={`/fittings/${f.id}`} className='underline'>
              <Text size='small'>
                round {f.fitting?.roundNumber ?? '—'}
                {f.fitting?.fittingDate ? ` · ${String(f.fitting.fittingDate).slice(0, 10)}` : ''}
                {f.fitting?.outcome ? ` · ${f.fitting.outcome}` : ''}
              </Text>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
