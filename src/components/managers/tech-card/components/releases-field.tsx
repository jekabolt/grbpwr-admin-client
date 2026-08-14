import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_TechCardBomItem,
  common_TechCardConstruction,
  common_TechCardOperation,
  common_TechCardReleaseMeta,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { techCardBomSectionOptions, techCardStageOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Row, RowTotal } from 'ui/components/row';
import { legacyOverlockThreadsText, legacyPressingText } from './equipment-options';
import { operationHeading } from './operation-options';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { ReleaseBlocker, ReleaseBlockersModal } from './release-blockers-modal';

const bomSectionLabel = (v?: string) =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? v ?? '—';
const stageLabel = (v?: string) => techCardStageOptions.find((o) => o.value === v)?.label ?? '—';

/**
 * What the `create release` button needs from the owner of the form. Optional: without it this
 * component is the read-only history it has always been, and the caller keeps its own button.
 * With it, the button lives here and shares the header's blocker gate — it is never a dead grey
 * button, it opens the blockers modal instead.
 */
export type ReleaseGate = {
  /** Reasons the card can't be released, with the tab that fixes each. Empty = ready. */
  blockers: ReleaseBlocker[];
  /** Freeze the current spec — the caller's `submitWithApproval(RELEASED)`. */
  onRelease: () => void;
  onGoToTab: (tab: string) => void;
  saving?: boolean;
};

// The frozen BOM the factory reads — the whole point of a release snapshot, previously shown only
// as a line count.
function SnapshotBom({ items }: { items: common_TechCardBomItem[] }) {
  if (items.length === 0) {
    return (
      <>
        <GroupLabel>BOM (frozen)</GroupLabel>
        <Text size='micro' variant='label'>
          no BOM lines
        </Text>
      </>
    );
  }
  return (
    <>
      <GroupLabel>BOM (frozen) · {items.length}</GroupLabel>
      <DataTable>
        <thead>
          <tr>
            <th>section</th>
            <th>material</th>
            <th>composition</th>
            <th>spec</th>
            <th>supplier</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b, i) => (
            <tr key={b.id ?? b.lineKey ?? i}>
              <td>{bomSectionLabel(b.section)}</td>
              <td>
                {b.name || <EmptyCell />}
                {b.color ? ` · ${b.color}` : ''}
              </td>
              <td>{b.composition || <EmptyCell />}</td>
              <td>
                {b.spec || <EmptyCell />}
                {b.unit ? ` (${b.unit})` : ''}
              </td>
              <td>
                {b.supplier || <EmptyCell />}
                {b.supplierRef ? ` · ${b.supplierRef}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}

function SnapshotConstruction({ c }: { c?: common_TechCardConstruction }) {
  if (!c) return null;
  const rows = (
    [
      ['default seam class', c.defaultSeamClass],
      ['default stitch density', c.defaultStitchesPerCm?.value],
      // A FROZEN RELEASE IS READ IN THE WORDS IT WAS SIGNED IN. `overlock_thread_count` and
      // `pressing` left the contract with the equipment park (0306), but a release snapshot is
      // immutable protojson that still holds them — reading it through the current generated type
      // would silently drop two lines somebody approved. Live cards simply have neither and the
      // rows below fall away on their own.
      ['overlock threads', legacyOverlockThreadsText(c)],
      ['hem finish', c.hemFinish],
      ['pressing', legacyPressingText(c)],
      ['notes', c.notes],
    ] as Array<[string, string | undefined]>
  ).filter((r): r is [string, string] => !!r[1]?.trim());
  if (rows.length === 0) return null;
  return (
    <>
      <GroupLabel>construction (frozen)</GroupLabel>
      {rows.map(([k, v]) => (
        <Row key={k} label={k} value={v} />
      ))}
    </>
  );
}

function SnapshotOperations({ ops }: { ops: common_TechCardOperation[] }) {
  if (ops.length === 0) return null;
  return (
    <>
      <GroupLabel>operations (frozen) · {ops.length}</GroupLabel>
      {ops.map((o, i) => (
        <Row
          key={i}
          label={
            <Text size='micro' component='span'>
              {o.operationNumber != null ? `#${o.operationNumber} ` : ''}
              {/* Composed, exactly as in the live editor — a frozen release must read the same way
                  the card did, and there is no stored step title to fall back on any more. */}
              {operationHeading({
                operationType: o.operationType,
                zone: o.zone,
                pieceNames: [],
                note: o.note,
              })}
            </Text>
          }
          value={
            o.smv?.value ? (
              <Text size='micro' variant='label' component='span'>
                {`${o.smv.value} min`}
              </Text>
            ) : undefined
          }
        />
      ))}
    </>
  );
}

