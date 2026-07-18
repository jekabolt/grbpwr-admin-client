import { useQueryClient } from '@tanstack/react-query';
import { common_Fitting } from 'api/proto-http/admin';
import {
  formatFittingDate,
  statusLabel,
  verdictLabel,
} from 'components/managers/fittings/components/utils';
import { MaterialPicker } from 'components/managers/materials/components/material-picker';
import {
  IssueStockModal,
  MovementTarget,
} from 'components/managers/materials/components/movement-modals';
import { MovementsList } from 'components/managers/materials/components/movements-tab';
import { ROUTES } from 'constants/routes';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { sampleKeys, useSampleFittings } from './useSamples';

// Material issued to / returned from this sample (NF-01), plus a one-click issue: pick a material,
// then the shared warehouse Issue modal opens locked to this sample. Reuses the run detail's
// building blocks so the sample cost (materials_base) and the ledger stay one source of truth.
export function SampleMovements({ sampleId }: { sampleId: number }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<MovementTarget | undefined>();
  const [open, setOpen] = useState(false);

  return (
    <div className='flex flex-col gap-2'>
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

// Verdict → tone for the fitting mini-card (fitting domain; distinct enum from sample status, so
// this stays local rather than reusing sample-options' chip tones).
const verdictTone: Record<string, string> = {
  FITTING_VERDICT_APPROVED: 'border-success text-success bg-success/10',
  FITTING_VERDICT_NEEDS_REWORK: 'border-warning text-warning bg-warning/10',
  FITTING_VERDICT_REJECTED: 'border-error text-error bg-error/10',
};
function verdictChipClass(v?: string): string {
  return `inline-block border px-1.5 py-0.5 text-textBaseSize uppercase ${
    verdictTone[v ?? ''] ?? 'border-textInactiveColor text-textColor'
  }`;
}

// Russian plural agreement for "примерка" (1 примерка, 2 примерки, 5/11 примерок, 21 примерка…).
function fittingsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'примерка';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'примерки';
  return 'примерок';
}

// Card-board summary text (owner decision 1, quoted verbatim): "N примерок · последний вердикт" —
// read without opening the sample. Fittings arrive newest-first (ListFittings ORDER_FACTOR_DESC,
// preserved by useSampleFittings' grouping), so the first entry is the latest.
export function fittingsSummary(fittings: common_Fitting[]): string {
  if (!fittings.length) return 'нет примерок';
  const n = fittings.length;
  return `${n} ${fittingsWord(n)} · последний вердикт: ${verdictLabel(fittings[0].fitting?.verdict)}`;
}

// Fittings that tried this sample on (NF-04): a sample:fittings 1:N link that already existed but
// was invisible (only reachable by filtering the card's whole fitting list). Elevated into its own
// explicit, scannable section — a summary line plus a round/status/verdict mini-card per fitting,
// not a bare list of links — with a shortcut to record a new one that returns here after saving
// (R-5). Shares its grouping (useSampleFittings) with the card board's summary chip.
export function SampleFittings({
  sampleId,
  techCardId,
  returnTo,
}: {
  sampleId: number;
  techCardId: number;
  returnTo: string;
}) {
  const { bySample } = useSampleFittings(techCardId);
  const fittings = bySample.get(sampleId) ?? [];
  const addHref = `${ROUTES.addFitting}?techCardId=${techCardId}&sampleId=${sampleId}&returnTo=${encodeURIComponent(
    returnTo,
  )}`;

  return (
    <div className='flex flex-col gap-2 border-t border-textInactiveColor pt-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-col'>
          <Text variant='uppercase' size='small'>
            примерки на этом семпле
          </Text>
          <Text variant='label' size='small'>
            {fittingsSummary(fittings)}
          </Text>
        </div>
        <Button asChild variant='secondary' size='lg' className='uppercase'>
          <Link to={addHref}>+ примерка на этом семпле</Link>
        </Button>
      </div>
      {/* Empty state is already said once, above (fittingsSummary → "нет примерок") — no need to
          repeat it here. */}
      {fittings.length > 0 && (
        <div className='flex flex-col gap-1'>
          {fittings.map((f) => (
            <Link
              key={f.id}
              to={`/fittings/${f.id}`}
              className='flex flex-wrap items-center justify-between gap-2 border border-textInactiveColor p-2 transition-colors hover:bg-highlightColor/5'
            >
              <Text size='small'>
                round {f.fitting?.roundNumber ?? '—'} · {formatFittingDate(f.fitting?.fittingDate)}
              </Text>
              <div className='flex flex-wrap items-center gap-1.5'>
                <span className={verdictChipClass(f.fitting?.verdict)}>
                  {verdictLabel(f.fitting?.verdict)}
                </span>
                <Text variant='label' size='small'>
                  {statusLabel(f.fitting?.status)} · {f.media?.length ?? 0} photo(s)
                </Text>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
