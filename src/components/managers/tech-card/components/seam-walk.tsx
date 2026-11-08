// THE SEAM WALK — a full window over ASSEMBLY ORDER: every operation in order, one at a time.
//
// It owns no seam logic. The canvas is the real `SeamPickerBody`, the result is the map's `StepView`
// and the position drives the tab's active step, so the rail and the map follow after CLOSE too.
// A move answers at once: rail and head take the new op, the heavy canvas and result follow deferred,
// and the next join's scene is computed in idle time, so NEXT lands on a warm cache. The map behind
// the window hears about the position only on CLOSE: it is covered, and redrawing it was half the pause.
// Nothing structural is reachable here: the inline editor stays unmounted under the walk (one writer
// per field) and keys stop at the root, or ⌘Z would undo a reorder nobody can see.
import * as Dialog from '@radix-ui/react-dialog';
import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Button, Placeholder, Text } from 'ui';
import { StepFoldsRow } from './assembly-folds/step-folds-row';
import { mapStepPictureOf, StepView } from './assembly-map/step-view';
import { useMapModel, type FormOp, type MapModel } from './assembly-map/use-map-model';
import { useTechCardAutosave } from './design/autosave-contract';
import { recordSeamDecision } from './step-seams/seam-decisions';
import { hasMultipleStepPieces, posesLabels } from './step-seams/step-seams-model';
import {
  StepPictureSvg,
  useBoxSize,
  useCardGeoms,
  useCardPieceKeys,
  useStepScene,
} from './step-seams/step-picture-view';
import { useStepResults } from './step-seams/step-result-context';
import { useStepSeams } from './step-seams/step-seams-context';
import { stepWords } from './step-seams/step-words';
import { useOperationWorkCatalog } from './useOperationWorkCatalog';

const loadPicker = () => import('./step-seams/seam-picker');
const SeamPickerBody = lazy(() =>
  loadPicker().then((module) => ({ default: module.SeamPickerBody })),
);

const memoryKey = (cardId: number | undefined) => `plm.techcard.seam-walk.${cardId ?? 'new'}`;