// The right pane: one frozen snapshot, read as GroupLabel + Row sections. Keyed by release id from
// the caller so switching selection remounts (and re-queries) cleanly.
function ReleaseSnapshot({
  id,
  meta,
  techCardId,
  canReadCosting,
}: {
  id: number;
  meta?: common_TechCardReleaseMeta;
  techCardId: number;
  canReadCosting: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['techCardRelease', id],
    queryFn: () => adminService.GetTechCardRelease({ id }),
  });
  // Colourways aren't part of the frozen snapshot (they're live products, not versioned by
  // release) — show the style's CURRENT colourway count instead of a historical one.
  // techCardId === styleId (R1); this reuses the same cached read as the rest of the
  // constructor, so it's effectively free once the tech-card page has loaded.
  const { data: techCard } = useTechCard(techCardId || undefined);
  const colorwayCount = techCard?.colorways?.length ?? 0;

  // The list row we were handed already carries the header; use it until the detail lands so the
  // pane never flashes empty on selection.
  const head = data?.release ?? meta;
  const snap = data?.snapshot?.techCard;
  const err = data?.snapshotError;

  return (
    <div className='border border-borderColor p-2'>
      <GroupLabel className='mt-0'>
        Rev.{head?.releaseNumber ?? '—'} · frozen {formatTechCardDate(head?.createdAt)} ·{' '}
        {head?.releasedBy || '—'}
      </GroupLabel>

      {isLoading ? (
        <Text size='micro' variant='label'>
          loading…
        </Text>
      ) : err ? (
        /* hero-v2 degradation: an old blob that no longer parses → say so, don't crash */
        <CalloutBox tone='warning'>
          <Text size='micro'>
            This snapshot is incompatible with the current schema and can’t be shown ({err}). The
            release metadata above is still valid.
          </Text>
        </CalloutBox>
      ) : snap ? (
        <>
          <Row label='style' value={`${snap.styleNumber || '—'} · ${snap.name || '—'}`} />
          <Row label='stage' value={stageLabel(snap.stage)} />
          <Row label='BOM' value={`${(snap.bomItems ?? []).length} articles`} />
          <Row label='operations' value={(snap.operations ?? []).length} />
          <Row label='sizes' value={(snap.sizeIds ?? []).length} />
          <Row label='colourways (current)' value={colorwayCount} />
          {/* 🔒 costing: the planned unit cost is only ever rendered with costing:read. */}
          {canReadCosting && (head?.unitCost?.value || snap.costing?.unitCost?.value) ? (
            <RowTotal
              label='unit cost'
              value={
                head?.unitCost?.value
                  ? `${decimalToInput(head.unitCost)} ${head.currency || ''}`.trim()
                  : `${decimalToInput(snap.costing?.unitCost)} ${
                      snap.costing?.currency || ''
                    }`.trim()
              }
            />
          ) : null}

          <SnapshotBom items={snap.bomItems ?? []} />
          <SnapshotConstruction c={snap.construction} />
          <SnapshotOperations ops={snap.operations ?? []} />

          <Text size='micro' variant='label' className='mt-2'>
            Colourways aren’t part of the frozen snapshot (they’re live products) — the count
            reflects the style’s current {colorwayCount} colourway
            {colorwayCount === 1 ? '' : 's'}.
          </Text>
        </>
      ) : (
        <Text size='micro' variant='label'>
          no snapshot payload
        </Text>
      )}
    </div>
  );
}

