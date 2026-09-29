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
import { WriteError } from './write-error';

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

// effective — the slug the candidate is CALLED with today as the server reads it (C-08,
// AiRouteCandidate.effective_model): `model` when named, else the router's default for the pair; ""
// when the server has none (a write in flight, an older server). Same-ness is judged by it.
type Candidate = { providerKey: string; model: string; effective: string };

const norm = (c: AiRouteCandidate | undefined): Candidate => ({
  providerKey: c?.providerKey ?? '',
  model: c?.model ?? '',
  effective: c?.effectiveModel ?? '',
});
// wire — a candidate as a write sends it: the effective slug is the server's to say (ignored on a
// write), so it travels undefined.
const wire = (c: Candidate): AiRouteCandidate => ({
  providerKey: c.providerKey,
  model: c.model,
  effectiveModel: undefined,
});
// A candidate as the server holds it, in one comparable string; absent (null) is its own value.
const signature = (c: AiRouteCandidate | null | undefined) =>
  c ? `${c.providerKey ?? ''}/${c.model ?? ''}` : '-';

const serves = (p: AiProviderInfo, capability: string) =>
  (p.capabilities ?? []).includes(capability);

// The provider's own label — since commit H no provider is reached through another one.
const displayLabel = (p: AiProviderInfo) => p.label || p.key || '';

