import type { TeamBrand } from 'api/proto-http/admin';
import type { PrintDep, PrintDepStatus } from 'components/managers/print/use-print-ready';
import type { LabelBrand } from 'components/managers/tech-card/care-labels/print-job';
import { currentHost } from 'lib/host';
import { cn } from 'lib/utility';
import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { GrbpwrMark } from 'ui';
import { type PaperBrand, resolvePaperBrand } from './paper-brand';
import { useWorkspace } from './use-workspace';

// The team brand every factory paper reads (W-spec §5). No provider (tests, public pages) = teams
// OFF: today's literals. The provider sits inside `WorkspaceProvider`.

type Source = { brand: TeamBrand | null; logoUrl: string; status: PrintDepStatus };

const HOUSE_SOURCE: Source = { brand: null, logoUrl: '', status: 'ok' };
/** A team whose brand is not known (yet): prints nothing, never GRBPWR. */
const BLANK: TeamBrand = {
  brandName: '',
  legalEntity: '',
  legalAddress: [],
  contactEmail: '',
  website: '',
  firstTeam: false,
  unavailable: true,
};

const Ctx = createContext<Source>(HOUSE_SOURCE);

/** Where the brand comes from on this host, for the print gate too. */
export function paperSource(
  hostKind: 'root' | 'console' | 'team' | 'legacy',
  ws: { brand?: TeamBrand | null; logoUrl?: string } | null,
  loading: boolean,
): Source {
  const legacy = hostKind === 'legacy';
  if (ws) {
    // a team host never prints GRBPWR for a missing brand (a server before the brand field)
    const brand = ws.brand ?? (legacy ? null : BLANK);
    return { brand, logoUrl: ws.logoUrl ?? '', status: brand?.unavailable ? 'error' : 'ok' };
  }
  if (loading) return { brand: legacy ? null : BLANK, logoUrl: '', status: 'pending' };
  // legacy host without a workspace = today's app; a team host without one = unknown
  return legacy ? HOUSE_SOURCE : { brand: BLANK, logoUrl: '', status: 'error' };
}

export function PaperBrandProvider({ children }: { children: ReactNode }) {
  const { workspace, gate } = useWorkspace();
  const has = !!workspace;
  const brand = workspace?.brand;
  const logoUrl = workspace?.logoUrl;
  const value = useMemo(
    () => paperSource(currentHost().kind, has ? { brand, logoUrl } : null, gate === 'loading'),
    [has, brand, logoUrl, gate],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The paper brand; `vatId` is the build's seller VAT id (the invoice only). */
export function usePaperBrand(vatId = ''): PaperBrand {
  const src = useContext(Ctx);
  return useMemo(
    () => resolvePaperBrand(src.brand, src.logoUrl, vatId),
    [src.brand, src.logoUrl, vatId],
  );
}

/** The print gate's `workspace` dep: `error` when the brand cannot be read. */
export function usePaperBrandDep(): PrintDep {
  const { status } = useContext(Ctx);
  return { label: 'workspace', status };
}

/** What the care label takes from the team; `undefined` = teams OFF (the tape as it was). */
export function labelBrand(pb: PaperBrand): LabelBrand | undefined {
  if (pb.mode === 'house') return undefined;
  return { company: pb.company ?? [], houseMark: pb.labelHouseMark };
}

export function useLabelBrand(): LabelBrand | undefined {
  const pb = usePaperBrand();
  return useMemo(() => labelBrand(pb), [pb]);
}

/**
 * The mark at the head of an HTML paper: the house vector mark (same markup as before), the team
 * logo, or nothing.
 */
export function PaperMark({ brand, className }: { brand: PaperBrand; className?: string }) {
  if (brand.mark === 'house') return <GrbpwrMark className={className} />;
  if (brand.mark === 'team')
    return <img src={brand.logoUrl} alt='' className={cn(className, 'object-contain')} />;
  return null;
}

/** A fixed brand for one subtree (tests, the dev print bench). */
export function PaperBrandOverride({
  brand,
  logoUrl = '',
  children,
}: {
  brand: TeamBrand | null;
  logoUrl?: string;
  children: ReactNode;
}) {
  const value = useMemo<Source>(
    () => ({ brand, logoUrl, status: brand?.unavailable ? 'error' : 'ok' }),
    [brand, logoUrl],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