// Immutable release snapshots (task 11): the frozen factory spec captured each time the card is
// saved in `released`. Read-only history; unit_cost is 🔒 costing.
//
// Two panes rather than a list that swaps itself for a detail screen: you keep your place in the
// list while you read, so comparing Rev.2 against Rev.1 is two clicks and no back button. The
// selection lives in the URL (?rev=N) so a specific snapshot is linkable.
export function ReleasesField({ techCardId, gate }: { techCardId: number; gate?: ReleaseGate }) {
  const { canReadCosting } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [blockersOpen, setBlockersOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['techCardReleases', techCardId],
    queryFn: () => adminService.ListTechCardReleases({ techCardId }),
  });

  const releases = data?.releases ?? [];
  const revParam = params.get('rev');
  // ?rev= carries the human release NUMBER (Rev.2), not the row id — that is what the UI shows and
  // what someone pasting a link means. An unknown/absent value falls back to the newest release
  // rather than an empty pane.
  const selected = releases.find((r) => String(r.releaseNumber ?? '') === revParam) ?? releases[0];

  const select = (rev?: number) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (rev != null) p.set('rev', String(rev));
        else p.delete('rev');
        return p;
      },
      { replace: true },
    );

  const blockers = gate?.blockers ?? [];
  const onCreate = () => {
    if (!gate) return;
    if (blockers.length > 0) {
      setBlockersOpen(true);
      return;
    }
    gate.onRelease();
  };

  return (
    <div className='flex flex-col border border-borderColor bg-bgColor p-3'>
      <SectionHeader
        title='frozen snapshots the factory reads'
        question='— each release freezes the whole spec; the factory may be building from Rev.2 while you edit Rev.3'
        action={
          gate ? (
            <Button
              type='button'
              variant='main'
              size='sm'
              disabled={gate.saving}
              loading={gate.saving}
              onClick={onCreate}
            >
              create release
            </Button>
          ) : undefined
        }
      />
      {gate && (
        <Text size='micro' variant='label' className='mb-1.5'>
          freezes the current spec as the next immutable Rev.N snapshot the factory reads
          {blockers.length > 0
            ? ` — ${blockers.length} thing${blockers.length > 1 ? 's' : ''} still in the way`
            : ''}
        </Text>
      )}

      {isLoading ? (
        <Text size='micro' variant='label'>
          loading…
        </Text>
      ) : releases.length === 0 ? (
        <Text size='micro' variant='label'>
          no releases yet — a frozen Rev.N snapshot is created automatically when the card is saved
          as “released”.
        </Text>
      ) : (
        <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-[140px_1fr]'>
          <div className='border border-borderColor'>
            {releases.map((r) => {
              const active = r.id != null && r.id === selected?.id;
              return (
                <button
                  key={r.id}
                  type='button'
                  aria-current={active ? 'true' : undefined}
                  onClick={() => select(r.releaseNumber)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-hairline px-2 py-1.5 text-left last:border-b-0',
                    active ? 'bg-textColor text-bgColor' : 'hover:bg-bgZebra',
                  )}
                >
                  <Text size='micro' component='span' className='font-bold uppercase'>
                    Rev.{r.releaseNumber ?? '—'}
                  </Text>
                  <Text
                    size='nano'
                    component='span'
                    className={active ? undefined : 'text-labelColor'}
                  >
                    {formatTechCardDate(r.createdAt)}
                  </Text>
                </button>
              );
            })}
          </div>

          {selected?.id != null ? (
            <ReleaseSnapshot
              key={selected.id}
              id={selected.id}
              meta={selected}
              techCardId={techCardId}
              canReadCosting={canReadCosting}
            />
          ) : (
            <Text size='micro' variant='label'>
              pick a release to read its frozen spec
            </Text>
          )}
        </div>
      )}

      {gate && (
        <ReleaseBlockersModal
          blockers={blockers}
          open={blockersOpen}
          onOpenChange={setBlockersOpen}
          onGoToTab={gate.onGoToTab}
        />
      )}
    </div>
  );
}
