import { useMutation, useQueryClient } from '@tanstack/react-query';
import { techCardBomSectionOptions } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import { useSnackBarStore } from 'lib/stores/store';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Accordion } from 'ui/components/accordion';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Row, RowTotal } from 'ui/components/row';
import { Section } from 'ui/components/section';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import {
  GapCard,
  GapExclusion,
  GapLine,
  openCards,
  openLines,
  recheckFabricDirectionGaps,
  useFabricDirectionGaps,
} from './useFabricDirectionGaps';
import { techCardKeys } from './useTechCardQuery';
import { approvalStateLabel, stageLabel } from './utils';

// КАМПАНИЯ Д1 — the third view of the tech-card portfolio (?view=direction), beside list and board.
// It is a WORKLIST, not a dashboard: every row is a BOM line somebody has to open and answer, and
// the screen exists to be finished.
//
// What Ф1 changed, and therefore what this reports: `fabric_direction` has sat on
// tech_card_bom_item since 0073 feeding nothing but the MATERIALS digest, so it is unset on almost
// every stored line. Ф1 makes an unset direction REFUSE the save of a раскладка whose layout
// carries a 180° or a mirror on that cloth — including the re-save of a marker that saves fine
// today. The portfolio therefore holds a pile of latent refusals, and this is the list of them.
//
// Three facts from the contract this screen may never contradict:
//
//  1. THE GO/NO-GO IS total_lines + excluded_lines == 0, never total_lines alone. See openLines().
//     The headline prints the complete number in BOTH filter modes, so toggling the filter moves
//     the LIST and never the verdict.
//  2. blocked_marker_count is an UPPER BOUND, not a count of refusals. The rule waves a layout
//     through before it ever asks about the cloth when that layout carries neither a 180° nor a
//     mirror, and the server cannot know which without parsing the blob it deliberately does not
//     parse. So no marker count on this screen is allowed to say "will break".
//  3. The urgent tier is drawn on linked_marker_count, not on blocked_marker_count — the latter has
//     false negatives (a sibling line under the same назначение can be the one that refuses).

/** Where a gap gets fixed: the card's BOM tab, at the line if we can name it. */
function bomHref(techCardId: number, lineKey?: string): string {
  const params = new URLSearchParams({ tab: 'bom' });
  // ?bom=<line_key> opens that article's editor on arrival (bom-field.tsx), the same shape the BOM
  // tab already uses to hand off to ?colorway=<id>. A line with no key still lands on the tab.
  if (lineKey?.trim()) params.set('bom', lineKey.trim());
  return `${ROUTES.techCards}/${techCardId}?${params.toString()}`;
}

const SECTION_LABEL: Record<string, string> = Object.fromEntries(
  techCardBomSectionOptions.map((o) => [o.value, o.label]),
);

// НАЗНАЧЕНИЕ labels, kept local on purpose. The canonical map lives in the tech-card editor's
// bom-purpose.ts, which reaches the form schema through bom-line-picker — importing it here would
// drag the whole card editor into the list route's chunk to render eight words.
const PURPOSE_LABEL: Record<string, string> = {
  TECH_CARD_BOM_PURPOSE_MAIN: 'основной материал',
  TECH_CARD_BOM_PURPOSE_LINING: 'подкладка',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'карманка',
  TECH_CARD_BOM_PURPOSE_INTERFACING: 'бортовка / прокладка',
  TECH_CARD_BOM_PURPOSE_INSULATION: 'утеплитель',
  TECH_CARD_BOM_PURPOSE_CONTRAST: 'контраст / отделочная',
  TECH_CARD_BOM_PURPOSE_MESH: 'сетка / второй слой',
  TECH_CARD_BOM_PURPOSE_OTHER: 'другое',
};

/** Section · назначение — the two facts that tell two cloth lines on one card apart. */
function lineMeta(line: GapLine): string {
  const section = line.section ? SECTION_LABEL[line.section] ?? '' : '';
  // UNSET is not "no purpose", it is "nobody sorted this line yet" — a second unanswered question
  // on the same row, and worth seeing here.
  const purpose =
    !line.purpose || line.purpose === 'TECH_CARD_BOM_PURPOSE_UNSET'
      ? 'назначение не задано'
      : PURPOSE_LABEL[line.purpose] ?? '';
  return [section, purpose].filter(Boolean).join(' · ');
}

