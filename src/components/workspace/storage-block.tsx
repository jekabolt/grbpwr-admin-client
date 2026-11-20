import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { gb, storageOf, storagePct } from 'components/console/model';
import { Progress, Row, Section } from 'ui';

export const storageKeys = { mine: () => ['team', 'storage'] as const };

/** The team's own storage (lane X11): used / cap and a thin rail; red when uploads are refused. */
export function WorkspaceStorage() {
  const q = useQuery({
    queryKey: storageKeys.mine(),
    queryFn: () => adminService.GetTeamStorage({}),
  });
  if (!q.data) return null;
  const s = storageOf({ storageUsedBytes: q.data.usedBytes, storageCapBytes: q.data.capBytes });
  if (!s.used && !s.cap) return null; // nothing counted here (teams mode off)
  return (
    <Section title='storage'>
      <Row
        label='used'
        tone={s.full ? 'error' : undefined}
        value={s.cap ? `${gb(s.used)} / ${gb(s.cap)} gb` : `${gb(s.used)} gb`}
      />
      {s.cap > 0 && <Progress value={storagePct(s)} className='mt-1 h-0.5' />}
    </Section>
  );
}
