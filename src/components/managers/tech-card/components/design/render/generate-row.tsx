import type { GetDesignBandResponse } from 'api/proto-http/admin';
import type { JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { budgetLine, type Gate } from './model';

/**
 * THE GENERATE ROW — one button, one refusal, one money line, on both generative screens.
 *
 * WHY THE PRICE IS NOT ON IT. The prototype prints `3 pictures · $0.06 · ~40 s`, because the
 * prototype owns a price list. This admin does not and cannot: `price_estimate` and `price_actual`
 * are OUTPUT-ONLY on a run — the server reserves against the day at dispatch — and no field on the
 * wire carries the price of a run that has not been asked for yet. So the line states the SHAPE of
 * what is about to be asked for (how many pictures, of which revision) and says plainly that the
 * money is settled at start. A number invented on the client would be wrong the first time a tariff
 * moved, and wrong silently.
 *
 * THE REFUSAL IS A CONTROL, NOT AN ABSENCE. A gate that fails renders the button as an `InertDoor`
 * carrying its reason, which is the wave's rule and the reason the strip above it exists at all: a
 * missing button teaches «this admin has no renders», a dead one with a reason teaches «front is
 * empty», and only the second is true.
 */
export function GenerateRow({
  band,
  gate,
  /** What is about to be asked for, in the shape the human can check: «3 pictures · one per side». */
  shape,
  pending,
  disabled,
  onGenerate,
}: {
  band: GetDesignBandResponse;
  gate: Gate;
  shape: string;
  pending?: boolean;
  disabled?: boolean;
  onGenerate: () => void;
}): JSX.Element {
  const speaks = serverSpeaksDesign();
  const budget = budgetLine(band);

  const frozen = disabled
    ? 'this card is read-only for you — a run spends money, so it is one of the writes that stops here'
    : !speaks
      ? 'this server does not serve the design band, so there is nothing to start a run on'
      : null;

  return (
    <div className='flex flex-wrap items-center gap-2 pt-1'>
      {frozen ? (
        <InertDoor label='generate' reason={frozen} />
      ) : gate.ok ? (
        <Button variant='main' size='sm' onClick={onGenerate} loading={pending}>
          GENERATE
        </Button>
      ) : (
        <InertDoor label='generate' reason={gate.reason} />
      )}

      {/* The prompt inventory door. Cut rather than guessed: what the model is actually shown is
          assembled server-side from a prompt PROFILE, and a profile is server configuration whose
          name reaches this client only as an OUTPUT of a run that has already happened. There is
          nothing on the wire to open a truthful «what the model gets» panel over. */}
      <InertDoor
        label='what the model gets ▸'
        reason='what the model is shown is assembled server-side from a prompt profile, and a profile reaches this screen only as the stamp on a run that has already happened — there is nothing here to open before one has'
      />

      <Text size='micro' variant='label' component='span' className='min-w-0'>
        {shape} · priced by the server when the run starts
      </Text>

      {budget && (
        <Text size='micro' variant='label' component='span' className='ml-auto shrink-0'>
          {budget.text}
        </Text>
      )}
    </div>
  );
}

/**
 * The «what is missing» bar of a locked screen — the prototype's `lockbar`.
 *
 * It repeats the gate's reason under the input strip rather than only inside the disabled button,
 * because the reason is about the INPUTS and the inputs are what the eye is on at that moment. The
 * ways out ride with it: the two doors that would produce the missing thing.
 */
export function LockBar({ reason, children }: { reason: string; children?: React.ReactNode }) {
  // `CalloutBox`, NOT A BORDERED DIV. A block never contains another block in this system; an
  // inline message with a 1px edge and no fill is the one shape that is allowed inside one, and it
  // is already a primitive. Hand-rolling the same border here is how the box-in-box rule gets lost.
  return (
    <CalloutBox tone='note'>
      <div className='flex flex-wrap items-center gap-2'>
        <Text
          size='micro'
          variant='uppercase'
          tracking='label'
          component='span'
          className='font-bold text-textColor'
        >
          what is missing
        </Text>
        <Text size='micro' component='span' className='min-w-0 flex-1'>
          {reason}
        </Text>
        {children}
      </div>
    </CalloutBox>
  );
}
