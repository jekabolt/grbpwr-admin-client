import type {
  AiModelInfo,
  AiProviderInfo,
  AiPurposeInfo,
  AiRouteCandidate,
  GetAiProvidersConfigResponse,
} from 'api/proto-http/admin';
import { useId, useState } from 'react';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { useSetAiDefaults, useSetAiRoute } from '../utils/hooks';

// ROUTES — which model answers which job. The purposes, their labels, hints and groups all come
// from the server (`purposes[]`); nothing here names a purpose. On top, the two defaults a route's
// "default" candidate means; below, one line per purpose: primary · fallback. Every control saves
// itself (02-PLAN A6): a select on change, a model field when it is committed (Enter or leaving
// it — the moment a text field's own `change` fires). No Save button, no reordering, no policy.

// The panel's headings, in this order; a group a newer server adds goes after them, not nowhere.
const GROUP_ORDER = ['chat', 'images', '3d'];

// Select values for the two candidates that are not a provider key. "" cannot be used: the select
// primitive reserves it, and here "" already means "the default provider" on the wire.
const DEFAULT = '__default';
const NONE = '__none';

type Candidate = { providerKey: string; model: string };

const norm = (c: AiRouteCandidate | undefined): Candidate => ({
  providerKey: c?.providerKey ?? '',
  model: c?.model ?? '',
});

const serves = (p: AiProviderInfo, capability: string) =>
  (p.capabilities ?? []).includes(capability);

const labelOf = (providers: AiProviderInfo[], key: string) =>
  providers.find((p) => p.key === key)?.label || key;

// A candidate whose provider is switched off: its calls walk past it. "" is the capability's default
// provider, so it is that provider's switch that counts; a capability with no default names no one.
function providerOff(
  config: GetAiProvidersConfigResponse,
  capability: string,
  c: Candidate | undefined,
): boolean {
  if (!c) return false;
  const key = c.providerKey || defaultKeyFor(config, capability) || '';
  if (!key) return false;
  const p = (config.providers ?? []).find((x) => x.key === key);
  return !!p && !p.enabled;
}

// THE FALLBACK IS NEVER THE PRIMARY (the server refuses it: field `fallback`, `same_as_primary`).
// Same-ness is the server's rule: the model is equal AND the provider is equal once "" is resolved to
// the capability's default provider — chat → the default chat provider, image → the default image
// provider, a blank default → openrouter.
const BLANK_DEFAULT = 'openrouter';
const SAME_AS_PRIMARY =
  'the fallback is the primary itself; choose another provider or model, or no fallback';

function resolvedProvider(
  config: GetAiProvidersConfigResponse,
  capability: string,
  providerKey: string,
): string {
  if (providerKey) return providerKey;
  const d = defaultKeyFor(config, capability);
  return d === null ? '' : d || BLANK_DEFAULT;
}

function sameCandidate(
  config: GetAiProvidersConfigResponse,
  capability: string,
  a: Candidate,
  b: Candidate,
): boolean {
  return (
    a.model === b.model &&
    resolvedProvider(config, capability, a.providerKey) ===
      resolvedProvider(config, capability, b.providerKey)
  );
}

// What choosing a provider in one candidate's select would do, given the OTHER candidate. A new
// provider starts on its own default model (""), so the pair it would make is (choice, ""):
// identical to the other → the choice is not offered; the same provider as the other but with the
// other on a named model → the choice is STAGED (the model field asks for a model before anything is
// sent); anything else is sent at once.
type ChoiceFate = 'send' | 'stage' | 'omit';

function choiceFate(
  config: GetAiProvidersConfigResponse,
  capability: string,
  choice: string,
  other: Candidate | undefined,
): ChoiceFate {
  if (!other || choice === NONE) return 'send';
  const providerKey = choice === DEFAULT ? '' : choice;
  if (
    resolvedProvider(config, capability, providerKey) !==
    resolvedProvider(config, capability, other.providerKey)
  )
    return 'send';
  return other.model === '' ? 'omit' : 'stage';
}

