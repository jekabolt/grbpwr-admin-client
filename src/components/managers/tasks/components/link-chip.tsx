import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { formatFittingDate, statusLabel } from 'components/managers/fittings/components/utils';
import { runStatusLabel } from 'components/managers/production-runs/components/options';
import { samplePurposeLabel } from 'components/managers/tech-card/components/sample-options';
import { Link } from 'react-router-dom';
import { TaskLink } from '../utils/links';

// Best-effort resolution via the linked entity's real single-get RPC: a display name and,
// for samples, the authoritative deep link (the sample's OWN techCardId — the task's techcard
// picker is independent, so links.ts can only guess the owning style).
// Defensive: any shape mismatch or network error falls back to the id label / static route.
// Orders have no display name, so they're never resolved.
type ResolvedLink = { name: string | null; to?: string };

function useLinkName(link: TaskLink) {
  return useQuery({
    queryKey: ['tasks', 'link-name', link.kind, link.id || link.orderUuid],
    enabled: link.kind !== 'order',
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<ResolvedLink> => {
      try {
        if (link.kind === 'techcard') {
          const r: any = await adminService.GetTechCard({ id: link.id });
          return { name: r?.techCard?.techCard?.name || null };
        }
        if (link.kind === 'product') {
          const r: any = await adminService.GetColorwayByID({ colorwayId: link.id });
          return {
            name:
              r?.colorway?.colorway?.display?.translations?.[0]?.name ||
              r?.colorway?.colorway?.slug ||
              null,
          };
        }
        if (link.kind === 'archive') {
          const r: any = await adminService.GetArchiveByID({ id: link.id });
          return { name: r?.archive?.archiveList?.slug || null };
        }
        if (link.kind === 'fitting') {
          // No name field — compose date · status like the fitting card list.
          const r = await adminService.GetFitting({ id: link.id });
          const f = r?.fitting?.fitting;
          if (!f) return { name: null };
          const date = formatFittingDate(f.fittingDate);
          return { name: [date, statusLabel(f.status)].filter(Boolean).join(' · ') || null };
        }
        if (link.kind === 'sample') {
          // No name field — compose the per-card number + purpose, and rebuild the deep
          // link from the sample's own owning tech card.
          const r = await adminService.GetSample({ id: link.id });
          const s = r?.sample;
          if (!s) return { name: null };
          const tcId = s.sample?.techCardId;
          return {
            name: `#${s.number ?? link.id} · ${samplePurposeLabel(s.sample?.purpose)}`,
            to: tcId ? `/tech-cards/${tcId}?tab=samples&sample=${link.id}` : undefined,
          };
        }
        if (link.kind === 'run') {
          // No name field — compose status + owning style.
          const r = await adminService.GetProductionRun({ id: link.id });
          const run = r?.run?.run;
          if (!run) return { name: null };
          const tc = run.techCardId ? ` · техкарта #${run.techCardId}` : '';
          return { name: `#${link.id} · ${runStatusLabel(run.status)}${tc}` };
        }
        return { name: null };
      } catch {
        return { name: null };
      }
    },
  });
}

const KIND_PREFIX: Record<TaskLink['kind'], string> = {
  techcard: 'техкарта',
  product: 'product',
  order: 'order',
  archive: 'drop',
  fitting: 'примерка',
  sample: 'образец',
  run: 'партия',
};

export function LinkChip({ link, onNavigate }: { link: TaskLink; onNavigate?: () => void }) {
  const { data } = useLinkName(link);
  const text = data?.name ? `${KIND_PREFIX[link.kind]}: ${data.name}` : link.label;
  return (
    <Link
      to={data?.to ?? link.to}
      onClick={onNavigate}
      title={text}
      className='max-w-full truncate border border-textInactiveColor px-2 py-0.5 text-textBaseSize lowercase hover:bg-textColor hover:text-bgColor'
    >
      {text}
    </Link>
  );
}
