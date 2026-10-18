import css from '@/global.css?raw';
import { Row, RowTotal, Section, SectionHeader, SectionStack, Text } from 'ui';
// The same parser the design lint reads @theme with: the kit never carries a hand-copied list.
import { themeDeclarations } from '../../../eslint-rules/design/theme-tokens.js';
import { KitMatrix } from './kit-entry';

const COLORS = themeDeclarations(css, 'color');
const TEXT = themeDeclarations(css, 'text');
const TRACKING = themeDeclarations(css, 'tracking');
const SPACING = themeDeclarations(css, 'spacing');

export type TokenBlock = { id: 'colors' | 'type' | 'spacing' | 'rules'; tokens: string[] };

export const TOKEN_BLOCKS: TokenBlock[] = [
  { id: 'colors', tokens: COLORS.map((t) => t.name) },
  { id: 'type', tokens: [...TEXT, ...TRACKING].map((t) => t.name) },
  { id: 'spacing', tokens: SPACING.map((t) => t.name) },
];

// Counted before `rules` joins: those are the @theme declarations, rules are how blocks use them.
export const TOKEN_COUNT = TOKEN_BLOCKS.reduce((n, b) => n + b.tokens.length, 0);

// The four ruled weights plus the gap that replaces a drawn divider; each sample is drawn by the
// primitive that owns it, never by a hand-made line.
const RULES = [
  { label: 'header rule', cls: 'border-b-2 border-textColor', owner: 'SectionHeader' },
  { label: 'outline', cls: 'border border-borderColor', owner: 'Section' },
  { label: 'hairline', cls: 'border-b border-hairline', owner: 'Row' },
  { label: 'total rule', cls: 'border-t border-textColor', owner: 'RowTotal' },
  { label: 'last item', cls: 'border-b-0', owner: 'Row · DataTable · Accordion · StatGrid' },
  { label: 'gap', cls: 'gap-gutter', owner: 'SectionStack' },
];
// Words people search when they look for these, though none of them is a token name.
const RULE_WORDS = ['divider', 'separator', 'rule', 'line', 'border', 'gap', 'last'];

TOKEN_BLOCKS.push({ id: 'rules', tokens: RULES.map((r) => r.label) });

/** Tokens of a block that pass the find query; the block name itself matching keeps them all. */
export function visibleTokens(block: TokenBlock, match: (s: string) => boolean) {
  if (match(block.id)) return block.tokens;
  if (block.id === 'rules') {
    return RULE_WORDS.some(match)
      ? block.tokens
      : RULES.filter((r) => [r.label, r.cls, r.owner].some(match)).map((r) => r.label);
  }
  return block.tokens.filter(match);
}

function ColorsBody({ names }: { names: string[] }) {
  const shown = COLORS.filter((c) => names.includes(c.name));
  return (
    <div
      className='grid gap-block'
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
    >
      {shown.map((c) => (
        <div key={c.name} className='flex min-w-0 flex-col gap-1'>
          <div
            className='h-10 w-full border border-borderColor'
            style={{ background: `var(--color-${c.name})` }}
          />
          <Text component='span' className='truncate'>
            {c.name}
          </Text>
          <Text size='micro' variant='label' component='span'>
            {c.value}
          </Text>
        </div>
      ))}
    </div>
  );
}

function TypeBody({ names }: { names: string[] }) {
  return (
    <div>
      {TEXT.filter((t) => names.includes(t.name)).map((t) => (
        <Row
          key={t.name}
          label={
            <span className='whitespace-nowrap' style={{ fontSize: `var(--text-${t.name})` }}>
              Aa {t.name}
            </span>
          }
          value={`text-${t.name} · ${t.value}`}
        />
      ))}
      {TRACKING.filter((t) => names.includes(t.name)).map((t) => (
        <Row
          key={t.name}
          label={
            <span
              className='text-micro uppercase'
              style={{ letterSpacing: `var(--tracking-${t.name})` }}
            >
              {t.name} label
            </span>
          }
          value={`tracking-${t.name} · ${t.value}`}
        />
      ))}
    </div>
  );
}

function SpacingBody({ names }: { names: string[] }) {
  return (
    <div className='flex flex-wrap items-end gap-gutter'>
      {SPACING.filter((s) => names.includes(s.name)).map((s) => (
        <div key={s.name} className='flex flex-col gap-1'>
          <div
            className='bg-textColor'
            style={{ width: `var(--spacing-${s.name})`, height: `var(--spacing-${s.name})` }}
          />
          <Text component='span'>{s.name}</Text>
          <Text size='micro' variant='label' component='span'>
            {s.value}
          </Text>
        </div>
      ))}
    </div>
  );
}

function RuleSample({ label }: { label: string }) {
  switch (label) {
    case 'header rule':
      return <SectionHeader title='title' className='w-full' />;
    case 'outline':
      return (
        <div className='w-full bg-pageBg p-2.5'>
          <Section>
            <Text component='span'>block</Text>
          </Section>
        </div>
      );
    case 'hairline':
      return (
        <div className='w-full'>
          <Row label='wool 420' value='€ 58.80' />
          <Row label='cupro' value='€ 14.40' />
        </div>
      );
    case 'total rule':
      return (
        <div className='w-full'>
          <Row label='cupro' value='€ 14.40' />
          <RowTotal label='total' value='€ 73.20' />
        </div>
      );
    case 'last item':
      // The last row ends in air; the block's own outline closes the list.
      return (
        <div className='w-full bg-pageBg p-2.5'>
          <Section>
            <Row label='wool 420' value='€ 58.80' />
            <Row label='cupro' value='€ 14.40' />
          </Section>
        </div>
      );
    default:
      return (
        <div className='w-full bg-pageBg p-2.5'>
          <SectionStack>
            <Section title='shell'>
              <Row label='fabric' value='wool' />
            </Section>
            <Section title='lining'>
              <Row label='fabric' value='cupro' />
            </Section>
          </SectionStack>
        </div>
      );
  }
}

function RulesBody({ names }: { names: string[] }) {
  return (
    <KitMatrix
      cols={['sample', 'class', 'primitive']}
      rows={RULES.filter((r) => names.includes(r.label)).map((r) => ({
        label: r.label,
        cells: [
          <RuleSample label={r.label} />,
          <Text component='span'>{r.cls}</Text>,
          <Text component='span'>{r.owner}</Text>,
        ],
      }))}
    />
  );
}

const BODY = { colors: ColorsBody, type: TypeBody, spacing: SpacingBody, rules: RulesBody };

export function TokenEntry({ block, names }: { block: TokenBlock; names: string[] }) {
  const Body = BODY[block.id];
  return (
    <Section
      id={block.id}
      title={block.id}
      question={block.id === 'rules' ? 'DESIGN.md' : '@theme · src/global.css'}
    >
      <Body names={names} />
    </Section>
  );
}
