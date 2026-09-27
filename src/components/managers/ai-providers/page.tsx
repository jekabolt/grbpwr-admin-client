import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { ROUTES } from 'constants/routes';
import { Navigate, useSearchParams } from 'react-router-dom';
import { CalloutBox } from 'ui/components/callout-box';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import { ViewSwitch, type ViewSwitchOption } from 'ui/components/view-switch';
import { useAiConfig } from './utils/hooks';
import { ProvidersView } from './views/providers';

// admin → AI providers: which services may spend money, which model answers which job, and what
// it cost. Two views in ?view= (accounting reports pattern: the selection lives in searchParams,
// so a view is a link); `providers` is the default and is not written into the address.
type AiView = 'providers' | 'spend';

const VIEWS: readonly ViewSwitchOption<AiView>[] = [
  { value: 'providers', label: 'providers', hint: 'switches, keys and routes' },
  { value: 'spend', label: 'spend', hint: 'what the calls cost, by provider and by account' },
];

export function AiProviders() {
  const { isSuper, resolved, isLoading: accountLoading } = usePermissions();
  // Super only (owner decision D-03): every AiProviders RPC is SuperOnly on the server, and the
  // menu draws the entry for supers only. As on /accounts, the screen closes once the account is
  // known and is not super, and the account goes to its own profile.
  const denied = resolved && !isSuper;

  const [params, setParams] = useSearchParams();
  const view: AiView = params.get('view') === 'spend' ? 'spend' : 'providers';
  const setView = (next: AiView) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'providers') p.delete('view');
        else p.set('view', next);
        return p;
      },
      { replace: true },
    );

  // Not asked before the account is known to be allowed: for anyone else it would only collect a
  // PermissionDenied on every visit.
  const config = useAiConfig(!accountLoading && !denied);
  const data = config.data;

  // While the account is in flight: nothing, rather than the page's title for half a second
  // before a redirect.
  if (accountLoading) return null;
  if (denied) return <Navigate to={ROUTES.me} replace />;

  const placeholder = (text: string) => (
    <Text size='micro' variant='label'>
      {config.isPending ? 'loading…' : text}
    </Text>
  );

  return (
    <div className='flex w-full flex-col gap-4 pb-16'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Text component='h1' variant='uppercase' size='large'>
          ai providers
        </Text>
        <ViewSwitch label='ai providers view' value={view} options={VIEWS} onChange={setView} />
      </div>

      <SectionStack>
        {config.isError && (
          <CalloutBox tone='error'>
            <Text size='micro'>
              couldn't read the AI config
              {config.error instanceof Error && config.error.message
                ? ` — ${config.error.message}`
                : ''}
            </Text>
          </CalloutBox>
        )}

        {view === 'providers' && (
          <>
            <ProvidersView config={data} loading={config.isPending} />
            <Section title='routes' question='which model answers which job'>
              {placeholder(`${data?.purposes?.length ?? 0} purposes`)}
            </Section>
          </>
        )}

        {view === 'spend' && (
          <Section title='spend' question='what the calls cost, by provider and by account'>
            <Text size='micro' variant='label'>
              —
            </Text>
          </Section>
        )}
      </SectionStack>
    </div>
  );
}