/** The op a reload comes back to. Session only: the door opens on the selected op otherwise. */
function readMemory(cardId: number | undefined): number | null {
  try {
    const value = Number(sessionStorage.getItem(memoryKey(cardId)));
    return value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeMemory(cardId: number | undefined, operationNumber: number | null) {
  try {
    if (operationNumber) sessionStorage.setItem(memoryKey(cardId), String(operationNumber));
    else sessionStorage.removeItem(memoryKey(cardId));
  } catch {
    /* private mode: the walk just reopens on the selected op */
  }
}

export function SeamWalk({
  fields,
  cardId,
  frozen,
  selectedIndex,
  onExit,
}: {
  /** Field ids hold the position: an index means another op after any renumbering. */
  fields: readonly { id: string }[];
  cardId: number | undefined;
  frozen: boolean;
  selectedIndex: number;
  onExit: (index: number) => void;
}) {
  const ctx = useStepSeams();
  const model = useMapModel();
  const autosave = useTechCardAutosave();
  const pieceKeys = useCardPieceKeys();
  const { geoms } = useCardGeoms();
  const { catalog } = useOperationWorkCatalog();
  const ops = model.ops;

  const [currentId, setCurrentId] = useState<string | null>(() => {
    const remembered = readMemory(cardId);
    const at = remembered ? ops.findIndex((op) => op?.operationNumber === remembered) : -1;
    return fields[at >= 0 ? at : Math.max(0, selectedIndex)]?.id ?? fields[0]?.id ?? null;
  });
  const lastIndex = useRef(0);
  const found = fields.findIndex((field) => field.id === currentId);
  const index = found >= 0 ? found : Math.min(lastIndex.current, fields.length - 1);
  lastIndex.current = Math.max(0, index);

  const op = ops[index];
  const operationNumber = op?.operationNumber ?? null;
  const readOnly = frozen || !cardId || !!ctx?.frozen;
  const isJoin = (at: number) =>
    at >= 0 &&
    ((ops[at]?.seamKeys?.length ?? 0) > 0 ||
      hasMultipleStepPieces(ops, at, pieceKeys, geoms) ||
      posesLabels(ops, at, pieceKeys));
  const join = isJoin(index);
  // The canvas and the result: a step behind the rail while they catch up.
  const shown = useDeferredValue(index);
  const shownJoin = isJoin(shown);
  const settled = shown === index;

  const [warm, setWarm] = useState<number | null>(null);
  useEffect(() => {
    void loadPicker();
  }, []);
  useEffect(() => {
    if (!settled) return;
    const nextJoin = ops.findIndex((_, at) => at > index && isJoin(at));
    if (nextJoin < 0) return;
    const task = window.setTimeout(() => setWarm(nextJoin), 150);
    return () => window.clearTimeout(task);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, settled]);

  useEffect(() => {
    if (index >= 0) writeMemory(cardId, operationNumber);
  }, [cardId, index, operationNumber]);

  const go = useCallback(
    (to: number) => {
      const next = fields[to]?.id;
      if (next) setCurrentId(next);
    },
    [fields],
  );
  const back = () => go(index - 1);
  const next = () => go(index + 1);

  const skip = () => {
    // A sewn step keeps what it has: SKIP only says «no seam yet» about a step that has none.
    if (!readOnly && cardId && operationNumber && (op?.seamKeys?.length ?? 0) === 0)
      recordSeamDecision({ cardId, operationNumber, action: 'skip' });
    next();
  };

  const close = () => {
    autosave.request('seams');
    writeMemory(cardId, null);
    onExit(index);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      back();
    }
  };

  const words = stepWords(op, catalog);
  const unit = op?.outputUnitName?.trim() ?? '';

  return (
    <Dialog.Root open modal>
      <Dialog.Portal>
        <Dialog.Content
          data-seam-walk=''
          data-assembly-map='walk'
          className='fixed inset-0 z-[var(--z-modal)] grid grid-rows-[auto_minmax(0,1fr)_auto] bg-pageBg text-textColor focus:outline-none'
          onKeyDown={onKeyDown}
          onEscapeKeyDown={(event) => event.preventDefault()}
        >
          <Dialog.Title className='sr-only'>{`op ${operationNumber ?? ''} seams`}</Dialog.Title>
          <Dialog.Description className='sr-only'>seam walk</Dialog.Description>

          <header className='flex min-h-11 items-center gap-3 border-b border-borderColor bg-bgColor px-4'>
            <Text size='small' tracking='section' className='whitespace-nowrap uppercase'>
              {`op ${operationNumber ?? ''}`}
            </Text>
            <Text size='small' variant='label' className='min-w-0 truncate'>
              {[words, unit].filter(Boolean).join(' · ')}
            </Text>
            <Button
              type='button'
              variant='underline'
              size='xs'
              className='ml-auto'
              onClick={close}
              data-seam-walk-close=''
            >
              close
            </Button>
          </header>

          <div className='flex min-h-0 flex-col overflow-y-auto md:flex-row md:overflow-hidden'>
            <WalkRail ops={ops} current={index} catalog={catalog} onPick={go} />
            <main className='h-120 min-w-0 flex-none p-3 md:h-auto md:min-h-0 md:flex-1'>
              {shownJoin ? (
                <Suspense fallback={<Placeholder label='loading' />}>
                  <SeamPickerBody
                    key={fields[shown]?.id}
                    index={shown}
                    readOnly={readOnly}
                    walk
                    onAccepted={() => autosave.request('seams')}
                  />
                </Suspense>
              ) : (
                <WalkSingle key={fields[shown]?.id} index={shown} model={model} />
              )}
            </main>
            <aside
              data-seam-walk-result=''
              className='min-w-0 flex-none overflow-y-auto border-borderColor bg-bgColor p-3 max-md:border-t md:w-80 md:border-l'
            >
              <Text size='micro' tracking='label' className='mb-2 block uppercase'>
                result
              </Text>
              {shown >= 0 && <StepView model={model} index={shown} />}
              {warm !== null && <WarmScene key={warm} index={warm} />}
            </aside>
          </div>

          <footer className='flex min-h-13 items-center justify-end gap-6 border-t border-borderColor bg-bgColor px-4'>
            <Button
              type='button'
              variant='underline'
              size='xs'
              onClick={back}
              disabled={index <= 0}
              data-seam-walk-back=''
            >
              back
            </Button>
            {join && (
              <Button
                type='button'
                variant='underline'
                size='xs'
                onClick={skip}
                disabled={index >= fields.length - 1}
                data-seam-walk-skip=''
              >
                skip
              </Button>
            )}
            <Button
              type='button'
              variant='main'
              size='sm'
              onClick={next}
              disabled={index >= fields.length - 1}
              data-seam-walk-next=''
            >
              next
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Computes a scene for its cache and draws nothing: the picker's own call then returns at once. */
function WarmScene({ index }: { index: number }) {
  useStepScene(index);
  return null;
}

function WalkRail({
  ops,
  current,
  catalog,
  onPick,
}: {
  ops: readonly FormOp[];
  current: number;
  catalog: ReturnType<typeof useOperationWorkCatalog>['catalog'];
  onPick: (index: number) => void;
}) {
  const currentRow = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    currentRow.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  return (
    <nav
      aria-label='operations'
      data-seam-walk-rail=''
      className='flex flex-none overflow-x-auto border-b border-borderColor bg-bgColor md:min-h-0 md:w-56 md:flex-col md:overflow-x-hidden md:overflow-y-auto md:border-r md:border-b-0'
    >
      {ops.map((op, index) => {
        const seams = op?.seamKeys?.length ?? 0;
        const selected = index === current;
        const type = stepWords(op, catalog).split(' · ')[0];
        return (
          <Button
            key={index}
            ref={selected ? currentRow : undefined}
            variant={selected ? 'simple' : 'default'}
            size='xs'
            aria-current={selected ? 'step' : undefined}
            onClick={() => onPick(index)}
            data-seam-walk-op={op?.operationNumber ?? ''}
            className='flex-none border-hairline text-left tabular-nums max-md:border-r md:w-full md:border-b'
          >
            <span className='flex min-h-8 items-center gap-1.5'>
              <span className='w-8 shrink-0'>{op?.operationNumber ?? ''}</span>
              <span className='shrink-0 max-md:hidden'>{type}</span>
              <span className='min-w-0 flex-1 truncate opacity-70 max-md:hidden'>
                {op?.outputUnitName?.trim() ?? ''}
              </span>
              {seams > 0 && (
                <span
                  className='inline-flex size-4 shrink-0 items-center justify-center border border-current leading-none'
                  data-seam-walk-count={seams}
                >
                  {seams}
                </span>
              )}
            </span>
          </Button>
        );
      })}
    </nav>
  );
}

/** FUSING, PRESS, FOLD: the same folds as the step editor, the picture only without a pattern. */
function WalkSingle({ index, model }: { index: number; model: MapModel }) {
  const pieces = useStepSeams()?.geometry?.pieces;
  const foldable = (model.ops[index]?.inputKeys ?? []).some(
    (key) => (pieces?.get(key.trim())?.geom?.rs.length ?? 0) >= 3,
  );
  if (!foldable) return <WalkSinglePicture index={index} model={model} />;
  return (
    <div
      data-seam-walk-folds=''
      className='h-full min-h-0 overflow-y-auto border border-borderColor bg-bgColor p-4'
    >
      <StepFoldsRow index={index} openSingle />
    </div>
  );
}

/** The piece as the card draws it, nothing to pick. */
function WalkSinglePicture({ index, model }: { index: number; model: MapModel }) {
  const results = useStepResults();
  const picture = mapStepPictureOf(results, index);
  const { geoms, innerLines } = useCardGeoms();
  const [boxEl, box] = useBoxSize();
  const inputs = (model.ops[index]?.inputKeys ?? []).filter(Boolean);
  const drawn = !!picture && picture.layout.T.size > 0 && box.w > 0;

  return (
    <div
      ref={boxEl}
      data-seam-walk-single=''
      className='relative h-full min-h-0 overflow-hidden border border-borderColor bg-bgColor'
    >
      {drawn ? (
        <StepPictureSvg
          w={box.w}
          h={box.h}
          pad={64}
          look='canvas'
          layout={picture.layout}
          layers={picture.layers}
          geoms={geoms}
          innerLines={innerLines}
          names={inputs.map(model.pieceName)}
          className='absolute inset-0'
        />
      ) : (
        <div className='absolute inset-0 grid place-items-center'>
          <Placeholder label={inputs.length ? 'no pattern' : 'no pieces'} dashed />
        </div>
      )}
    </div>
  );
}