/**
 * The line's own name, resolved server-side through the catalogue exactly as the BOM tab resolves
 * it. Empty only when the line has neither its own name nor a linked article — then the line_key is
 * all there is, and it is at least the thing the editor can be pointed at.
 */
function lineName(line: GapLine): string {
  return line.name?.trim() || line.lineKey?.trim() || 'unnamed line';
}

/**
 * «1 card» / «4 cards». This screen prints a dozen small counts in pills and stat subtitles, and
 * every one of them can legitimately be 1 — «1 cards» reads as a rendering bug and makes the
 * neighbouring figures look untrustworthy too.
 *
 * English for the counted nouns even where the domain word is Russian: «раскладка» declines three
 * ways by number, so a counted «раскладок» would be wrong two thirds of the time. The Russian term
 * stays in the hint sentences, where nothing is being counted.
 */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

const LINE_MARKERS_HINT =
  'раскладки bound to this line. An upper bound on what an unset направление could refuse — never a count of refusals: a layout carrying neither a 180° nor a mirror saves whatever the cloth says.';
const CARD_MARKERS_HINT =
  'КАРТОЧНЫЕ раскладки bound to any BOM line of this card — every marker a gap here could possibly refuse. Раскройные (снятые под прогон, Ф4.2) НЕ считаются: они умирают вместе со своим прогоном, а направление берут с тех же строк BOM, которые этот отчёт уже покрывает через карточку. Deliberately over-inclusive within card markers: a sibling line under the same назначение can be the one that refuses.';

type Tier = {
  key: string;
  title: string;
  hint: string;
  cards: GapCard[];
  defaultOpen: boolean;
};

