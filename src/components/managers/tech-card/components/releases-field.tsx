import { useQuery } from '@tanstack/react-query';
import {
  common_TechCardBomItem,
  common_TechCardConstruction,
  common_TechCardOperation,
} from 'api/proto-http/admin';
import { adminService } from 'api/api';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { techCardBomSectionOptions } from 'constants/filter';
import { ReactNode, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';

const snapCell = 'border border-textInactiveColor px-2 py-1 text-textBaseSize align-top';

const bomSectionLabel = (v?: string) =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? v ?? '—';

function TitledSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className='flex flex-col gap-1 border-t border-textInactiveColor pt-2'>
      <Text variant='uppercase' size='small'>
        {title}
      </Text>
      {children}
    </div>
  );
}

// The frozen BOM the factory reads — the whole point of a release snapshot, previously shown only
// as a line count.
function SnapshotBom({ items }: { items: common_TechCardBomItem[] }) {
  return (
    <TitledSection title='BOM (frozen)'>
      {items.length === 0 ? (
        <Text variant='inactive' size='small'>
          no BOM lines
        </Text>
      ) : (
        <div className='overflow-x-auto'>
          <table className='w-full min-w-max border-collapse'>
            <thead>
              <tr>
                <th className={`${snapCell} text-left uppercase`}>section</th>
                <th className={`${snapCell} text-left uppercase`}>material</th>
                <th className={`${snapCell} text-left uppercase`}>composition</th>
                <th className={`${snapCell} text-left uppercase`}>spec</th>
                <th className={`${snapCell} text-left uppercase`}>supplier</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b, i) => (
                <tr key={b.id ?? b.lineKey ?? i}>
                  <td className={snapCell}>{bomSectionLabel(b.section)}</td>
                  <td className={snapCell}>
                    {b.name || '—'}
                    {b.color ? ` · ${b.color}` : ''}
                  </td>
                  <td className={snapCell}>{b.composition || '—'}</td>
                  <td className={snapCell}>
                    {b.spec || '—'}
                    {b.unit ? ` (${b.unit})` : ''}
                  </td>
                  <td className={snapCell}>
                    {b.supplier || '—'}
                    {b.supplierRef ? ` · ${b.supplierRef}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TitledSection>
  );
}

function SnapshotConstruction({ c }: { c?: common_TechCardConstruction }) {
  if (!c) return null;
  const rows = (
    [
      ['main stitch', c.mainStitchType],
      ['stitch density', c.stitchDensity],
      ['overlock threads', c.overlockThreads],
      ['seam allowances', c.seamAllowances],
      ['hem finish', c.hemFinish],
      ['pressing', c.pressing],
      ['machine class', c.machineClass],
      ['notes', c.notes],
    ] as Array<[string, string | undefined]>
  ).filter((r): r is [string, string] => !!r[1]?.trim());
  if (rows.length === 0) return null;
  return (
    <TitledSection title='construction (frozen)'>
      {rows.map(([k, v]) => (
        <Text key={k} variant='inactive' size='small'>
          {k}: {v}
        </Text>
      ))}
    </TitledSection>
  );
}

function SnapshotOperations({ ops }: { ops: common_TechCardOperation[] }) {
  if (ops.length === 0) return null;
  return (
    <TitledSection title={`operations (frozen) · ${ops.length}`}>
      {ops.map((o, i) => (
        <Text key={i} variant='inactive' size='small'>
          {o.operationNumber != null ? `#${o.operationNumber} ` : ''}
          {o.node || '—'}
          {o.description ? ` — ${o.description}` : ''}
          {o.machine ? ` · ${o.machine}` : ''}
        </Text>
      ))}
    </TitledSection>
  );
}

