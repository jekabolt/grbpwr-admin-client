import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import { formatFittingDate, statusLabel } from 'components/managers/fittings/components/utils';
import { samplePurposeLabel } from 'components/managers/tech-card/components/sample-options';
import { Link } from 'react-router-dom';
import { TaskLink } from '../utils/links';

// Best-effort name resolution via the linked entity's real single-get RPC.
// Defensive: any shape mismatch or network error falls back to the id label.
// Orders have no display name, so they're never resolved.
function useLinkName(link: TaskLink) {
  return useQuery({
    queryKey: ['tasks', 'link-name', link.kind, link.id || link.orderUuid],
    enabled: link.kind !== 'order',
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      try {
        if (link.kind === 'techcard') {
          const r: any = await adminService.GetTechCard({ id: link.id });
          return r?.techCard?.techCard?.name || null;
        }
        if (link.kind === 'product') {
          const r: any = await adminService.GetProductByID({ id: link.id });
          return (
            r?.product?.product?.productDisplay?.productBody?.translations?.[0]?.name ||
            r?.product?.product?.slug ||
            null
          );
        }
        if (link.kind === 'archive') {
          const r: any = await adminService.GetArchiveByID({ id: link.id });
          return r?.archive?.archiveList?.slug || null;
        }
        if (link.kind === 'fitting') {
          // No name field — compose date · status like the fitting card list.
          const r = await adminService.GetFitting({ id: link.id });
          const f = r?.fitting?.fitting;
          if (!f) return null;
          const date = formatFittingDate(f.fittingDate);
          return [date, statusLabel(f.status)].filter(Boolean).join(' · ') || null;
        }
        if (link.kind === 'sample') {
          // No name field — compose the per-card number + purpose.
          const r = await adminService.GetSample({ id: link.id });
          const s = r?.sample;
          if (!s) return null;
          return `#${s.number ?? link.id} · ${samplePurposeLabel(s.sample?.purpose)}`;
        }
        return null;
      } catch {
        return null;
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
};

export function LinkChip({ link, onNavigate }: { link: TaskLink; onNavigate?: () => void }) {
  const { data: name } = useLinkName(link);
  const text = name ? `${KIND_PREFIX[link.kind]}: ${name}` : link.label;
  return (
    <Link
      to={link.to}
      onClick={onNavigate}
      title={text}
      className='max-w-full truncate border border-textInactiveColor px-2 py-0.5 text-textBaseSize lowercase hover:bg-textColor hover:text-bgColor'
    >
      {text}
    </Link>
  );
}