export function FabricDirectionReport() {
  const { showMessage } = useSnackBarStore();
  const queryClient = useQueryClient();
  // The filter lives in the URL like every other filter on this page (R-1), so the go/no-go view is
  // a shareable link rather than a state somebody has to be told to reproduce.
  const [params, setParams] = useSearchParams();
  const includeInactive = params.get('inactive') === '1';
  const [query, setQuery] = useState('');

  const setInactive = (next: boolean) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next) p.set('inactive', '1');
        else p.delete('inactive');
        return p;
      },
      { replace: true },
    );

  const report = useFabricDirectionGaps(includeInactive);
  const data = report.data;

  // The complete number — identical under both filters, so it is the campaign's one figure.
  const totalOpenLines = openLines(data);
  const totalOpenCards = openCards(data);
  const withheldLines = data?.excludedLines ?? 0;
  const withheldCards = data?.excludedCards ?? 0;

  // Cards the operator has personally re-checked clean in this session. A LOG OF ACTIONS, not a
  // claim about the portfolio: the totals above stay exactly as the server last stated them, and the
  // strip admits it is behind rather than doing arithmetic on a release gate. Deriving the headline
  // by subtracting cleared cards would be this client computing the go/no-go itself, off a per-card
  // read taken at a different moment from the portfolio one — precisely the number that must not be
  // guessed.
  const countedRef = useRef<Set<number>>(new Set());
  const [clearedCount, setClearedCount] = useState(0);
  const [lastClearedAt, setLastClearedAt] = useState(0);
  const markCleared = useCallback((id: number) => {
    setLastClearedAt(Date.now());
    if (countedRef.current.has(id)) return;
    countedRef.current.add(id);
    setClearedCount((n) => n + 1);
  }, []);
  // True only while a clean re-check is NEWER than the portfolio read the headline came from — a
  // refresh puts the two back in step and the caveat has to go with it.
  const totalsBehind = lastClearedAt > (report.dataUpdatedAt ?? 0);

  const cards = useMemo(() => data?.cards ?? [], [data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) =>
      [c.styleNumber, c.name, String(c.techCardId ?? '')]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [cards, query]);

  // Server order is «cards carrying any bound раскладка first, then tech_card_id», so working the
  // list over days never reshuffles it. These three buckets are a STABLE partition of that order —
  // each keeps the server's relative sequence — so the property survives, and the operator gets the
  // one thing the raw order cannot give: with released cards included, a frozen card carrying
  // markers would sort into the urgent band while being the one card whose markers cannot be
  // refused today, because a marker write on a released card is refused outright before направление
  // is ever consulted.
  const tiers: Tier[] = useMemo(() => {
    const urgent: GapCard[] = [];
    const pending: GapCard[] = [];
    const frozen: GapCard[] = [];
    for (const card of visible) {
      if (!card.markerSavePossible) frozen.push(card);
      else if ((card.linkedMarkerCount ?? 0) > 0) urgent.push(card);
      else pending.push(card);
    }
    return (
      [
        {
          key: 'urgent',
          title: 'markers already bound',
          hint: 'These cards have markers on file and can be saved today, so an unanswered направление is what a re-save runs into. Start here.',
          cards: urgent,
          defaultOpen: true,
        },
        {
          key: 'pending',
          title: 'no marker yet',
          hint: 'Nothing refuses on these cards right now. Answering them before somebody nests is the difference between a dropdown and a blocked save at the cutting table.',
          cards: pending,
          defaultOpen: true,
        },
        {
          key: 'frozen',
          title: 'released & frozen',
          hint: 'Every marker write on a released card is refused outright, before направление is consulted — so these gaps block nothing today. They are counted and not dismissed because re-opening the card to draft is one ordinary edit, and the lines come back with it.',
          cards: frozen,
          defaultOpen: false,
        },
      ]
        .filter((t) => t.cards.length > 0)
        // The frozen band opens closed — it is the pile you work last — unless it is the only band
        // left, in which case a collapsed accordion would render the screen as blank while the
        // headline insists there is work.
        .map((t, _i, all) => ({ ...t, defaultOpen: t.defaultOpen || all.length === 1 }))
    );
  }, [visible]);

  // "What do I do next": the first card of the highest non-empty band, in server order. Never a
  // frozen card — fixing one is optional today, and pointing the operator at optional work is
  // exactly what a worklist is for avoiding.
  const nextId = tiers.find((t) => t.key !== 'frozen')?.cards[0]?.techCardId ?? 0;

  const updatedAt = report.dataUpdatedAt ? new Date(report.dataUpdatedAt) : undefined;

  return (
    <div className='flex flex-col gap-2.5'>
      <Toolbar>
        <div className='min-w-[150px] flex-1'>
          <Input
            name='fabric-direction-search'
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            placeholder='search style № / name'
            aria-label='search the fabric-direction worklist'
          />
        </div>
        <Chip
          selected={includeInactive}
          pressed={includeInactive}
          onClick={() => setInactive(!includeInactive)}
          title='released cards are deferred by default — include them for the release go/no-go'
        >
          include released
        </Chip>
        <ToolbarSpacer />
        {updatedAt && (
          <Text size='micro' variant='label' className='tabular-nums'>
            read {updatedAt.toTimeString().slice(0, 5)}
          </Text>
        )}
        {/* Invalidates the whole gap-report branch rather than refetching this one query: the
            toolbar chip's counter is a second read of the same facts, and a refresh that left it
            stale would put two different numbers for one campaign on one screen. */}
        <Button
          type='button'
          size='xs'
          variant='secondary'
          disabled={report.isFetching}
          onClick={() =>
            queryClient.invalidateQueries({ queryKey: techCardKeys.fabricDirectionGaps() })
          }
        >
          {report.isFetching ? 'reading…' : 'refresh'}
        </Button>
      </Toolbar>

      {/* The one figure. It is the SAME number under both filters, which is why it sits above the
          filter chip's effect and never moves when the chip is clicked. Green only at zero — a
          months-long campaign rendered permanently red would stop meaning anything by week two. */}
      <StatGrid min={140}>
        <Stat
          big
          label='lines to answer'
          value={report.isPending ? '—' : totalOpenLines}
          sub={
            report.isPending
              ? 'reading'
              : totalOpenLines === 0
                ? 'nothing outstanding · released included'
                : `on ${plural(totalOpenCards, 'card')} · released included`
          }
          tone={!report.isPending && totalOpenLines === 0 ? 'up' : 'default'}
        />
        <Stat
          label='deferred'
          value={report.isPending ? '—' : withheldLines}
          sub={
            withheldLines > 0
              ? `${plural(withheldCards, 'card')} withheld — counted above`
              : 'nothing withheld'
          }
        />
        <Stat
          label='cleared here'
          value={clearedCount}
          sub={totalsBehind ? 'this session · totals are behind' : 'this session'}
        />
      </StatGrid>

      {report.isError ? (
        <div className='flex justify-center py-20'>
          <Text variant='label' className='uppercase'>
            failed to read the направление report — refresh to retry
          </Text>
        </div>
      ) : report.isPending ? (
        <div className='flex justify-center py-20'>
          <Text variant='label' className='animate-pulse uppercase'>
            reading every BOM line…
          </Text>
        </div>
      ) : totalOpenLines === 0 ? (
        <CampaignFinished includeInactive={includeInactive} />
      ) : (
        <>
          <Section
            title='направление ткани'
            question='— which cloth lines nobody has answered, and what that stops'
          >
            <Text size='micro' variant='label'>
              Направление is a property of the CLOTH: whether the roll may be laid head-to-toe
              (ворс, twill, a directional print) or turned freely. Until a line has one, any
              раскладка whose layout puts a piece upside down or mirrors it on that cloth is refused
              on save — a marker that saves fine today included. Answering the field is the whole
              job; it lives on the BOM tab, under «how this style uses it».
            </Text>

            <ExcludedBreakdown
              includeInactive={includeInactive}
              excluded={data?.excluded ?? []}
              withheldCards={withheldCards}
              withheldLines={withheldLines}
              onInclude={() => setInactive(true)}
            />
          </Section>

          {visible.length === 0 ? (
            <div className='flex justify-center py-16'>
              <Text variant='label' className='max-w-[420px] text-center uppercase'>
                {query.trim()
                  ? `nothing in this list matches «${query.trim()}»`
                  : 'every card in this filter is answered — the rest are deferred above'}
              </Text>
            </div>
          ) : (
            // Bands stack into ONE ruled surface, the pipeline board's grammar: -mt-px collapses
            // each band's top border into the one above it.
            <div className='flex flex-col'>
              {tiers.map((tier, index) => (
                <Accordion
                  key={tier.key}
                  className={index > 0 ? '-mt-px' : undefined}
                  defaultOpen={tier.defaultOpen}
                  title={
                    <Text
                      size='micro'
                      component='span'
                      variant='uppercase'
                      tracking='group'
                      className='font-bold'
                    >
                      {tier.title}
                    </Text>
                  }
                  meta={
                    <>
                      <Pill tone='mut'>{plural(tier.cards.length, 'card')}</Pill>
                      <Pill tone='mut'>
                        {plural(
                          tier.cards.reduce((sum, c) => sum + (c.lines?.length ?? 0), 0),
                          'line',
                        )}
                      </Pill>
                    </>
                  }
                >
                  <div className='flex flex-col gap-2'>
                    <Text size='micro' variant='label'>
                      {tier.hint}
                    </Text>
                    <Tiles min={300}>
                      {tier.cards.map((card) => (
                        <GapCardTile
                          // Re-keyed on the read: a tile carries the answer to its own re-check, and
                          // a fresh portfolio read is the server overruling it. Remounting is how
                          // that answer is dropped instead of outliving the fact it described.
                          key={`${card.techCardId}-${report.dataUpdatedAt}`}
                          card={card}
                          isNext={(card.techCardId ?? 0) === nextId}
                          onCleared={markCleared}
                          onMessage={showMessage}
                        />
                      ))}
                    </Tiles>
                  </div>
                </Accordion>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * What the scope withheld, always priced. A filter nobody can see is a report that lies by
 * omission, and this one is read as a release gate — so the breakdown renders whether or not
 * anything was withheld, and says which of the two it is.
 */
function ExcludedBreakdown({
  includeInactive,
  excluded,
  withheldCards,
  withheldLines,
  onInclude,
}: {
  includeInactive: boolean;
  excluded: GapExclusion[];
  withheldCards: number;
  withheldLines: number;
  onInclude: () => void;
}) {
  if (withheldLines === 0 && withheldCards === 0) {
    return (
      <CalloutBox tone='note'>
        <Text size='micro'>
          {includeInactive
            ? 'Nothing is withheld: this is every card on file, released ones included. The number above is the release go/no-go.'
            : 'Nothing is withheld — no card is currently deferred, so this list and the release go/no-go are the same set.'}
        </Text>
      </CalloutBox>
    );
  }

  return (
    <div>
      <GroupLabel
        action={
          <Button type='button' size='xs' variant='secondary' onClick={onInclude}>
            include them
          </Button>
        }
      >
        deferred by this filter
      </GroupLabel>
      {excluded.map((e) => (
        <Row
          key={e.approvalState ?? 'unknown'}
          label={
            <Text size='micro' component='span' className='uppercase'>
              {approvalStateLabel(e.approvalState)}
            </Text>
          }
          value={
            <Text size='micro' component='span'>
              {plural(e.cards ?? 0, 'card')} · {plural(e.lines ?? 0, 'line')}
            </Text>
          }
        />
      ))}
      <RowTotal
        label={
          <Text size='micro' component='span' className='uppercase'>
            not in the list below
          </Text>
        }
        value={
          <Text size='micro' component='span'>
            {plural(withheldCards, 'card')} · {plural(withheldLines, 'line')}
          </Text>
        }
      />
      <Text size='micro' variant='label' className='mt-1'>
        A released card is deferred on a judgement — that nobody re-opens it — and not on a proof.
        Re-opening one to draft is a single ordinary edit and its unset lines come straight back,
        which is why these lines are counted in the figure above and the campaign is not finished
        until they are gone too.
      </Text>
    </div>
  );
}

/**
 * The finish line — and the one state that must never be confused with an empty filter, which is
 * why it is keyed on the COMPLETE number and therefore renders identically whether or not released
 * cards are being shown. «This filter has nothing left in it» gets a different, quieter sentence
 * further up, next to the deferred rows that explain it.
 */
function CampaignFinished({ includeInactive }: { includeInactive: boolean }) {
  return (
    <Section title='кампания закончена' question='— every cloth line has a направление'>
      <Text>
        Nothing is missing and nothing is deferred: no roll-goods BOM line anywhere in the portfolio
        is waiting for a направление, released cards included. No раскладка can be refused for an
        unanswered cloth.
      </Text>
      <Text size='micro' variant='label'>
        {includeInactive
          ? 'Released cards are already in this count, and turning the filter off cannot change it — the figure above is the complete one either way.'
          : 'Released cards are counted in this figure even though they are not listed, so turning «include released» on cannot uncover anything more.'}{' '}
        A new cloth line starts unanswered, so the number will move again the next time somebody
        adds a fabric to a BOM.
      </Text>
    </Section>
  );
}

/**
 * One card with unanswered cloth. Every line is its own link into the BOM tab, and the card carries
 * the one action the report cannot do for the operator: re-ask the server about THIS card after the
 * fix, without re-reading the portfolio.
 */
function GapCardTile({
  card,
  isNext,
  onCleared,
  onMessage,
}: {
  card: GapCard;
  isNext: boolean;
  onCleared: (id: number) => void;
  onMessage: (message: string, severity: 'success' | 'error') => void;
}) {
  const id = card.techCardId ?? 0;

  const recheck = useMutation({
    mutationFn: () => recheckFabricDirectionGaps(id),
    onSuccess: (res) => {
      const remaining = openLines(res);
      if (remaining === 0) {
        onCleared(id);
        onMessage('направление answered — nothing left on this card', 'success');
      } else {
        onMessage(
          `still ${remaining} line${remaining === 1 ? '' : 's'} without направление`,
          'error',
        );
      }
    },
    onError: (error) =>
      onMessage(error instanceof Error ? error.message : 'could not re-check this card', 'error'),
  });

  // The freshest thing we know about this card: its own re-check if it has one, else the portfolio
  // read. Never a merge of the two — one of them is simply newer.
  const fresh = recheck.data
    ? (recheck.data.cards ?? []).find((c) => c.techCardId === id)?.lines ?? []
    : undefined;
  const lines = fresh ?? card.lines ?? [];
  const cleared = recheck.isSuccess && lines.length === 0;

  const title = [card.styleNumber, card.name].filter(Boolean).join(' ') || `#${id}`;
  const linked = card.linkedMarkerCount ?? 0;

  return (
    <Tile
      // Weight carries "this is the one", per the system: a 2px edge, no colour, no fill.
      selected={isNext && !cleared}
      // min-w-0 is load-bearing, not tidiness: a grid item defaults to min-width:auto, and the
      // truncating title inside is `white-space: nowrap`, so its min-content width is the WHOLE
      // style name. Without this a long name widens the track past 1fr and pushes the entire page
      // into a horizontal scroll on a narrow window — the title stops truncating and the toolbar
      // above runs off the right edge.
      className='flex h-full min-w-0 flex-col gap-1 p-2'
    >
      <div className='flex items-baseline gap-2'>
        <Link to={bomHref(id)} className='min-w-0 flex-1'>
          <Text size='micro' component='span' className='block truncate font-bold uppercase'>
            {title}
          </Text>
        </Link>
        {isNext && !cleared && <Pill tone='ink'>next</Pill>}
        {cleared && <Pill tone='ok'>✓ cleared</Pill>}
      </div>

      <div className='flex flex-wrap items-center gap-1'>
        <Pill tone='mut'>{stageLabel(card.stage)}</Pill>
        <Pill tone='mut'>{approvalStateLabel(card.approvalState)}</Pill>
        {!card.markerSavePossible && (
          <Pill
            tone='mut'
            title='a marker write on a released card is refused before направление is consulted'
          >
            frozen
          </Pill>
        )}
        {/* Blue, not red: a bound marker means "a human has to look at this", which is exactly what
            the mid-flight tone is for. Red would claim these saves are already broken, and no count
            on this screen knows that. */}
        {/* «card» СТОИТ В САМОЙ ПЛАШКЕ, а не только в подсказке (Ф4, условие решения Р6). С Ф4.2
            раскройные раскладки из этого числа исключены, и без слова его прочтут как полное — то
            есть недосчитаются ровно тех раскладок, что сейчас лежат в открытых прогонах. Подсказку
            наводят курсором, а решение о срочности принимают по цифре на экране. */}
        {linked > 0 && (
          <Pill tone='attention' title={CARD_MARKERS_HINT}>
            {plural(linked, 'card marker')}
          </Pill>
        )}
        {card.hasPatterns && (
          <Pill
            tone='mut'
            title='DXF sheets on file — this card can be nested, so a раскладка is imminent'
          >
            dxf
          </Pill>
        )}
      </div>

      {cleared ? (
        <Text size='micro' variant='label' className='py-1'>
          The server re-checked this card and found no unanswered cloth. The totals above are still
          the earlier read — refresh when you want them to catch up.
        </Text>
      ) : (
        <div className='flex flex-col'>
          {lines.map((line) => (
            <Link
              key={line.lineKey || String(line.bomItemId)}
              to={bomHref(id, line.lineKey)}
              className='block border-b border-hairline py-1 last:border-b-0 hover:bg-bgZebra'
            >
              <div className='flex items-center gap-1.5'>
                <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                  {lineName(line)}
                </Text>
                {line.isSample && (
                  <Pill tone='mut' title='семпловая ярдажа — sample раскладки ask this cloth too'>
                    sample
                  </Pill>
                )}
                {(line.blockedMarkerCount ?? 0) > 0 && (
                  <Pill tone='attention' title={LINE_MARKERS_HINT}>
                    {plural(line.blockedMarkerCount ?? 0, 'marker')}
                  </Pill>
                )}
                <Text size='nano' variant='label' component='span' className='shrink-0'>
                  →
                </Text>
              </div>
              <Text size='nano' variant='label' className='truncate uppercase'>
                {lineMeta(line)}
              </Text>
            </Link>
          ))}
        </div>
      )}

      <div className='mt-auto flex flex-wrap items-center gap-1.5 pt-1.5'>
        <Button type='button' size='xs' variant='secondary' asChild>
          <Link to={bomHref(id, lines[0]?.lineKey)}>open bom →</Link>
        </Button>
        <Button
          type='button'
          size='xs'
          variant='secondary'
          disabled={recheck.isPending}
          onClick={() => recheck.mutate()}
        >
          {recheck.isPending ? 'checking…' : 're-check'}
        </Button>
        {/* Which read the rows above came from. Without it a re-check that changed nothing is
            indistinguishable from a re-check that never fired. */}
        {recheck.isSuccess && !cleared && (
          <Text size='nano' variant='label' component='span' className='uppercase'>
            re-checked just now
          </Text>
        )}
      </div>
    </Tile>
  );
}
