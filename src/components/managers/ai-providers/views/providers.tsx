import type {
  AiModelInfo,
  AiProbeResult,
  AiProviderInfo,
  GetAiProvidersConfigResponse,
} from 'api/proto-http/admin';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { ToggleSwitch } from 'ui/components/toggle-switch';
import { adminKeyLine, faultLabel, keyLine, probeLine, type KeyLine } from '../utils/format';
import { useSetAiProviderKey, useUpdateAiProvider, type AiKeyKind } from '../utils/hooks';

// PROVIDERS — which services may spend money. One line per provider of the registry, in the
// server's order: name (+ the server's one-line note) · fault badge · "paused" · the switch.
// One control = one action (02-PLAN A6): the switch saves itself; the name opens ONE panel at a
// time with the key slot(s) and the model list. No Save bar anywhere.
export function ProvidersView({
  config,
  loading,
}: {
  config: GetAiProvidersConfigResponse | undefined;
  loading: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const providers = config?.providers ?? [];
  // Without the master key the server refuses to store a key; the fields say so by being off.
  const keysLocked = config?.masterKeyPresent === false;

  return (
    <>
      {/* Above the block, not inside it: a callout is a box of its own, and a block never holds
          another box (DESIGN.md, "The Block"). */}
      {keysLocked && (
        <CalloutBox tone='warning'>
          <Text size='micro'>
            keys cannot be stored until AI_KEYS_MASTER_KEY is set on the server; providers keep
            using their env keys
          </Text>
        </CalloutBox>
      )}
      <Section title='providers' question='which services may spend money'>
        {!config ? (
          <Text size='micro' variant='label'>
            {loading ? 'loading…' : '—'}
          </Text>
        ) : providers.length === 0 ? (
          <Text size='micro' variant='label'>
            no providers on this server
          </Text>
        ) : (
          <div className='divide-y divide-hairline'>
            {providers.map((p) => (
              <ProviderRow
                key={p.key}
                provider={p}
                open={openKey === p.key}
                onOpenChange={(open) => setOpenKey(open ? (p.key ?? null) : null)}
                keysLocked={keysLocked}
              />
            ))}
          </div>
        )}

        {config && (
          <Text size='micro' variant='label'>
            master key: {config.masterKeyPresent ? 'present' : 'missing'} · timezone:{' '}
            {config.timezone || '—'} · prices: {config.priceVersion || '—'}
          </Text>
        )}
      </Section>
    </>
  );
}

function ProviderRow({
  provider: p,
  open,
  onOpenChange,
  keysLocked,
}: {
  provider: AiProviderInfo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keysLocked: boolean;
}) {
  const toggle = useUpdateAiProvider();
  const key = p.key ?? '';
  const name = p.label || key;
  // While the switch's own write is in flight it shows what was asked; a refusal snaps it back
  // (the hook re-reads the config either way).
  const enabled = toggle.isPending && toggle.variables ? toggle.variables.enabled : !!p.enabled;
  const fault = faultLabel(p.faultCode);
  const panelId = `ai-provider-panel-${key}`;

  return (
    <div data-provider={key} className='py-1'>
      <div className='flex items-start justify-between gap-2.5'>
        <div className='min-w-0'>
          <button
            type='button'
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => onOpenChange(!open)}
            className='flex cursor-pointer items-baseline gap-1.5 text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
          >
            <span aria-hidden className='w-2 text-labelColor'>
              {open ? '−' : '+'}
            </span>
            <span className='break-words'>{name}</span>
          </button>
          {p.note && (
            <Text size='micro' variant='label' className='pl-3.5'>
              {p.note}
            </Text>
          )}
        </div>
        <div className='flex shrink-0 items-center gap-2'>
          {fault && <Pill tone='attention'>{fault}</Pill>}
          {p.breaker === 'open' && (
            <Pill tone='warn' title='failing calls tripped the breaker — new calls skip it for now'>
              paused
            </Pill>
          )}
          <label className='flex cursor-pointer items-center gap-1.5'>
            <ToggleSwitch
              checked={enabled}
              disabled={toggle.isPending}
              onCheckedChange={(next) => toggle.mutate({ providerKey: key, enabled: next })}
            />
            <span className='sr-only'>use {name}</span>
            <Text component='span' size='micro' variant='label' aria-hidden className='w-6 uppercase'>
              {enabled ? 'on' : 'off'}
            </Text>
          </label>
        </div>
      </div>

      {open && (
        <div id={panelId} className='mt-1 mb-1.5 flex flex-col gap-2.5 pl-3.5'>
          <KeySlot provider={p} kind='api' line={keyLine(p)} locked={keysLocked} />
          {p.adminKeySupported && (
            <KeySlot provider={p} kind='admin' line={adminKeyLine(p)} locked={keysLocked} />
          )}
          <ModelList models={p.models ?? []} />
        </div>
      )}
    </div>
  );
}

