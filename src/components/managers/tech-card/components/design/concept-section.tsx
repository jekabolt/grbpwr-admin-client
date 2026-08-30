import { useMemo, useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import { Section, SectionStack } from 'ui/components/section';
import Text from 'ui/components/text';
import Tooltip from 'ui/components/tooltip';
import TextareaField from 'ui/form/fields/textarea-field';

import type { CalloutForm, TechCardFormData } from '../schema';
import { detailKeyLabel } from '../tech-card-options';

/**
 * CONCEPT & CONSTRUCTION DESCRIPTION — the one place in the whole DESIGN band where a callout
 * stops being a mark on a picture and becomes TEXT THE FACTORY READS.
 *
 * Everything else in the band moves images around. This block is where the words are settled, and
 * it is the only organ whose output is printed: `concept` heads the tech pack's description sheet,
 * the aspects follow it, and `notes` never leaves the building. That asymmetry is the whole reason
 * the print facsimile sits beside the editor rather than in a preview somewhere else — a field
 * whose text goes on paper must show the paper while it is being written.
 *
 * WHAT IT WRITES, AND WHAT IT ONLY READS.
 *   writes  `concept`  (schema.ts:1905) — prose, printed, inside the DESIGN signature
 *   writes  `notes`    (schema.ts:1906) — prose, internal, OUTSIDE the DESIGN signature
 *   reads   `callouts` (schema.ts:1978) — the source of the suggested lines
 *   reads   `details`  (schema.ts:1980) — the aspects, shown only as they will print
 *   reads   `styleNumber` (schema.ts:1856) — the head of the printed sheet
 *
 * THE CALLOUTS ARE READ AND NEVER WRITTEN, and that is a rule rather than a preference. The band
 * has exactly ONE writer of the `callouts` field array, and it is not this file. Two `useFieldArray`
 * hooks on one name do not synchronise: the second writer's view of the list is a stale copy, and
 * a write from it drops whatever the first one added in between — silently, with no error and no
 * red field. So this block subscribes with `useWatch` and never touches the array.
 *
 * NOTHING IS WRITTEN UNTIL A HUMAN ADDS IT. Reading the callouts produces OFFERS, not text. The
 * model here is a receipt book, not an autocomplete: a line the human accepted stays on screen as
 * a receipt with an undo, a line he dismissed does not come back on the next read, and a line he
 * never touched reaches neither the field, nor the digest, nor the paper.
 */

const CONCEPT_MAX = 2000;

type SuggestionState = 'offered' | 'added' | 'dismissed';

type Suggestion = {
  /** Stable across reads: the callout's own identity, never its position in the list. */
  id: string;
  /** The composed line as it was offered. */
  line: string;
  /** Where it came from, in the technologist's words: «callout 3». */
  source: string;
  state: SuggestionState;
  /**
   * EXACTLY the string that went into `concept`, kept so undo can cut out exactly that and not a
   * lookalike. Recomputing the appended text at undo time is how «undo» quietly removes the
   * human's own sentence that happened to contain the same words.
   */
  appended?: string;
  /** hh:mm of the acceptance — the receipt's timestamp. */
  at?: string;
};

const hhmm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * THE COMPOSED LINE. A card callout has no single text field — its note is `part` / `description`
 * / `dimensions`, and it is the COMPOSED line that goes on paper (the wire says so in as many
 * words on DesignSheetCallout.text). So the same composition is done here, once, and what is
 * offered to the concept is exactly what the sheet would print.
 *
 * The measurement goes in brackets at the end rather than being run into the sentence: «binding,
 * split (20 mm)» can only be read one way, whereas «20 mm binding, split» leaves a reader to guess
 * whether the 20 mm belongs to the binding or to the split.
 */
export function calloutLine(c: CalloutForm): string {
  const parts = (c.parts?.length ? c.parts : c.part ? [c.part] : [])
    .map((p) => (p ?? '').trim())
    .filter(Boolean);
  const head = parts.join(', ');
  const description = (c.description ?? '').trim();
  const dimensions = (c.dimensions ?? '').trim();
  // THE COLON BELONGS TO THE DESCRIPTION, NOT TO THE MEASUREMENT. A callout that names a piece and
  // a measurement but no description — `part` set, `description` empty, `dimensions` «6 mm», the
  // commonest shape on a drawing — used to read «front panel: (6 mm)». The server composes the
  // frozen line for paper with the same rule (`entity.TechCardCalloutPrintedLine`), and screen and
  // paper under one signature have to read identically, so the two are kept in step deliberately.
  const body = head && description ? `${head}: ${description}` : head || description;
  if (dimensions) return body ? `${body} (${dimensions})` : dimensions;
  return body;
}

/** A callout's identity for the receipt book, in order of how much it survives: minted ref, minted
 *  number, and only then its place in the list. */
function calloutId(c: CalloutForm, index: number): string {
  const ref = (c.clientRef ?? '').trim();
  if (ref) return `ref:${ref}`;
  if (c.number) return `n:${c.number}`;
  return `i:${index}`;
}

/** Ends the offered line as a sentence, so accepted lines read as prose and not as a list glued
 *  end to end. Anything already terminated is left exactly as the human wrote it. */
function asSentence(line: string): string {
  return /[.!?;:]$/.test(line) ? line : `${line}.`;
}

export function ConceptSection({ disabled }: { disabled?: boolean }): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();

  // READ-ONLY SUBSCRIPTIONS. `useWatch` and not `useFieldArray` — see the file note above.
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as CalloutForm[];
  const concept = (useWatch({ control, name: 'concept' }) ?? '') as string;
  const details = (useWatch({ control, name: 'details' }) ?? []) as Array<{
    key?: string;
    text?: string;
  }>;
  const styleNumber = (useWatch({ control, name: 'styleNumber' }) ?? '') as string;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [readOfCallouts, setReadOfCallouts] = useState(0);
  /** A refusal that belongs to one press of one button — it goes away on the next read. */
  const [refusal, setRefusal] = useState<string | null>(null);

  /** Callouts that actually say something. A callout with no words is a mark on a picture and has
   *  no line to offer. */
  const speaking = useMemo(
    () => callouts.map((c, i) => ({ c, i })).filter(({ c }) => calloutLine(c).length > 0),
    [callouts],
  );

  const offered = suggestions.filter((s) => s.state === 'offered');
  const added = suggestions.filter((s) => s.state === 'added');

  /**
   * THE READ. It rebuilds only what is still OFFERED and keeps every decision already made:
   * a dismissed line does not come back to be dismissed again, and an accepted one keeps its
   * receipt. A read that reset the whole book would turn «I already said no» into a question the
   * screen asks forever.
   */
  function readCallouts() {
    setRefusal(null);
    const decided = suggestions.filter((s) => s.state !== 'offered');
    const decidedLines = new Set(decided.map((s) => s.line));
    const text = getValues('concept') ?? '';
    const fresh: Suggestion[] = [];
    const seen = new Set<string>();
    for (const { c, i } of speaking) {
      const line = calloutLine(c);
      // Three filters, and each one answers a different question: is it already SAID in the text,
      // has it already been DECIDED, and is it a duplicate of another callout saying the same.
      if (text.includes(line)) continue;
      if (decidedLines.has(line) || seen.has(line)) continue;
      seen.add(line);
      fresh.push({
        id: calloutId(c, i),
        line,
        source: c.number ? `callout ${c.number}` : `callout ${i + 1}`,
        state: 'offered',
      });
    }
    setSuggestions([...decided, ...fresh]);
    setReadAt(hhmm());
    setReadOfCallouts(speaking.length);
  }

  function addLine(id: string) {
    const s = suggestions.find((x) => x.id === id);
    if (!s) return;
    const current = (getValues('concept') ?? '').trim();
    const piece = asSentence(s.line);
    const next = current ? `${current} ${piece}` : piece;
    // The field's own ceiling, enforced BEFORE the write rather than by a red border after it: a
    // truncated concept is a description that lost its last sentence without saying so.
    if (next.length > CONCEPT_MAX) {
      setRefusal(
        `This line does not fit — the concept holds ${CONCEPT_MAX} characters and it is already ` +
          `${current.length}. Shorten the text above, then add it.`,
      );
      return;
    }
    setRefusal(null);
    setValue('concept', next, { shouldDirty: true, shouldValidate: true });
    setSuggestions((prev) =>
      prev.map((x) => (x.id === id ? { ...x, state: 'added', appended: piece, at: hhmm() } : x)),
    );
  }

  function undoLine(id: string) {
    const s = suggestions.find((x) => x.id === id);
    if (!s) return;
    const current = getValues('concept') ?? '';
    // The LAST occurrence, because that is where an accepted line was put. If the human has since
    // edited it away himself there is nothing to cut — his text wins, and the row simply goes back
    // to being offered.
    const at = s.appended ? current.lastIndexOf(s.appended) : -1;
    const next =
      at < 0
        ? current
        : `${current.slice(0, at)}${current.slice(at + (s.appended?.length ?? 0))}`
            .replace(/\s{2,}/g, ' ')
            .trim();
    if (next !== current) setValue('concept', next, { shouldDirty: true, shouldValidate: true });
    setSuggestions((prev) =>
      prev.map((x) =>
        x.id === id ? { ...x, state: 'offered', appended: undefined, at: undefined } : x,
      ),
    );
  }

  function dismissLine(id: string) {
    setSuggestions((prev) => prev.map((x) => (x.id === id ? { ...x, state: 'dismissed' } : x)));
  }

  /**
   * THE REFUSAL OF THE READ, WORDED. There is exactly one way this button can have nothing to do:
   * the card carries no callout that says anything. It is named as such, and it names where a
   * callout is made — a disabled control that does not say why is the same bug as a dead one.
   */
  const cannotRead = speaking.length === 0 ? 'no callouts on this card say anything yet' : null;
  const readLabel = readAt ? 'read the callouts again ▸' : 'read the callouts ▸';

  const readButton = (
    <Button
      type='button'
      variant='secondary'
      size='sm'
      disabled={!!disabled || !!cannotRead}
      onClick={readCallouts}
    >
      {readLabel}
    </Button>
  );

  return (
    <SectionStack row>
      <Section
        title='concept & construction description'
        question='— the one place a callout becomes text for the factory'
        className='min-w-0 flex-1'
        action={
          added.length || offered.length ? (
            <Text size='micro' variant='label' component='span'>
              {offered.length} offered · {added.length} added
            </Text>
          ) : undefined
        }
      >
        <div>
          <TextareaField
            name='concept'
            label='concept (design intent)'
            rows={4}
            maxLength={CONCEPT_MAX}
            disabled={disabled}
            placeholder='what this thing is — the idea, the reference, the purpose'
          />
          <Text size='micro' variant='label' component='p' className='mt-1'>
            printed for the factory · part of the DESIGN signature
          </Text>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          {cannotRead ? (
            // NOT a bare disabled button. The reason is on the control itself, reachable by hover
            // and by focus, because «why is this grey» is the question a disabled button always
            // raises and almost never answers.
            <Tooltip
              side='top'
              align='start'
              className='max-w-[300px] normal-case'
              // The wrapper is not decoration. A `disabled` <button> fires no pointer events and
              // takes no focus, so a tooltip mounted on it never opens and the reason never
              // arrives. The span carries the hover AND is focusable itself, so the explanation
              // reaches a keyboard the same way it reaches a mouse.
              trigger={
                <span
                  tabIndex={0}
                  role='note'
                  className='inline-flex focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                >
                  {readButton}
                </span>
              }
            >
              {`${cannotRead} — a callout is placed on a picture, and its words are what this button reads.`}
            </Tooltip>
          ) : (
            readButton
          )}
          <Text size='micro' variant='label' component='span' className='min-w-0 flex-1'>
            {readAt == null
              ? 'Goes through this card’s callouts and offers the construction facts the text above does not mention yet. Nothing is written until you add it.'
              : `read ${readAt} · ${readOfCallouts} callout${readOfCallouts === 1 ? '' : 's'}`}
          </Text>
        </div>

        {refusal && (
          <CalloutBox tone='warning'>
            <Text size='micro' component='span'>
              {refusal}
            </Text>
          </CalloutBox>
        )}

        {(readAt != null || added.length > 0) && (
          <div>
            <GroupLabel
              action={
                <Text size='micro' variant='label' component='span'>
                  {offered.length
                    ? `${offered.length} left · ${added.length} added`
                    : 'nothing new'}
                </Text>
              }
            >
              suggested lines
            </GroupLabel>

            {offered.length === 0 && added.length === 0 ? (
              <Text size='micro' variant='label' component='p' className='py-1.5'>
                Nothing new — every construction fact the callouts carry is already in the text
                above.
              </Text>
            ) : (
              <div>
                {/* Receipts first: what is already IN the text is the more consequential half of
                    this list, and it is the half a reader needs to find when he wants it out. */}
                {added.map((s) => (
                  <div
                    key={s.id}
                    className='flex items-start gap-2 border-b border-hairline py-1.5'
                  >
                    <Button
                      type='button'
                      variant='secondary'
                      size='xs'
                      disabled={disabled}
                      className='shrink-0'
                      onClick={() => undoLine(s.id)}
                    >
                      undo
                    </Button>
                    <div className='min-w-0 flex-1'>
                      <Text size='default' component='p' className='break-words'>
                        {s.line}
                      </Text>
                      <Text size='nano' variant='label' component='p' className='uppercase'>
                        {s.source} · added to concept{s.at ? ` · ${s.at}` : ''}
                      </Text>
                    </div>
                  </div>
                ))}
                {offered.map((s) => (
                  <div
                    key={s.id}
                    className='flex items-start gap-2 border-b border-hairline py-1.5'
                  >
                    <div className='flex shrink-0 gap-1'>
                      <Button
                        type='button'
                        variant='secondary'
                        size='xs'
                        disabled={disabled}
                        onClick={() => addLine(s.id)}
                      >
                        add
                      </Button>
                      <Button
                        type='button'
                        variant='secondary'
                        size='xs'
                        disabled={disabled}
                        onClick={() => dismissLine(s.id)}
                      >
                        dismiss
                      </Button>
                    </div>
                    <div className='min-w-0 flex-1'>
                      <Text size='default' component='p' className='break-words'>
                        {s.line}
                      </Text>
                      <Text size='nano' variant='label' component='p' className='uppercase'>
                        {s.source}
                      </Text>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Text size='micro' variant='label' component='p' className='mt-1.5'>
              An added line is appended to the text above and turns into a receipt here. Dismissed
              and un-added lines reach neither the field, nor the digest, nor the paper.
            </Text>
          </div>
        )}

        <div>
          <TextareaField name='notes' label='notes' rows={2} maxLength={2000} disabled={disabled} />
          <Text size='micro' variant='label' component='p' className='mt-1'>
            internal · not sent to the factory · outside the DESIGN signature
          </Text>
        </div>
      </Section>

      {/*
        THE PAPER, BESIDE THE PEN. Not a preview panel and not a second editor — the same block
        grammar showing what the description sheet will carry, in the order it carries it. It is
        deliberately the ONLY place the aspects appear in this block: `details` has one editor
        already and a second one would be a second writer of the same list.
      */}
      <Section
        title='tech pack · description sheet'
        question='— how it prints'
        className='min-w-0 lg:w-[380px] lg:shrink-0'
      >
        <GroupLabel flush>{`${styleNumber.trim() || 'no style number'} · description`}</GroupLabel>
        <Text size='default' component='p' className='whitespace-pre-wrap break-words'>
          {concept.trim() || '—'}
        </Text>
        {details
          .filter((d) => (d.text ?? '').trim())
          .map((d, i) => (
            <Row
              key={`${d.key ?? 'aspect'}-${i}`}
              label={detailKeyLabel(d.key)}
              value={(d.text ?? '').trim()}
            />
          ))}
        <Text size='micro' variant='label' component='p'>
          Print order — concept → details. <b className='text-textColor'>notes never reach it.</b>
        </Text>
        <div>
          <Pill tone='warn'>an edit changes the DESIGN signature</Pill>
        </div>
      </Section>
    </SectionStack>
  );
}