const labelOf = (providers: AiProviderInfo[], key: string) => {
  const p = providers.find((x) => x.key === key);
  return p ? displayLabel(p) : key;
};

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
  // The server's rule (REVIEW-FIXE #2): by the EFFECTIVE slug where both are known, else by `model`
  // — a fallback on "" and a primary naming the very slug "" resolves to are the same candidate.
  const ma = a.effective && b.effective ? a.effective : a.model;
  const mb = a.effective && b.effective ? b.effective : b.model;
  return (
    ma === mb &&
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
      label: p.enabled ? displayLabel(p) : `${displayLabel(p)} · off`,
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
              {/* B-32: the 3D group also holds video.generate (runblob's clip route) — the heading
                  says so; the group key stays `3d` on the wire and in GROUP_ORDER. */}
              <GroupLabel>{g.key === '3d' ? '3d & video' : g.key}</GroupLabel>
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
// A text action inside a micro line (the key slot's pattern): it inherits the line's size and says it
// is clickable by its underline.
const LINE_ACTION =
  'cursor-pointer underline underline-offset-2 hover:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50';

type DefaultCapability = 'chat' | 'image';

function DefaultsRow({ config }: { config: GetAiProvidersConfigResponse }) {
  const save = useSetAiDefaults();
  const providers = config.providers ?? [];
  const purposes = config.purposes ?? [];
  const pending = save.isPending ? save.variables : undefined;
  const chat = pending?.chatProviderKey || config.defaultChatProviderKey || '';
  const image = pending?.imageProviderKey || config.defaultImageProviderKey || '';
  // One write carries both; the one it named is the select that failed.
  const failedOn = save.failure ? (save.variables?.chatProviderKey ? 'chat' : 'image') : null;
  // A CHOSEN DEFAULT IS NOT SENT UNTIL THE ADMIN SAYS HOW FAR IT GOES (28.09): every purpose of that
  // capability with it (the server re-points them in the same write), or only the default (routes set
  // to "default" follow, the rest stay). One question at a time, under the select it belongs to; the
  // select keeps showing the stored default until the answer.
  const [asking, setAsking] = useState<{ capability: DefaultCapability; value: string } | null>(
    null,
  );
  const answer = (applyToRoutes: boolean) => {
    if (!asking) return;
    const vars =
      asking.capability === 'chat'
        ? { chatProviderKey: asking.value, imageProviderKey: '' }
        : { chatProviderKey: '', imageProviderKey: asking.value };
    setAsking(null);
    save.mutate({ ...vars, applyToRoutes });
  };
  const question = (capability: DefaultCapability) => {
    if (asking?.capability !== capability) return null;
    const n = purposes.filter((p) => p.capability === capability).length;
    const word = capability === 'chat' ? 'chat' : 'image';
    return (
      <Text
        size='micro'
        role='group'
        aria-label={`switch the ${word} purposes to ${labelOf(providers, asking.value)}?`}
        data-default-confirm={capability}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            setAsking(null);
          }
        }}
      >
        switch {n === 1 ? `the ${word} purpose` : `all ${n} ${word} purposes`} to{' '}
        {labelOf(providers, asking.value)} too? ·{' '}
        <button type='button' onClick={() => answer(true)} className={LINE_ACTION}>
          yes
        </button>{' '}
        /{' '}
        <button type='button' onClick={() => answer(false)} className={LINE_ACTION}>
          only the default
        </button>{' '}
        / {/* The safe answer holds the focus: Enter on an unread question changes nothing. */}
        <button type='button' autoFocus onClick={() => setAsking(null)} className={LINE_ACTION}>
          cancel
        </button>
      </Text>
    );
  };

  return (
    <div data-route-defaults='' className='flex flex-col gap-1'>
      <div className='flex flex-wrap items-start gap-x-4 gap-y-1.5'>
        <Labelled label='default for chat'>
          <SelectComponent
            name='ai-default-chat'
            placeholder='default for chat'
            value={chat}
            items={providerItems(providers, 'chat')}
            disabled={save.isPending}
            invalid={failedOn === 'chat'}
            className='w-48'
            onValueChange={(v: string) => {
              if (v && v !== chat) setAsking({ capability: 'chat', value: v });
            }}
          />
          {question('chat')}
          <WriteError text={failedOn === 'chat' ? save.failure?.text : null} id='default-chat' />
        </Labelled>
        <Labelled label='default for images'>
          <SelectComponent
            name='ai-default-image'
            placeholder='default for images'
            value={image}
            items={providerItems(providers, 'image')}
            disabled={save.isPending}
            invalid={failedOn === 'image'}
            className='w-48'
            onValueChange={(v: string) => {
              if (v && v !== image) setAsking({ capability: 'image', value: v });
            }}
          />
          {question('image')}
          <WriteError text={failedOn === 'image' ? save.failure?.text : null} id='default-image' />
        </Labelled>
      </div>
      <Text size='micro' variant='label'>
        a route set to “default” uses these; choosing one asks whether the routes below follow
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
  // AN ABSENT PRIMARY STAYS ABSENT. For chat and image the contract's "" IS the default provider,
  // so a purpose with no route there reads as "default"; any other capability has no default, and
  // making one up would show a route that does not exist — and send a provider the server refuses.
  const shownPrimary = pending ? pending.primary : purpose.primary;
  const defaultable = defaultKeyFor(config, capability) !== null;
  const primary: Candidate | undefined = shownPrimary
    ? norm(shownPrimary)
    : defaultable
      ? { providerKey: '', model: '', effective: '' }
      : undefined;
  const serverFallback = shownFallback ? norm(shownFallback) : undefined;
  // WHAT IS STAGED BELONGS TO THE ROUTE IT WAS STAGED ON. The base is the config version and this
  // row's route as the server returned it; a refetch that moves any of it (another admin's change,
  // a new default) leaves the staged provider and the same-pair sentence answering a route that is
  // gone, so they are dropped before render — a model typed afterwards can never pair the fresh
  // primary with a stale staged fallback under the fresh version.
  const base = `${config.configVersion ?? ''}|${signature(purpose.primary)}|${signature(purpose.fallback)}`;
  // A fallback provider chosen but not sent yet: the same provider as the primary, which needs a
  // model of its own first. Only the model field can send it.
  const [stagedOn, setStagedOn] = useState<{ value: string; base: string } | null>(null);
  const staged = stagedOn?.base === base ? stagedOn.value : null;
  const setStaged = (value: string | null) => setStagedOn(value === null ? null : { value, base });
  const fallback: Candidate | undefined =
    staged !== null
      ? { providerKey: staged === DEFAULT ? '' : staged, model: '', effective: '' }
      : serverFallback;
  // The server's sentence, said before the server has to: a pair that would be refused is not sent.
  const [sameOn, setSameOn] = useState<string | null>(null);
  const sameError = sameOn === base;
  const setSameError = (on: boolean) => setSameOn(on ? base : null);

  const send = (next: { primary: Candidate; fallback?: Candidate }) => {
    if (next.fallback && sameCandidate(config, capability, next.primary, next.fallback)) {
      setSameError(true);
      return;
    }
    setSameError(false);
    setStaged(null);
    route.mutate({
      purpose: key,
      primary: wire(next.primary),
      fallback: next.fallback ? wire(next.fallback) : undefined,
    });
  };
  const chooseFallback = (value: string) => {
    setSameError(false);
    // No primary, no fallback: a route starts from its primary.
    if (!primary) return;
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
    send({
      primary,
      fallback: { providerKey: value === DEFAULT ? '' : value, model: '', effective: '' },
    });
  };
  const primaryOff = providerOff(config, capability, primary);
  const fallbackOff = providerOff(config, capability, serverFallback);
  // The server's refusal, pinned where it points: a `primary` / `fallback` field violation under
  // that candidate, anything else under the row's controls.
  const failure = route.failure;
  const primaryError = failure?.field === 'primary' ? failure.text : null;
  const fallbackError = sameError
    ? SAME_AS_PRIMARY
    : failure?.field === 'fallback'
      ? failure.text
      : null;
  const rowError = failure && !primaryError && failure.field !== 'fallback' ? failure.text : null;

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
      <div className='flex flex-col gap-1'>
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
            error={primaryError}
            onChoose={(v) =>
              send({
                primary: { providerKey: v === DEFAULT ? '' : v, model: '', effective: '' },
                fallback: serverFallback,
              })
            }
            onModel={(model) =>
              // A model typed here makes the effective slug the server's to re-read: unknown ("")
              // until then, so same-ness falls back to the model itself.
              primary &&
              send({ primary: { ...primary, model, effective: '' }, fallback: serverFallback })
            }
          />
          <CandidateControls
            role='fallback'
            purposeLabel={label}
            capability={capability}
            config={config}
            value={fallback}
            other={primary}
            staged={staged !== null}
            disabled={route.isPending || !primary}
            error={fallbackError}
            onChoose={chooseFallback}
            onModel={(model) =>
              primary &&
              fallback &&
              send({ primary, fallback: { ...fallback, model, effective: '' } })
            }
          />
        </div>
        <WriteError text={rowError} id='route' />
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
  // No candidate: "none" for a fallback; for a primary, nothing — the placeholder asks for one.
  const selected = value ? value.providerKey || DEFAULT : role === 'fallback' ? NONE : '';

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
  ].filter(
    (i) => i.value === selected || choiceFate(config, capability, i.value, other) !== 'omit',
  );
  // A route the server holds is shown as it is even when it no longer fits the list (a provider
  // that stopped serving the capability): an empty select would claim there is no route at all.
  if (selected && !items.some((i) => i.value === selected)) {
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
          placeholder={selected ? `${purposeLabel} ${role}` : 'choose a provider'}
          value={selected}
          items={items}
          disabled={disabled}
          invalid={!!error}
          // The placeholder is an ask, not a value — label grey, like an empty field's; a select
          // that cannot be used yet (a fallback before its primary) says so the same way.
          className='w-48 data-[disabled]:cursor-not-allowed data-[disabled]:text-labelColor data-[placeholder]:text-labelColor'
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
      <WriteError text={error} id={`route-${role}`} />
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