// Only chat and image have a default provider (proto: AiRouteCandidate.provider_key).
function defaultKeyFor(config: GetAiProvidersConfigResponse, capability: string): string | null {
  if (capability === 'chat') return config.defaultChatProviderKey ?? '';
  if (capability === 'image') return config.defaultImageProviderKey ?? '';
  return null;
}

function providerItems(providers: AiProviderInfo[], capability: string) {
  return providers
    .filter((p) => serves(p, capability))
    .map((p) => ({
      value: p.key ?? '',
      // A switched-off provider stays choosable — its routes skip it until it is back on — but
      // says so, or a route would look live while every call walks past it.
      label: p.enabled ? p.label || p.key || '' : `${p.label || p.key} · off`,
    }));
}

export function RoutesView({
  config,
  loading,
}: {
  config: GetAiProvidersConfigResponse | undefined;
  loading: boolean;
}) {
  const purposes = config?.purposes ?? [];
  const groups = groupPurposes(purposes);

  return (
    <Section title='routes' question='which model answers which job'>
      {!config ? (
        <Text size='micro' variant='label'>
          {loading ? 'loading…' : '—'}
        </Text>
      ) : (
        <>
          <DefaultsRow config={config} />
          {groups.length === 0 && (
            <Text size='micro' variant='label'>
              no purposes on this server
            </Text>
          )}
          {groups.map((g) => (
            <div key={g.key} data-route-group={g.key}>
              <GroupLabel>{g.key}</GroupLabel>
              <div className='divide-y divide-hairline'>
                {g.purposes.map((p) => (
                  <PurposeRow key={p.key} purpose={p} config={config} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </Section>
  );
}

function groupPurposes(purposes: AiPurposeInfo[]) {
  const byGroup = new Map<string, AiPurposeInfo[]>();
  for (const p of purposes) {
    const g = (p.group ?? '').trim() || 'other';
    byGroup.set(g, [...(byGroup.get(g) ?? []), p]);
  }
  const rest = [...byGroup.keys()].filter((g) => !GROUP_ORDER.includes(g));
  return [...GROUP_ORDER, ...rest]
    .filter((g) => byGroup.has(g))
    .map((g) => ({ key: g, purposes: byGroup.get(g) ?? [] }));
}

// The two defaults. Both travel in every write; the one not touched goes as "" — "unchanged" —
// so this select never re-sends the other one's value over a change made elsewhere.
function DefaultsRow({ config }: { config: GetAiProvidersConfigResponse }) {
  const save = useSetAiDefaults();
  const providers = config.providers ?? [];
  const pending = save.isPending ? save.variables : undefined;
  const chat = pending?.chatProviderKey || config.defaultChatProviderKey || '';
  const image = pending?.imageProviderKey || config.defaultImageProviderKey || '';

  return (
    <div data-route-defaults='' className='flex flex-wrap items-end gap-x-4 gap-y-1.5'>
      <Labelled label='default for chat'>
        <SelectComponent
          name='ai-default-chat'
          placeholder='default for chat'
          value={chat}
          items={providerItems(providers, 'chat')}
          disabled={save.isPending}
          className='w-48'
          onValueChange={(v: string) => {
            if (v && v !== chat) save.mutate({ chatProviderKey: v, imageProviderKey: '' });
          }}
        />
      </Labelled>
      <Labelled label='default for images'>
        <SelectComponent
          name='ai-default-image'
          placeholder='default for images'
          value={image}
          items={providerItems(providers, 'image')}
          disabled={save.isPending}
          className='w-48'
          onValueChange={(v: string) => {
            if (v && v !== image) save.mutate({ chatProviderKey: '', imageProviderKey: v });
          }}
        />
      </Labelled>
      <Text size='micro' variant='label' className='pb-1'>
        a route set to “default” uses these
      </Text>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='flex flex-col gap-0.5'>
      <Text size='micro' variant='label' tracking='label' className='uppercase'>
        {label}
      </Text>
      {children}
    </div>
  );
}

// One purpose: primary (required) and fallback (optional). A change to either sends the WHOLE
// route — the other candidate as it stands — so nothing is left to a server default.
function PurposeRow({
  purpose,
  config,
}: {
  purpose: AiPurposeInfo;
  config: GetAiProvidersConfigResponse;
}) {
  const route = useSetAiRoute();
  const key = purpose.key ?? '';
  const label = purpose.label || key;
  const capability = purpose.capability ?? '';
  const pending = route.isPending ? route.variables : undefined;
  // An absent fallback arrives as null (the gateway emits unpopulated fields), not undefined.
  const shownFallback = pending ? pending.fallback : purpose.fallback;
  const primary = norm(pending ? pending.primary : purpose.primary);
  const serverFallback = shownFallback ? norm(shownFallback) : undefined;
  // A fallback provider chosen but not sent yet: the same provider as the primary, which needs a
  // model of its own first. Only the model field can send it.
  const [staged, setStaged] = useState<string | null>(null);
  const fallback: Candidate | undefined =
    staged !== null ? { providerKey: staged === DEFAULT ? '' : staged, model: '' } : serverFallback;
  // The server's sentence, said before the server has to: a pair that would be refused is not sent.
  const [sameError, setSameError] = useState(false);

  const send = (next: { primary: Candidate; fallback?: Candidate }) => {
    if (next.fallback && sameCandidate(config, capability, next.primary, next.fallback)) {
      setSameError(true);
      return;
    }
    setSameError(false);
    setStaged(null);
    route.mutate({ purpose: key, primary: next.primary, fallback: next.fallback });
  };
  const chooseFallback = (value: string) => {
    setSameError(false);
    if (value === NONE) {
      setStaged(null);
      // Unstaging a fallback the server never had changes nothing on the server.
      if (serverFallback) send({ primary });
      return;
    }
    if (choiceFate(config, capability, value, primary) === 'stage') {
      setStaged(value);
      return;
    }
    send({ primary, fallback: { providerKey: value === DEFAULT ? '' : value, model: '' } });
  };
  const primaryOff = providerOff(config, capability, primary);
  const fallbackOff = providerOff(config, capability, serverFallback);

  return (
    <div
      data-purpose={key}
      className='flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5 py-1.5'
    >
      <div className='min-w-0 flex-1 basis-56'>
        <Text>{label}</Text>
        {purpose.hint && (
          <Text size='micro' variant='label'>
            {purpose.hint}
          </Text>
        )}
        {/* The fault pill's colour (attention), said in words — no pill: this is the route's
            state, not the provider's, and the provider's own row already carries its switch. */}
        {primaryOff && (
          <Text size='micro' variant='label' className='text-warning' data-route-warning='primary'>
            primary provider is off
          </Text>
        )}
        {fallbackOff && (
          <Text size='micro' variant='label' className='text-warning' data-route-warning='fallback'>
            fallback provider is off
          </Text>
        )}
      </div>
      {/* Top-aligned: a sentence under one candidate (a refusal, a staged provider's ask) hangs
          below it instead of pushing the other candidate's select down out of line. */}
      <div className='flex flex-wrap items-start gap-x-4 gap-y-1.5'>
        <CandidateControls
          role='primary'
          purposeLabel={label}
          capability={capability}
          config={config}
          value={primary}
          other={serverFallback}
          disabled={route.isPending}
          onChoose={(v) =>
            send({
              primary: { providerKey: v === DEFAULT ? '' : v, model: '' },
              fallback: serverFallback,
            })
          }
          onModel={(model) => send({ primary: { ...primary, model }, fallback: serverFallback })}
        />
        <CandidateControls
          role='fallback'
          purposeLabel={label}
          capability={capability}
          config={config}
          value={fallback}
          other={primary}
          staged={staged !== null}
          disabled={route.isPending}
          error={sameError ? SAME_AS_PRIMARY : null}
          onChoose={chooseFallback}
          onModel={(model) => fallback && send({ primary, fallback: { ...fallback, model } })}
        />
      </div>
    </div>
  );
}

function CandidateControls({
  role,
  purposeLabel,
  capability,
  config,
  value,
  other,
  staged = false,
  disabled,
  error = null,
  onChoose,
  onModel,
}: {
  role: 'primary' | 'fallback';
  purposeLabel: string;
  capability: string;
  config: GetAiProvidersConfigResponse;
  value: Candidate | undefined;
  /** The route's other candidate: a choice that would copy it is not offered. */
  other: Candidate | undefined;
  /** A fallback provider chosen but waiting for its model. */
  staged?: boolean;
  disabled: boolean;
  /** One sentence under the control, in the error colour. */
  error?: string | null;
  onChoose: (value: string) => void;
  onModel: (model: string) => void;
}) {
  const providers = config.providers ?? [];
  const defaultKey = defaultKeyFor(config, capability);
  const selected = !value ? NONE : value.providerKey || DEFAULT;

  const items: { value: string; label: string }[] = [
    ...(role === 'fallback' ? [{ value: NONE, label: 'none' }] : []),
    ...(defaultKey !== null
      ? [
          {
            value: DEFAULT,
            label: `default · ${defaultKey ? labelOf(providers, defaultKey) : 'not set'}`,
          },
        ]
      : []),
    ...providerItems(providers, capability),
  ].filter((i) => i.value === selected || choiceFate(config, capability, i.value, other) !== 'omit');
  // A route the server holds is shown as it is even when it no longer fits the list (a provider
  // that stopped serving the capability): an empty select would claim there is no route at all.
  if (!items.some((i) => i.value === selected)) {
    items.push({
      value: selected,
      label: selected === DEFAULT ? 'default' : labelOf(providers, selected),
    });
  }

  // The provider that actually answers — the default one for a "default" candidate — lends its
  // models of this capability to the model field's suggestions.
  const answering = value ? value.providerKey || defaultKey || '' : '';
  const models = (providers.find((p) => p.key === answering)?.models ?? []).filter(
    (m) => m.kind === capability,
  );

  return (
    <div className='flex flex-col gap-0.5' data-candidate={role}>
      <Text size='micro' variant='label' tracking='label' className='uppercase'>
        {role}
      </Text>
      <div className='flex flex-wrap items-center gap-1'>
        <SelectComponent
          name={`ai-route-${role}`}
          placeholder={`${purposeLabel} ${role}`}
          value={selected}
          items={items}
          disabled={disabled}
          invalid={!!error}
          className='w-48'
          onValueChange={(v: string) => {
            if (!v || v === selected) return;
            onChoose(v);
          }}
        />
        {value ? (
          <ModelField
            key={`${answering}|${value.model}|${staged ? 'staged' : ''}`}
            label={`${purposeLabel} ${role} model`}
            value={value.model}
            models={models}
            disabled={disabled}
            invalid={!!error}
            placeholder={staged ? 'type a model' : 'provider default'}
            onCommit={onModel}
          />
        ) : (
          // No fallback, no model: the slot stays, so the columns of the next row still line up.
          <span aria-hidden className='hidden w-48 sm:block' />
        )}
      </div>
      {staged && !error && other && (
        <Text size='micro' variant='label' className='max-w-96'>
          same provider as the primary: type a model other than {other.model}
        </Text>
      )}
      {error && (
        <Text
          size='micro'
          variant='errorLabel'
          role='alert'
          className='max-w-96'
          data-write-error={`route-${role}`}
        >
          ! {error}
        </Text>
      )}
    </div>
  );
}

// The provider's models of this capability as suggestions, any other slug as free text (the server
// files an unknown one as a custom model). "" = the provider's own default model.
function ModelField({
  label,
  value,
  models,
  disabled,
  invalid = false,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  models: AiModelInfo[];
  disabled: boolean;
  invalid?: boolean;
  placeholder: string;
  onCommit: (model: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const listId = `ai-models-${useId().replace(/:/g, '')}`;

  const commit = () => {
    const next = draft.trim();
    if (next === value) {
      setDraft(value);
      return;
    }
    onCommit(next);
  };

  return (
    <>
      <Input
        name={listId + '-input'}
        aria-label={label}
        list={listId}
        value={draft}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        maxLength={128}
        autoComplete='off'
        spellCheck={false}
        disabled={disabled}
        className='w-48'
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(value);
          }
        }}
      />
      <datalist id={listId}>
        {models.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.label && m.label !== m.slug ? m.label : undefined}
          </option>
        ))}
      </datalist>
    </>
  );
}