// Immutable release snapshots (task 11): the frozen factory spec captured each time the
// card is saved in `released`. Read-only history; unit_cost is 🔒 costing.
export function ReleasesField({ techCardId }: { techCardId: number }) {
  const { canReadCosting } = usePermissions();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['techCardReleases', techCardId],
    queryFn: () => adminService.ListTechCardReleases({ techCardId }),
  });

  if (selectedId != null) {
    return (
      <ReleaseDetail
        id={selectedId}
        techCardId={techCardId}
        canReadCosting={canReadCosting}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  if (isLoading) return <Text size='small'>loading…</Text>;
  const releases = data?.releases ?? [];
  if (releases.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        no releases yet — a frozen Rev.N snapshot is created automatically when the card is saved as
        “released”.
      </Text>
    );
  }

  return (
    <div className='flex flex-col gap-1'>
      {releases.map((r) => (
        <div
          key={r.id}
          className='flex flex-wrap items-center justify-between gap-2 border border-textInactiveColor p-2'
        >
          <div className='flex flex-col'>
            <Text size='small'>
              Rev.{r.releaseNumber ?? '—'}
              {r.version ? ` · ${r.version}` : ''}
            </Text>
            <Text variant='inactive' size='small'>
              by {r.releasedBy || '—'}
              {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString()}` : ''}
              {canReadCosting && r.unitCost?.value
                ? ` · unit cost ${decimalToInput(r.unitCost)} ${r.currency || ''}`
                : ''}
            </Text>
          </div>
          <Button
            type='button'
            variant='secondary'
            size='lg'
            className='uppercase'
            onClick={() => r.id != null && setSelectedId(r.id)}
          >
            view snapshot
          </Button>
        </div>
      ))}
    </div>
  );
}

function ReleaseDetail({
  id,
  techCardId,
  canReadCosting,
  onBack,
}: {
  id: number;
  techCardId: number;
  canReadCosting: boolean;
  onBack: () => void;
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

  const meta = data?.release;
  const snap = data?.snapshot?.techCard;
  const err = data?.snapshotError;

  return (
    <div className='flex flex-col gap-3'>
      <Button
        type='button'
        variant='secondary'
        size='lg'
        className='self-start uppercase'
        onClick={onBack}
      >
        ← back to releases
      </Button>

      {isLoading ? (
        <Text size='small'>loading…</Text>
      ) : (
        <>
          <div className='flex flex-col gap-1 border border-textInactiveColor p-3'>
            <Text size='small'>
              frozen release · Rev.{meta?.releaseNumber ?? '—'}
              {meta?.version ? ` · ${meta.version}` : ''}
            </Text>
            <Text variant='inactive' size='small'>
              by {meta?.releasedBy || '—'}
              {meta?.createdAt ? ` · ${new Date(meta.createdAt).toLocaleDateString()}` : ''}
              {canReadCosting && meta?.unitCost?.value
                ? ` · unit cost ${decimalToInput(meta.unitCost)} ${meta.currency || ''}`
                : ''}
            </Text>
          </div>

          {/* hero-v2 degradation: old blob that no longer parses → show a banner, don't crash */}
          {err ? (
            <div className='border border-warning p-3'>
              <Text size='small' className='block text-warning'>
                This snapshot is incompatible with the current schema and can’t be shown ({err}).
                The release metadata above is still valid.
              </Text>
            </div>
          ) : snap ? (
            <div className='flex flex-col gap-3 border border-textInactiveColor p-3'>
              <div className='flex flex-col gap-1'>
                <Text variant='uppercase' size='small'>
                  frozen spec
                </Text>
                <Text variant='inactive' size='small'>
                  {snap.styleNumber || '—'} · {snap.name || '—'} · stage {snap.stage || '—'}
                </Text>
                <Text variant='inactive' size='small'>
                  {(snap.bomItems ?? []).length} BOM lines · {colorwayCount} colourways ·{' '}
                  {(snap.sizeIds ?? []).length} sizes · {(snap.operations ?? []).length} operations
                </Text>
                {canReadCosting && snap.costing?.unitCost?.value && (
                  <Text variant='inactive' size='small'>
                    costing unit cost: {decimalToInput(snap.costing.unitCost)}{' '}
                    {snap.costing.currency || ''}
                  </Text>
                )}
              </div>

              <SnapshotBom items={snap.bomItems ?? []} />
              <SnapshotConstruction c={snap.construction} />
              <SnapshotOperations ops={snap.operations ?? []} />

              <Text variant='inactive' size='small'>
                Colourways aren’t part of the frozen snapshot (they’re live products) — the count
                reflects the style’s current {colorwayCount} colourway
                {colorwayCount === 1 ? '' : 's'}.
              </Text>
            </div>
          ) : (
            <Text variant='inactive' size='small'>
              no snapshot payload
            </Text>
          )}
        </>
      )}
    </div>
  );
}
