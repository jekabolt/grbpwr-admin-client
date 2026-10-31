import {
  lazy,
  memo,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button, GroupLabel, Text } from 'ui';
import { seamOfSides } from './step-picture';
import {
  hasMultipleStepPieces,
  innerId,
  type FormOpLike,
  type StepProposal,
} from './step-seams-model';
import { recordSeamDecision } from './seam-decisions';
import { useStepSeams } from './step-seams-context';
import { frameSeamsOf, useCardGeoms, useCardPieceKeys, useStepScene } from './step-picture-view';
import { SeamTile } from './step-seams-row';
import type { TechCardFormData } from '../schema';

const SeamPickerBody = lazy(() =>
  import('./seam-picker').then((module) => ({ default: module.SeamPickerBody })),
);

type Outcome = 'done' | 'skipped';
type Outcomes = Partial<Record<number, Outcome>>;

function quizOpsSignature(ops: readonly FormOpLike[]): string {
  return JSON.stringify(
    ops.map((op) => ({
      inputKeys: op?.inputKeys,
      outputUnitKey: op?.outputUnitKey,
      seamKeys: op?.seamKeys,
      assemblyBlockDetached: op?.assemblyBlockDetached,
      operationType: op?.operationType,
      work: op?.work,
    })),
  );
}

export function SeamsQuiz() {
  const ctx = useStepSeams();
  const { control, getValues } = useFormContext<TechCardFormData>();
  const opsSignature = useWatch({
    control,
    name: 'operations',
    compute: (value) => quizOpsSignature((value ?? []) as FormOpLike[]),
  });
  const { geoms } = useCardGeoms();
  const pieceKeys = useCardPieceKeys();
  const ops = (getValues('operations') ?? []) as FormOpLike[];
  const waiting = useMemo(
    () =>
      ctx
        ? ops.flatMap((op, index) =>
            (op?.seamKeys?.length ?? 0) === 0 && hasMultipleStepPieces(ops, index, pieceKeys, geoms)
              ? [index]
              : [],
          )
        : [],
    [ctx, geoms, ops, opsSignature, pieceKeys],
  );
  const waitingKey = waiting.join(',');

  const [session, setSession] = useState<number[]>([]);
  const [outcomes, setOutcomes] = useState<Outcomes>({});
  const [current, setCurrent] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [reviewSkipped, setReviewSkipped] = useState(false);
  const sessionKey = session.join(',');

  useEffect(() => {
    const kept = session.filter((index) => index < ops.length);
    const next = [...new Set([...kept, ...waiting])].sort((a, b) => a - b);
    if (next.join(',') === sessionKey) return;
    const added = next.filter((index) => !session.includes(index));
    setSession(next);
    if (current === null || !next.includes(current) || (finished && added.length > 0)) {
      setCurrent(added[0] ?? next[0] ?? null);
      setFinished(next.length === 0);
      setReviewSkipped(false);
    }
  }, [current, finished, ops.length, session, sessionKey, waiting, waitingKey]);

  if (session.length === 0) return null;

  const activeIndex = finished ? null : current ?? session[0];
  const position = activeIndex === null ? session.length - 1 : session.indexOf(activeIndex);
  const readOnly = !ctx?.cardId || !!ctx.frozen;
  const doneCount = session.filter((index) => outcomes[index] === 'done').length;
  const skippedCount = session.filter((index) => outcomes[index] === 'skipped').length;

  const advance = (index: number, nextOutcomes: Outcomes) => {
    const at = session.indexOf(index);
    const ordered = [...session.slice(at + 1), ...session.slice(0, at)];
    const next = reviewSkipped
      ? ordered.find((candidate) => nextOutcomes[candidate] === 'skipped')
      : ordered.find((candidate) => nextOutcomes[candidate] === undefined);
    if (next !== undefined) {
      setCurrent(next);
      return;
    }
    setCurrent(null);
    setFinished(true);
    setReviewSkipped(false);
  };

  const complete = (index: number, outcome: Outcome) => {
    const operationNumber = ops[index]?.operationNumber;
    if (outcome === 'skipped' && ctx?.cardId && operationNumber)
      recordSeamDecision({ cardId: ctx.cardId, operationNumber, action: 'skip' });
    const next = { ...outcomes, [index]: outcome };
    setOutcomes(next);
    advance(index, next);
  };

  const goBack = () => {
    if (position <= 0) return;
    setCurrent(session[position - 1]);
    setFinished(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (readOnly || activeIndex === null) return;
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      complete(activeIndex, 'skipped');
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      goBack();
    }
  };

  return (
    <div className='flex flex-col' data-seams-quiz='' onKeyDown={onKeyDown}>
      <GroupLabel flush>
        {`seams · ${finished ? session.length : position + 1} of ${session.length}`}
      </GroupLabel>
      <div className='flex gap-1.5 overflow-x-auto pb-1' data-seams-quiz-strip=''>
        {session.map((index) => (
          <QuizTile
            key={index}
            index={index}
            status={outcomes[index]}
            current={activeIndex === index}
            onOpen={() => {
              setCurrent(index);
              setFinished(false);
              setReviewSkipped(false);
            }}
          />
        ))}
      </div>

      {finished ? (
        <div className='flex items-center gap-3 py-2'>
          <Text size='micro' variant='label' tracking='label' className='uppercase'>
            {`${doneCount} seamed · ${skippedCount} skipped`}
          </Text>
          {skippedCount > 0 && (
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={() => {
                const first = session.find((index) => outcomes[index] === 'skipped');
                if (first === undefined) return;
                setCurrent(first);
                setFinished(false);
                setReviewSkipped(true);
              }}
            >
              go to skipped
            </Button>
          )}
        </div>
      ) : activeIndex !== null ? (
        <QuizCurrent
          key={activeIndex}
          index={activeIndex}
          readOnly={readOnly}
          onAccepted={() => complete(activeIndex, 'done')}
          actions={
            readOnly ? undefined : (
              <>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={() => complete(activeIndex, 'skipped')}
                >
                  skip
                </Button>
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  onClick={goBack}
                  disabled={position <= 0}
                >
                  back
                </Button>
              </>
            )
          }
        />
      ) : null}
    </div>
  );
}