// ONE field and ONE button per slot. Saving is the check: the server stores the key, probes it with
// the provider's free endpoint and answers with the result, which is shown under the key line. The
// value leaves the field the moment it is stored and is never shown back — only its last four.
function KeySlot({
  provider: p,
  kind,
  line,
  locked,
}: {
  provider: AiProviderInfo;
  kind: AiKeyKind;
  line: KeyLine;
  locked: boolean;
}) {
  const save = useSetAiProviderKey();
  const [value, setValue] = useState('');
  const [probe, setProbe] = useState<AiProbeResult | null>(null);
  const key = p.key ?? '';
  const fieldName = `ai-key-${key}-${kind}`;
  const trimmed = value.trim();
  const result = probe ? probeLine(probe) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed || locked || save.isPending) return;
    setProbe(null);
    save.mutate(
      { providerKey: key, kind, value: trimmed },
      {
        onSuccess: (resp) => {
          setValue('');
          setProbe(resp.probe ?? null);
        },
      },
    );
  };

  return (
    <form onSubmit={submit} autoComplete='off' className='flex flex-col gap-1'>
      <Text size='micro' variant={line.broken ? 'errorLabel' : 'label'}>
        {line.broken && '! '}
        {line.text}
      </Text>
      <div className='flex flex-wrap items-center gap-1.5'>
        <label htmlFor={fieldName} className='sr-only'>
          {kind === 'admin' ? `${p.label || key} reconciliation key` : `${p.label || key} key`}
        </label>
        <Input
          type='password'
          name={fieldName}
          value={value}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
          // A password field is where a browser offers the admin's own saved login: `new-password`
          // is the one value it respects, and the two data attributes keep 1Password and LastPass
          // off a field that holds a provider's secret.
          autoComplete='new-password'
          spellCheck={false}
          data-1p-ignore=''
          data-lpignore='true'
          placeholder={kind === 'admin' ? 'paste the admin key' : 'paste a new key'}
          disabled={locked || save.isPending}
          className='w-64 max-w-full'
        />
        <Button
          type='submit'
          variant='secondary'
          size='sm'
          disabled={locked || !trimmed || save.isPending}
          loading={save.isPending}
        >
          save key
        </Button>
      </div>
      {result && (
        <Text
          size='micro'
          role='status'
          variant={result.ok ? 'default' : 'errorLabel'}
          className={result.ok ? 'text-success' : undefined}
          title={result.detail || undefined}
        >
          {result.ok ? '✓ ' : '! '}
          {result.text}
        </Text>
      )}
    </form>
  );
}

// Read-only: the curated catalogue plus the custom slugs an admin typed into a route. Choosing a
// model happens in the routes block, not here.
function ModelList({ models }: { models: AiModelInfo[] }) {
  if (models.length === 0) {
    return (
      <Text size='micro' variant='label'>
        models: none on file
      </Text>
    );
  }
  return (
    <div className='flex flex-col gap-0.5'>
      <Text size='micro' variant='label'>
        models
      </Text>
      <ul className='flex flex-wrap gap-x-3 gap-y-0.5'>
        {models.map((m) => {
          const tags = [m.custom && 'custom', !m.priced && 'no price'].filter(Boolean).join(' · ');
          return (
            <li key={`${m.kind}:${m.slug}`} title={m.label || undefined}>
              <Text component='span' size='micro'>
                {m.slug}
              </Text>
              {tags && (
                <Text component='span' size='micro' variant='label'>
                  {' '}
                  · {tags}
                </Text>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
