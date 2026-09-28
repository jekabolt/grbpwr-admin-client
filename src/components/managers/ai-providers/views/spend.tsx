import type {
  AiSpendActorRow,
  GetAiProvidersConfigResponse,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { Fragment, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { Section } from 'ui/components/section';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { ViewSwitch, type ViewSwitchOption } from 'ui/components/view-switch';
import { formatUsd, sumUsd, usd } from '../utils/format';
import { useAiSpend } from '../utils/hooks';
import {
  periodLabel,
  presetRange,
  rangeProblem,
  todayIn,
  type DayRange,
  type Preset,
} from '../utils/period';

// SPEND — what the calls cost, over calendar days in the org timezone. Our number is the ledger
// (one row per physical call, priced at call time); their number is the provider's own cost API,
// where one exists and a reconciliation key is set — until then it is —, never 0.
//
// THEIR NUMBER IS COUNTED IN THEIR DAYS (D-17). A provider's cost API buckets by its own day — UTC
// for most — and the ledger by the org's; near midnight the two disagree by up to the offset at
// each end of the period. So every "their" figure says "provider days", and one line under the
// table says what that means: a boundary difference must not read as drift in our ledger.
//
// searchParams contract (beside ?view=spend): range=this-month|last-month|last-7|custom, and for
// custom from & to (YYYY-MM-DD). A preset link means "this month" whenever it is opened; a custom
// link keeps its days.
const PRESETS: readonly ViewSwitchOption<Preset>[] = [
  { value: 'this-month', label: 'this month' },
  { value: 'last-month', label: 'last month' },
  { value: 'last-7', label: 'last 7 days' },
  { value: 'custom', label: 'custom' },
];

const isPreset = (v: string | null): v is Preset => PRESETS.some((p) => p.value === v);

export function SpendView({ config }: { config: GetAiProvidersConfigResponse | undefined }) {
  const [params, setParams] = useSearchParams();
  // The days are the server's days, counted in the org timezone the config reports — and ONLY in
  // it: until the config is in, nothing is computed and nothing is asked. A browser zone standing in
  // meanwhile asked for the wrong month around midnight and then showed it under the right label.
  const orgTz = config?.timezone || '';
  const today = orgTz ? todayIn(orgTz) : '';

  const raw = params.get('range');
  const preset: Preset = isPreset(raw) ? raw : 'this-month';
  const range: DayRange =
    preset === 'custom'
      ? { from: params.get('from') ?? '', to: params.get('to') ?? '' }
      : today
        ? presetRange(preset, today)
        : { from: '', to: '' };
  const problem = orgTz ? rangeProblem(range) : null;
  const ready = !!orgTz && problem === null;
  const spend = useAiSpend(range.from, range.to, ready);
  const report = ready ? spend.data : undefined;
  // The zone the report says it counted in — shown, and checked against the config's.
  const reportTz = report?.timezone || '';

  const patch = (next: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(next)) {
          if (!v) p.delete(k);
          else p.set(k, v);
        }
        return p;
      },
      { replace: true },
    );

  const choosePreset = (next: Preset) =>
    next === 'custom'
      ? // Custom starts from the days on screen, so the two fields are never blank.
        patch({ range: 'custom', from: range.from, to: range.to })
      : patch({ range: next === 'this-month' ? undefined : next, from: undefined, to: undefined });

  const providerLabel = (key?: string) =>
    config?.providers?.find((p) => p.key === key)?.label || key || '—';
  const purposeLabel = (key?: string) =>
    config?.purposes?.find((p) => p.key === key)?.label || key || '—';

  const byProvider = report?.byProvider ?? [];
  const theirTotal = sumUsd(byProvider.map((r) => r.theirUsd));
  const loading = !orgTz || (problem === null && spend.isPending);
  const dash = (s: string | null) => s ?? '—';
  const count = (n: number | undefined) => (report ? String(n ?? 0) : '—');

  return (
    <>
      <Section>
        <div className='flex flex-wrap items-end gap-x-4 gap-y-2'>
          <ViewSwitch label='period' value={preset} options={PRESETS} onChange={choosePreset} />
          {preset === 'custom' && (
            <>
              <DayField label='from' value={range.from} onChange={(v) => patch({ from: v })} />
              <DayField label='to' value={range.to} onChange={(v) => patch({ to: v })} />
            </>
          )}
        </div>
        <Text size='micro' variant='label' aria-live='polite' data-spend-period=''>
          {orgTz
            ? `${periodLabel(range)} · days in ${reportTz || orgTz}`
            : 'waiting for the org timezone…'}
          {spend.isFetching && !spend.isPending ? ' · updating…' : ''}
        </Text>
        {reportTz && reportTz !== orgTz && (
          <Text size='micro' variant='errorLabel'>
            ! the report counted its days in {reportTz}, not {orgTz}; reload the page
          </Text>
        )}
        {problem && (
          <Text size='micro' variant='errorLabel'>
            ! {problem}
          </Text>
        )}
        {problem === null && spend.isError && (
          <CalloutBox tone='error'>
            <Text size='micro'>
              couldn't read the spend report
              {spend.error instanceof Error && spend.error.message
                ? `: ${spend.error.message}`
                : ''}
            </Text>
          </CalloutBox>
        )}
      </Section>

      <StatGrid min={140}>
        <Stat label='our total · usd' value={dash(usd(report?.totalUsd))} sub='from our ledger' />
        <Stat
          label='their total · usd · provider days'
          value={dash(formatUsd(theirTotal))}
          sub={theirTotal === null ? 'no provider reports yet' : 'from their cost APIs'}
        />
        <Stat
          label='calls'
          value={count(report?.calls)}
          sub={report ? `${report.failed ?? 0} failed` : undefined}
        />
        <Stat label='unpriced' value={count(report?.unpriced)} sub='not in our total' />
      </StatGrid>

      <Section title='by provider' question='our number beside theirs'>
        {!report ? (
          <Text size='micro' variant='label'>
            {loading ? 'loading…' : '—'}
          </Text>
        ) : byProvider.length === 0 ? (
          <Text size='micro' variant='label'>
            no AI calls in this period
          </Text>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th>provider</th>
                <th>our usd</th>
                <th>their usd · provider days</th>
                <th>calls</th>
                <th>failed</th>
              </tr>
            </thead>
            <tbody>
              {byProvider.map((r) => (
                <tr key={r.providerKey} data-spend-provider={r.providerKey}>
                  <td>{providerLabel(r.providerKey)}</td>
                  <td
                    title={
                      r.unpriced
                        ? `${r.unpriced} calls with no known cost are not in this number`
                        : undefined
                    }
                  >
                    <UsdCell value={r.ourUsd} />
                  </td>
                  <td>
                    <UsdCell value={r.theirUsd} />
                  </td>
                  <td>{r.calls ?? 0}</td>
                  <td>{r.failed ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        {report && byProvider.length > 0 && (
          <Text size='micro' variant='label' data-provider-days=''>
            a provider counts its own days (utc for most); a local day can differ by up to 2 h at
            each end
          </Text>
        )}
      </Section>

      <Section title='by account' question='who the calls were made for'>
        {!report ? (
          <Text size='micro' variant='label'>
            {loading ? 'loading…' : '—'}
          </Text>
        ) : (report.byActor ?? []).length === 0 ? (
          <Text size='micro' variant='label'>
            no AI calls in this period
          </Text>
        ) : (
          <ActorTable
            rows={report.byActor ?? []}
            providerLabel={providerLabel}
            purposeLabel={purposeLabel}
          />
        )}
      </Section>
    </>
  );
}

function UsdCell({ value }: { value: googletype_Decimal | null | undefined }) {
  const text = usd(value);
  return text === null ? <EmptyCell /> : <>{text}</>;
}

function DayField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className='flex flex-col gap-0.5'>
      <Text component='span' size='micro' variant='label' tracking='label' className='uppercase'>
        {label}
      </Text>
      <Input
        type='date'
        name={`ai-spend-${label}`}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className='w-40'
      />
    </label>
  );
}

type ActorGroup = {
  actor: string;
  usd: number | null;
  calls: number;
  lines: AiSpendActorRow[];
};

// The wire is one line per actor × purpose × provider × model; the table is one line per actor,
// opening into those lines. Most expensive first; an actor with no priced call sorts last.
function groupByActor(rows: AiSpendActorRow[]): ActorGroup[] {
  const map = new Map<string, AiSpendActorRow[]>();
  for (const r of rows) {
    const a = r.actor || 'unknown';
    map.set(a, [...(map.get(a) ?? []), r]);
  }
  return [...map.entries()]
    .map(([actor, lines]) => ({
      actor,
      usd: sumUsd(lines.map((l) => l.usd)),
      calls: lines.reduce((n, l) => n + (l.calls ?? 0), 0),
      lines,
    }))
    .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1) || b.calls - a.calls);
}

const ACTOR_NOTE: Record<string, string> = {
  system: 'background work',
  unknown: 'calls whose path carried no account',
};

function ActorTable({
  rows,
  providerLabel,
  purposeLabel,
}: {
  rows: AiSpendActorRow[];
  providerLabel: (key?: string) => string;
  purposeLabel: (key?: string) => string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const groups = groupByActor(rows);
  const flip = (actor: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(actor)) next.delete(actor);
      else next.add(actor);
      return next;
    });

  return (
    <DataTable>
      <thead>
        <tr>
          <th>account</th>
          <th>usd</th>
          <th>calls</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const isOpen = open.has(g.actor);
          return (
            <Fragment key={g.actor}>
              <tr data-spend-actor={g.actor}>
                <td>
                  <button
                    type='button'
                    aria-expanded={isOpen}
                    onClick={() => flip(g.actor)}
                    className='flex cursor-pointer items-baseline gap-1.5 text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                  >
                    <span aria-hidden className='w-2 text-labelColor'>
                      {isOpen ? '−' : '+'}
                    </span>
                    <span>{g.actor}</span>
                    {ACTOR_NOTE[g.actor] && (
                      <Text component='span' size='micro' variant='label'>
                        {ACTOR_NOTE[g.actor]}
                      </Text>
                    )}
                  </button>
                </td>
                <td>{formatUsd(g.usd) ?? <EmptyCell />}</td>
                <td>{g.calls}</td>
              </tr>
              {isOpen &&
                g.lines.map((l, i) => (
                  <tr key={`${l.purpose}|${l.providerKey}|${l.model}|${i}`} data-spend-line=''>
                    <td>
                      <Text component='span' size='micro' variant='label' className='block pl-3.5'>
                        {purposeLabel(l.purpose)} · {providerLabel(l.providerKey)} ·{' '}
                        {l.model || 'default model'}
                      </Text>
                    </td>
                    <td>
                      <UsdCell value={l.usd} />
                    </td>
                    <td>{l.calls ?? 0}</td>
                  </tr>
                ))}
            </Fragment>
          );
        })}
      </tbody>
    </DataTable>
  );
}
