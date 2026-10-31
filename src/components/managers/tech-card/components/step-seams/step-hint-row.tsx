// THE STEP'S HINT, ONE LINE (mockup variant 1). Above a step's canvas: what the card's joins map says
// this step sews, «placket → front edge», and whose word it is (ai / own / off, as in the panel).
// Shown only when the canvas would use it (`guessHints`: a stale AI run is left out there too).
// Reads only; nothing runs inside a step.

import { useMemo } from 'react';
import { Chip, Text } from 'ui';
import { joinWords, roleReader, sideText, stateWord } from './hint-words';
import { useStepSeams } from './step-seams-context';

export function StepHintRow({ op }: { op: { operationNumber?: number } | undefined }) {
  const ctx = useStepSeams();
  const number = op?.operationNumber;
  const hints = ctx?.seamHints.hints;
  const overrides = ctx?.seamHints.overrides;
  const roleOf = useMemo(
    () => (hints && overrides ? roleReader(hints, overrides) : null),
    [hints, overrides],
  );
  if (number == null || !ctx || !hints || !roleOf) return null;
  const live = ctx.guessHints.joins.find((row) => row.op === number);
  const row = hints.joins.find((join) => join.op === number);
  if (!live || !row) return null;
  const { what, where } = joinWords(row, roleOf);
  const ai = row.state === 'ai';
  const off = row.state === 'off';
  return (
    <span
      className={`flex min-w-0 items-baseline gap-2 ${off ? 'line-through' : ''}`}
      title={`${sideText(row.a)} → ${sideText(row.b)}`}
      data-step-hint={number}
    >
      <Text
        size='small'
        variant={off ? 'label' : 'default'}
        component='span'
        className={`min-w-0 truncate ${ai ? 'text-warning' : ''}`}
      >
        {`${what} → ${where}`}
      </Text>
      <Chip nonForm tone={ai ? 'attention' : 'default'} dashed={ai} selected={!ai && !off}>
        {stateWord(row.state)}
      </Chip>
    </span>
  );
}