const QuizTile = memo(
  function QuizTile({
    index,
    status,
    current,
    onOpen,
  }: {
    index: number;
    status?: Outcome;
    current: boolean;
    onOpen: () => void;
  }) {
    const scene = useStepScene(index);
    const proposalRef = useRef<StepProposal | null | undefined>(undefined);
    if (proposalRef.current === undefined && scene.geo?.dep.status !== 'pending') {
      proposalRef.current = scene.suggestions[0] ?? null;
    }
    const proposal = proposalRef.current ?? scene.suggestions[0] ?? null;
    const seams = useMemo(() => {
      const own = proposal ? seamOfSides(proposal, scene.geoms, scene.innerLines) : null;
      return frameSeamsOf(
        scene.innerSeams,
        scene.storedSeams,
        own ? [own] : proposal ? [] : scene.surfaceProposals,
        scene.crossSeams,
      );
    }, [
      proposal,
      scene.surfaceProposals,
      scene.crossSeams,
      scene.geoms,
      scene.innerLines,
      scene.innerSeams,
      scene.storedSeams,
    ]);
    const surfaces = proposal ? [] : scene.surfaceSuggestions;
    const surface = surfaces.length > 0;
    // No guess yet the pieces are there: the tile draws them for a pick by hand.
    const drawable = scene.leaves.some((ks) => ks.some((k) => scene.geoms.has(k)));
    const marks = proposal
      ? [...proposal.a, ...proposal.b].map((id) => ({ id, tone: 'proposal' as const }))
      : surface
        ? surfaces.map((s) => ({ id: innerId(s.host, s.inner), tone: 'proposal' as const }))
        : [];

    return (
      <SeamTile
        scene={scene}
        seams={seams}
        marks={marks}
        dashed={!!proposal || !!surface}
        current={current}
        status={status}
        emptyLabel={proposal || surface || drawable ? undefined : 'no seam'}
        caption={proposal || surface || !drawable ? undefined : 'pick'}
        onOpen={onOpen}
      />
    );
  },
  (previous, next) =>
    previous.index === next.index &&
    previous.status === next.status &&
    previous.current === next.current,
);

function QuizCurrent({
  index,
  readOnly,
  onAccepted,
  actions,
}: {
  index: number;
  readOnly: boolean;
  onAccepted: () => void;
  actions?: ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <SeamPickerBody
        index={index}
        readOnly={readOnly}
        onAccepted={onAccepted}
        footerActions={actions}
      />
    </Suspense>
  );
}
