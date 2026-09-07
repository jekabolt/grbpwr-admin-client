import { useRef, type JSX } from 'react';
import { Chip } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';

import { GROUP_GAP, Reason } from '../core';
import type { PlaygroundDraft } from './drafts';
import { ASK_MAX, areaToken, subjectItem, type Preset } from './model';

/**
 * ═══ THE ASK — WHAT THIS RUN IS FOR, IN WORDS AND IN ONE PRESET ═══════════════════════════════
 *
 * THE CHIPS ARE THE SERVER'S LIST, IN THE SERVER'S ORDER (`band.freeformPresets`), and exactly one
 * of them is pressed. A preset is not a filter over the same request: it decides WHICH DOOR the run
 * takes (`cutout` is a kind of its own, with its own provider and its own key) and WHICH craft
 * paragraph the server appends. Two pressed chips would be two runs.
 *
 * ⚠ THE CUT-OUT TAKES NO WORDS, AND THE BOX IS GONE RATHER THAN IGNORED. The server refuses a
 * cut-out that carries an ask (`cutout_takes_no_words`) — so a box a person could type into, whose
 * contents would be refused, is a trap. The line says so where the box stood.
 *
 * ⚠ THE INSERT CHIPS WRITE THROUGH `setRangeText`, NOT `execCommand`. `document.execCommand` writes
 * WHERE THE SELECTION IS, and the selection is not necessarily in this box: measured on a
 * neighbouring screen, a link went into the task's TITLE field because that is where the caret had
 * been. `setRangeText` names the element it writes into and cannot miss.
 */
export function AskGroup({
  presets,
  preset,
  draft,
  disabled,
}: {
  /** Every preset this server wired, in its order. Empty — the screen says so, above. */
  presets: readonly Preset[];
  /** The one chosen, or null. */
  preset: Preset | null;
  draft: PlaygroundDraft;
  disabled?: boolean;
}): JSX.Element {
  const box = useRef<HTMLTextAreaElement | null>(null);
  const state = draft.state;
  const takesWords = preset ? preset.kind !== 'cutout' : true;

  /** `image 1 · A` for every marked area, plus a bare `image N` for every picture. */
  const tokens: string[] = [];
  state.items.forEach((item, i) => {
    if (item.regions.length === 0) {
      tokens.push(`image ${i + 1}`);
      return;
    }
    item.regions.forEach((_, r) => tokens.push(areaToken(i, r)));
  });

  /**
   * INSERT AT THE CARET OF THIS BOX — and put the caret after what was inserted, so a person can
   * keep typing. A space before it unless the line already ends in one: the token is a word in a
   * sentence, not a tag.
   */
  const insert = (token: string) => {
    const el = box.current;
    if (!el || disabled) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const before = el.value.slice(0, start);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    const text = `${pad}${token}`;
    el.setRangeText(text, start, end, 'end');
    // React does not see `setRangeText`: the value changed on the DOM node, and the draft is the
    // one owner of this string. Reading it back is what keeps them one.
    draft.setAsk(el.value.slice(0, ASK_MAX));
    el.focus();
  };

  const subject = subjectItem(state);
  const repaintWhole =
    preset?.key === 'repaint_parts' &&
    state.items.length > 0 &&
    (subject?.regions.length ?? 0) === 0;

  return (
    <div id='design-playground-ask' data-pg-preset={preset?.key ?? ''}>
      <GroupLabel
        flush
        className={GROUP_GAP}
        action={preset ? <Pill tone='mut'>{preset.label}</Pill> : <Pill tone='gap'>no preset</Pill>}
      >
        the ask
      </GroupLabel>

      {presets.length === 0 ? (
        /* THE CELL EXISTS AND THE ROUTE DOES NOT — «absent ≠ empty» seen from the inside. The rail
           drew this step because the field ARRIVED; an empty list means the server has the code and
           not the keys, and naming the variables is the only useful thing this screen can say. */
        <div data-pg-no-route=''>
          <Reason>
            no playground route is wired on this server · OPENROUTER_IMAGES_API_KEY / FAL_KEY
          </Reason>
        </div>
      ) : (
        <>
          <div className='flex flex-wrap items-center gap-1.5'>
            {presets.map((p) => (
              <Chip
                key={p.key}
                data-pg-preset-chip={p.key}
                selected={preset?.key === p.key}
                pressed={preset?.key === p.key}
                disabled={disabled}
                title={
                  p.craft || `the server offers «${p.key}»; this build has no description of it`
                }
                onClick={() => draft.setPreset(p.key)}
              >
                {p.label}
              </Chip>
            ))}
          </div>

          <Text
            size='micro'
            variant='label'
            component='p'
            data-pg-needs=''
            className='mt-2 normal-case'
          >
            {preset
              ? `needs: ${preset.needs}`
              : 'pick one — each preset asks for different pictures'}
          </Text>

          {takesWords ? (
            <div className='relative mt-3'>
              <Textarea
                ref={box}
                name='pg-ask'
                data-pg-ask=''
                value={state.ask}
                disabled={disabled}
                rows={3}
                maxLength={ASK_MAX}
                placeholder='say what should change; the pictures and the marked areas are numbered above'
                aria-label='words for the model'
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  draft.setAsk(e.target.value)
                }
                /* Полка под счётчик — ИНЛАЙНОМ: произвольного класса, которого не было в дереве на
                   момент сборки, в собранном CSS не существует (тот же приём, что у
                   `references-section.tsx`). */
                style={{ paddingBottom: 20 }}
                className='resize-y'
              />
              <Text
                size='nano'
                variant='label'
                component='span'
                data-pg-ask-count={state.ask.length}
                style={{ position: 'absolute', bottom: 6, right: 8 }}
              >
                {state.ask.length} / {ASK_MAX}
              </Text>
            </div>
          ) : (
            <div data-pg-no-words='' className='mt-3'>
              <Reason>
                this preset takes no words · the background is removed and the subject comes back on
                transparency
              </Reason>
            </div>
          )}

          {takesWords && tokens.length > 0 && (
            <div className='mt-2 flex flex-wrap items-center gap-1.5'>
              <Text size='nano' variant='label' component='span' className='normal-case'>
                put in the text:
              </Text>
              {tokens.map((token) => (
                <Chip
                  key={token}
                  dashed
                  disabled={disabled}
                  data-pg-token={token}
                  title={`insert «${token}» where the caret is`}
                  onClick={() => insert(token)}
                >
                  {token}
                </Chip>
              ))}
            </div>
          )}

          {repaintWhole && (
            <div data-pg-whole-garment='' className='mt-2'>
              <Reason>no area is marked, so this repaints the whole garment</Reason>
            </div>
          )}
        </>
      )}
    </div>
  );
}
